// Baseline refresh (spec 4.5 wave start step 1, 5.4). Owner: slice B2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Re-extract at origin/<base>; append a refreshes entry to baseline.json; give each capability that
 * landed since the run began a plan row (class migrate, a Tier 1 decision file). unclassed lists
 * any that could not be given a row; wave start refuses to finish while it is non-empty.
 * Called by wave start (A2) and ready (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ added: string[], unclassed: string[] }>}
 */
export async function refreshBaseline(ctx) {
  throw notImplementedError('B2', 'refreshBaseline');
}
