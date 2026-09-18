// inventory check (spec 4.2 step 5). Owner: slice B1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-2 gate input: every candidate in candidates.json is in inventory.candidates, mapped or
 * excluded with a reason; every state has an id, a design reference, a render (render files
 * present) or an impossible reason, and a control or an explicit none; every control has a target
 * and an effect class; for a redesign, every capability has a signature and evidence.
 * Called by lib/gates/phase-2.mjs (A1) and the inventory check command.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function inventoryGate(ctx) {
  throw notImplementedError('B1', 'inventoryGate');
}
