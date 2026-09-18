// Evaluating the phase gates for a run (spec 11.2): every earlier phase's gate from its sources,
// then the gate of the phase being left. Shared by advance and status, so the two cannot disagree.

import { worstExit } from '../core/exit.mjs';
import * as p0 from '../gates/phase-0.mjs';
import * as p1 from '../gates/phase-1.mjs';
import * as p2 from '../gates/phase-2.mjs';
import * as p3 from '../gates/phase-3.mjs';
import * as p4 from '../gates/phase-4.mjs';
import * as p5 from '../gates/phase-5.mjs';
import * as p6 from '../gates/phase-6.mjs';
import * as p7 from '../gates/phase-7.mjs';
import { dep, partsResult, safePart } from './compose.mjs';
import { earlierSteps, isPostMerge, stepOf } from './phases.mjs';

/** gate id -> the function listing its parts (lib/gates/*). */
export const GATE_EVALUATORS = Object.freeze({
  'phase-0': p0.evaluate,
  'phase-1': p1.evaluate,
  'phase-2': p2.evaluate,
  'phase-3': p3.evaluate,
  'phase-4': p4.evaluate,
  'phase-5': p5.evaluate,
  'phase-6': p6.evaluate,
  merge: p6.evaluateMerged,
  staging: p7.evaluateStaging,
  'epic-closed': p7.evaluateEpicClosed,
});

/**
 * @typedef {{ gate: string, ok: boolean, exit: number, failures: { code: string, message: string }[],
 *             parts: import('./compose.mjs').Part[], notes: string[] }} GateVerdict
 * @typedef {GateVerdict & { step: import('./phases.mjs').Step }} StepVerdict
 */

/**
 * Evaluate one gate. ctx.deps["gate:<id>"] replaces the evaluator in tests.
 * @param {object} ctx
 * @param {string} gateId
 * @returns {Promise<GateVerdict>}
 */
export async function evaluateGate(ctx, gateId) {
  const evaluator = dep(ctx, `gate:${gateId}`, GATE_EVALUATORS[gateId]);
  if (!evaluator) throw new Error(`no evaluator for gate ${gateId}`);
  let parts;
  try {
    parts = await evaluator(ctx);
    if (!Array.isArray(parts)) throw new Error('returned no parts');
  } catch (err) {
    parts = [{ id: gateId, result: await safePart(gateId, async () => { throw err; }) }];
  }
  const result = partsResult(parts);
  return {
    gate: gateId,
    ok: result.ok,
    exit: result.ok ? 0 : (result.exit ?? 1),
    failures: result.failures,
    parts,
    notes: parts.flatMap((p) => p.notes ?? []),
  };
}

/**
 * Re-run the gates that bind a run at state.phase.
 * backTo: the earliest earlier phase whose gate is red (exit 1) or blocked on the founder (exit 3).
 * Never set after the merge, which cannot be undone; exits 2, 4 and 5 never move a run back
 * (a configuration problem, a wait, a tampered file).
 * @param {object} ctx
 * @param {{ phase: string }} state
 * @param {{ leaving?: boolean }} [opts] leaving: also evaluate the gate of the current phase
 * @returns {Promise<{ earlier: StepVerdict[], leaving: StepVerdict|null, backTo: string|null, exit: number }>}
 */
export async function evaluateRun(ctx, state, opts = {}) {
  const earlier = [];
  for (const step of earlierSteps(state.phase)) earlier.push({ step, ...(await evaluateGate(ctx, step.gate)) });
  const cur = stepOf(state.phase);
  const leaving = opts.leaving !== false && cur.gate ? { step: cur, ...(await evaluateGate(ctx, cur.gate)) } : null;
  const back = isPostMerge(state.phase) ? null : earlier.find((e) => !e.ok && (e.exit === 1 || e.exit === 3));
  const exit = worstExit([...earlier, ...(leaving ? [leaving] : [])].map((e) => e.exit));
  return { earlier, leaving, backTo: back ? back.step.phase : null, exit };
}

/** One line per verdict: "gate phase-2 (inventory): green" or "... red (exit 1)". */
export function verdictLine(v) {
  const label = `gate ${v.gate} (${v.step?.phase ?? '?'})`;
  if (v.ok) return `${label}: green${v.notes?.length ? ` (${v.notes.join('; ')})` : ''}`;
  return `${label}: red, exit ${v.exit}, ${v.failures.length} failure(s)`;
}
