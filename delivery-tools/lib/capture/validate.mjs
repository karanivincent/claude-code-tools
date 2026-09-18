// The capture validator (spec 6.2). Owner: slice C (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * @typedef {{ state: string, world: string, role: string, width: number, locale: string, theme: string,
 *             status: 'reached'|'not-reached', why: string|null }} ItemVerdict
 */

/**
 * Re-validate a capture run's files against the plan (never trusting capture.json's status):
 * required markers present, no forbidden marker, text not identical to a sibling unless sameAs,
 * served SHA equals expectedSha, no console error or failed non-intercept request, textSha256
 * matches the .txt on disk. Called by M3 and M15 (B1), ready (A1) and land --check (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} runId
 * @returns {Promise<ItemVerdict[]>}
 */
export async function validateCaptureItems(ctx, runId) {
  throw notImplementedError('C', 'validateCaptureItems');
}

/**
 * The newest capture run id for a mode (by capture.json in captures/), or null.
 * Called by check (B1), ready (A1) and report (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ mode?: string }} [opts]
 * @returns {Promise<string|null>}
 */
export async function latestCaptureRun(ctx, opts = {}) {
  throw notImplementedError('C', 'latestCaptureRun');
}

/**
 * Phase-4 gate input: the wave-0 capture smoke (one state per world, on the stub routes) exists and
 * every item re-validates as reached (sign-in per role, served SHA, markers).
 * Called by lib/gates/phase-4.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function captureSmokeGate(ctx) {
  throw notImplementedError('C', 'captureSmokeGate');
}
