// Plan invariants (spec 4.3, M12): short statements a capture's visible text can settle. The plan
// writes them in this grammar (case does not matter, a final period is ignored):
//
//   at most|at least|exactly <n> <anything> shows|show|reads|read <target>
//   never|nowhere <target>                     no element may match
//   <"a"> never beside <"b">                   not both on one page ("never with" too)
//   not both <"a"> and <"b">
//
// <n> is digits or a word from zero to ten. A target in double quotes matches any element that
// contains it; a bare target matches an element equal to it. "at most one version row shows
// Submit" counts the elements that read exactly "Submit".

import { foldTypography } from './text.mjs';

const NUMBERS = { zero: 0, none: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * @typedef {{ quoted: boolean, text: string }} Target
 * @typedef {{ kind: 'count', op: 'max'|'min'|'eq', n: number, target: Target }
 *   | { kind: 'never', target: Target }
 *   | { kind: 'not-both', a: Target, b: Target }} Invariant
 */

function target(raw) {
  const t = raw.trim();
  const q = /^["“](.+)["”]$/.exec(t);
  if (q) return { quoted: true, text: q[1] };
  return t ? { quoted: false, text: t } : null;
}

/**
 * @param {string} text
 * @returns {Invariant|null} null when the statement is not in the grammar
 */
export function parseInvariant(text) {
  const s = String(text ?? '').trim().replace(/\.$/, '').trim();
  let m = /^(at most|at least|exactly)\s+(\d+|[a-z]+)\s+(?:.+?\s+)?(?:shows?|reads?)\s+(.+)$/i.exec(s);
  if (m) {
    const n = /^\d+$/.test(m[2]) ? Number(m[2]) : NUMBERS[m[2].toLowerCase()];
    const t = target(m[3]);
    if (n === undefined || !t) return null;
    return { kind: 'count', op: { 'at most': 'max', 'at least': 'min', exactly: 'eq' }[m[1].toLowerCase()], n, target: t };
  }
  m = /^(?:never|nowhere)\s+(.+)$/i.exec(s);
  if (m) { const t = target(m[1]); return t ? { kind: 'never', target: t } : null; }
  m = /^not both\s+(".+?"|“.+?”)\s+and\s+(".+?"|“.+?”)$/i.exec(s);
  if (m) return { kind: 'not-both', a: target(m[1]), b: target(m[2]) };
  m = /^(".+?"|“.+?”)\s+never\s+(?:beside|with|next to)\s+(".+?"|“.+?”)$/i.exec(s);
  if (m) return { kind: 'not-both', a: target(m[1]), b: target(m[2]) };
  return null;
}

const norm = (s) => foldTypography(s).toLowerCase();

/** @param {Target} t @param {{ text: string }[]} elements */
function countMatches(t, elements) {
  const want = norm(t.text);
  return elements.filter((e) => (t.quoted ? norm(e.text).includes(want) : norm(e.text) === want)).length;
}

/**
 * @param {Invariant} inv
 * @param {{ text: string }[]} elements parseElements() of one capture
 * @returns {{ ok: boolean, detail: string }}
 */
export function evaluateInvariant(inv, elements) {
  if (inv.kind === 'count') {
    const c = countMatches(inv.target, elements);
    const ok = inv.op === 'max' ? c <= inv.n : inv.op === 'min' ? c >= inv.n : c === inv.n;
    return { ok, detail: `${c} element(s) match "${inv.target.text}"` };
  }
  if (inv.kind === 'never') {
    const c = countMatches(inv.target, elements);
    return { ok: c === 0, detail: `${c} element(s) match "${inv.target.text}"` };
  }
  const a = countMatches(inv.a, elements);
  const b = countMatches(inv.b, elements);
  return { ok: !(a > 0 && b > 0), detail: `"${inv.a.text}" ${a > 0 ? 'present' : 'absent'}, "${inv.b.text}" ${b > 0 ? 'present' : 'absent'}` };
}
