// Baseline extraction (spec 5.1). Owner: slice B2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-2 gate input: for a redesign (intent.redesign), baseline.json exists, validates, was taken
 * at the run's start SHA on the base, and every capability has a signature and evidence. Green
 * with no baseline when the intent is not a redesign.
 * Called by lib/gates/phase-2.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function baselineGate(ctx) {
  throw notImplementedError('B2', 'baselineGate');
}
