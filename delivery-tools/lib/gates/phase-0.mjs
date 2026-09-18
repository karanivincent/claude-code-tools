// Phase 0 gate (intake), spec 3.4: advance refuses unless the design snapshot is hashed, intent.json validates, the epic exists (found by marker), state is initialised.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - verifyIntake (lib/lifecycle/intake.mjs, A2)
//   - findEpic (lib/github/issues.mjs, A2)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-0 gate not implemented (slice A1)' }] };
}

export const PHASE = 0;
export const RULE = "the design snapshot is hashed, intent.json validates, the epic exists (found by marker), state is initialised";
