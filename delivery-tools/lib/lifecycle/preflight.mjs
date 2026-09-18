// Preflight probes (spec 4.1). Owner: slice A2 (docs/ARCHITECTURE.md).
// PROBES is final; preflightGate is a stub until A2 lands.

import { notImplementedError } from '../core/exit.mjs';

/**
 * Every probe, whether the founder may waive it, and whether red means the founder must act
 * (a red-circle item, exit 3) rather than a wave-0 task. Read by waive (A1) and the phase-1 gate.
 * blocking "conditional" means red-circle only in the case the spec names (see note).
 * @type {ReadonlyArray<{ id: string, title: string, waivable: boolean, blocking: boolean|'conditional', note: string }>}
 */
export const PROBES = Object.freeze([
  { id: 'P1', title: 'Profile validates; command strings complete', waivable: false, blocking: 'conditional', note: 'red-circle only for a founder-authored field; otherwise a wave-0 profile fix' },
  { id: 'P2', title: 'Safety file exists, validates, byte-identical to origin/<base>', waivable: false, blocking: true, note: 'no seeding without it' },
  { id: 'P3', title: 'Test database: service-role read and write; the project is the test project, not production', waivable: false, blocking: true, note: '' },
  { id: 'P4', title: 'Migration apply path to the test environment', waivable: false, blocking: 'conditional', note: 'red-circle when the plan adds a migration; re-checked after planning' },
  { id: 'P5', title: 'Fixture worlds; the e2e robot is not in the founder\'s organisation', waivable: false, blocking: false, note: 'wave-0 task T-robot-org' },
  { id: 'P6', title: 'Safe seeding: sidefx derives and an empty seed plan passes seed --check', waivable: false, blocking: false, note: 'wave-0 task' },
  { id: 'P7', title: 'Committed capture spec and a version route reporting the served SHA', waivable: false, blocking: false, note: 'wave-0 tasks T-capture, T-version' },
  { id: 'P8', title: 'Trusted e2e path against a resolved preview passes a smoke spec', waivable: false, blocking: 'conditional', note: 'red-circle if auth fails; wave-0 task if only the smoke spec is missing' },
  { id: 'P9', title: 'Preview resolver, CI waiter and staging-deploy waiter run', waivable: false, blocking: true, note: '' },
  { id: 'P10', title: 'Bootstrap command prepares a fresh worktree', waivable: false, blocking: false, note: 'wave-0 task T-bootstrap' },
  { id: 'P11', title: 'Heavy-slot wrapper works; both slots within 10 minutes', waivable: false, blocking: true, note: '' },
  { id: 'P12', title: 'Pool planner runs; path claims present in the scope check', waivable: false, blocking: 'conditional', note: 'red-circle for the planner; missing path claims is a recorded warning' },
  { id: 'P13', title: 'Observer user is a member of the founder\'s organisation', waivable: true, blocking: false, note: 'wave-0 task if the safety file names it; the report then leads with the waiver' },
  { id: 'P14', title: 'Every message file and banned-word list exists', waivable: false, blocking: false, note: 'wave-0 task' },
  { id: 'P15', title: 'Permission rehearsal: every command shape runs once without a prompt', waivable: false, blocking: false, note: 'fix the allow rule now' },
  { id: 'P16', title: 'Loop-test broker available when an in-scope path matches loopTest.when', waivable: false, blocking: 'conditional', note: 'red-circle only when the voice path is in scope' },
]);

/**
 * Phase-1 gate input: every probe green, turned into a wave-0 task, or waived where waivable.
 * Re-runs the cheap probes (P1, P2, P7, P14) from sources and re-validates preflight.json for the rest.
 * Called by lib/gates/phase-1.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function preflightGate(ctx) {
  throw notImplementedError('A2', 'preflightGate');
}
