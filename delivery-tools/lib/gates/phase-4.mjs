// Phase 4 gate (wave0), spec 3.4: advance refuses unless contracts compile with stubs; every fixture world is seeded and passes the safety scan; the capture smoke passes; the draft PR claims every child; the planner confirms it.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - unitGateStatus for the contract unit (lib/gate/unit.mjs, B1)
//   - seedScanGate (lib/seed/scan.mjs, B2)
//   - captureSmokeGate (lib/capture/validate.mjs, C)
//   - claimsGate (lib/github/claims.mjs, A2)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-4 gate not implemented (slice A1)' }] };
}

export const PHASE = 4;
export const RULE = "contracts compile with stubs; every fixture world is seeded and passes the safety scan; the capture smoke passes; the draft PR claims every child; the planner confirms it";
