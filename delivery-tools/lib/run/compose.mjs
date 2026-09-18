// Composing gate parts. A phase gate is a list of parts, each the result of one gate-facing
// function of some slice, wrapped so that a missing slice or a crash is a failure line and never
// a crash of advance or status.

import { EXIT } from '../core/exit.mjs';
import { combineGates, gateResult, guardGate } from '../core/gate.mjs';

/**
 * The one test seam for cross-slice calls: ctx.deps[name] replaces the real function. Production
 * code never sets ctx.deps, so the real import is used.
 * @template T
 * @param {object} ctx
 * @param {string} name
 * @param {T} real
 * @returns {T}
 */
export function dep(ctx, name, real) {
  const f = ctx?.deps?.[name];
  return f === undefined ? real : f;
}

/**
 * @typedef {import('../core/gate.mjs').GateResult} GateResult
 * @typedef {{ id: string, result: GateResult, notes?: string[] }} Part
 */

/**
 * Run one part: a thrown DeliveryError keeps its exit (guardGate); any other throw is a failure
 * with exit 2, because an unevaluable gate is a plugin or configuration problem, not a red run.
 * @param {string} code
 * @param {() => Promise<GateResult>} fn
 * @returns {Promise<GateResult>}
 */
export async function safePart(code, fn) {
  let r;
  try {
    r = await guardGate(code, fn);
  } catch (err) {
    return gateResult([{ code: 'internal', message: `${code}: ${err?.message ?? String(err)}` }], EXIT.USAGE);
  }
  return normalise(code, r);
}

/** What each non-zero exit means (spec 16), for failure lines. */
export const EXIT_MEANING = Object.freeze({ 1: 'red', 2: 'usage or configuration', 3: 'blocked on the founder', 4: 'wait and retry', 5: 'inconsistency' });

/**
 * Make any returned value a well-formed GateResult: failures present exactly when not ok, and a
 * red result always carries an exit. A non-zero exit is never green, even on a result that says
 * ok with no failure lines (a check asking for 3, blocked on the founder, or 5, an inconsistency).
 * @param {string} code
 * @param {unknown} r
 * @returns {GateResult}
 */
export function normalise(code, r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.failures)) {
    return gateResult([{ code: 'internal', message: `${code}: returned no gate result` }], EXIT.USAGE);
  }
  const failures = r.failures.map((f) => ({ code: String(f?.code ?? code), message: String(f?.message ?? '') }));
  const exit = typeof r.exit === 'number' && r.exit !== 0 ? r.exit : null;
  if (r.ok === true && failures.length === 0 && exit === null) return { ok: true, failures: [] };
  if (failures.length === 0) {
    failures.push({ code, message: exit === null ? `${code} is red` : `${code} ended with exit ${exit} (${EXIT_MEANING[exit] ?? 'unknown'}) and no failure line` });
  }
  return gateResult(failures, exit ?? EXIT.RED);
}

/**
 * combineGates, with exact duplicate failure lines dropped (two parts may report the same fact).
 * @param {GateResult[]} results
 * @returns {GateResult}
 */
export function combine(results) {
  const merged = combineGates(results);
  if (merged.ok) return { ok: true, failures: [] };
  const seen = new Set();
  const failures = merged.failures.filter((f) => {
    const k = JSON.stringify([f.code, f.message]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return gateResult(failures, merged.exit ?? EXIT.RED);
}

/** @param {Part[]} parts @returns {GateResult} */
export function partsResult(parts) {
  return combine(parts.map((p) => p.result));
}

/** A red result with one failure. */
export function red(code, message, exit = EXIT.RED) {
  return gateResult([{ code, message }], exit);
}
