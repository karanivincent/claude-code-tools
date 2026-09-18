// plan check, M1 (spec 4.3 step 4). Owner: slice B1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-3 gate input (M1): coverage, owners, reach and markers, cut reasons, issues and budget,
 * Scope lines for removes and requested cuts (at most five), the prop and unseedable cap, no
 * same-wave file overlap outside message files, a unit for every missing backend piece.
 * Called by lib/gates/phase-3.mjs (A1) and the plan check command.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function planGate(ctx) {
  throw notImplementedError('B1', 'planGate');
}
