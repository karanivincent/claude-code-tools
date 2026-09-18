// Duplicate PRs (spec 12.3). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * PRs that are not the run's, open or merged since the run began, that reference a claimed child
 * or touch a claimed path. Called by ready (A1) and wave start/end (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ pr: number, reason: string }[]>}
 */
export async function findDupes(ctx) {
  throw notImplementedError('A2', 'findDupes');
}
