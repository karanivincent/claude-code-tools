// Phase 2 gate (inventory), spec 3.4: advance refuses unless every design candidate is mapped or excluded; every state has a design render or a reason; the baseline exists for a redesign.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - inventoryGate (lib/plan/inventory-check.mjs, B1)
//   - baselineGate (lib/baseline/extract.mjs, B2)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-2 gate not implemented (slice A1)' }] };
}

export const PHASE = 2;
export const RULE = "every design candidate is mapped or excluded; every state has a design render or a reason; the baseline exists for a redesign";
