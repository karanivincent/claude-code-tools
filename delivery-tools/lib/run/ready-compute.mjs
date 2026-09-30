// `delivery ready --pr N` (spec 4.6, 5.4, 8.3, 11.6, 12.3): recompute every ready input for the
// PR's head SHA, write ready.json, and record it (state.readyRecords and the journal, whose entry
// carries the file's sha256 so checkReady can tell it from a hand-written one).
//
// Every check is one line of ready.json. A slice that cannot answer (not implemented, a crash)
// makes its line red with that exit, so ready is never green by omission.

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { artefactHash, readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { EXIT, UsageError, worstExit } from '../core/exit.mjs';
import { readFindings } from '../core/findings.mjs';
import { sha256File } from '../core/hash.mjs';
import { fillCommand } from '../core/profile.mjs';
import { formatEvent, parseEvent, updateState } from '../core/state.mjs';
import { ciStatus } from '../github/ci.mjs';
import { findDupes, undecided } from '../github/dupes.mjs';
import { lateChanges } from '../github/scope.mjs';
import { resolvePreview } from '../lifecycle/preview.mjs';
import { refreshBaseline } from '../baseline/refresh.mjs';
import { outOfScopeFiles } from '../baseline/scope.mjs';
import { CHECK_IDS, runChecks } from '../checks/index.mjs';
import { readMap } from '../picture/map.mjs';
import { latestVerdicts, pictureFacts } from '../picture/next.mjs';
import { runDecision } from '../picture/stop.mjs';
import { contractSummary, readContract } from '../picture/contract.mjs';
import { ruleFacts } from '../picture/rules.mjs';
import { designFor } from '../picture/widths.mjs';
import { componentsMapPath, readComponentsMap } from '../components/map.mjs';
import { componentProblems, normalisePath, usedComponents } from '../components/check.mjs';
import { readStateComponents, renderFileName } from '../design/render.mjs';
import { readExportComponents } from '../design/components.mjs';
import { readyBlockers } from '../checks/severity.mjs';
import { latestCaptureRun, validateCaptureItems } from '../capture/validate.mjs';
import { spotRecapture } from '../capture/spot.mjs';
import { probeServedSha } from '../capture/served-sha.mjs';
import { EXIT_MEANING, dep, normalise } from './compose.mjs';
import { requireRunState, trackedClean } from './context.mjs';
import { matchesAny } from './glob.mjs';
import { captureEvidence, readyInputs, sameSha, shortSha } from './ready.mjs';

const BUILT = new Set(['keep', 'change', 'new', 'adapt']);
const STATE_ID = /^(?:[A-Z]{1,6}-\d{2,3}|C-[A-Z][A-Za-z0-9]{0,40}-\d{2,3})$/;
const CAP_ID = /^CAP-\d{3}$/;

/** A plan row for a designed state (capability rows are CAP-nnn, which the state pattern also fits). */
export function isStateRow(row) {
  return STATE_ID.test(row.id) && !CAP_ID.test(row.id);
}

/**
 * ready.json counts (pure).
 * @param {object|null} plan
 * @param {{ findings: object[] }|null} findingsDoc
 * @param {{ status: string }[]} verdicts the capture's re-validated items
 */
export function readyCounts(plan, findingsDoc, verdicts) {
  const rows = plan?.rows ?? [];
  const built = rows.filter((r) => isStateRow(r) && BUILT.has(r.class));
  const f = findingsDoc?.findings ?? [];
  return {
    statesBuilt: built.length,
    cut: rows.filter((r) => r.class === 'cut').length,
    adapted: rows.filter((r) => r.class === 'adapt').length,
    invented: rows.filter((r) => r.invented === true).length,
    removed: rows.filter((r) => r.class === 'remove').length,
    acceptedP2: f.filter((x) => x.severity === 'P2' && x.status === 'accepted').length,
    p3Filed: f.filter((x) => x.severity === 'P3' && x.status === 'filed').length,
    notReached: (verdicts ?? []).filter((v) => v.status === 'not-reached').length,
    propOrUnseedable: built.filter((r) => r.reach && ['prop', 'unseedable'].includes(r.reach.class)).length,
    reAudits: f.reduce((n, x) => n + (Number(x.reAudits) || 0), 0),
  };
}

/** The newest loop-test result journalled for a head SHA, or null (pure). */
export function loopTestEvidence(journal, headSha) {
  let found = null;
  for (const e of journal ?? []) {
    const { command, exit, counts } = parseEvent(e.event);
    if (command === 'loop-test' && counts.sha && sameSha(counts.sha, headSha)) found = { exit, at: e.at };
  }
  return found;
}

/** The served SHA as the newest full capture of the head saw it, signed in, on every item. */
async function servedByCapture(ctx, headSha) {
  const runId = await dep(ctx, 'latestCaptureRun', latestCaptureRun)(ctx, { mode: 'full' });
  if (!runId) return { ok: false, why: 'and no full capture exists to prove it' };
  const cap = await readArtefact(ctx.requirePaths(), 'capture', { key: runId }).catch(() => null);
  if (!cap || !sameSha(cap.expectedSha, headSha)) return { ok: false, why: `and the newest full capture is not of the head` };
  const seen = (await dep(ctx, 'validateCaptureItems', validateCaptureItems)(ctx, runId)).filter((v) => v.servedSha);
  const other = seen.find((v) => !sameSha(v.servedSha, headSha));
  if (other) return { ok: false, why: `capture ${runId} saw ${shortSha(other.servedSha)} on ${other.state}` };
  if (!seen.length) return { ok: false, why: `capture ${runId} recorded no served SHA` };
  return { ok: true, runId, items: seen.length };
}

/** The merge base with the branch's remote base, falling back to the local base ref. */
async function mergeBaseWith(git, base) {
  for (const ref of [`origin/${base}`, base]) {
    const mb = await git.mergeBase(ref, 'HEAD');
    if (mb) return mb;
  }
  return null;
}

async function changedPaths(git, base) {
  const mb = await mergeBaseWith(git, base);
  return mb === null ? null : git.diffNames(mb, 'HEAD');
}

/** Paths this branch adds (git status "A") against its merge base, or null when no base ref resolves. */
async function addedPaths(git, base) {
  const mb = await mergeBaseWith(git, base);
  if (mb === null) return null;
  const out = await git.ok(['diff', '--name-status', mb, 'HEAD']);
  if (!out) return [];
  return out.split('\n').filter(Boolean).filter((l) => /^A\d*\t/.test(l)).map((l) => l.slice(l.indexOf('\t') + 1));
}

const IMPORT_SPEC_RE = /\b(?:import|export)\b[^;\n]*?\bfrom\s+['"]([^'"]+)['"]/g;
const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

/** The repo-relative directory a repo-relative file lives in, "" for the repo root. */
function relDir(file) {
  const d = posix.dirname(file);
  return d === '.' ? '' : d;
}

/** dir and every ancestor up to and including the repo root (""). */
function ancestorDirs(dir) {
  const out = [];
  let d = dir;
  for (;;) {
    out.push(d);
    if (d === '') break;
    const parent = posix.dirname(d);
    d = parent === '.' ? '' : parent;
  }
  return out;
}

/** The nearest tsconfig.json walking up from a directory, or null. Cached per starting directory. */
function findTsconfig(repoRoot, dir, cache) {
  if (cache.has(dir)) return cache.get(dir);
  let found = null;
  for (const d of ancestorDirs(dir)) {
    const abs = join(repoRoot, d, 'tsconfig.json');
    if (existsSync(abs)) {
      try {
        const json = JSON.parse(readFileSync(abs, 'utf8'));
        found = { dir: d, compilerOptions: json.compilerOptions ?? {} };
      } catch { found = null; }
      break;
    }
  }
  cache.set(dir, found);
  return found;
}

/** Resolve an alias specifier (the common "@/*": ["./src/*"] form, with baseUrl if present) to a repo path. */
function resolveAlias(tsconfig, spec) {
  if (!tsconfig) return null;
  const { dir, compilerOptions } = tsconfig;
  const base = posix.normalize(posix.join(dir, compilerOptions.baseUrl ?? '.'));
  for (const [pattern, list] of Object.entries(compilerOptions.paths ?? {})) {
    const target = list?.[0];
    if (!target) continue;
    if (pattern.endsWith('/*') && spec.startsWith(pattern.slice(0, -1))) {
      const rest = spec.slice(pattern.length - 1);
      const prefix = target.endsWith('/*') ? target.slice(0, -2) : target;
      return posix.normalize(posix.join(base, prefix, rest));
    }
    if (pattern === spec) return posix.normalize(posix.join(base, target));
  }
  return null;
}

/**
 * The `components` check's importsOf: every static `import … from '…'`/`export … from '…'`
 * specifier a file has, with a relative or tsconfig-alias one resolved to a repo path (extensionless
 * is fine; componentProblems compares without extensions). A package specifier is left as its name.
 */
function makeImportsOf(repoRoot) {
  const tsconfigCache = new Map();
  return function importsOf(file) {
    let src;
    try { src = readFileSync(join(repoRoot, file), 'utf8'); } catch { return []; }
    const dir = relDir(file);
    return [...src.matchAll(IMPORT_SPEC_RE)].map((m) => m[1]).map((spec) => {
      if (spec.startsWith('.')) return posix.normalize(posix.join(dir, spec));
      return resolveAlias(findTsconfig(repoRoot, dir, tsconfigCache), spec) ?? spec;
    });
  };
}

/** The `components` check's importGraph: paths plus, one level deep, whichever of their imports resolve to a real repo file. */
function makeImportGraph(repoRoot, importsOf) {
  const resolve = (spec) => RESOLVE_EXTS.map((ext) => `${spec}${ext}`).find((cand) => existsSync(join(repoRoot, cand))) ?? null;
  return function importGraph(paths) {
    const out = new Set(paths);
    for (const p of paths) for (const spec of importsOf(p) ?? []) { const r = resolve(spec); if (r) out.add(r); }
    return out;
  };
}

const SOURCE_EXT_RE = /\.(tsx|ts|jsx|js|mjs|cjs)$/;

/**
 * Rule 4's weaker form (fix round, #: an update run that never touches a component's own caller
 * used to go red even when the target is wired in somewhere): which of the map's design targets
 * some tracked file in the whole repo imports, not only what this PR's own changes reach. Bounded
 * by the map's own target count, not the repo's size: it stops scanning once every target is found.
 */
async function anyImporterTargets(git, compMap, importsOf) {
  const targets = new Set((compMap.components ?? []).filter((c) => c.target).map((c) => normalisePath(c.target)));
  if (!targets.size) return new Set();
  const files = (await git.lsTree('HEAD')).filter((f) => SOURCE_EXT_RE.test(f));
  const found = new Set();
  for (const f of files) {
    if (found.size === targets.size) break;
    for (const spec of importsOf(f) ?? []) {
      const np = normalisePath(spec);
      if (targets.has(np)) found.add(np);
    }
  }
  return found;
}

/**
 * The `components` ready check for a picture-mode run: the design ids the run's states show, the
 * component map, and componentProblems over what this branch changed. Shared by ready and
 * `delivery prepush` (the same rule, before the first push instead of after CI).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ paths: object, profile: object, runMap: object, headSha?: string|null }} o
 * @returns {Promise<{ ok: boolean, detail: string, evidence: string, problems?: string[] }>}
 */
export async function componentsCheck(ctx, { paths, profile, runMap, headSha = null }) {
  const compPath = componentsMapPath(ctx.repoRoot, profile);
  if (!compPath) return { ok: true, detail: 'no component map configured', evidence: '', problems: [] };
  headSha ??= await ctx.git.revParse('HEAD');
  // The design ids this run's states show, at both widths (spec: a state's design may be a
  // string or { desktop, phone }); readStateComponents is [] when a state has no picture yet.
  const ids = new Set();
  for (const s of runMap.states ?? []) {
    for (const width of ['desktop', 'phone']) {
      const d = designFor(s, width);
      if (d) ids.add(d.id);
    }
  }
  const stateNames = [];
  let anyRecord = false;
  for (const id of ids) {
    for (const width of ['desktop', 'phone']) {
      if (existsSync(join(paths.designRenders, renderFileName(id, width, 'components.json')))) anyRecord = true;
      stateNames.push(await readStateComponents(paths, id, width));
    }
  }
  // A run rendered before 0.9 has no per-state component records at all; it is not held to
  // this check, whether or not a component map exists yet (fix round, I5: this pass must win
  // over "no component map" — a pre-0.9 run owes this check nothing either way).
  if (!anyRecord) return { ok: true, detail: 'no component records (design rendered before 0.9)', evidence: '' };

  const compMap = await readComponentsMap(compPath);
  if (!compMap) {
    return { ok: false, detail: `no component map at ${profile.components.map}: the mapper writes it (briefs/components-mapper.md), or delivery components --scan-base starts one`, evidence: profile.components.map };
  }
  const used = usedComponents(stateNames);

  const changed = await changedPaths(ctx.git, profile.repo.base);
  if (changed === null) return { ok: false, detail: `cannot list the paths this branch changes against ${profile.repo.base}`, evidence: '' };
  const added = (await addedPaths(ctx.git, profile.repo.base)) ?? [];

  const isComponentsRun = runMap.kind === 'components';
  let buildingNow = [];
  if (isComponentsRun) {
    let gallery = null;
    try { gallery = JSON.parse(readFileSync(join(paths.deliveryDir, 'gallery-states.json'), 'utf8')); } catch { gallery = null; }
    buildingNow = gallery ? [...new Set((gallery.states ?? []).map((s) => s.component))] : [];
  }

  // The run's own design snapshot (I3): components.json's own design.hash/status can be
  // stale for a page run, which never refreshes it, so rule 1 checks against what the design
  // actually looks like right now rather than trusting the map alone.
  let exportComponents = [];
  if (existsSync(paths.designSnapshot)) {
    try { exportComponents = (await readExportComponents(paths.designSnapshot)).components; } catch { exportComponents = []; }
  }

  const importsOf = makeImportsOf(ctx.repoRoot);
  const importGraph = makeImportGraph(ctx.repoRoot, importsOf);
  const importedAnywhere = await anyImporterTargets(ctx.git, compMap, importsOf);
  const problems = componentProblems({
    map: compMap, used, changed, added, importsOf, importGraph, buildingNow,
    docDirs: [profile.paths?.designRoot, profile.paths?.deliveryRoot],
    isComponentsRun, exportComponents, importedAnywhere,
  });

  // A components run also proves, from the PR head's own committed components.json, that
  // every component it builds was marked built before ready (land never commits: spec
  // correction #2, so --mark-built is the one place this status change is recorded).
  if (isComponentsRun && buildingNow.length) {
    const raw = await ctx.git.show(headSha, profile.components.map);
    const atHead = raw ? JSON.parse(raw.toString('utf8')) : null;
    const byName = new Map((atHead?.components ?? []).filter((c) => c.kind === 'design').map((c) => [c.name, c]));
    const notBuilt = buildingNow.filter((name) => byName.get(name)?.status !== 'built');
    // Same combined instruction as NEXT's (fix round, I14): whether the working copy already
    // says built or not, what actually clears this is committing and pushing it.
    if (notBuilt.length) problems.unshift(`run delivery components --mark-built ${notBuilt.join(' ')}, commit ${profile.components.map} and push`);
  }

  if (problems.length) return { ok: false, detail: problems.slice(0, 4).join('; '), evidence: profile.components.map, problems };
  return { ok: true, detail: `${used.length} component(s) used, none rebuilt`, evidence: profile.components.map, problems: [] };
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ pr: number }} opts
 * @returns {Promise<{ ready: object, exit: number, digest: string, notes: string[] }>} notes: runChecks' lines worth printing
 */
