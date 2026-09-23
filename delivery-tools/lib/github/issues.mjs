// Issues by marker (spec 4.0 step 7, 4.3 step 5, 11.3). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// One epic per run, one child per build unit and per backend unit (sub-issues of the epic, claimed
// by the run's draft PR), one follow-up per cut row and one polish issue for P3 findings. The
// follow-ups reference the epic in their body but are not sub-issues: they outlive the epic by
// design, and an epic closes only when every sub-issue is closed. Nothing is ever deleted: a unit
// or cut that leaves the plan has its issue closed with a comment.

import { readFile } from 'node:fs/promises';
import { gateResult } from '../core/gate.mjs';
import { hasMarker, parseMarkers } from '../core/markers.mjs';
import { readFindings } from '../core/findings.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { updateState, formatEvent } from '../core/state.mjs';
import { exists, withLock } from '../core/fs.mjs';
import { UsageError } from '../core/exit.mjs';
import { deps, isNotImplemented } from '../lifecycle/deps.mjs';
import {
  runMarkers, readState, readPlan, updatePlan, fitBody, clip, repoRel,
} from '../lifecycle/run-info.mjs';
import { ensureIssue, ensureComment, findIssue, blockCurrent, sameText } from './write.mjs';
import { ensureScopeIssue } from './scope.mjs';

/** The command a repo runs to prove an epic done; the shim every target repo carries (spec 3.2). */
export const SHIM = 'node scripts/delivery.mjs';

/** "Done when" line of the epic (spec 4.0 step 7). */
export function doneWhen(epic) {
  return epic ? `Done when: \`${SHIM} land --check --epic ${epic}\` exits 0.` : `Done when: \`${SHIM} land --check\` for this epic exits 0.`;
}

/**
 * The epic's generated section. Works before the intent exists (intake's first pass) from the
 * founder's sentence alone.
 * @param {{ feature: string, sentence: string|null, intent?: object|null, plan?: object|null, followUps?: { number: number, what: string }[] }} o
 * @returns {(n: number|null) => string}
 */
