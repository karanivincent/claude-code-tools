// Phase 5 gate (build), spec 3.4: advance refuses unless every unit passed its gate; the last wave's staging sync is clean; full CI is green on the integrated tree.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   units      unitGateStatus (lib/gate/unit.mjs, B1) for every unit of the plan
//   wave-sync  waveSyncGate (lib/lifecycle/wave.mjs, A2)
//   ci         ciStatus (lib/github/ci.mjs, A2) for the run's PR, one look without waiting:
//              pending is exit 4 (wait and retry), a conflict and a red run are exit 1

import { EXIT } from '../core/exit.mjs';
import { PASS } from '../core/gate.mjs';
import { waveSyncGate } from '../lifecycle/wave.mjs';
import { ciStatus } from '../github/ci.mjs';
import { dep, partsResult, red, safePart } from '../run/compose.mjs';
import { readRunState } from '../run/context.mjs';
import { findRunPr } from '../run/github.mjs';
import { unitsGate } from './phase-4.mjs';

export const PHASE = 5;
export const RULE = "every unit passed its gate; the last wave's staging sync is clean; full CI is green on the integrated tree";
export const PARTS = Object.freeze(['units', 'wave-sync', 'ci']);

/**
 * ciStatus as a gate result (pure).
 * @param {number} pr
 * @param {{ state: string, headSha?: string, detail?: string }} s
 */
export function ciResult(pr, s) {
  const detail = s?.detail ? `: ${s.detail}` : '';
  switch (s?.state) {
    case 'green': return PASS;
    case 'pending': return red('ci', `CI is pending on PR #${pr}${detail}`, EXIT.WAIT);
    case 'conflicting': return red('ci', `PR #${pr} is mergeable: CONFLICTING, so no CI runs at all; merge origin/<base> into the integration branch first`);
    case 'red': return red('ci', `CI is red on PR #${pr}${detail}`);
    default: return red('ci', `ciStatus returned an unknown state "${s?.state}" for PR #${pr}`, EXIT.USAGE);
  }
}

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  const units = await safePart('units', () => unitsGate(ctx, (plan) => plan.units, 'units', 'the plan lists no unit'));
  const sync = await safePart('wave-sync', () => dep(ctx, 'waveSyncGate', waveSyncGate)(ctx));
  const ci = await safePart('ci', async () => {
    const state = await readRunState(ctx);
    const pr = await findRunPr(ctx, state);
    if (!pr) return red('ci', 'the run has no PR yet; delivery claims open makes the draft PR in wave 0');
    return ciResult(pr.number, await dep(ctx, 'ciStatus', ciStatus)(ctx, { pr: pr.number, wait: false }));
  });
  return [{ id: 'units', result: units }, { id: 'wave-sync', result: sync }, { id: 'ci', result: ci }];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}
