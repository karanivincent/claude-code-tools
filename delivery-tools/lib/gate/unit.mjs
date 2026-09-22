// The unit gate (spec 4.5, 6.3, 12.1). Owner: slice B1 (docs/ARCHITECTURE.md).
//
// runUnitGate is `delivery gate <unit>`: capture the unit's states in branch mode on its own tree
// (slice C's runCapture owns the server), run M3, M4, M7, M9 and M10 on that capture, check the
// component render tests (markers present, passing, failing on an empty component), re-run the
// unit check, and write the failure file the builder gets back.
//
// unitGateStatus recomputes the same verdict from files only, for the phase gates and wave merge:
// the unit report, the newest branch capture of the unit's head re-validated, the open findings on
// its states, its component tests at its head. It never captures, builds or runs anything.

import { readdir } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { readJson, writeJsonAtomic } from '../core/fs.mjs';
import { readFindings } from '../core/findings.mjs';
import { gateResult } from '../core/gate.mjs';
import { fillCommand, wrapHeavy } from '../core/profile.mjs';
import { UsageError } from '../core/exit.mjs';
import { runCapture } from '../capture/run.mjs';
import { validateCaptureItems } from '../capture/validate.mjs';
import { BUILD_CLASSES } from '../plan/check.mjs';
import { effectiveSeverity, rowsById } from '../checks/severity.mjs';
import { runChecks as realRunChecks } from '../checks/index.mjs';
import { loadCheckEnv } from '../checks/env.mjs';
import { readMessageFiles, messageFindings } from '../checks/m8.mjs';

/** The checks a unit gate runs on its branch capture (spec 4.5). */
export const GATE_CHECKS = Object.freeze(['M3', 'M4', 'M7', 'M9', 'M10']);
/** The environment variable under which a component-state test renders an empty component (spec 6.3). */
export const RENDER_EMPTY_ENV = 'DELIVERY_RENDER_EMPTY';
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const TEST_FILE_RE = /(^|\/)(__tests__|e2e|tests?)\/|\.(test|spec|stories)\.[cm]?[jt]sx?$/;

/** The plan rows a unit owns and builds. */
export function unitRows(plan, unit) {
  const ids = new Set([...(unit.states ?? []), ...(unit.capabilities ?? [])]);
  return (plan.rows ?? []).filter((r) => ids.has(r.id) && BUILD_CLASSES.has(r.class));
}

/** Rows a browser capture verifies (spec 6.1): seeded, or an action answered by an intercept. */
export function capturedBy(rows) {
  return rows.filter((r) => r.reach && (r.reach.class === 'seeded' || (r.reach.class === 'action' && r.reach.intercept)));
}

/** Rows a component render test verifies (spec 6.3): prop, unseedable, and actions with no intercept. */
export function testedBy(rows) {
  return rows.filter((r) => r.reach && (r.reach.class === 'prop' || r.reach.class === 'unseedable' || (r.reach.class === 'action' && !r.reach.intercept)));
}

/** The strings a component test must contain: every text and test-id marker. */
export function markerStrings(row) {
  return [...(row.markers?.text ?? []), ...(row.markers?.testids ?? [])].filter((s) => s && s.trim());
}

/** The last few non-blank lines a failed command printed, for a failure message. */
export function lastLines(result, n = 3, width = 300) {
  const text = `${String(result?.stdout ?? '')}\n${String(result?.stderr ?? '')}`;
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return ' (it printed nothing)';
  return `; it ended with: ${lines.slice(-n).join(' / ').slice(-width)}`;
}

/** The deepest directory every file shares ("." when none). */
export function commonDir(files) {
  const dirs = files.map((f) => f.split('/').slice(0, -1));
  if (!dirs.length) return '.';
  const first = dirs[0];
  let n = first.length;
  for (const d of dirs) { let k = 0; while (k < n && k < d.length && d[k] === first[k]) k++; n = k; }
  return first.slice(0, n).join('/') || '.';
}

async function loadUnit(ctx, unitId) {
  const paths = ctx.requirePaths();
  const plan = await readArtefact(paths, 'plan');
  const unit = (plan.units ?? []).find((u) => u.id === unitId);
  if (!unit) throw new UsageError(`unit ${unitId} is not in the plan; units: ${(plan.units ?? []).map((u) => u.id).join(', ') || 'none'}`);
  let report = await readArtefact(paths, 'unit-report', { key: unitId, optional: true });
  report = (await adoptStrandedReport(ctx, paths, unitId, report)) ?? report;
  let unitFile = null;
  try { unitFile = await readArtefact(paths, 'unit-file', { key: unitId, optional: true }); } catch { unitFile = null; }
  return { paths, plan, unit, report, unitFile, rows: unitRows(plan, unit) };
}

