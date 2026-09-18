// The Scope issue (spec 10.2, 10.4). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Phase-3 gate input: the Scope issue exists (by marker), carries every plan.scope line, and
 * plan.scopeSnapshot is set. Read-only.
 * Called by lib/gates/phase-3.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function scopeGate(ctx) {
  throw notImplementedError('A2', 'scopeGate');
}

/**
 * Rows whose class differs from the Scope snapshot: the late changes, listed first in the report,
 * the PR body and ready.json. Pure over the plan and the snapshot's recorded classes.
 * Called by ready (A1), report (C) and pr-body (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ row: string, from: string, to: string, scopeLine: string|null }[]>}
 */
export async function lateChanges(ctx) {
  throw notImplementedError('A2', 'lateChanges');
}
