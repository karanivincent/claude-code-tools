// Phase 7 gate (land after merge), spec 3.4: advance refuses unless staging proof is green; the epic is closed through the profile epicClose command.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   staging      landGate (lib/lifecycle/land.mjs, A2): every after-merge step for the merge SHA;
//                also the gate for leaving "merged" (stagingGate)
//   epic-closed  the epic issue is closed on GitHub; the gate for leaving "landed" (epicClosedGate).
//                land closes it with the profile's epicClose command, whose evidence is land --check.

import { PASS } from '../core/gate.mjs';
import { landGate } from '../lifecycle/land.mjs';
import { dep, partsResult, red, safePart } from '../run/compose.mjs';
import { readRunState } from '../run/context.mjs';
import { findRunEpicNumber } from '../run/github.mjs';

export const PHASE = 7;
export const RULE = "staging proof is green; the epic is closed through the profile epicClose command";
export const PARTS = Object.freeze(['staging', 'epic-closed']);

async function epicNumber(ctx) {
  return findRunEpicNumber(ctx, await readRunState(ctx));
}

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluateStaging(ctx) {
  const result = await safePart('staging', async () => {
    const epic = await epicNumber(ctx);
    if (!epic) return red('staging', 'the run has no epic');
    return dep(ctx, 'landGate', landGate)(ctx, { epic });
  });
  return [{ id: 'staging', result }];
}

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluateEpicClosed(ctx) {
  const result = await safePart('epic-closed', async () => {
    const epic = await epicNumber(ctx);
    if (!epic) return red('epic-closed', 'the run has no epic');
    const issue = await ctx.gh.issueGet(epic);
    if (!issue) return red('epic-closed', `epic #${epic} not found`);
    return issue.state === 'closed' ? PASS : red('epic-closed', `epic #${epic} is still open; delivery land --epic ${epic} closes it once the staging proof is green`);
  });
  return [{ id: 'epic-closed', result }];
}

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  return [...(await evaluateStaging(ctx)), ...(await evaluateEpicClosed(ctx))];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}

/** The gate for leaving "merged": the staging proof alone (the epic closes after it). */
export async function stagingGate(ctx) {
  return partsResult(await evaluateStaging(ctx));
}

/** The gate for leaving "landed": the epic is closed. */
export async function epicClosedGate(ctx) {
  return partsResult(await evaluateEpicClosed(ctx));
}