/**
 * A report the builder wrote inside its own worktree instead of at the unit file's reportPath.
 *
 * A builder runs in an isolated worktree and its write to an absolute path in ANOTHER worktree can
 * be refused, silently as far as this session is concerned. Two shapes, both seen in one run:
 * nothing arrives at all, and the gate says the unit has no report, which reads as "the builder
 * never finished" when its work is committed on a branch; or something older sits there, because
 * a builder that copied its report in later put the file back as it found it — so a gate that
 * passed on the real evidence cannot be reproduced.
 *
 * A worktree copy is adopted when there is nothing here, or when it carries every commit this one
 * does and more: that is the same work taken further, which is the only disagreement that has an
 * obvious answer. Anything else is left alone for the gate to fail on honestly.
 */
async function adoptStrandedReport(ctx, paths, unitId, current) {
  const rel = relative(paths.repoRoot, paths.unitReport(unitId));
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  for (const wt of await ctx.git.worktrees()) {
    if (!wt.path || wt.path === paths.repoRoot) continue;
    const value = await readJson(join(wt.path, rel), { optional: true });
    if (value === null || value.unit !== unitId) continue;
    if (current && !carriesAllOf(value, current)) continue;
    await writeJsonAtomic(paths.unitReport(unitId), value);
    ctx.out.line(current
      ? `adopted ${unitId}'s report from ${wt.path}: it carries ${value.commits.length} commit(s) to the ${current.commits.length} at ${paths.unitReport(unitId)}`
      : `adopted ${unitId}'s report from ${wt.path}: the builder could not write it to ${paths.unitReport(unitId)}`);
    return value;
  }
  return null;
}

/** Strictly further along: every commit of `older`, in order, and at least one more. */
function carriesAllOf(newer, older) {
  const a = newer.commits ?? [];
  const b = older.commits ?? [];
  return a.length > b.length && b.every((sha, i) => a[i] === sha);
}

/** The unit's head: its branch, else the branch on origin, else its last reported commit. */
async function unitHead(ctx, report) {
  if (!report) return null;
  for (const ref of [report.branch, `origin/${report.branch}`, report.commits[report.commits.length - 1]]) {
    if (!ref) continue;
    const sha = await ctx.git.revParse(ref);
    if (sha) return { sha, ref };
  }
  return null;
}

function reportFailures(unitId, report, rows, unitFile = null) {
  const out = [];
  if (!report) return [{ code: 'gate-no-report', message: `unit ${unitId} has no report; the builder writes it when it finishes` }];
  if (report.unit !== unitId) out.push({ code: 'gate-report', message: `the report for ${unitId} names unit ${report.unit}` });
  for (const s of report.statesNotDone) out.push({ code: 'gate-not-done', message: `${s.id} is not done: ${s.why}` });
  const done = new Set(report.statesDone);
  for (const r of rows) {
    if (/^CAP-/.test(r.id)) continue;
    if (!done.has(r.id) && !report.statesNotDone.some((s) => s.id === r.id)) out.push({ code: 'gate-not-done', message: `${r.id} is owned by ${unitId} but the report does not say it is done` });
  }
  if (report.unitCheck.exit !== 0) {
    // Name the command the unit file holds NOW whenever it differs from the one the report ran.
    // Without this the failure quotes a command that no longer exists, and a builder resuming from
    // this file re-runs it and reports the same failure for ever - which is exactly what happened
    // to three builders at once when the correction WAS the command.
    const now = unitFile?.commands?.unitCheck ?? null;
    const stale = now && now !== report.unitCheck.command;
    out.push({
      code: 'gate-unit-check',
      message: stale
        ? `the builder's unit check exited ${report.unitCheck.exit} running "${report.unitCheck.command}", which is not the unit check any more: re-read your unit file and run "${now}"`
        : `the builder's unit check exited ${report.unitCheck.exit} (${report.unitCheck.command})`,
    });
  }
  return out;
}

/** Component tests at a ref: each file exists and contains every marker string (spec 6.3 item 1). */
async function componentTestFiles(ctx, ref, rows) {
  const failures = [];
  const files = [];
  for (const r of testedBy(rows)) {
    const test = r.reach.test;
    if (!test) { failures.push({ code: 'gate-component-test', message: `${r.id} (${r.reach.class}) names no component test` }); continue; }
    const buf = await ctx.git.show(ref, test.file);
    if (buf === null) { failures.push({ code: 'gate-component-test', message: `${r.id}: ${test.file} does not exist at ${ref.slice(0, 12)}` }); continue; }
    const text = buf.toString('utf8');
    const missing = markerStrings(r).filter((m) => !text.includes(m));
    if (missing.length) failures.push({ code: 'gate-component-test', message: `${r.id}: ${test.file} does not assert ${missing.map((m) => JSON.stringify(m)).join(', ')}` });
    else if (!files.includes(test.file)) files.push(test.file);
  }
  return { failures, files };
}

