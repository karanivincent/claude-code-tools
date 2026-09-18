// Land after the merge (spec 4.7). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Every step recomputes from its source: the deploy waiter and the migrations check are run again,
// workflow runs for the merge commit are read from GitHub, reverts from git, the staging capture's
// files are re-validated and re-checked, the children's state and the ready record are read fresh.
// Two facts have no source but the run's own record: that the owed loop test passed on staging
// (dialling again to check would place a second call), and nothing else. That one is read from
// the journal, and only for the merge SHA.
//
// `land --check` is the epic's evidence command, so it never writes and never needs the epic
// closed (the repo's close script runs it before closing). landGate, the phase-7 gate, is the same
// evidence plus the epic being closed.

import { readdir } from 'node:fs/promises';
import { gateResult } from '../core/gate.mjs';
import { fillCommand } from '../core/profile.mjs';
import { parseMarkers, hasMarker } from '../core/markers.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { featurePaths, UNIT_ID_RE } from '../core/paths.mjs';
import { discoverRuns } from '../core/discovery.mjs';
import { parseEvent, updateState, formatEvent } from '../core/state.mjs';
import { exists } from '../core/fs.mjs';
import { worstExit, EXIT, UsageError } from '../core/exit.mjs';
import { deps } from './deps.mjs';
import {
  runMarkers, readState, readPlan, findRunPr, matchesAny, lastLine, clip, claimedChildren,
} from './run-info.mjs';
import { ensureComment } from '../github/write.mjs';
import { upsertHandoverBlock } from './handover.mjs';

/** A check's outcome: ok, or red (1), pending (4) or inconsistent (5). */
const ok = (id, detail) => ({ id, ok: true, exit: 0, detail });
const red = (id, detail, exit = EXIT.RED) => ({ id, ok: false, exit, detail });

/**
 * A ctx aimed at the run's own paths, for a land started from another worktree (the epic's
 * close script can run anywhere): requirePaths and journal then point at the run's state.
 */
export function withRun(ctx, paths) {
  if (ctx.paths && ctx.paths.state === paths.state) return ctx;
  const c = { ...ctx, feature: paths.feature, paths, requirePaths: () => paths };
  c.journal = async ({ command, exit = null, counts = {}, inputs = null, outputs = null }) => {
    if (!(await exists(paths.state))) return false;
    await updateState(paths, (s) => s, { at: ctx.clock.now().toISOString(), event: formatEvent({ command, exit, counts }), inputs, outputs });
    return true;
  };
  return c;
}

/**
 * The run a `land --epic N` is about: --feature or this worktree's run, else the feature named by
 * the epic's own marker, found in whichever worktree holds its run.
 */
export async function landPaths(ctx, { epic }) {
  if (ctx.paths) return ctx.requirePaths();
  const profile = await ctx.profile();
  const issue = await ctx.gh.issueGet(epic);
  if (!issue) throw new UsageError(`issue #${epic} does not exist`);
  const prefix = profile.issues.markerPrefix || 'delivery';
  const m = parseMarkers(issue.body, { prefix }).find((x) => !x.closing && x.kind === 'epic' && x.feature);
  if (!m) throw new UsageError(`#${epic} carries no delivery epic marker; pass --feature`);
  const run = (await discoverRuns(ctx.git, { runRoot: profile.paths.runRoot })).find((r) => r.feature === m.feature);
  return featurePaths(run ? run.worktree : ctx.repoRoot, m.feature, profile.paths);
}

/** Workflow runs of one commit: ok when every run completed well, pending while any runs. Pure. */
export function judgeWorkflowRuns(runs, sha) {
  const list = runs ?? [];
  if (!list.length) return { state: 'pending', detail: `no workflow run registered for ${sha.slice(0, 7)} yet` };
  const running = list.filter((r) => r.status !== 'completed');
  const bad = list.filter((r) => r.status === 'completed' && !['success', 'skipped', 'neutral'].includes(r.conclusion));
  if (bad.length) return { state: 'red', detail: `${bad.map((r) => `${r.name} ${r.conclusion}`).join(', ')} on ${sha.slice(0, 7)}` };
  if (running.length) return { state: 'pending', detail: `${running.map((r) => r.name).join(', ')} still running on ${sha.slice(0, 7)}` };
  return { state: 'green', detail: `${list.length} workflow run${list.length === 1 ? '' : 's'} green on ${sha.slice(0, 7)} (${[...new Set(list.map((r) => r.name))].join(', ')})` };
}

