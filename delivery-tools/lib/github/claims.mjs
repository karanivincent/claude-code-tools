// Claims (spec 4.4 step 1, 12.2). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-4 gate input: the run's draft PR exists, its body refs every claimed child and carries the
 * claimed-paths block and run label, and the planner queues no claimed child.
 * Called by lib/gates/phase-4.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function claimsGate(ctx) {
  throw notImplementedError('A2', 'claimsGate');
}