/**
 * Picture mode's proof that the page is done, counted by item (a state at a width; a desktop-only
 * run's items are its states): every round pictured is compiled, every item's
 * newest picture was reached, and states still to fix are allowed only once the fix rounds are
 * spent (they then go to the founder as a list, with the comparison page). A state keeps the
 * verdict of the newest round that pictured it, so a round that re-shoots a few states counts.
 * @param {{ runDir: string, deliveryDir: string }} paths
 * @returns {Promise<{ ok: boolean, detail: string, evidence: string }>}
 */
export async function pictureReadiness(paths) {
  const rounds = (await pictureFacts(paths)).rounds.filter((r) => r.shot);
  if (!rounds.length) return { ok: false, detail: 'no picture round yet: delivery shoot, the reviewers, then delivery review', evidence: '' };
  const stale = rounds.find((r) => !r.compiled);
  if (stale) return { ok: false, detail: `round ${stale.round} is pictured but its reviews are not compiled: delivery review --round ${stale.round}`, evidence: `rounds/${stale.round}` };
  const latest = latestVerdicts(paths);
  // A run that checks the phone counts items (a state at a width); a desktop-only run, states.
  const noun = [...latest.keys()].some((k) => k.includes('@')) ? 'item' : 'state';
  const by = (v) => [...latest].filter(([, s]) => s.verdict === v).map(([id, s]) => `${id} (round ${s.round})`);
  const unreached = by('not-reached');
  if (unreached.length) return { ok: false, detail: `${unreached.length} ${noun}(s) whose newest picture was not reached: ${unreached.slice(0, 5).join(', ')}`, evidence: 'review.json' };
  // A1: a data gap is the world's problem, not the builder's, so it is never counted by the
  // stop rule below and never quietly goes to the founder as an accepted open
  // item the way a stale must-fix can. It always keeps ready red, listed apart from code defects,
  // until the world is re-seeded (delivery seed --apply) and the state shot again.
  const dataGaps = [...by('data-fault'), ...by('data-gap')];
  if (dataGaps.length) {
    return { ok: false, detail: `${dataGaps.length} ${noun}(s) have a data fault or gap, not a code defect: a seed-writer fixes the world file, then delivery shoot --only data-faults: ${dataGaps.slice(0, 5).join(', ')}`, evidence: 'review.json' };
  }
  // D6: a value the design shows that the product does not store is closed once the founder
  // decided it (build, drop or back to the design), and keeps ready red until then.
  const undecided = contractFactsFor(paths).undecided;
  if (undecided.length) {
    return { ok: false, detail: `${undecided.length} value(s) the product does not store wait for the founder's decision: delivery contract --questions, then delivery contract --decide`, evidence: 'contract.json' };
  }
  const open = by('must');
  const last = rounds.at(-1).round;
  // W4: the same stop rule NEXT reads. Open items are allowed only once the loop has stopped.
  const d = runDecision(paths);
  if (open.length && d.decision === 'fix') {
    return { ok: false, detail: `${open.length} ${noun}(s) still to fix, and the fix rounds go on while the count falls (${d.why}): ${open.slice(0, 5).join(', ')}`, evidence: `rounds/${last}` };
  }
  // W5: an item held back from review (its screen's sample was clean) is reviewed before shipping.
  const held = [...latest].filter(([, s]) => s.held).map(([id]) => id);
  if (held.length) return { ok: false, detail: `${held.length} ${noun}(s) were held back from review while their screen's sample was clean; review them before shipping: delivery review --plan --round ${last} --held`, evidence: `rounds/${last}/review-plan.json` };
  const n = (v) => by(v).length;
  const tail = open.length ? `; the loop stopped (${d.why}): ${open.length} stuck item(s) go to the founder with rounds/${last}/stuck.md` : '';
  return { ok: true, detail: `${latest.size} ${noun}(s): ${n('match')} match, ${n('small')} small differences, every pictured ${noun} reached${tail}`, evidence: `rounds/${last}/review.json` };
}

