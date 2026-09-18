// The served-SHA probe (spec 6.2 item 3, M15). Owner: slice C (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Ask the deployment which commit it serves, with profile.commands.versionProbe (for example
 * "GET /api/version") against baseUrl. Null when the route is absent or unreadable.
 * Called by ready (A1) and capture (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} baseUrl
 * @returns {Promise<string|null>}
 */
export async function probeServedSha(ctx, baseUrl) {
  throw notImplementedError('C', 'probeServedSha');
}