/** Files at a ref that import a stub (spec 12.1: the stub-swap unit's gate). */
async function stubImports(ctx, ref) {
  const r = await ctx.git.raw(['grep', '-l', '-E', "from ['\"][^'\"]*\\.stub(['\"/.])|import\\(['\"][^'\"]*\\.stub", ref, '--']);
  if (r.code !== 0) return [];
  return String(r.stdout).split('\n').map((l) => l.replace(new RegExp(`^${ref}:`), '')).filter((f) => f && !TEST_FILE_RE.test(f) && !/\.stub\./.test(f));
}

/**
 * A captured unit whose screen is still registered as a stub: the capture graded the stub, not the
 * unit's work. The plan's contracts say which stub this unit replaces (`consumers`), so another
 * screen's stub, still legitimately in place, is never named here.
 * Found on a real run: the wave-2 stub-swap unit owned the registry, so every wave-1 screen state
 * came back as its neighbour's text and four P1s described a symptom nobody could act on.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} ref
 * @param {object} plan
 * @param {string} unitId
 * @returns {Promise<{ code: string, message: string }[]>}
 */
async function stubStillRegistered(ctx, ref, plan, unitId) {
  const mine = (plan.contracts ?? []).filter((c) => c.stub && (c.consumers ?? []).includes(unitId));
  if (!mine.length) return [];
  const stubs = new Set(mine.map((c) => c.stub));
  const out = [];
  for (const f of await stubImports(ctx, ref)) {
    const buf = await ctx.git.show(ref, f);
    if (buf === null) continue;
    const text = buf.toString('utf8');
    const hit = [...stubs].find((stub) => text.includes(basename(stub).replace(/\.[jt]sx?$/, '')));
    if (hit) out.push({ code: 'gate-stub-registered', message: `${f} still imports ${hit} at ${ref.slice(0, 12)}, so the capture rendered the stub and not this unit's screen: the unit that builds a screen also points the registry at it` });
  }
  return out;
}

/**
 * The unit's branch must already contain the integration branch's head.
 *
 * A branch capture serves the unit's own tree, and in a wave built in parallel the siblings'
 * work reaches that tree only through the integration branch. A screen gated on a branch cut
 * before its words and its API routes landed is judged with neither: every message key renders as
 * its own name and every fetch answers 404, which reads as a broken screen and is a stale branch.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {object|null} unitFile
 * @param {string|null} headSha
 * @returns {Promise<{ code: string, message: string }|null>}
 */
async function behindBase(ctx, unitFile, headSha) {
  const base = unitFile?.baseRef;
  if (!base || !headSha) return null;
  const at = await ctx.git.raw(['rev-parse', base]);
  if (at.code !== 0) return null;
  const baseSha = String(at.stdout).trim();
  if ((await ctx.git.raw(['merge-base', '--is-ancestor', baseSha, headSha])).code === 0) return null;
  // A merged unit's branch is behind by definition and never catches up: its work is in the base
  // already, and nothing is captured against it again. Only a unit still waiting to merge can be
  // missing what a sibling merged.
  if ((await ctx.git.raw(['merge-base', '--is-ancestor', headSha, baseSha])).code === 0) return null;
  const counted = await ctx.git.raw(['rev-list', '--count', `${headSha}..${baseSha}`]);
  const n = Number(String(counted.stdout).trim() || 0) || 0;
  return {
    code: 'gate-behind-base',
    message: `${unitFile.branch ?? 'the unit branch'} is behind ${base}${n ? ` by ${n} commit(s)` : ''}: a branch capture serves this branch's own tree, so whatever a sibling unit has merged is missing from it. Merge ${base} into your branch, run the unit check again and rewrite your report`,
  };
}

async function contractFiles(ctx, ref, plan) {
  const out = [];
  for (const c of plan.contracts ?? []) {
    for (const f of [c.file, c.stub]) {
      if ((await ctx.git.show(ref, f)) === null) out.push({ code: 'gate-contract', message: `contract ${c.id}: ${f} does not exist at ${ref.slice(0, 12)}` });
    }
  }
  return out;
}

const sameSha = (a, b) => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));

