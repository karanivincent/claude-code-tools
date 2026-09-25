// CI status (spec 4.5 wave end, 4.6 step 1). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// mergeable first: a pull request that conflicts with its base gets no Actions runs at all, so
// waiting for CI on it waits for runs that never start (last time that read as an outage for 40
// minutes). Then the profile's own CI waiter, which gates on runs for the head SHA; never
// `gh pr checks`, where a workflow that has not registered yet looks the same as one that passed.
//
// The waiter's exit codes, as read here: 0 green; 1 red; 2 or 4 still pending; 3 could not ask
// GitHub (pending, retry); 124 our own timeout (pending); anything else red.

import { fillCommand } from '../core/profile.mjs';
import { UsageError } from '../core/exit.mjs';
import { deps } from '../lifecycle/deps.mjs';
import { lastLine } from '../lifecycle/run-info.mjs';

export const CI_WAIT_TIMEOUT_MS = 45 * 60_000;
export const CI_LOOK_TIMEOUT_MS = 90_000;

/** The waiter's exit code as a CI state. */
export function waiterState(code) {
  if (code === 0) return 'green';
  if (code === 2 || code === 3 || code === 4 || code === 124) return 'pending';
  return 'red';
}

/**
 * mergeable first (a conflicting PR gets no Actions runs), then the profile's CI waiter for the
 * head SHA. Never gh pr checks. With wait false, one short look (pending stays pending).
 * Called by ready and the phase-5 gate (A1), and by ci and wave end (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ pr: number, wait?: boolean }} opts
 * @returns {Promise<{ state: 'green'|'red'|'pending'|'conflicting', headSha: string, detail: string, mergeable: string }>}
 */
export async function ciStatus(ctx, { pr, wait = false }) {
  const profile = await ctx.profile();
  const d = deps(ctx);
  let p = await ctx.gh.prGet(pr);
  if (!p) throw new UsageError(`PR #${pr} not found in ${ctx.gh.repo}`);
  // GitHub computes mergeable lazily; the first read after a push often says UNKNOWN.
  for (let i = 0; p.mergeable === 'UNKNOWN' && i < (wait ? 6 : 2); i++) {
    await d.sleep(5_000);
    p = (await ctx.gh.prGet(pr)) ?? p;
  }
  const headSha = p.headRefOid;
  if (p.mergeable === 'CONFLICTING') {
    return {
      state: 'conflicting', headSha, mergeable: 'CONFLICTING',
      detail: `mergeable: CONFLICTING (PR #${pr}, head ${short(headSha)}): a conflicting PR gets no Actions runs at all, so there is no CI to wait for; merge origin/${profile.repo.base} into ${p.headRefName || 'the branch'} first`,
    };
  }
  if (p.mergeable === 'UNKNOWN') {
    return { state: 'pending', headSha, mergeable: 'UNKNOWN', detail: `mergeable: UNKNOWN (PR #${pr}): GitHub is still computing it; retry` };
  }
  const cmd = fillCommand(profile.commands.ciWait, { pr, sha: headSha });
  const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: wait ? CI_WAIT_TIMEOUT_MS : CI_LOOK_TIMEOUT_MS });
  const state = waiterState(r.code);
  const after = await ctx.gh.prGet(pr);
  const finalSha = after?.headRefOid || headSha;
  const said = lastLine(r.stdout, r.stderr) || `exit ${r.code}`;
  const moved = finalSha !== headSha ? `; the head moved to ${short(finalSha)} while waiting` : '';
  const detail = state === 'pending' && r.code === 124
    ? `CI still pending on ${short(finalSha)} after ${Math.round((wait ? CI_WAIT_TIMEOUT_MS : CI_LOOK_TIMEOUT_MS) / 1000)}s (${said})${moved}`
    : `CI ${state} on ${short(finalSha)} by the waiter (exit ${r.code}): ${said}${moved}`;
  const known = profile.ci?.knownRed ?? [];
  if (state === 'red' && known.length && !moved) {
    const failed = failedWorkflows(said);
    if (failed.length && failed.every((f) => known.some((k) => k.workflow === f))) {
      return knownRedOnly(ctx, { profile, sha: finalSha, known: known.filter((k) => failed.includes(k.workflow)), wait, said });
    }
  }
  return { state, headSha: finalSha, mergeable: 'MERGEABLE', detail };
}

/** The workflow names in a waiter verdict line: "<sha>  FAIL — A (failure, run 1), B (cancelled, run 2)". */
export function failedWorkflows(line) {
  const at = String(line ?? '').indexOf('FAIL — ');
  if (at < 0) return [];
  const rest = String(line).slice(at + 'FAIL — '.length);
  return [...rest.matchAll(/(?:^|, )(.+?) \([a-z_]+, run \d+\)/g)].map((m) => m[1]);
}

const PASSING = new Set(['success', 'skipped', 'neutral']);

/**
 * Every failure is a declared known-red workflow. The repo's waiter stops at the first failure,
 * so it cannot say whether the rest finished: read the head's runs and wait for every other
 * workflow to finish clean. Green then, naming each known red and its issue; red if anything
 * else failed; pending if the rest is still running.
 */
async function knownRedOnly(ctx, { profile, sha, known, wait, said }) {
  const d = deps(ctx);
  const deadline = Date.now() + (wait ? CI_WAIT_TIMEOUT_MS : 0);
  const names = known.map((k) => `${k.workflow} (#${k.issue}: ${k.why})`).join('; ');
  for (;;) {
    const r = await ctx.runner.sh(`gh run list --repo ${profile.repo.slug} --commit ${sha} --limit 100 --json workflowName,status,conclusion,databaseId`, { cwd: ctx.repoRoot, timeoutMs: 60_000 });
    let runs = [];
    try { runs = JSON.parse(r.stdout || '[]'); } catch { runs = []; }
    const newest = new Map();
    for (const run of runs) {
      if (known.some((k) => k.workflow === run.workflowName)) continue;
      const seen = newest.get(run.workflowName);
      if (!seen || run.databaseId > seen.databaseId) newest.set(run.workflowName, run);
    }
    const others = [...newest.values()];
    const bad = others.filter((run) => run.status === 'completed' && !PASSING.has(run.conclusion)).map((run) => run.workflowName);
    const running = others.filter((run) => run.status !== 'completed').map((run) => run.workflowName);
    if (r.code === 0 && others.length && !bad.length && !running.length) {
      return { state: 'green', headSha: sha, mergeable: 'MERGEABLE', knownRed: known,
        detail: `CI green on ${short(sha)} except known red: ${names}; every other run on this commit finished clean (${others.length})` };
    }
    if (bad.length) {
      return { state: 'red', headSha: sha, mergeable: 'MERGEABLE', detail: `CI red on ${short(sha)}: ${bad.join(', ')} failed, besides known red ${names}` };
    }
    if (Date.now() >= deadline) {
      return { state: 'pending', headSha: sha, mergeable: 'MERGEABLE',
        detail: `CI on ${short(sha)}: only known red failed so far (${said}); still running: ${running.join(', ') || 'no other runs listed yet'}` };
    }
    await d.sleep(30_000);
  }
}

function short(sha) {
  return String(sha ?? '').slice(0, 7) || 'unknown';
}