export function renderEpicContent({ feature, sentence, intent = null, plan = null, followUps = [], deliveryRoot = 'docs/delivery', designRoot = 'docs/design' }) {
  return (n) => {
    const lines = [`**Delivery run \`${feature}\`.** ${intent?.sentence ?? sentence ?? ''}`.trim(), ''];
    if (intent?.job) lines.push(intent.job, '');
    if (intent?.inScope?.length) lines.push(`Screens in scope: ${intent.inScope.map((s) => s.screen).join(', ')}.`);
    if (intent?.outOfScope?.length) lines.push(`Out of scope: ${intent.outOfScope.map((s) => `${s.screen} (${s.why})`).join('; ')}.`);
    if (intent?.inScope?.length || intent?.outOfScope?.length) lines.push('');
    lines.push(`Design snapshot: \`${designRoot}/${feature}/\`. The plan is \`${deliveryRoot}/${feature}/plan.json\`; the spec rendered from it is the comment below.`);
    if (plan?.units?.length) {
      lines.push('', 'Build units (sub-issues, claimed by the run\'s draft pull request):');
      for (const u of plan.units) lines.push(`- ${u.issue ? `#${u.issue}` : '(not filed yet)'} ${u.id}: ${u.title} (wave ${u.wave})`);
    }
    if (followUps.length) {
      lines.push('', 'Follow-ups this run filed and did not build (not part of done):');
      for (const f of followUps) lines.push(`- #${f.number} ${f.what}`);
    }
    lines.push('', doneWhen(n));
    return lines.join('\n');
  };
}

/** A build or backend unit's generated section. */
export function renderUnitContent({ unit, epic, feature, deliveryRoot = 'docs/delivery' }) {
  const lines = [
    `Part of #${epic}, the \`${feature}\` delivery run. A delivery builder builds it in wave ${unit.wave}; the run's draft pull request claims it, so no other lane should take it.`,
    '',
    `**${unit.id}: ${unit.title}** (${unit.kind}, risk ${unit.risk})`,
  ];
  if (unit.states?.length) lines.push('', `States: ${unit.states.join(', ')}`);
  if (unit.capabilities?.length) lines.push('', `Capabilities kept or moved: ${unit.capabilities.join(', ')}`);
  if (unit.files?.length) {
    lines.push('', 'Files:');
    for (const f of unit.files) lines.push(`- \`${f}\``);
  }
  lines.push('', `Every state's row (class, reach, markers, copy) is in \`${deliveryRoot}/${feature}/plan.json\`.`);
  return lines.join('\n');
}

/** A cut row's follow-up section. */
export function renderCutContent({ row, epic, feature, scope = [] }) {
  const line = row.scopeLine ?? scope.find((s) => s.rows.includes(row.id))?.line ?? null;
  const lines = [
    `Follow-up of #${epic}, the \`${feature}\` delivery run, which did not build this designed state.`,
    '',
    `**${row.id}** was cut, reason \`${row.reason?.code ?? 'none given'}\`: ${row.reason?.text ?? 'no reason recorded'}.`,
  ];
  if (row.requested) lines.push('', `It was requested in the design rounds (${row.requested}), so the cut went through Scope line ${line ?? '(none yet)'}.`);
  lines.push('', 'Unclaimed: any lane may take it.');
  return lines.join('\n');
}

/** The polish issue's section: every P3 that was filed rather than fixed. */
export function renderPolishContent({ findings, epic, feature }) {
  const lines = [
    `Small differences between the design and the build of \`${feature}\` (#${epic}), filed rather than fixed during the run. Any lane may take them after the merge.`,
    '',
  ];
  for (const f of findings) {
    lines.push(`- **${f.state}** \`${f.where}\`: design "${clip(f.design, 120)}", live "${clip(f.live, 120)}"${f.cause ? ` (${clip(f.cause, 80)})` : ''}`);
  }
  return lines.join('\n');
}

/** P3 findings the polish issue lists: open or already filed. */
export function polishFindings(doc) {
  return (doc?.findings ?? []).filter((f) => f.severity === 'P3' && (f.status === 'open' || f.status === 'filed'))
    .sort((a, b) => (a.state + a.where).localeCompare(b.state + b.where));
}

function unitTitle(feature, unit) { return `[${feature}] ${unit.id}: ${unit.title}`; }
function cutTitle(feature, row) { return `[${feature}] Follow-up: build ${row.id} (cut, ${row.reason?.code ?? 'no reason'})`; }
function polishTitle(feature, n) { return `[${feature}] Polish: ${n} small design difference${n === 1 ? '' : 's'}`; }

/**
 * The spec comment's text: renderSpec(plan) (B1), else spec.md on disk when B1 has not landed.
 * @returns {Promise<string|null>}
 */
export async function specText(ctx, plan, paths) {
  try {
    return String(await deps(ctx).renderSpec(plan));
  } catch (err) {
    if (!isNotImplemented(err)) throw err;
    if (await exists(paths.spec)) return readFile(paths.spec, 'utf8');
    return null;
  }
}

/**
 * The run's epic: the number the run recorded (intent, plan, state) when it carries the marker,
 * else the issue carrying <!-- delivery:<feature>:epic --> in any state, else the one intent.json
 * names even without the marker (verifyIntake then reports the missing marker). Null when none.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gh.mjs').Issue|null>}
 */
export async function findEpic(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const marker = runMarkers(profile, paths.feature).epic();
  const known = await knownEpicNumbers(paths);
  const { issue } = await findIssue(ctx, { marker, known });
  if (issue) return issue;
  for (const n of known) {
    const i = await ctx.gh.issueGet(n);
    if (i && !i.isPr) return i;
  }
  return null;
}

async function knownEpicNumbers(paths) {
  const out = [];
  const intent = await readArtefact(paths, 'intent', { optional: true }).catch(() => null);
  if (intent?.epic) out.push(intent.epic);
  const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
  if (plan?.epic) out.push(plan.epic);
  const state = await readState(paths).catch(() => null);
  if (state?.epic) out.push(state.epic);
  return [...new Set(out)];
}

/** The founder's sentence: given, else intent.json's, else the one intake kept. */
async function sentenceOf(paths, given, intent) {
  if (intent?.sentence) return intent.sentence;
  if (given) return given;
  try { return (await readFile(`${paths.intentDir}/sentence.txt`, 'utf8')).trim() || null; } catch { return null; }
}

/**
 * Find, adopt or create the epic (spec 4.0 step 7; issues sync --epic-only). The body is a pure
 * function of the intent, the kept sentence and the plan on disk (unless a plan is passed), so
 * intake, issues sync and issues sync --epic-only all write the same body and never undo each
 * other.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ paths: object, profile: object, sentence?: string|null, adopt?: number|null, dryRun?: boolean, plan?: object|null }} o
 * @returns {Promise<{ number: number|null, action: string }>}
 */
export async function syncEpic(ctx, { paths, profile, sentence = null, adopt = null, dryRun = false, plan: given = undefined }) {
  const feature = paths.feature;
  const marks = runMarkers(profile, feature);
  const intent = await readArtefact(paths, 'intent', { optional: true }).catch(() => null);
  const plan = given === undefined ? await readArtefact(paths, 'plan', { optional: true }).catch(() => null) : given;
  const theSentence = await sentenceOf(paths, sentence, intent);
  const followUps = (plan?.rows ?? []).filter((r) => r.class === 'cut' && r.issue).map((r) => ({ number: r.issue, what: `cut ${r.id} (${r.reason?.code ?? 'no reason'})` }));
  const title = clip(theSentence ?? `Deliver the ${feature} design`, 120).replace(/\.$/, '');
  const res = await ensureIssue(ctx, {
    marker: marks.epic(),
    block: marks.block('epic'),
    content: renderEpicContent({
      feature, sentence: theSentence, intent, plan, followUps,
      deliveryRoot: profile.paths.deliveryRoot, designRoot: profile.paths.designRoot,
    }),
    title,
    labels: profile.issues.epicLabels,
    type: profile.issues.epicType,
    known: await knownEpicNumbers(paths),
    adopt,
    dryRun,
  });
  return res;
}

/**
 * Every issue the plan wants besides the epic and the Scope issue, as ensureIssue specs.
 * Pure over the plan, the profile and the findings document.
 */
export function desiredChildren({ plan, profile, feature, findingsDoc = null }) {
  const marks = runMarkers(profile, feature);
  const epic = plan.epic;
  const out = [];
  for (const unit of plan.units) {
    out.push({
      key: `${unit.kind === 'backend' ? 'backend' : 'unit'} ${unit.id}`,
      kind: unit.kind === 'backend' ? 'backend' : 'unit',
      id: unit.id,
      marker: marks.child(unit),
      block: marks.block('body'),
      content: renderUnitContent({ unit, epic, feature, deliveryRoot: profile.paths.deliveryRoot }),
      title: unitTitle(feature, unit),
      labels: profile.issues.childLabels,
      known: [unit.issue],
      parent: epic,
      subIssues: profile.issues.subIssues,
    });
  }
  for (const row of plan.rows.filter((r) => r.class === 'cut')) {
    out.push({
      key: `cut ${row.id}`,
      kind: 'cut',
      id: row.id,
      marker: marks.cut(row.id),
      block: marks.block('body'),
      content: renderCutContent({ row, epic, feature, scope: plan.scope }),
      title: cutTitle(feature, row),
      labels: profile.issues.childLabels,
      known: [row.issue],
      parent: null,
      subIssues: false,
    });
  }
  const p3 = polishFindings(findingsDoc);
  if (p3.length) {
    out.push({
      key: 'polish',
      kind: 'polish',
      id: null,
      marker: marks.polish(),
      block: marks.block('body'),
      content: renderPolishContent({ findings: p3, epic, feature }),
      title: polishTitle(feature, p3.length),
      labels: profile.issues.polishLabels,
      known: [],
      parent: null,
      subIssues: false,
    });
  }
  return out;
}

/**
 * issues sync: the epic, every child, the Scope issue, the spec comment; write back the numbers.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ epicOnly?: boolean, adopt?: number|null, dryRun?: boolean, sentence?: string|null }} [opts]
 * @returns {Promise<{ lines: string[], counts: { created: number, updated: number, closed: number, unchanged: number }, epic: number|null }>}
 */
export async function syncIssues(ctx, { epicOnly = false, adopt = null, dryRun = false, sentence = null } = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const feature = paths.feature;
  const counts = { created: 0, updated: 0, closed: 0, unchanged: 0 };
  const lines = [];
  const note = (action, what, n) => {
    if (action === 'created' || action === 'adopted') counts.created++;
    else if (action === 'updated') counts.updated++;
    else if (action === 'closed') counts.closed++;
    else counts.unchanged++;
    const verb = dryRun ? { created: 'would create', adopted: 'would adopt', updated: 'would update', closed: 'would close', unchanged: 'in sync' }[action] : { created: 'created', adopted: 'adopted', updated: 'updated', closed: 'closed', unchanged: 'in sync' }[action];
    lines.push(`${what}${n ? ` #${n}` : ''}: ${verb}`);
  };

  if (epicOnly) {
    const res = await syncEpic(ctx, { paths, profile, sentence, adopt, dryRun });
    note(res.action, 'epic', res.number);
    for (const d of res.duplicatesClosed) note('closed', `duplicate epic`, d);
    if (!dryRun && res.number) await recordEpicNumber(ctx, paths, res.number);
    return { lines, counts, epic: res.number };
  }

  let plan = await readPlan(paths, { optional: true });
  if (!plan) throw new UsageError(`no plan at ${repoRel(paths.repoRoot, paths.plan)}; write the plan first, or pass --epic-only`);
  const findingsDoc = await readFindings(paths, 'unknown').catch(() => null);

  // The epic first: every child is its sub-issue, and plan.epic must name the marked epic.
  const first = await syncEpic(ctx, { paths, profile, sentence, adopt: adopt ?? null, dryRun, plan });
  if (first.action !== 'unchanged') note(first.action, 'epic', first.number);
  if (!dryRun && first.number && plan.epic !== first.number) {
    lines.push(`plan.json named epic #${plan.epic}; the epic carrying this run's marker is #${first.number}, so the plan now names it`);
    plan = (await updatePlan(paths, (p) => ({ ...p, epic: first.number }))).plan;
  }

  // Then the children.
  const numbers = new Map();
  for (const want of desiredChildren({ plan, profile, feature, findingsDoc })) {
    const res = await ensureIssue(ctx, { ...want, dryRun });
    note(res.action, want.key, res.number);
    for (const d of res.duplicatesClosed) note('closed', `duplicate of ${want.key}`, d);
    numbers.set(want.key, res.number);
  }

  // Issues this feature filed for units or cuts the plan no longer has: close, never delete.
  const wantedMarkers = new Set(desiredChildren({ plan, profile, feature, findingsDoc }).map((w) => w.marker));
  for (const stale of await staleChildren(ctx, { profile, feature, wantedMarkers })) {
    if (!dryRun) await ctx.gh.issueClose(stale.number, { comment: stale.comment });
    note('closed', stale.what, stale.number);
  }

  // Write the numbers back: plan (units, cut rows), then the polish findings' status.
  if (!dryRun) {
    const res = await updatePlan(paths, (p) => {
      for (const u of p.units) {
        const n = numbers.get(`${u.kind === 'backend' ? 'backend' : 'unit'} ${u.id}`);
        if (n) u.issue = n;
      }
      for (const r of p.rows) {
        const n = r.class === 'cut' ? numbers.get(`cut ${r.id}`) : null;
        if (n) r.issue = n;
      }
      return p;
    });
    plan = res.plan;
    const polish = numbers.get('polish');
    if (polish) await markPolishFiled(paths, findingsDoc);
    await recordTaskIssues(paths, plan);
  }

  // The epic again, now that the children have numbers to list.
  const epicRes = dryRun ? first : await syncEpic(ctx, { paths, profile, sentence, dryRun, plan });
  if (first.action === 'unchanged') note(epicRes.action, 'epic', epicRes.number);
  const epicNumber = epicRes.number ?? plan.epic;
  if (!dryRun && epicRes.number) await recordEpicNumber(ctx, paths, epicRes.number);

  // The spec comment on the epic, updated in place.
  const spec = await specText(ctx, plan, paths);
  if (spec === null) {
    lines.push('spec comment: not posted (spec.md cannot be rendered yet)');
  } else if (epicNumber) {
    const marks = runMarkers(profile, feature);
    const body = `${marks.spec()}\n${fitBody(spec, { rest: `\`${repoRel(paths.repoRoot, paths.spec)}\`` })}`;
    const res = dryRun && !epicRes.number ? { action: 'created' } : await ensureComment(ctx, { issue: epicNumber, marker: marks.spec(), body, dryRun });
    note(res.action, 'spec comment on the epic', null);
  }

  // The Scope issue: its lines are kept current here; scope post takes the snapshot.
  const scopeRes = await ensureScopeIssue(ctx, { paths, profile, plan, epic: epicNumber, dryRun, snapshot: false });
  note(scopeRes.action, 'scope', scopeRes.number);

  return { lines, counts, epic: epicNumber };
}

/** Open issues of this feature whose unit, backend or cut marker the plan no longer wants. */
async function staleChildren(ctx, { profile, feature, wantedMarkers }) {
  const prefix = profile.issues.markerPrefix || 'delivery';
  const open = await ctx.gh.issueList({ state: 'open', labels: profile.issues.childLabels });
  const out = [];
  for (const issue of open) {
    for (const m of parseMarkers(issue.body, { prefix })) {
      if (m.closing || m.feature !== feature || !['unit', 'backend', 'cut'].includes(m.kind)) continue;
      const canonical = `<!-- ${prefix}:${feature}:${m.kind}:${m.id} -->`;
      if (wantedMarkers.has(canonical)) continue;
      const what = m.kind === 'cut' ? `cut ${m.id}` : `${m.kind} ${m.id}`;
      const comment = m.kind === 'cut'
        ? `${m.id} is no longer cut in the \`${feature}\` plan (built after all, or no longer in the plan), so this follow-up is closed by delivery issues sync.`
        : `Unit ${m.id} is no longer in the \`${feature}\` plan, so this issue is closed by delivery issues sync. Nothing was deleted.`;
      out.push({ number: issue.number, what, comment });
      break;
    }
  }
  return out;
}

