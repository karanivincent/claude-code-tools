// Layer 1 evaluation (spec 7.1): does a seed row match a predicate a worker acts on?
//
// A match has a "when":
//   now      every filter holds at the evaluation instant;
//   later    it will hold as time passes (`release_at <= now()` on a row whose release is still
//            ahead: seeded worlds persist, so the row becomes claimable while it sits there);
//   unknown  a filter reads a column the row does not set, so the database default decides.
// All three refuse the seed. Only `now` is what a dry run "matches at its own clock".

import { isRelative } from './contacts.mjs';

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * Resolve a relative time marker: `now`, `now-2h`, `today`, `today@09:00`, `today@09:00+1d`.
 * `as: "date"` gives YYYY-MM-DD instead of an ISO timestamp.
 * @param {{ $rel: string, as?: string }} marker
 * @param {Date} now
 */
export function resolveRelative(marker, now) {
  const m = /^\s*(now|today)(?:@(\d{1,2}):(\d{2})(?::(\d{2}))?)?((?:\s*[+-]\s*\d+\s*[smhdw])*)\s*$/.exec(String(marker.$rel));
  if (!m) throw new Error(`relative time "${marker.$rel}" is not understood (now|today[@HH:MM][+-N(s|m|h|d|w)]...)`);
  let t = now.getTime();
  if (m[1] === 'today') {
    const d = new Date(t);
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (m[2] !== undefined) t += (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0)) * 1000;
  }
  for (const o of m[5].matchAll(/([+-])\s*(\d+)\s*([smhdw])/g)) t += (o[1] === '-' ? -1 : 1) * Number(o[2]) * UNITS[o[3]];
  const iso = new Date(t).toISOString();
  return marker.as === 'date' ? iso.slice(0, 10) : iso;
}

/** A deep copy of row values with every relative marker resolved at `now`. */
export function resolveValues(values, now) {
  if (isRelative(values)) return resolveRelative(values, now);
  if (Array.isArray(values)) return values.map((v) => resolveValues(v, now));
  if (values && typeof values === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(values)) out[k] = resolveValues(v, now);
    return out;
  }
  return values;
}

const NOW_EXPR = /^now\(\)(?:\s*([+-])\s*interval\s*'([^']*)')?$/i;

/** The instant a `now()` expression names at `now`, or null when the value is not one. */
export function nowExpression(value, now) {
  if (typeof value !== 'string') return null;
  const m = NOW_EXPR.exec(value.trim());
  if (!m) return null;
  let t = now.getTime();
  if (m[1]) {
    const ms = intervalMs(m[2]);
    if (ms === null) return null;
    t += (m[1] === '-' ? -1 : 1) * ms;
  }
  return t;
}

function intervalMs(text) {
  let total = 0;
  let any = false;
  const units = { second: 1000, sec: 1000, minute: 60_000, min: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
  for (const m of String(text).toLowerCase().matchAll(/(-?\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
    const unit = Object.keys(units).find((u) => m[2].startsWith(u));
    if (!unit) return null;
    total += Number(m[1]) * units[unit];
    any = true;
  }
  return any ? total : null;
}

function timeOf(v) {
  if (typeof v !== 'string') return NaN;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return NaN;
  return Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && x === y;
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  return String(a) === String(b);
}

function order(a, b) {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  const x = Number(a);
  const y = Number(b);
  if (typeof a !== 'object' && typeof b !== 'object' && a !== '' && b !== '' && Number.isFinite(x) && Number.isFinite(y)) return x - y;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return NaN;
}

/**
 * One filter against one row: 'yes', 'no', 'later' or 'unknown'.
 * @param {{ column: string, op: string, value: unknown }} f
 * @param {Record<string, unknown>} values resolved values
 * @param {Date} now
 */
export function evalFilter(f, values, now) {
  if (!Object.prototype.hasOwnProperty.call(values, f.column)) return 'unknown';
  const v = values[f.column];
  const target = nowExpression(f.value, now);
  switch (f.op) {
    case 'not-null': return v === null || v === undefined ? 'no' : 'yes';
    case 'is':
      if (f.value === null) return v === null || v === undefined ? 'yes' : 'no';
      return sameValue(v, f.value) ? 'yes' : 'no';
    case 'eq':
      if (v === null || v === undefined) return 'no';
      if (target !== null) return 'unknown';
      return sameValue(v, f.value) ? 'yes' : 'no';
    case 'neq':
      if (v === null || v === undefined) return 'no';
      if (target !== null) return 'unknown';
      return sameValue(v, f.value) ? 'no' : 'yes';
    case 'in':
      if (v === null || v === undefined) return 'no';
      return (Array.isArray(f.value) ? f.value : [f.value]).some((x) => sameValue(v, x)) ? 'yes' : 'no';
    case 'lt': case 'lte': case 'gt': case 'gte': {
      if (v === null || v === undefined) return 'no';
      if (target !== null) {
        const tv = typeof v === 'number' ? NaN : timeOf(v);
        if (!Number.isFinite(tv)) return 'unknown';
        const holds = f.op === 'lt' ? tv < target : f.op === 'lte' ? tv <= target : f.op === 'gt' ? tv > target : tv >= target;
        if (holds) return 'yes';
        return f.op === 'lt' || f.op === 'lte' ? 'later' : 'no';
      }
      const c = order(v, f.value);
      if (!Number.isFinite(c)) return 'unknown';
      const holds = f.op === 'lt' ? c < 0 : f.op === 'lte' ? c <= 0 : f.op === 'gt' ? c > 0 : c >= 0;
      return holds ? 'yes' : 'no';
    }
    default: return 'unknown';
  }
}

/**
 * @param {{ filters: object[] }} predicate
 * @param {Record<string, unknown>} values resolved values
 * @param {Date} now
 * @returns {'now'|'later'|'unknown'|null} null: does not match
 */
export function matchPredicate(predicate, values, now) {
  let later = false;
  let unknown = false;
  for (const f of predicate.filters) {
    const r = evalFilter(f, values, now);
    if (r === 'no') return null;
    if (r === 'later') later = true;
    if (r === 'unknown') unknown = true;
  }
  return unknown ? 'unknown' : later ? 'later' : 'now';
}

/** "status = queued AND release_at <= now()", for messages. */
export function describeFilters(filters) {
  if (!filters.length) return 'every row';
  const sym = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };
  return filters.map((f) => {
    if (f.op === 'not-null') return `${f.column} IS NOT NULL`;
    if (f.op === 'is') return `${f.column} IS ${f.value === null ? 'NULL' : String(f.value).toUpperCase()}`;
    if (f.op === 'in') return `${f.column} in (${(Array.isArray(f.value) ? f.value : [f.value]).join(', ')})`;
    return `${f.column} ${sym[f.op] ?? f.op} ${f.value}`;
  }).join(' AND ');
}
