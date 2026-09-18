// Unit gate status (spec 4.5). Owner: slice B1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Whether a unit's gate is green for its branch head, recomputed from files only (the unit report,
 * the newest branch capture of its states re-validated, the findings for its states, its component
 * tests' presence). Never captures or builds anything.
 * Called by the phase-4 and phase-5 gates (A1) and wave merge (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} unitId
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function unitGateStatus(ctx, unitId) {
  throw notImplementedError('B1', 'unitGateStatus');
}
