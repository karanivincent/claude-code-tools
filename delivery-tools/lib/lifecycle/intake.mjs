// Intake (spec 4.0). Owner: slice A2 (docs/ARCHITECTURE.md).
// Cross-slice functions below are stubs with their final signatures until A2 lands.

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-0 gate input, recomputed from sources: the snapshot under docs/design/<feature>/ hashes to
 * intent.design.treeSha256 (via the README's recorded hashes), intent.json validates, the epic
 * exists and carries its marker, and state.json exists with a sound journal.
 * Called by lib/gates/phase-0.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function verifyIntake(ctx) {
  throw notImplementedError('A2', 'verifyIntake');
}
