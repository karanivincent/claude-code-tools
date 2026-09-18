// Waves (spec 4.5). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-5 gate input: the last wave start merged origin/<base> cleanly (no unresolved conflict,
 * no unclassed new capability), recomputed from git and the plan.
 * Called by lib/gates/phase-5.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function waveSyncGate(ctx) {
  throw notImplementedError('A2', 'waveSyncGate');
}