async function recordEpicNumber(ctx, paths, number) {
  const intent = await readArtefact(paths, 'intent', { optional: true }).catch(() => null);
  if (intent && intent.epic !== number) await writeArtefact(paths, 'intent', { ...intent, epic: number });
  if (await exists(paths.state)) {
    const state = await readState(paths);
    if (state.epic !== number) {
      await updateState(paths, (s) => ({ ...s, epic: number }), {
        at: ctx.clock.now().toISOString(), event: formatEvent({ command: 'issues sync', counts: { epic: number } }), inputs: { epic: number }, outputs: { epic: number },
      });
    }
  }
}

async function markPolishFiled(paths, findingsDoc) {
  if (!findingsDoc) return;
  await withLock(`${paths.findings}.lock`, async () => {
    const doc = await readFindings(paths, findingsDoc.runId);
    let changed = false;
    for (const f of doc.findings) if (f.severity === 'P3' && f.status === 'open') { f.status = 'filed'; changed = true; }
    if (changed) await writeArtefact(paths, 'findings', doc);
  });
}

/** A preflight task whose id is a plan unit id gets that unit's issue number (spec 4.1). */
async function recordTaskIssues(paths, plan) {
  const pre = await readArtefact(paths, 'preflight', { optional: true }).catch(() => null);
  if (!pre?.tasks?.length) return;
  const byId = new Map(plan.units.map((u) => [u.id, u.issue]));
  let changed = false;
  const tasks = pre.tasks.map((t) => {
    const n = byId.get(t.id);
    if (n && t.issue !== n) { changed = true; return { ...t, issue: n }; }
    return t;
  });
  if (changed) await writeArtefact(paths, 'preflight', { ...pre, tasks });
}

