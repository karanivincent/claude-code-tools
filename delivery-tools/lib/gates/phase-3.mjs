// Phase 3 gate (plan), spec 3.4: advance refuses unless plan check passes; issues are synced; the Scope issue is posted and snapshotted.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until A1 lands.
//
// Composes, recomputing from sources (never a recorded verdict), with guardGate from
// lib/core/gate.mjs so a missing piece of another slice shows as a failure line, not a crash:
//   - planGate (lib/plan/check.mjs, B1)
//   - issuesSyncedGate (lib/github/issues.mjs, A2)
//   - scopeGate (lib/github/scope.mjs, A2)

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return { ok: false, failures: [{ code: 'not-implemented', message: 'phase-3 gate not implemented (slice A1)' }] };
}

export const PHASE = 3;
export const RULE = "plan check passes; issues are synced; the Scope issue is posted and snapshotted";
