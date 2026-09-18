// In-flight builder records (spec 4.5 dispatch, 11.3 step 3). Owner: slice A1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Record that a builder is about to be dispatched for a unit (state.inFlight, journalled).
 * Called by wave start (A2), which writes each unit file and records it before the main session dispatches.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ unit: string, agent: string, branch: string, brief: string, report: string }} rec
 * @returns {Promise<void>}
 */
export async function recordDispatch(ctx, rec) {
  throw notImplementedError('A1', 'recordDispatch');
}

/**
 * Remove a unit's in-flight record once it is merged (journalled). Called by wave merge (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} unit
 * @returns {Promise<void>}
 */
export async function clearDispatch(ctx, unit) {
  throw notImplementedError('A1', 'clearDispatch');
}
