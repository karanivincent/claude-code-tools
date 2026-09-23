// Phase 0 gate (intake), spec 3.4: advance refuses unless the design snapshot is hashed, intent.json validates, the epic exists (found by marker), state is initialised.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   intake  verifyIntake (lib/lifecycle/intake.mjs, A2): snapshot hashes, intent.json, state journal
//   epic    findEpic (lib/github/issues.mjs, A2): the issue carrying <!-- delivery:<feature>:epic -->

import { PASS } from '../core/gate.mjs';
import { makeMarker } from '../core/markers.mjs';
import { verifyIntake } from '../lifecycle/intake.mjs';
import { findEpic } from '../github/issues.mjs';
import { dep, partsResult, red, safePart } from '../run/compose.mjs';
import { markerPrefix } from '../run/github.mjs';

export const PHASE = 0;
export const RULE = "the design snapshot is hashed, intent.json validates, the epic exists (found by marker), state is initialised";
export const PARTS = Object.freeze(['intake', 'epic']);

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  const intake = await safePart('intake', () => dep(ctx, 'verifyIntake', verifyIntake)(ctx));
  const epic = await safePart('epic', async () => {
    // verifyIntake reports the epic too; say it once.
    if (intake.failures.some((f) => f.code === 'epic')) return PASS;
    if (await dep(ctx, 'findEpic', findEpic)(ctx)) return PASS;
    const marker = ctx.feature ? makeMarker({ prefix: await markerPrefix(ctx), feature: ctx.feature, kind: 'epic' }) : 'the epic marker';
    return red('epic', `no issue carries ${marker}; run delivery issues sync --epic-only`);
  });
  return [{ id: 'intake', result: intake }, { id: 'epic', result: epic }];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}
