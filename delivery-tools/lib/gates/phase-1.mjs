// Phase 1 gate (preflight), spec 3.4: advance refuses unless every probe is green, or became a wave-0 task, or carries a named founder waiver where waivable.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - preflightGate (lib/lifecycle/preflight.mjs, A2)
//   - state.waivers (lib/core/state.mjs)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-1 gate not implemented (slice A1)' }] };
}

export const PHASE = 1;
export const RULE = "every probe is green, or became a wave-0 task, or carries a named founder waiver where waivable";
