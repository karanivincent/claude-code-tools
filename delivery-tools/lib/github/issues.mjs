// Issues by marker (spec 4.0 step 7, 4.3 step 5, 11.3). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * The run's epic: the issue carrying <!-- delivery:<feature>:epic --> in any state, or the one
 * intent.json names. Null when none exists yet.
 * Called by status and the phase-0 gate (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gh.mjs').Issue|null>}
 */
export async function findEpic(ctx) {
  throw notImplementedError('A2', 'findEpic');
}

/**
 * Phase-3 gate input: every plan unit, backend piece, cut follow-up and the polish issue has its
 * issue (found by marker), bodies match what sync would write, and the spec comment is current.
 * Read-only: never writes to GitHub.
 * Called by lib/gates/phase-3.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function issuesSyncedGate(ctx) {
  throw notImplementedError('A2', 'issuesSyncedGate');
}
