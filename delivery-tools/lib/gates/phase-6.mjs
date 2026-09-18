// Phase 6 gate (land before merge), spec 3.4: advance refuses unless ready.json is green for the PR's head SHA.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - checkReady (lib/run/ready.mjs, A1)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-6 gate not implemented (slice A1)' }] };
}

export const PHASE = 6;
export const RULE = "ready.json is green for the PR's head SHA";
