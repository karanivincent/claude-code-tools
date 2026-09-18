// Seed safety, M13 (spec 7). Owner: slice B2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * seed --check as a gate: layers 1 to 3 over seedplan.json (derived predicates, contact values
 * against the fake pattern and the derived never-dial set, guards) and the worlds' structure.
 * Called by check M13 (B1) and preflight P6 with an empty plan (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ seedPlan?: object }} [opts] a plan to check instead of seedplan.json
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function seedCheckGate(ctx, opts = {}) {
  throw notImplementedError('B2', 'seedCheckGate');
}
