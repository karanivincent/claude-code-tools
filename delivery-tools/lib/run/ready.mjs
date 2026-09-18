// Ready (spec 4.6 step 8, 11.6). Owner: slice A1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * The ready --check logic: ready.json exists, validates, is ok, its headSha is the PR's current head,
 * and every input hash still matches the file on disk. Never recomputes the checks themselves.
 * Called by the pre-bash hook (A1), land --check (A2) and report (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ pr: number }} opts
 * @returns {Promise<import('../core/gate.mjs').GateResult & { headSha: string|null }>}
 */
export async function checkReady(ctx, { pr }) {
  throw notImplementedError('A1', 'checkReady');
}
