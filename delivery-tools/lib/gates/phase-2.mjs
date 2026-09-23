// Phase 2 gate (inventory), spec 3.4: advance refuses unless every design candidate is mapped or excluded; every state has a design render or a reason; the baseline exists for a redesign.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   inventory  inventoryGate (lib/plan/inventory-check.mjs, B1)
//   baseline   baselineGate (lib/baseline/extract.mjs, B2); green with no baseline when not a redesign

import { inventoryGate } from '../plan/inventory-check.mjs';
import { baselineGate } from '../baseline/extract.mjs';
import { dep, partsResult, safePart } from '../run/compose.mjs';

export const PHASE = 2;
export const RULE = "every design candidate is mapped or excluded; every state has a design render or a reason; the baseline exists for a redesign";
export const PARTS = Object.freeze(['inventory', 'baseline']);

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  return [
    { id: 'inventory', result: await safePart('inventory', () => dep(ctx, 'inventoryGate', inventoryGate)(ctx)) },
    { id: 'baseline', result: await safePart('baseline', () => dep(ctx, 'baselineGate', baselineGate)(ctx)) },
  ];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}
