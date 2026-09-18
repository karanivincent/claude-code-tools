// Severity policy (spec 8.3). Owner: slice B1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * What keeps ready red under the severity policy: any open P1; any open P2 not accepted with a
 * reason class and issue; accepted P2s over limits.maxAcceptedP2PerGroup or limits.maxAcceptedP2;
 * day-one states raised one level. Pure.
 * Called by ready (A1) and report (C).
 * @param {import('../core/findings.mjs').FindingsDoc} findings
 * @param {object} plan
 * @param {object} profile
 * @returns {import('../core/gate.mjs').GateFailure[]}
 */
export function readyBlockers(findings, plan, profile) {
  throw notImplementedError('B1', 'readyBlockers');
}
