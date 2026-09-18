// The one result shape every gate and gate-facing function returns:
// { ok, failures: [{ code, message }] }. Phase gates compose these with combineGates.

/**
 * @typedef {{ code: string, message: string }} GateFailure
 * @typedef {{ ok: boolean, failures: GateFailure[], exit?: number }} GateResult
 *   exit is optional: set it when red means something other than 1 (3 blocked, 4 wait, 5 inconsistent)
 */

/** @param {GateFailure[]} [failures] @param {number} [exit] @returns {GateResult} */
export function gateResult(failures = [], exit) {
  const r = { ok: failures.length === 0, failures };
  if (failures.length && exit !== undefined) r.exit = exit;
  return r;
}

export const PASS = Object.freeze({ ok: true, failures: [] });

/**
 * Merge several results. ok only when all are; failures concatenated in order; the most serious exit kept.
 * @param {GateResult[]} results
 * @returns {GateResult}
 */
export function combineGates(results) {
  const failures = results.flatMap((r) => r.failures);
  const rank = { 5: 6, 2: 5, 3: 4, 4: 3, 1: 2 };
  let exit;
  for (const r of results) {
    if (!r.ok) {
      const e = r.exit ?? 1;
      if (exit === undefined || (rank[e] ?? 0) > (rank[exit] ?? 0)) exit = e;
    }
  }
  return gateResult(failures, failures.length ? exit : undefined);
}

/**
 * Run a gate-facing function and turn a thrown DeliveryError into a red result instead of a crash,
 * so one slice's missing piece shows as a failure line in another slice's gate.
 * @param {string} code failure code to use for a thrown error
 * @param {() => Promise<GateResult>} fn
 * @returns {Promise<GateResult>}
 */
export async function guardGate(code, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err && typeof err.exit === 'number') {
      const failures = (err.failures ?? [{ code, message: err.message }]).map((f) => ({ code: f.code === 'not-implemented' ? 'not-implemented' : code, message: f.message }));
      return gateResult(failures, err.exit);
    }
    throw err;
  }
}
