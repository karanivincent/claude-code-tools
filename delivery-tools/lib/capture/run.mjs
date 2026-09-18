// Running a capture (spec 6.2, 9). Owner: slice C (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Write the job file, run the committed capture spec through profile.commands.heavy (the spec owns
 * its server through Playwright's webServer in branch mode), validate every item, and write
 * captures/<runId>/capture.json. Before each world: refreshWorld and seedScanGate (B2).
 * Called by the capture command (C) and gate <unit> (B1, mode "branch").
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ mode: 'baseline'|'branch'|'wave'|'full'|'staging'|'real-org', states?: string[]|null,
 *           unit?: string|null, baseUrl?: string|null, sha?: string|null }} opts
 * @returns {Promise<{ runId: string, capture: object, notReached: number }>} capture is capture.json's value
 */
export async function runCapture(ctx, opts) {
  throw notImplementedError('C', 'runCapture');
}
