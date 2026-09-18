// Post-write scan, refresh and teardown (spec 7.4). Owner: slice B2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Layers 1 and 2 over every row in every fixture world as the database is now, plus every guard's
 * probes. Red refuses the capture that asked. Called by the phase-4 gate (A1) and before every
 * capture (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function seedScanGate(ctx) {
  throw notImplementedError('B2', 'seedScanGate');
}

/**
 * Re-apply one world from seedplan.json (relative dates refreshed), then scan it.
 * Called by capture (C) before each world's captures.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} worldId
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function refreshWorld(ctx, worldId) {
  throw notImplementedError('B2', 'refreshWorld');
}

/**
 * Delete rows a capture's clicks created (ids recorded from intercepted responses), then scan.
 * Refuses any row outside the run's worlds. Called by capture (C) after M9 clicks.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ table: string, id: string }[]} rows
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function teardownRows(ctx, rows) {
  throw notImplementedError('B2', 'teardownRows');
}