/** The newest branch capture of this head that covers every state given. */
async function branchCaptureFor(paths, sha, states) {
  let names;
  try { names = await readdir(paths.captures); } catch { return null; }
  let best = null;
  for (const n of names.sort()) {
    const doc = await readJson(join(paths.captures, n, 'capture.json'), { optional: true }).catch(() => null);
    if (!doc || doc.mode !== 'branch' || !sameSha(doc.expectedSha, sha)) continue;
    const have = new Set(doc.items.map((i) => i.state));
    if (!states.every((s) => have.has(s))) continue;
    best = n;
  }
  return best;
}

function reachFailures(rows, verdicts) {
  const out = [];
  for (const r of rows) {
    const mine = verdicts.filter((v) => v.state === r.id && v.world === r.reach.world && v.role === r.reach.role);
    if (!mine.length) out.push({ code: 'gate-not-reached', message: `${r.id} has no capture in world ${r.reach.world} as ${r.reach.role}` });
    else for (const v of mine.filter((x) => x.status !== 'reached')) out.push({ code: 'gate-not-reached', message: `${r.id} not reached at ${v.width}/${v.locale}/${v.theme}: ${v.why ?? 'no reason given'}` });
  }
  return out;
}

async function findingFailures(paths, runId, plan, rows) {
  const doc = await readFindings(paths, runId);
  const ids = new Set(rows.map((r) => r.id));
  const byId = rowsById(plan);
  const out = [];
  for (const f of doc.findings) {
    if (f.status !== 'open' || !ids.has(f.state) || !GATE_CHECKS.some((c) => f.source === `check:${c}`)) continue;
    const { severity } = effectiveSeverity(f, byId);
    if (severity === 'P3') continue;
    out.push({ code: 'gate-finding', message: `${severity} ${f.id} ${f.state} ${f.where}: ${f.rule ?? ''} ${f.live}`.trim() });
  }
  return out;
}

/**
 * Whether a unit's gate is green for its branch head, recomputed from files only (the unit report,
 * the newest branch capture of its states re-validated, the findings for its states, its component
 * tests' presence). Never captures or builds anything.
 * Called by the phase-4 and phase-5 gates (A1) and wave merge (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} unitId
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function unitGateStatus(ctx, unitId) {
  return unitGateStatusWith(ctx, unitId, {});
}

/** unitGateStatus with an injectable validator (tests). */
export async function unitGateStatusWith(ctx, unitId, deps = {}) {
  const { paths, plan, unit, report, unitFile, rows } = await loadUnit(ctx, unitId);
  const failures = reportFailures(unitId, report, rows, unitFile);
  const head = await unitHead(ctx, report);
  if (report && !head) failures.push({ code: 'gate-no-head', message: `unit ${unitId}: branch ${report.branch} and its commits are not in this repository` });
  const stale = await behindBase(ctx, unitFile, head?.sha ?? null);
  if (stale) failures.push(stale);
  if (head) {
    const cap = capturedBy(rows);
    if (cap.length && !stale) {
      const runId = await branchCaptureFor(paths, head.sha, cap.map((r) => r.id));
      if (!runId) failures.push({ code: 'gate-no-capture', message: `no branch capture of ${head.sha.slice(0, 12)} covers ${unitId}'s states; run delivery gate ${unitId}` });
      else failures.push(...reachFailures(cap, await (deps.validateCaptureItems ?? validateCaptureItems)(ctx, runId)));
      if (unit.kind !== 'stub-swap') failures.push(...(await stubStillRegistered(ctx, head.sha, plan, unitId)));
    }
    failures.push(...(await componentTestFiles(ctx, head.sha, rows)).failures);
    if (unit.kind === 'contract') failures.push(...(await contractFiles(ctx, head.sha, plan)));
    if (unit.kind === 'stub-swap') {
      for (const f of await stubImports(ctx, head.sha)) failures.push({ code: 'gate-stub-import', message: `${f} still imports a stub at ${head.sha.slice(0, 12)}` });
    }
  }
  const state = await readJson(paths.state, { optional: true, exit: 5 }).catch(() => null);
  failures.push(...(await findingFailures(paths, state?.runId ?? `run-${paths.feature}`, plan, rows)));
  return gateResult(failures);
}

/**
 * `delivery gate <unit>`: capture, check, test, and write the failure file.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} unitId
 * @param {{ runCapture?: Function, runChecks?: Function }} [deps] injectable for tests
 * @returns {Promise<{ ok: boolean, failures: { code: string, message: string }[], captureRunId: string|null, head: string|null, file: string }>}
 */