/** The run's contract summary, or an empty one when there is no contract (a full-mode run). */
function contractFactsFor(paths) {
  try { return contractSummary(readContract(paths)); } catch { return contractSummary(null); }
}

/**
 * A picture run's rules at the ready stage: every rule the briefs state has a design state, a test
 * named after it that exists, or a cut. A run with neither briefs nor rules.json has nothing to prove.
 */
export function ruleReadiness(paths) {
  const map = readMap(paths);
  const f = ruleFacts(paths, { stateIds: map ? map.states.map((s) => s.id) : undefined, stage: 'ready' });
  if (!f.exists) {
    return f.briefs
      ? { ok: false, detail: `${f.briefs} brief(s) in intent/ and no rules.json: dispatch the rules agent (briefs/rules.md), then delivery rules`, evidence: 'intent/' }
      : { ok: true, detail: 'no briefs and no rules.json: every decision is in the design pictures', evidence: '' };
  }
  if (f.problems.length) return { ok: false, detail: `${f.problems.length} rule gap(s): ${f.problems.slice(0, 3).join('; ')}`, evidence: 'rules.json' };
  const c = f.counts;
  return { ok: true, detail: `${c.total} rule(s): ${c.picture} shown by a state, ${c.test} proved by a named test, ${c.cut} cut`, evidence: 'rules.json' };
}