/**
 * Phase-3 gate input, read-only: every unit, backend unit, cut follow-up and (when P3s exist) the
 * polish issue is found by record or marker and its generated section matches the plan, and the
 * spec comment on the epic is current.
 * Called by lib/gates/phase-3.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function issuesSyncedGate(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readPlan(paths);
  const findingsDoc = await readFindings(paths, 'unknown').catch(() => null);
  const failures = [];
  const fix = 'run delivery issues sync';

  const epic = await findEpic(ctx);
  const marks = runMarkers(profile, paths.feature);
  if (!epic) failures.push({ code: 'issues', message: `no epic carries ${marks.epic()} (${fix})` });
  else if (!hasMarker(epic.body, marks.epic())) failures.push({ code: 'issues', message: `epic #${epic.number} lacks its marker (${fix})` });
  else if (epic.number !== plan.epic) failures.push({ code: 'issues', message: `plan.json names epic #${plan.epic}, the marked epic is #${epic.number} (${fix})` });

  for (const want of desiredChildren({ plan, profile, feature: paths.feature, findingsDoc })) {
    const { issue } = await findIssue(ctx, { marker: want.marker, known: want.known });
    if (!issue) { failures.push({ code: 'issues', message: `${want.key} has no issue (${fix})` }); continue; }
    if (!blockCurrent(issue.body, want.block, want.content)) failures.push({ code: 'issues', message: `${want.key} #${issue.number}: its generated section differs from the plan (${fix})` });
    if (want.kind === 'unit' || want.kind === 'backend') {
      const unit = plan.units.find((u) => u.id === want.id);
      if (unit && unit.issue !== issue.number) failures.push({ code: 'issues', message: `plan.json records #${unit.issue ?? 'none'} for ${want.key}, the marked issue is #${issue.number} (${fix})` });
    }
  }

  if (epic) {
    const spec = await specText(ctx, plan, paths);
    if (spec === null) failures.push({ code: 'issues', message: 'spec.md cannot be rendered, so the spec comment cannot be checked' });
    else {
      const c = await ctx.gh.findCommentByMarker(epic.number, marks.spec());
      const body = `${marks.spec()}\n${fitBody(spec, { rest: `\`${repoRel(paths.repoRoot, paths.spec)}\`` })}`;
      if (!c) failures.push({ code: 'issues', message: `epic #${epic.number} has no spec comment (${fix})` });
      else if (!sameText(c.body, body)) failures.push({ code: 'issues', message: `the spec comment on #${epic.number} is older than the plan (${fix})` });
    }
  }
  return gateResult(failures);
}
