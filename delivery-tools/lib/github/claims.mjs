// Claims (spec 4.4 step 1, 12.2). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// The pool already skips any issue an open PR references, so the run claims its children by
// opening its draft PR in wave 0, before the first builder, with Refs #N for every build unit and
// backend unit. The planner then proves it: claims verify fails while a claimed child is still in
// the planner's queue. Labels are never relied on.

import { gateResult } from '../core/gate.mjs';
import { hasMarker } from '../core/markers.mjs';
import { updateState, formatEvent } from '../core/state.mjs';
import { DeliveryError, EXIT, UsageError } from '../core/exit.mjs';
import {
  runMarkers, readPlan, readState, readIntent, claimedChildren, claimedPaths, findRunPr,
  integrationBranch, clip, lastLine, commitRunFiles,
} from '../lifecycle/run-info.mjs';
import { assemblePrBody } from '../lifecycle/prbody.mjs';
import { parseClaims, referencedIssues } from './pr.mjs';
import { sameText } from './write.mjs';

/** The run's PR title: the founder's sentence, as the epic carries it. */
export function prTitle(intent, feature) {
  return clip(intent?.sentence ?? `Deliver the ${feature} design`, 100).replace(/\.$/, '');
}

/**
 * claims open: push the integration branch, then open or update the one draft PR.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ dryRun?: boolean }} [o]
 * @returns {Promise<{ pr: number|null, action: 'created'|'updated'|'unchanged', claimed: number[], paths: string[] }>}
 */
export async function openClaims(ctx, { dryRun = false } = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  if (profile.claims.mode === 'none') return { pr: null, action: 'unchanged', claimed: [], paths: [], skipped: true };
  const plan = await readPlan(paths);
  const state = await readState(paths);
  const intent = await readIntent(paths, { optional: true }).catch(() => null);
  const unfiled = plan.units.filter((u) => !u.issue);
  if (unfiled.length) throw new DeliveryError(EXIT.RED, `units with no issue yet: ${unfiled.map((u) => u.id).join(', ')} (run delivery issues sync first)`, { code: 'claims' });

  const branch = state?.branch ?? integrationBranch(profile, plan.epic, paths.feature);
  const current = await ctx.git.currentBranch();
  if (current !== branch) throw new UsageError(`run claims open from the integration worktree on ${branch} (this worktree is on ${current ?? 'a detached HEAD'})`);

  const existing = await findRunPr(ctx, { profile, feature: paths.feature, state, branch });
  if (existing && existing.state === 'closed') {
    throw new DeliveryError(EXIT.RED, `the run's PR #${existing.number} is closed without a merge; reopen it rather than open a second one`, { code: 'claims' });
  }
  const { body } = await assemblePrBody(ctx, { paths, profile, plan, state, existing: existing?.body ?? '' });
  const claimed = plan.units.map((u) => u.issue);
  if (dryRun) return { pr: existing?.number ?? null, action: existing ? (sameText(existing.body, body) ? 'unchanged' : 'updated') : 'created', claimed, paths: claimedPaths(plan) };

  await commitRunFiles(ctx.git, paths, `Record the ${paths.feature} run's issue numbers and Scope snapshot`, { what: 'claims open' });
  await ctx.git.ok(['push', '-u', 'origin', branch]);
  const label = profile.claims.runLabel;
  let pr;
  let action;
  if (existing) {
    const missing = label && !existing.labels.includes(label);
    if (missing) await ctx.gh.labelEnsure(label, { description: 'A delivery run\'s pull request; its claimed paths are in the body' });
    if (!sameText(existing.body, body) || missing) {
      pr = await ctx.gh.prEdit(existing.number, { ...(sameText(existing.body, body) ? {} : { body }), ...(missing ? { addLabels: [label] } : {}) });
      action = 'updated';
    } else { pr = existing; action = 'unchanged'; }
  } else {
    if (label) await ctx.gh.labelEnsure(label, { description: 'A delivery run\'s pull request; its claimed paths are in the body' });
    pr = await ctx.gh.prCreate({ title: prTitle(intent, paths.feature), body, base: profile.repo.base, head: branch, draft: true, labels: label ? [label] : [] });
    action = 'created';
  }
  if (state && state.pr !== pr.number) {
    await updateState(paths, (s) => ({ ...s, pr: pr.number }), {
      at: ctx.clock.now().toISOString(), event: formatEvent({ command: 'claims open', counts: { pr: pr.number } }), inputs: { claimed }, outputs: { pr: pr.number },
    });
  }
  return { pr: pr.number, action, claimed, paths: claimedPaths(plan) };
}

