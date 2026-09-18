// CI status (spec 4.5 wave end, 4.6 step 1). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * mergeable first (a conflicting PR gets no Actions runs), then the profile's CI waiter for the
 * head SHA. Never gh pr checks. With wait false, one non-blocking look (pending stays pending).
 * Called by ready and the phase-5 gate (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ pr: number, wait?: boolean }} opts
 * @returns {Promise<{ state: 'green'|'red'|'pending'|'conflicting', headSha: string, detail: string }>}
 */
export async function ciStatus(ctx, { pr, wait = false }) {
  throw notImplementedError('A2', 'ciStatus');
}
