// Phase 6 gate (land before merge), spec 3.4: advance refuses unless ready.json is green for the PR's head SHA.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   ready  checkReady (lib/run/ready.mjs, A1): ready.json written by delivery ready (journal),
//          green, for the PR's current head, inputs unchanged (not compared once merged)
// mergedGate, the gate for leaving "ready" (waiting for the founder's merge), adds:
//   merge  the run's PR is merged into the base; until then the run waits on the founder (exit 3)

import { EXIT } from '../core/exit.mjs';
import { PASS } from '../core/gate.mjs';
import { checkReady } from '../run/ready.mjs';
import { dep, partsResult, red, safePart } from '../run/compose.mjs';
import { readRunState } from '../run/context.mjs';
import { findRunPr } from '../run/github.mjs';

export const PHASE = 6;
export const RULE = "ready.json is green for the PR's head SHA";
export const PARTS = Object.freeze(['ready']);

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  const result = await safePart('ready', async () => {
    const pr = await findRunPr(ctx, await readRunState(ctx));
    if (!pr) return red('ready', 'the run has no PR; delivery claims open makes the draft PR in wave 0');
    const r = await dep(ctx, 'checkReady', checkReady)(ctx, { pr: pr.number });
    return { ok: r.ok, failures: r.failures, ...(r.exit !== undefined ? { exit: r.exit } : {}) };
  });
  return [{ id: 'ready', result }];
}

/** The parts of the gate that leaves "ready": the merge, then ready as of the merged head. */
export async function evaluateMerged(ctx) {
  const merge = await safePart('merge', async () => {
    const pr = await findRunPr(ctx, await readRunState(ctx));
    if (!pr) return red('merge', 'the run has no PR');
    if (pr.state === 'closed') return red('merge', `PR #${pr.number} was closed without a merge`);
    if (pr.state !== 'merged') return red('merge', `PR #${pr.number} is not merged yet; the merge is the founder's`, EXIT.BLOCKED);
    let base = null;
    try { base = (await ctx.profile()).repo.base; } catch { /* no profile: base not compared */ }
    if (base && pr.baseRefName && pr.baseRefName !== base) return red('merge', `PR #${pr.number} merged into ${pr.baseRefName}, not ${base}`);
    return PASS;
  });
  return [{ id: 'merge', result: merge }, ...(await evaluate(ctx))];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}

/** The gate for leaving "ready": the PR is merged, and its head had a green ready.json. */
export async function mergedGate(ctx) {
  return partsResult(await evaluateMerged(ctx));
}
