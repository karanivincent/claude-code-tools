// Land after the merge (spec 4.7). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-7 gate and land --check: every after-merge step holds for the merge SHA (deploy, migrations,
 * E2E staging, guards quiet, backfills, owed loop test, staging capture checks, teardown, children
 * closed), and the PR's ready event matches a green ready record for its head SHA.
 * Called by lib/gates/phase-7.mjs (A1) and by the land command.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ epic: number }} opts
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function landGate(ctx, { epic }) {
  throw notImplementedError('A2', 'landGate');
}