/** The next tag for this feature from the profile's format ({n} numbered across every tag). */
export function nextTag(tagFormat, feature, existingTags) {
  const re = new RegExp(`^${String(tagFormat).split(/(\{n\}|\{slug\})/).map((p) => (p === '{n}' ? '(\\d+)' : p === '{slug}' ? '[a-z0-9-]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`);
  let max = 0;
  for (const t of existingTags) {
    const m = t.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(tagFormat).replace(/\{n\}/g, String(max + 1)).replace(/\{slug\}/g, feature);
}

/** The release block (spec 4.7 step 9). Pure. */
export function releaseBlock({ feature, base, pr, mergeSha, pending, tag, tagRequired, tagWhy, profile, loopTest }) {
  const lines = [
    '### Release block for production',
    '',
    `The \`${feature}\` delivery run is merged into \`${base}\` as ${mergeSha.slice(0, 7)} (PR #${pr}). The release itself stays with you.`,
    '',
    '- Migrations pending production:',
    ...(pending.ok ? (pending.lines.length ? pending.lines.map((l) => `  - ${l}`) : ['  - none reported']) : [`  - the pending-production check failed (${pending.detail}); read the ledgers by hand before releasing`]),
    tagRequired
      ? `- Tag required (${tagWhy}): create \`${tag}\` on the production branch before merging \`${base}\` into it, so the tag keeps the last commit of the state this replaces.`
      : `- No tag required: nothing was removed on purpose (${tagWhy}).`,
    `- Title the release PR with \`${profile.release.prodTitlePrefix}\` and merge it with a merge commit, never a squash.`,
    `- Loop test: ${loopTest}.`,
  ];
  return lines.join('\n');
}

async function runCheck(id, fn) {
  try { return await fn(); } catch (err) {
    if (err && typeof err.exit === 'number') return red(id, err.message, err.exit);
    throw err;
  }
}

/**
 * Every after-merge step for the run's merged PR. mode "land" also acts: it runs the owed loop
 * test (once per merge SHA) and writes the release block; mode "check" only reads.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ epic: number, mode?: 'check'|'land' }} o
 * @returns {Promise<{ checks: object[], pr: object|null, mergeSha: string|null, paths: object }>}
 */
export async function landEvidence(outer, { epic, mode = 'check' }) {
  const paths = await landPaths(outer, { epic });
  const ctx = withRun(outer, paths);
  const profile = await ctx.profile();
  const d = deps(ctx);
  const state = await readState(paths);
  const plan = await readPlan(paths, { optional: true });
  const marks = runMarkers(profile, paths.feature);
  const checks = [];

  const epicIssue = await ctx.gh.issueGet(epic);
  if (!epicIssue || !hasMarker(epicIssue.body, marks.epic())) checks.push(red('epic', `#${epic} is not this run's epic (it lacks ${marks.epic()})`));
  else checks.push(ok('epic', `#${epic} is the run's epic`));

  const pr = await findRunPr(ctx, { profile, feature: paths.feature, state });
  if (!pr) return { checks: [...checks, red('merge', 'the run has no PR')], pr: null, mergeSha: null, paths };
  if (pr.state !== 'merged' || !pr.mergeCommit) {
    return { checks: [...checks, red('merge', `PR #${pr.number} is ${pr.state === 'open' ? 'not merged yet; land runs after the founder\'s merge' : 'closed without a merge'}`)], pr, mergeSha: null, paths };
  }
  const mergeSha = pr.mergeCommit;
  const sha12 = mergeSha.slice(0, 12);
  checks.push(ok('merge', `PR #${pr.number} merged into ${pr.baseRefName || profile.repo.base} as ${mergeSha.slice(0, 7)}`));

  // 1. The staging deploy of the merge commit.
  checks.push(await runCheck('deploy', async () => {
    const r = await ctx.runner.sh(fillCommand(profile.commands.stagingDeployWait, { sha: mergeSha }), { cwd: ctx.repoRoot, timeoutMs: mode === 'check' ? 5 * 60_000 : 30 * 60_000 });
    if (r.code === 0) return ok('deploy', `the ${profile.environments.test.name} deploy serves ${mergeSha.slice(0, 7)}`);
    if ([2, 4, 124].includes(r.code)) return red('deploy', `the deploy of ${mergeSha.slice(0, 7)} is not live yet (${lastLine(r.stderr, r.stdout) || `exit ${r.code}`})`, EXIT.WAIT);
    return red('deploy', `the deploy waiter exited ${r.code}: ${lastLine(r.stderr, r.stdout)}`);
  }));

  // 2. Migrations owed on the test environment.
  checks.push(await runCheck('migrations', async () => {
    const r = await ctx.runner.sh(profile.commands.migrationsOwed, { cwd: ctx.repoRoot, timeoutMs: 5 * 60_000 });
    if (r.code === 0) return ok('migrations', `no migration owed on ${profile.environments.test.name}`);
    return red('migrations', `migrations owed on ${profile.environments.test.name} (exit ${r.code}): ${lastLine(r.stdout, r.stderr)}`, r.code === 124 ? EXIT.WAIT : EXIT.RED);
  }));

  // 3. Every workflow run for the merge commit (migrations apply, staging E2E, guards) and no revert.
  checks.push(await runCheck('workflows', async () => {
    const res = await ctx.gh.api('GET', `repos/${ctx.gh.repo}/actions/runs?head_sha=${mergeSha}&per_page=100`);
    const j = judgeWorkflowRuns(res?.workflow_runs ?? [], mergeSha);
    return j.state === 'green' ? ok('workflows', j.detail) : red('workflows', j.detail, j.state === 'pending' ? EXIT.WAIT : EXIT.RED);
  }));
  checks.push(await runCheck('guards', async () => {
    const base = profile.repo.base;
    await ctx.git.raw(['fetch', 'origin', base]);
    const r = await ctx.git.raw(['log', '--format=%h %s', `origin/${base}`, `--grep=This reverts commit ${mergeSha}`]);
    const reverts = String(r.stdout ?? '').split('\n').filter(Boolean);
    if (reverts.length) return red('guards', `the merge was reverted on ${base}: ${reverts[0]}`);
    const open = await ctx.gh.issueList({ state: 'open' });
    const short = mergeSha.slice(0, 7);
    const naming = open.filter((i) => !parseMarkers(i.body, { prefix: marks.prefix }).some((m) => m.feature === paths.feature)
      && (`${i.title}\n${i.body}`.includes(short)));
    if (naming.length) return red('guards', `open issue #${naming[0].number} "${clip(naming[0].title, 60)}" names the merge commit ${short}`);
    return ok('guards', `no revert of ${short} on ${base}, and no open issue names it`);
  }));

  // 4. The owed loop test, once per merge SHA.
  const files = await ctx.gh.prFiles(pr.number).catch(() => []);
  const voice = files.filter((f) => matchesAny(f, profile.commands.loopTest.when));
  const ready = await readArtefact(paths, 'ready', { optional: true }).catch(() => null);
  const owed = voice.length > 0 && (!ready || (ready.owedAfterMerge ?? []).some((o) => /loop/i.test(o)));
  let loopText = 'not owed';
  if (!owed) checks.push(ok('loop-test', voice.length ? 'passed on the preview before the merge' : 'no changed path needs one'));
  else {
    const passed = (state?.journal ?? []).some((e) => {
      const ev = parseEvent(e.event);
      return ev.command === 'land loop-test' && ev.exit === 0 && ev.counts.sha === sha12;
    });
    if (passed) { checks.push(ok('loop-test', `passed on staging for ${mergeSha.slice(0, 7)}`)); loopText = 'passed on staging after the merge'; }
    else if (mode === 'check') checks.push(red('loop-test', `the loop test owed after the merge has not passed on staging for ${mergeSha.slice(0, 7)} (run delivery land)`));
    else {
      checks.push(await runCheck('loop-test', async () => {
        const cmd = fillCommand(profile.commands.loopTest.stagingCommand, { epic, pr: pr.number, sha: mergeSha });
        const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: 30 * 60_000 });
        await ctx.journal({ command: 'land loop-test', exit: r.code, counts: { sha: sha12 }, inputs: { cmd }, outputs: { code: r.code } });
        if (r.code === 0) return ok('loop-test', `passed on staging for ${mergeSha.slice(0, 7)}`);
        if (r.code === 4) return red('loop-test', `the daily call allowance is spent; the loop test waits for the reset (never a skip): ${lastLine(r.stdout, r.stderr)}`, EXIT.WAIT);
        return red('loop-test', `the loop test on staging exited ${r.code}: ${lastLine(r.stdout, r.stderr)}`);
      }));
      loopText = checks[checks.length - 1].ok ? 'passed on staging after the merge' : 'owed, not yet passed';
    }
  }

  // 5. The staging audit's captures, re-validated and re-checked from their files.
  checks.push(...await stagingAudit(ctx, { paths, profile, state, mergeSha, d }));

  // 6. Teardown: nothing the run created is left outside its worlds.
  checks.push(await runCheck('teardown', async () => {
    const { findings, failures } = await d.runChecks(ctx, ['M14'], { record: false });
    if (failures.length) return red('teardown', failures[0].message);
    if (findings.length) return red('teardown', `${findings.length} leftover row group(s), first ${findings[0].where}`);
    return ok('teardown', 'no rows left behind outside the fixture worlds');
  }));

  // 7. Children closed by the PR's Closes lines.
  checks.push(await runCheck('children', async () => {
    const openKids = [];
    for (const c of claimedChildren(plan).filter((x) => x.issue)) {
      const i = await ctx.gh.issueGet(c.issue);
      if (!i || i.state !== 'closed') openKids.push(`#${c.issue} (${c.unit})`);
    }
    return openKids.length ? red('children', `still open after the merge: ${openKids.join(', ')}`) : ok('children', 'every build and backend child is closed');
  }));

  // 8. The PR was made ready with a green ready record for its head SHA.
  checks.push(await runCheck('ready-record', async () => {
    const r = await d.checkReady(ctx, { pr: pr.number });
    return r.ok ? ok('ready-record', `ready.json was green for ${String(r.headSha ?? pr.headRefOid).slice(0, 7)}`) : red('ready-record', r.failures.map((f) => f.message).join('; '), r.exit ?? EXIT.RED);
  }));

  // 9. The release block: written by land, required by --check.
  checks.push(await runCheck('release', async () => {
    if (mode === 'check') {
      const c = await ctx.gh.findCommentByMarker(epic, marks.release());
      return c ? ok('release', `the release block is on #${epic}`) : red('release', `no release block on #${epic} yet (run delivery land)`);
    }
    const res = await writeRelease(ctx, { paths, profile, plan, pr, mergeSha, epic, loopText });
    return res.ok ? ok('release', `release block ${res.action} on #${epic} and in the handover`) : red('release', res.detail);
  }));

  return { checks, pr, mergeSha, paths };
}

