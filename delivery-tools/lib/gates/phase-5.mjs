// Phase 5 gate (build), spec 3.4: advance refuses unless every unit passed its gate; the last wave's staging sync is clean; full CI is green on the integrated tree.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - unitGateStatus for every unit (lib/gate/unit.mjs, B1)
//   - waveSyncGate (lib/lifecycle/wave.mjs, A2)
//   - ciStatus (lib/github/ci.mjs, A2)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-5 gate not implemented (slice A1)' }] };
}

export const PHASE = 5;
export const RULE = "every unit passed its gate; the last wave's staging sync is clean; full CI is green on the integrated tree";
