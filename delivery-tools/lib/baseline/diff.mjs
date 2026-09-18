// The capability diff, M2 (spec 5.3). Owner: slice B2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * M2 as findings: lost = old signatures minus new ones must equal the remove rows exactly; every
 * migrate found at its migrateTo; every base e2e assertion present, mapped (e2eMap) or removed;
 * every old copy key still rendered belongs to a keep or migrate row. P1 per lost capability.
 * Extracts at `against` (default HEAD) into baseline-head.json first.
 * Called by check M2 (B1) and ready (A1, through runChecks).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ against?: string }} [opts]
 * @returns {Promise<import('../core/findings.mjs').Finding[]>}
 */
export async function checkM2(ctx, opts = {}) {
  throw notImplementedError('B2', 'checkM2');
}