export async function computeReady(ctx, { pr }) {
  const { paths, state } = await requireRunState(ctx);
  const profile = await ctx.profile();
  const pull = await ctx.gh.prGet(pr);
  if (!pull) throw new UsageError(`PR #${pr} not found in ${ctx.gh.repo}`);
  if (pull.state !== 'open') throw new UsageError(`PR #${pr} is ${pull.state}; ready applies before the merge, and delivery land after it`);
  const headSha = pull.headRefOid;
  if (!headSha) throw new UsageError(`PR #${pr} reports no head SHA`);
  const head = shortSha(headSha);
  // Picture mode proves the page with its rounds of pictures and reviews, not a full capture,
  // the M-checks and an audit's severities, which a picture run never produces.
  const runMap = readMap(paths);
  const pictureMode = Boolean(runMap);

  const checks = [];
  const exits = [];
  const add = (id, ok, detail, evidence = '', exit = EXIT.RED) => {
    checks.push({ id, ok, detail, evidence });
    if (!ok) exits.push(exit || EXIT.RED);
  };
  const attempt = async (id, fn) => {
    try {
      await fn();
    } catch (err) {
      const known = err && typeof err.exit === 'number';
      add(id, false, known ? err.message : `internal: ${err?.message ?? err}`, '', known ? err.exit : EXIT.USAGE);
    }
  };

  // 5.4: capabilities that landed on the base since the run began get a plan row first, so the
  // head check below sees the plan change they cause.
  await attempt('baseline-refresh', async () => {
    if ((await artefactHash(paths, 'baseline')) === 'absent') return add('baseline-refresh', true, 'no baseline: not a redesign');
    const { added, unclassed } = await dep(ctx, 'refreshBaseline', refreshBaseline)(ctx);
    if (unclassed.length) return add('baseline-refresh', false, `${unclassed.length} capability(ies) landed on the base with no plan row: ${unclassed.slice(0, 5).join(', ')}`, 'baseline.json');
    add('baseline-refresh', true, `${added.length} capability(ies) that landed since the run began are classed`, 'baseline.json');
  });

  await attempt('head', async () => {
    const local = await ctx.git.revParse('HEAD');
    const clean = await trackedClean(ctx.git);
    if (!clean) return add('head', false, 'tracked files are changed and not committed; commit and push, then run ready again', `HEAD ${local}`);
    if (local !== headSha) return add('head', false, `local HEAD ${shortSha(local)} is not the PR head ${head}; push, then run ready again`, `HEAD ${local}`);
    add('head', true, `local HEAD is the PR head ${head}`, `HEAD ${local}`);
  });

  await attempt('ci', async () => {
    const s = await dep(ctx, 'ciStatus', ciStatus)(ctx, { pr, wait: false });
    const detail = s.detail ? `: ${s.detail}` : '';
    if (s.headSha && !sameSha(s.headSha, headSha)) return add('ci', false, `CI reported for ${shortSha(s.headSha)}, not the head ${head}`, '', EXIT.WAIT);
    if (s.state === 'green') return add('ci', true, `every required check is green on ${head}${detail}`, 'ciStatus');
    if (s.state === 'pending') return add('ci', false, `CI is pending on ${head}${detail}`, 'ciStatus', EXIT.WAIT);
    if (s.state === 'conflicting') return add('ci', false, `PR #${pr} is mergeable: CONFLICTING, so no CI runs at all`, 'ciStatus');
    add('ci', false, `CI is red on ${head}${detail}`, 'ciStatus');
  });

  let previewUrl = '';
  await attempt('preview', async () => {
    if (profile.environments?.previews === 'none') return add('preview', true, 'no previews: a local production build stands in');
    const p = await dep(ctx, 'resolvePreview', resolvePreview)(ctx, { sha: headSha });
    if (p.pending) return add('preview', false, `the preview for ${head} is not built yet${p.detail ? `: ${p.detail}` : ''}`, '', EXIT.WAIT);
    if (!p.url) return add('preview', false, `no preview serves ${head}${p.detail ? `: ${p.detail}` : ''}`);
    previewUrl = p.url;
    add('preview', true, `resolved by SHA ${head}`, p.url);
  });
  if (previewUrl && !pictureMode) {
    await attempt('served-sha', async () => {
      const served = await dep(ctx, 'probeServedSha', probeServedSha)(ctx, previewUrl);
      if (!served) {
        // A version route behind sign-in never answers this anonymous probe (a repository whose
        // middleware sends it to /login). The full capture of the head read the served SHA on every item after signing
        // in, so it is the proof, provided every item that recorded one saw the head.
        const proof = await servedByCapture(ctx, headSha);
        if (proof.ok) return add('served-sha', true, `the version route answers a signed-in session only; the full capture ${proof.runId} signed in and saw the head ${head} on ${proof.items} item(s)`, proof.runId);
        return add('served-sha', false, `the version route of ${previewUrl} did not answer, so the served commit is unproven${proof.why ? ` (${proof.why})` : ''}`);
      }
      if (!sameSha(served, headSha)) return add('served-sha', false, `the preview serves ${shortSha(served)}, not the head ${head}`, served);
      add('served-sha', true, `the preview serves the head ${head}`, served);
    });
  }

  await attempt('dupes', async () => {
    const hits = await dep(ctx, 'findDupes', findDupes)(ctx);
    const red = undecided(hits);
    if (red.length) return add('dupes', false, `${red.length} other PR(s) claim this run's work: ${red.slice(0, 5).map((h) => `#${h.pr} (${h.reason})`).join(', ')}`);
    const decided = hits.filter((h) => h.decided);
    if (decided.length) return add('dupes', true, `${decided.length} overlap(s) decided: ${decided.map((h) => `#${h.pr} (${h.note})`).join('; ')}`);
    add('dupes', true, 'no other PR references a claimed child or touches a claimed path');
  });

  // A design export holds every screen of the project; the run was asked for some of them. A
  // page it was not asked for is left as it is, so a changed file in that page's route directory
  // is work outside the run: revert it, or put that screen in scope and plan it.
  await attempt('scope', async () => {
    const intent = await readArtefact(paths, 'intent', { optional: true }).catch(() => null);
    const outs = (intent?.outOfScope ?? []).filter((s) => s.routes?.length);
    if (!outs.length) return add('scope', true, 'no out-of-scope screen names a route');
    const changed = await changedPaths(ctx.git, profile.repo.base);
    if (changed === null) return add('scope', false, `cannot list the paths this branch changes against ${profile.repo.base}`);
    const hits = outOfScopeFiles(changed, profile, intent);
    if (hits.length) {
      return add('scope', false, `${hits.length} changed file(s) belong to out-of-scope pages; revert them, or put the screen in scope and plan it: ${hits.slice(0, 5).map((h) => `${h.file} (${h.screen})`).join(', ')}`, 'intent.json');
    }
    add('scope', true, `no changed file belongs to an out-of-scope page (${outs.map((s) => s.screen).join(', ')})`, 'intent.json');
  });

  const owedAfterMerge = [];
  await attempt('loop-test', async () => {
    const lt = profile.commands.loopTest;
    const changed = await changedPaths(ctx.git, profile.repo.base);
    if (changed === null) return add('loop-test', false, `cannot list the paths this branch changes against ${profile.repo.base}`);
    const hits = changed.filter((p) => matchesAny(p, lt.when));
    if (!hits.length) return add('loop-test', true, 'not owed: no changed path matches loopTest.when');
    const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
    const epic = state.epic ?? plan?.epic ?? null;
    let code = loopTestEvidence(state.journal, headSha)?.exit ?? null;
    if (code !== 0 && code !== 6) {
      const cmd = fillCommand(lt.command, { epic, pr });
      const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: 45 * 60_000 });
      code = r.code;
      await ctx.journal({ command: 'loop-test', exit: code, counts: { sha: headSha, target: 'preview' }, inputs: { cmd }, outputs: { code } });
    }
    if (code === 0) return add('loop-test', true, `passed on the preview (${hits.length} voice-path file(s) changed)`, 'journal: loop-test');
    if (code === 6) {
      owedAfterMerge.push(`loop test: the preview cannot be dialled while the inbound leg routes to staging; land runs it on staging (${fillCommand(lt.stagingCommand, { epic })})`);
      return add('loop-test', true, 'owed after the merge (broker exit 6), run by land on staging', 'journal: loop-test');
    }
    if (code === 4) return add('loop-test', false, 'the loop-test allowance is spent until its reset: wait and retry, never skip', 'journal: loop-test', EXIT.WAIT);
    if (code === 3) return add('loop-test', false, 'the loop test completed and its evidence failed (exit 3), a P1', 'journal: loop-test');
    add('loop-test', false, `the loop test could not complete (exit ${code})`, 'journal: loop-test');
  });

  let captureRunId = null;
  let verdicts = [];
  const checkNotes = [];
  if (pictureMode) {
    await attempt('pictures', async () => {
      const r = await pictureReadiness(paths);
      add('pictures', r.ok, r.detail, r.evidence);
    });
    await attempt('rules', async () => {
      const r = ruleReadiness(paths);
      add('rules', r.ok, r.detail, r.evidence);
    });
    const compPath = componentsMapPath(ctx.repoRoot, profile);
    if (compPath) {
      await attempt('components', async () => {
        const r = await componentsCheck(ctx, { paths, profile, runMap, headSha });
        add('components', r.ok, r.detail, r.evidence);
      });
    }
  } else {
  await attempt('capture', async () => {
    captureRunId = await dep(ctx, 'latestCaptureRun', latestCaptureRun)(ctx, { mode: 'full' });
    if (!captureRunId) return add('capture', false, `no full-mode capture; run delivery capture --mode full on the preview of ${head}`);
    const evidence = captureEvidence(captureRunId);
    const cap = await readArtefact(paths, 'capture', { key: captureRunId });
    if (!sameSha(cap.expectedSha, headSha)) return add('capture', false, `capture ${captureRunId} is of ${shortSha(cap.expectedSha)}, not the head ${head}; capture the head`, evidence);
    verdicts = await dep(ctx, 'validateCaptureItems', validateCaptureItems)(ctx, captureRunId);
    const nr = verdicts.filter((v) => v.status === 'not-reached');
    if (nr.length) return add('capture', false, `${nr.length} of ${verdicts.length} item(s) re-validate as not reached: ${nr.slice(0, 5).map((v) => `${v.state} (${v.why ?? 'not reached'})`).join(', ')}`, evidence);
    add('capture', true, `${verdicts.length} item(s) re-validated as reached`, evidence);
  });

  await attempt('checks', async () => {
    const ids = [...dep(ctx, 'CHECK_IDS', CHECK_IDS)];
    const res = await dep(ctx, 'runChecks', runChecks)(ctx, ids, { captureRunId, record: true });
    const failures = res.failures ?? [];
    checkNotes.push(...(res.notes ?? []));
    // runChecks' exit is the most serious non-red exit a check asked for (M13 refusing a seed
    // is 3, blocked on the founder); it is never green, with or without failure lines.
    const asked = typeof res.exit === 'number' && res.exit > EXIT.RED ? res.exit : null;
    if (failures.length || asked) {
      const lines = failures.length ? `${failures.length} check failure(s): ${failures.slice(0, 4).map((f) => `${f.code} ${f.message}`).join('; ')}` : 'no failure line';
      return add('checks', false, asked ? `${lines}; exit ${asked}, ${EXIT_MEANING[asked] ?? 'unknown'}` : lines, 'findings.json', asked ?? EXIT.RED);
    }
    const hints = (res.hints ?? []).length;
    add('checks', true, `${ids.length} checks ran; ${(res.findings ?? []).length} finding(s) recorded${hints ? `; ${hints} advisory hint(s)` : ''}`, 'findings.json');
  });

  if (captureRunId) {
    await attempt('spot', async () => {
      const pct = profile.limits.spotRecapturePct;
      const r = normalise('spot', await dep(ctx, 'spotRecapture', spotRecapture)(ctx, { runId: captureRunId, pct, seed: headSha }));
      if (!r.ok) return add('spot', false, r.failures.slice(0, 3).map((f) => f.message).join('; '), '', r.exit ?? EXIT.RED);
      add('spot', true, `a ${pct}% sample (at least five states) re-captured with unchanged visible text`);
    });
  }

  await attempt('severity', async () => {
    const doc = await readFindings(paths, state.runId);
    const plan = await readArtefact(paths, 'plan');
    const blockers = dep(ctx, 'readyBlockers', readyBlockers)(doc, plan, profile);
    if (blockers.length) return add('severity', false, `${blockers.length} blocker(s): ${blockers.slice(0, 4).map((b) => b.message).join('; ')}`, 'findings.json');
    add('severity', true, 'no open P1; every open P2 accepted with a reason class, within the caps', 'findings.json');
  });
  }

  let late = [];
  await attempt('late-changes', async () => {
    late = (await dep(ctx, 'lateChanges', lateChanges)(ctx)).map((c) => `${c.row}: ${c.from} -> ${c.to}${c.scopeLine ? ` (${c.scopeLine})` : ''}`);
  });

  const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
  const findingsDoc = await readFindings(paths, state.runId).catch(() => null);
  const at = ctx.clock.now().toISOString();
  const ok = checks.length > 0 && checks.every((c) => c.ok);
  const ready = {
    schemaVersion: 1,
    headSha,
    previewUrl,
    generatedAt: at,
    cli: { version: ctx.cli.version, manifestSha256: ctx.cli.manifestSha256 ?? 'none' },
    inputs: await readyInputs(ctx, { captureRunId }),
    checks,
    counts: readyCounts(plan, findingsDoc, verdicts),
    lateChanges: late,
    waivers: state.waivers.map((w) => `${w.probe}: ${w.note}`),
    owedAfterMerge,
    ok,
  };
  await writeArtefact(paths, 'ready', ready);
  const digest = await sha256File(paths.ready);
  const exit = ok ? EXIT.PASS : (worstExit(exits) || EXIT.RED);
  await updateState(paths, (s) => ({ ...s, pr: s.pr ?? pr, readyRecords: [...s.readyRecords, { sha: headSha, ok, at, readySha256: digest }] }), {
    at, event: formatEvent({ command: 'ready', exit, counts: { sha: headSha, ok, red: checks.filter((c) => !c.ok).length } }),
    inputs: ready.inputs, outputs: digest,
  });
  return { ready, exit, digest, notes: checkNotes };
}
