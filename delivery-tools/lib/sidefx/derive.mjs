// Side-effect map derivation (spec 7.1). Owner: slice B2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Derive (and write) .delivery/<feature>/sidefx.json from the worker globs, the SQL definitions of
 * every .rpc() they call, the scheduled jobs and the hand-listed forbidden states. A worker file
 * whose hash changed since the last run is re-read, never trusted from a cache.
 * Called by the sidefx command and preflight P6 (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<object>} the sidefx.json value (schemas/sidefx.schema.json)
 */
export async function deriveSideEffects(ctx) {
  throw notImplementedError('B2', 'deriveSideEffects');
}
