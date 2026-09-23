// The phases of a run and the gate that must be green to leave each one (spec 3.4, 11.2).
// Phase names are State.phase (schemas/state.schema.json); the spec numbers the gates 0 to 7.
// Phase 6 spans "pr" (land before the merge) and "ready" (waiting for the founder's merge);
// phase 7 spans "merged" (staging proof) and "landed" (the epic closing).

import { UsageError } from '../core/exit.mjs';

export const PHASES = Object.freeze(['intake', 'preflight', 'inventory', 'plan', 'wave0', 'build', 'pr', 'ready', 'merged', 'landed', 'closed']);

/**
 * @typedef {{ phase: string, number: number|null, gate: string|null, skill: string|null, title: string }} Step
 *   gate: the id of the gate that must be green to leave this phase (lib/run/gates.mjs)
 *   skill: the skill that drives the phase, which NEXT names (spec 14.1)
 */

/** @type {ReadonlyArray<Step>} one per phase, in order */
export const STEPS = Object.freeze([
  { phase: 'intake', number: 0, gate: 'phase-0', skill: 'deliver-from-design', title: 'intake' },
  { phase: 'preflight', number: 1, gate: 'phase-1', skill: 'deliver-from-design', title: 'preflight' },
  { phase: 'inventory', number: 2, gate: 'phase-2', skill: 'design-inventory', title: 'inventory and baseline' },
  { phase: 'plan', number: 3, gate: 'phase-3', skill: 'coverage-plan', title: 'plan' },
  { phase: 'wave0', number: 4, gate: 'phase-4', skill: 'epic-build', title: 'wave 0' },
  { phase: 'build', number: 5, gate: 'phase-5', skill: 'epic-build', title: 'build waves' },
  { phase: 'pr', number: 6, gate: 'phase-6', skill: 'deliver-from-design', title: 'land before the merge' },
  { phase: 'ready', number: 6, gate: 'merge', skill: 'deliver-from-design', title: 'waiting for the merge' },
  { phase: 'merged', number: 7, gate: 'staging', skill: 'deliver-from-design', title: 'land after the merge' },
  { phase: 'landed', number: 7, gate: 'epic-closed', skill: 'deliver-from-design', title: 'closing the epic' },
  { phase: 'closed', number: null, gate: null, skill: null, title: 'closed' },
].map((s) => Object.freeze(s)));

/** @param {string} phase */
export function phaseIndex(phase) {
  const i = PHASES.indexOf(phase);
  if (i < 0) throw new UsageError(`unknown phase "${phase}"; one of: ${PHASES.join(', ')}`);
  return i;
}

/** @param {string} phase @returns {Step} */
export function stepOf(phase) {
  return STEPS[phaseIndex(phase)];
}

/** @param {string} phase @returns {string|null} */
export function nextPhase(phase) {
  return PHASES[phaseIndex(phase) + 1] ?? null;
}

export const FIRST_POST_MERGE = PHASES.indexOf('merged');

/** True from "merged" on: the PR is in the base branch and nothing before it can change. */
export function isPostMerge(phase) {
  return phaseIndex(phase) >= FIRST_POST_MERGE;
}

/**
 * The steps whose gates advance and status re-run for a run at `phase`: every earlier phase.
 * After the merge only the steps from "pr" on are re-run: the merged code cannot change, and
 * gates 0 to 5 read things the merge ends by design (the open draft PR, its claims).
 * @param {string} phase
 * @returns {Step[]}
 */
export function earlierSteps(phase) {
  const i = phaseIndex(phase);
  const from = isPostMerge(phase) ? PHASES.indexOf('pr') : 0;
  return STEPS.slice(from, i);
}
