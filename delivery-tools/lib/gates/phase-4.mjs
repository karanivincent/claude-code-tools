// Phase 4 gate (wave0), spec 3.4: advance refuses unless contracts compile with stubs; every fixture world is seeded and passes the safety scan; the capture smoke passes; the draft PR claims every child; the planner confirms it.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   contract-unit  unitGateStatus (lib/gate/unit.mjs, B1) for every wave-0 unit of the plan: the
//                  contract unit, plus the repo prerequisites preflight turned into wave-0 units
//   seed-scan      seedScanGate (lib/seed/scan.mjs, B2): the worlds as the database is now
//   capture-smoke  captureSmokeGate (lib/capture/validate.mjs, C)
//   claims         claimsGate (lib/github/claims.mjs, A2): the draft PR and the planner

import { readArtefact } from '../core/artefacts.mjs';
import { PASS } from '../core/gate.mjs';
import { unitGateStatus } from '../gate/unit.mjs';
import { seedScanGate } from '../seed/scan.mjs';
import { captureSmokeGate } from '../capture/validate.mjs';
import { claimsGate } from '../github/claims.mjs';
import { combine, dep, partsResult, red, safePart } from '../run/compose.mjs';

export const PHASE = 4;
export const RULE = "contracts compile with stubs; every fixture world is seeded and passes the safety scan; the capture smoke passes; the draft PR claims every child; the planner confirms it";
export const PARTS = Object.freeze(['contract-unit', 'seed-scan', 'capture-smoke', 'claims']);

/**
 * Every listed unit's gate, one part; red when the plan is missing or lists none.
 * @param {object} ctx
 * @param {(plan: object) => object[]} pick the units to check
 * @param {string} code
 * @param {string} none the failure when the plan names no such unit
 */
export async function unitsGate(ctx, pick, code, none) {
  const plan = await readArtefact(ctx.requirePaths(), 'plan', { optional: true });
  if (!plan) return red('plan', 'no docs/delivery/<feature>/plan.json; the plan comes before any unit');
  const units = pick(plan);
  if (!units.length) return red(code, none);
  const check = dep(ctx, 'unitGateStatus', unitGateStatus);
  const results = [];
  for (const u of units) results.push(await safePart(`unit ${u.id}`, () => check(ctx, u.id)));
  return combine(results);
}

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  const contract = await safePart('contract-unit', async () => {
    const r = await unitsGate(ctx, (plan) => plan.units.filter((u) => u.wave === 0), 'contract-unit', 'the plan has no wave-0 unit; wave 0 is always the contract unit (spec 12.1)');
    if (!r.ok) return r;
    const plan = await readArtefact(ctx.requirePaths(), 'plan');
    return plan.units.some((u) => u.wave === 0 && u.kind === 'contract') ? PASS : red('contract-unit', 'no wave-0 unit is of kind contract (spec 12.1)');
  });
  return [
    { id: 'contract-unit', result: contract },
    { id: 'seed-scan', result: await safePart('seed-scan', () => dep(ctx, 'seedScanGate', seedScanGate)(ctx)) },
    { id: 'capture-smoke', result: await safePart('capture-smoke', () => dep(ctx, 'captureSmokeGate', captureSmokeGate)(ctx)) },
    { id: 'claims', result: await safePart('claims', () => dep(ctx, 'claimsGate', claimsGate)(ctx)) },
  ];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}