async function stagingAudit(ctx, { paths, profile, state, mergeSha, d }) {
  const out = [];
  let runs = [];
  try { runs = (await readdir(paths.captures)).filter((n) => UNIT_ID_RE.test(n)).sort(); } catch { runs = []; }
  const matching = { staging: null, 'real-org': null };
  for (const runId of runs) {
    let cap;
    try { cap = await readArtefact(paths, 'capture', { key: runId, optional: true }); } catch (err) {
      out.push(red('staging-audit', `capture ${runId}: ${err.message}`, err.exit ?? EXIT.INCONSISTENT));
      continue;
    }
    if (!cap || !(cap.mode in matching)) continue;
    if (!(mergeSha.startsWith(cap.expectedSha) || cap.expectedSha.startsWith(mergeSha))) continue;
    matching[cap.mode] = runId;
  }
  const safety = await ctx.safety().catch(() => null);
  const waived = (state?.waivers ?? []).some((w) => w.probe === 'P13');
  const wants = [['staging', ['M3', 'M7', 'M10']], ...(safety?.safety?.realOrg && !waived ? [['real-org', ['M7', 'M10', 'M12']]] : [])];
  for (const [mode, ids] of wants) {
    const id = `${mode}-audit`;
    const runId = matching[mode];
    if (!runId) { out.push(red(id, `no ${mode} capture of ${mergeSha.slice(0, 7)} (run delivery capture --mode ${mode}, then delivery check all)`)); continue; }
    out.push(await runCheck(id, async () => {
      const items = await d.validateCaptureItems(ctx, runId);
      const missed = items.filter((i) => i.status !== 'reached');
      if (missed.length) return red(id, `${missed.length} of ${items.length} states not reached in ${runId}, first ${missed[0].state}: ${missed[0].why ?? ''}`);
      const { findings, failures } = await d.runChecks(ctx, ids, { captureRunId: runId, record: false });
      if (failures.length) return red(id, failures[0].message);
      const p1 = findings.filter((f) => f.severity === 'P1' && f.status === 'open');
      if (p1.length) return red(id, `${p1.length} P1 finding${p1.length === 1 ? '' : 's'} on ${profile.environments.test.name}, first ${p1[0].state} ${p1[0].where}`);
      return ok(id, `${items.length} states reached in ${runId}; ${ids.join(', ')} found no P1`);
    }));
  }
  return out;
}