/** Issue numbers a planner's output names as #N. */
export function queuedIssues(stdout) {
  return new Set([...String(stdout ?? '').matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])));
}

/**
 * claims verify: run the profile's planner; red when any claimed child is in its queue.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, queued: { unit: string, issue: number }[], detail: string }>}
 */
export async function verifyClaims(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  if (profile.claims.verify !== 'planner' || profile.claims.mode === 'none') return { ok: true, skipped: true, queued: [], detail: 'claims are not verified in this repo (profile.claims)' };
  const plan = await readPlan(paths);
  const r = await ctx.runner.sh(profile.commands.planner, { cwd: ctx.repoRoot, timeoutMs: 5 * 60_000 });
  if (r.code !== 0) {
    throw new DeliveryError(r.code === 124 ? EXIT.WAIT : EXIT.RED, `the planner (${profile.commands.planner}) exited ${r.code}: ${lastLine(r.stderr, r.stdout) || 'no output'}`, { code: 'planner' });
  }
  const queue = queuedIssues(r.stdout);
  const queued = claimedChildren(plan).filter((c) => c.issue && queue.has(c.issue)).map((c) => ({ unit: c.unit, issue: c.issue }));
  return { ok: queued.length === 0, queued, detail: lastLine(r.stdout) };
}

/**
 * Phase-4 gate input: the run's draft PR exists (open, or merged later on), its body references
 * every claimed child and carries the claimed-paths block and the run label, and the planner
 * queues no claimed child.
 * Called by lib/gates/phase-4.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function claimsGate(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  if (profile.claims.mode === 'none') return gateResult([]);
  const plan = await readPlan(paths);
  const state = await readState(paths);
  const marks = runMarkers(profile, paths.feature);
  const failures = [];
  const pr = await findRunPr(ctx, { profile, feature: paths.feature, state });
  if (!pr) return gateResult([{ code: 'claims', message: 'the run has no draft PR (run delivery claims open)' }]);
  if (pr.state === 'closed') failures.push({ code: 'claims', message: `PR #${pr.number} is closed without a merge, so it claims nothing` });
  if (!hasMarker(pr.body, marks.pr())) failures.push({ code: 'claims', message: `PR #${pr.number} lacks the run's marker` });
  const refs = referencedIssues(pr.body);
  for (const c of claimedChildren(plan)) {
    if (!c.issue) failures.push({ code: 'claims', message: `unit ${c.unit} has no issue, so nothing claims it (run delivery issues sync)` });
    else if (!refs.has(c.issue)) failures.push({ code: 'claims', message: `PR #${pr.number} does not reference #${c.issue} (${c.unit}); run delivery claims open` });
  }
  const listed = parseClaims(pr.body, marks.claims());
  if (listed === null) failures.push({ code: 'claims', message: `PR #${pr.number} has no claimed-paths block` });
  else {
    const missing = claimedPaths(plan).filter((p) => !listed.includes(p));
    if (missing.length) failures.push({ code: 'claims', message: `PR #${pr.number}'s claimed-paths block lacks ${missing.length} path(s), first ${missing[0]}` });
  }
  if (profile.claims.runLabel && !pr.labels.includes(profile.claims.runLabel)) failures.push({ code: 'claims', message: `PR #${pr.number} lacks the ${profile.claims.runLabel} label` });
  if (pr.state === 'open' && profile.claims.verify === 'planner') {
    const v = await verifyClaims(ctx);
    for (const q of v.queued) failures.push({ code: 'claims', message: `the planner still queues #${q.issue} (${q.unit})` });
  }
  return gateResult(failures);
}
