// The check registry (spec 8.1). Owner: slice B1 (docs/ARCHITECTURE.md); M2 and M13 live in B2's
// files (lib/baseline/diff.mjs, lib/seed/safety.mjs) and are called from here.

import { notImplementedError } from '../core/exit.mjs';

/** Every mechanical check id. M5 and M6 are advisory until the replay proves them (spec 8.1). */
export const CHECK_IDS = Object.freeze(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17']);

/**
 * Run checks and record their findings (source check:<id>) in findings.json.
 * M13 produces failures, never findings (it refuses the seed).
 * Called by the check and gate commands (B1), ready (A1) and land --check (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string[]} ids a subset of CHECK_IDS
 * @param {{ captureRunId?: string|null, record?: boolean }} [opts] record defaults to true
 * @returns {Promise<{ findings: import('../core/findings.mjs').Finding[], failures: import('../core/gate.mjs').GateFailure[] }>}
 */
export async function runChecks(ctx, ids, opts = {}) {
  throw notImplementedError('B1', 'runChecks');
}