async function writeRelease(ctx, { paths, profile, plan, pr, mergeSha, epic, loopText }) {
  const r = await ctx.runner.sh(profile.commands.pendingProduction, { cwd: ctx.repoRoot, timeoutMs: 5 * 60_000 });
  const pending = r.code === 0
    ? { ok: true, lines: String(r.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-40), detail: '' }
    : { ok: false, lines: [], detail: `exit ${r.code}: ${lastLine(r.stderr, r.stdout)}` };
  const removed = (plan?.rows ?? []).filter((x) => x.class === 'remove').map((x) => x.id);
  const tags = String((await ctx.git.raw(['tag', '--list'])).stdout ?? '').split('\n').filter(Boolean);
  const tag = nextTag(profile.release.tagFormat, paths.feature, tags);
  const content = releaseBlock({
    feature: paths.feature, base: profile.repo.base, pr: pr.number, mergeSha, pending, tag,
    tagRequired: removed.length > 0,
    tagWhy: removed.length ? `the plan removes ${removed.join(', ')}` : 'the plan removes no capability; check the migrations above for any that reshape data',
    profile, loopTest: loopText,
  });
  const marks = runMarkers(profile, paths.feature);
  const c = await ensureComment(ctx, { issue: epic, marker: marks.release(), body: `${marks.release()}\n${content}` });
  await upsertHandoverBlock(ctx, { profile, feature: paths.feature, name: 'release', content });
  return pending.ok ? { ok: true, action: c.action } : { ok: false, detail: `the release block is written, but the pending-production check failed (${pending.detail})` };
}

