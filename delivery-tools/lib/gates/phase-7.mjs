// Phase 7 gate (land after merge), spec 3.4: advance refuses unless staging proof is green; the epic is closed through the profile epicClose command.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - landGate (lib/lifecycle/land.mjs, A2)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-7 gate not implemented (slice A1)' }] };
}

export const PHASE = 7;
export const RULE = "staging proof is green; the epic is closed through the profile epicClose command";