export async function runUnitGate(ctx, unitId, deps = {}) {
  const { paths, plan, unit, report, unitFile, rows } = await loadUnit(ctx, unitId);
  const profile = await ctx.profile();
  const failures = reportFailures(unitId, report, rows, unitFile);
  const head = await unitHead(ctx, report);
  let captureRunId = null;
  if (report && !head) failures.push({ code: 'gate-no-head', message: `unit ${unitId}: branch ${report.branch} and its commits are not in this repository` });

  const stale = await behindBase(ctx, unitFile, head?.sha ?? null);
  // Before the capture, not after: six minutes spent grading a tree that is missing its siblings'
  // work answers a question nobody asked.
  if (stale) failures.push(stale);
  if (head) {
    const wt = (await ctx.git.worktrees()).find((w) => w.branch === report.branch);
    const cap = capturedBy(rows);
    if (cap.length && !stale) {
      const res = await (deps.runCapture ?? runCapture)(ctx, { mode: 'branch', unit: unitId, states: cap.map((r) => r.id), sha: head.sha });
      captureRunId = res.runId;
      const checked = await (deps.runChecks ?? realRunChecks)(ctx, [...GATE_CHECKS], { captureRunId });
      failures.push(...checked.failures.map((f) => ({ code: 'gate-check', message: `${f.code}: ${f.message}` })));
      const ids = new Set(rows.map((r) => r.id));
      const byId = rowsById(plan);
      for (const f of checked.findings) {
        if (!ids.has(f.state) || f.status !== 'open') continue;
        const { severity } = effectiveSeverity(f, byId);
        if (severity !== 'P3') failures.push({ code: 'gate-finding', message: `${severity} ${f.id} ${f.state} ${f.where}: ${f.rule ?? ''} ${f.live}`.trim() });
      }
      if (unit.kind !== 'stub-swap') failures.push(...(await stubStillRegistered(ctx, head.sha, plan, unitId)));
    }

    const tests = await componentTestFiles(ctx, head.sha, rows);
    failures.push(...tests.failures);
    if (!wt) {
      failures.push({ code: 'gate-no-worktree', message: `no worktree has ${report.branch} checked out, so the unit check and component tests cannot run` });
    } else {
      const run = (spec, env) => ctx.runner.sh(wrapHeavy(profile, fillCommand(profile.commands.unitCheck, { spec, dir: wt.path })), { cwd: wt.path, env, timeoutMs: COMMAND_TIMEOUT_MS });
      // One unit check over the tests' directory (or the unit's own); then each component test once
      // more with the component rendering nothing, which must fail (spec 6.3 items 2 and 3).
      const spec = tests.files.length ? commonDir(tests.files) : commonDir((unit.files ?? []).filter((f) => !/[*?]/.test(f)));
      const r = await run(spec, {});
      const green = r.code === 0;
      // Carry the last of what it printed. "exited 1" alone sent four builders off to re-derive a
      // cause the output named outright: the check was a repo script their branches predated, and
      // node said MODULE_NOT_FOUND on the first line.
      if (!green) failures.push({ code: 'gate-unit-check', message: `unit check on ${spec} exited ${r.code}${r.timedOut ? ' (timed out)' : ''}${lastLines(r)}` });
      if (green) {
        for (const file of tests.files) {
          const r = await run(file, { [RENDER_EMPTY_ENV]: '1' });
          if (r.code === 0) failures.push({ code: 'gate-component-test', message: `${file} still passes when the component renders nothing: it asserts nothing` });
        }
      }
    }
    if (unit.kind === 'contract') failures.push(...(await contractFiles(ctx, head.sha, plan)));
    if (unit.kind === 'stub-swap') {
      for (const f of await stubImports(ctx, head.sha)) failures.push({ code: 'gate-stub-import', message: `${f} still imports a stub` });
    }
    if (unit.kind === 'words') {
      const env = await loadCheckEnv(ctx, { needsCapture: false });
      const read = await readMessageFiles(env, { ref: head.sha });
      failures.push(...read.failures.map((f) => ({ code: 'gate-words', message: f.message })));
      for (const f of messageFindings(env, read.locales)) {
        if (f.severity === 'P1') failures.push({ code: 'gate-words', message: `${f.where}: ${f.cause}` });
      }
    }
  }

  const file = join(paths.units, `${unitId}.gate.json`);
  const ok = failures.length === 0;
  await writeJsonAtomic(file, { unit: unitId, head: head?.sha ?? null, captureRunId, at: ctx.clock.now().toISOString(), ok, failures });
  return { ok, failures, captureRunId, head: head?.sha ?? null, file };
}
