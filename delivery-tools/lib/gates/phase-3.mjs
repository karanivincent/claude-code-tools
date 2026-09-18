// Phase 3 gate (plan), spec 3.4: advance refuses unless plan check passes; issues are synced; the Scope issue is posted and snapshotted.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   plan    planGate (lib/plan/check.mjs, B1): M1 and the plan rules
//   issues  issuesSyncedGate (lib/github/issues.mjs, A2): read-only
//   scope   scopeGate (lib/github/scope.mjs, A2): read-only

import { planGate } from '../plan/check.mjs';
import { issuesSyncedGate } from '../github/issues.mjs';
import { scopeGate } from '../github/scope.mjs';
import { dep, partsResult, safePart } from '../run/compose.mjs';

export const PHASE = 3;
export const RULE = "plan check passes; issues are synced; the Scope issue is posted and snapshotted";
export const PARTS = Object.freeze(['plan', 'issues', 'scope']);

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  return [
    { id: 'plan', result: await safePart('plan', () => dep(ctx, 'planGate', planGate)(ctx)) },
    { id: 'issues', result: await safePart('issues', () => dep(ctx, 'issuesSyncedGate', issuesSyncedGate)(ctx)) },
    { id: 'scope', result: await safePart('scope', () => dep(ctx, 'scopeGate', scopeGate)(ctx)) },
  ];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}