/** The checks as one result: exit is the worst (5 over 1 over 4). */
export function landResult(checks) {
  const failures = checks.filter((c) => !c.ok).map((c) => ({ code: c.id, message: c.detail }));
  const exit = worstExit(checks.filter((c) => !c.ok).map((c) => c.exit));
  return { ok: failures.length === 0, failures, exit: failures.length ? exit : 0 };
}

/**
 * land (without --check): the evidence with the acting steps, then, when everything holds, the
 * profile's epic-close command and the Scope issue closed.
 */
export async function runLand(ctx, { epic }) {
  const ev = await landEvidence(ctx, { epic, mode: 'land' });
  const res = landResult(ev.checks);
  if (!res.ok) return { ...ev, ...res, closed: false };
  const profile = await ctx.profile();
  const cmd = fillCommand(profile.commands.epicClose, { epic });
  const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: 5 * 60_000 });
  if (r.code !== 0) {
    const failures = [{ code: 'epic-close', message: `${cmd} exited ${r.code}: ${lastLine(r.stderr, r.stdout)}` }];
    return { ...ev, ok: false, failures, exit: EXIT.RED, closed: false };
  }
  const plan = await readPlan(ev.paths, { optional: true });
  if (plan?.scopeIssue) {
    const s = await ctx.gh.issueGet(plan.scopeIssue);
    if (s && s.state === 'open') await ctx.gh.issueClose(plan.scopeIssue, { comment: `The run landed (#${epic} closed). Lines nobody answered kept their defaults; the release block on #${epic} records the outcome.` });
  }
  return { ...ev, ok: true, failures: [], exit: 0, closed: true };
}

/**
 * Phase-7 gate and land --check: every after-merge step holds for the merge SHA (deploy, migrations,
 * E2E staging, guards quiet, backfills, owed loop test, staging capture checks, teardown, children
 * closed), and the PR's ready event matches a green ready record for its head SHA.
 * The epic being closed is not a step: the close script runs land --check before it closes the
 * epic, and the phase-7 gate (A1) checks the closed epic as a part of its own.
 * Called by lib/gates/phase-7.mjs (A1) and by the land command.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ epic: number }} opts
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function landGate(ctx, { epic }) {
  const res = landResult((await landEvidence(ctx, { epic, mode: 'check' })).checks);
  return gateResult(res.failures, res.failures.length ? res.exit : undefined);
}
