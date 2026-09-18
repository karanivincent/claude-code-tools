// Spot re-capture (spec 11.6). Owner: slice C (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Re-capture a random limits.spotRecapturePct of reached states (at least five) and compare visible
 * text with the stored capture; any mismatch is red and leads the report.
 * Called by ready (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ runId: string, pct: number, seed?: string }} opts seed makes the sample reproducible
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function spotRecapture(ctx, opts) {
  throw notImplementedError('C', 'spotRecapture');
}
