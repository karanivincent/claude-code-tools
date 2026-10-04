// Layer 1 evaluation (spec 7.1): does a seed row match a predicate a worker acts on?
//
// A match has a "when":
//   now      every filter holds at the evaluation instant;
//   later    it will hold as time passes (`release_at <= now()` on a row whose release is still
//            ahead: seeded worlds persist, so the row becomes claimable while it sits there);
//   unknown  a filter reads a column the row does not set, so the database default decides.
// All three refuse the seed. Only `now` is what a dry run "matches at its own clock".

import { isMinuteOfDay, isRelative } from './contacts.mjs';

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * Resolve a relative time marker: `now`, `now-2h`, `today`, `today@09:00`, `today@09:00+1d`.
 * `as: "date"` gives YYYY-MM-DD instead of an ISO timestamp. `today` and the date are the local
 * day in `now.timeZone` (see zonedNow) when it is set, and the UTC day when it is not: a page reads
 * the organisation's own day, so a seed run late in the UTC evening put "today's" rows on the
 * organisation's yesterday.
 * @param {{ $rel: string, as?: string }} marker
 * @param {Date} now
 */
export function resolveRelative(marker, now) {
  const m = /^\s*(now|today)(?:@(\d{1,2}):(\d{2})(?::(\d{2}))?)?((?:\s*[+-]\s*\d+\s*[smhdw])*)\s*$/.exec(String(marker.$rel));
  if (!m) throw new Error(`relative time "${marker.$rel}" is not understood (now|today[@HH:MM][+-N(s|m|h|d|w)]...)`);
  const zone = now.timeZone ?? null;
  let t = now.getTime();
  if (m[1] === 'today') {
    const [y, mo, d] = localDate(t, zone).split('-').map(Number);
    t = localMidnight(y, mo, d, zone);
    if (m[2] !== undefined) t += (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0)) * 1000;
  }
  for (const o of m[5].matchAll(/([+-])\s*(\d+)\s*([smhdw])/g)) t += (o[1] === '-' ? -1 : 1) * Number(o[2]) * UNITS[o[3]];
  return marker.as === 'date' ? localDate(t, zone) : new Date(t).toISOString();
}

const MINUTE_OF_DAY = /^\s*(?:(startOfDay|endOfDay|closedStart|closedEnd|openStart|openEnd)|now((?:\s*[+-]\s*\d+\s*[mh]?)*))\s*$/;

/**
 * A calling-hours window relative to the minute of the day `n` (0..1439) that never depends on the
 * clock: always 0 <= start < end <= 1440, at every minute of the day.
 *   closed  a window that does NOT contain n: [0, n-30] from 01:00, [n+30, 1440] before it
 *           (2026-10-05: "now-240".."now-60" clamped to 0..0 between 00:00 and 01:00, and the
 *           database refused an end_minute that was not after start_minute);
 *   open    a window that contains n (start <= n < end): [max(0, n-60), min(1440, n+60)].
 * @param {'closed'|'open'} kind
 * @param {number} n
 * @returns {{ start: number, end: number }}
 */
export function minuteWindow(kind, n) {
  if (kind === 'closed') return n >= 60 ? { start: 0, end: n - 30 } : { start: n + 30, end: 1440 };
  return { start: Math.max(0, n - 60), end: Math.min(1440, n + 60) };
}

const WINDOW_TOKENS = {
  closedStart: ['closed', 'start'], closedEnd: ['closed', 'end'],
  openStart: ['open', 'start'], openEnd: ['open', 'end'],
};

/**
 * Resolve a minute-of-day marker: the minute of the local day (in `now.timeZone`, UTC when unset)
 * relative to the moment the row is written, so a time-of-day setting (calling hours, opening
 * hours) reads the same whatever the clock says when the world is seeded or reset.
 *   "now"          the current minute of the day
 *   "now-60"       sixty minutes before it (a bare number is minutes; "now+2h" and "now-90m" work too)
 *   "startOfDay"   0, and "endOfDay" 1440: together, "open all day"
 *   "closedStart" / "closedEnd"   a pair giving a valid window that does not contain now, at any
 *                                 minute of the day (see minuteWindow); prefer it to now-N for closed
 *   "openStart" / "openEnd"       a pair giving a window that contains now
 * Every marker in one row resolves from the same `now`, so a pair always agrees.
 * The result is clamped to 0..1440, so "now-60" just after midnight is 0, not yesterday's 23:00;
 * `wrap: true` takes it modulo 1440 instead (a value that may name tomorrow's minute).
 * @param {{ $minuteOfDay: string, wrap?: boolean }} marker
 * @param {Date} now
 * @returns {number}
 */
export function resolveMinuteOfDay(marker, now) {
  const m = MINUTE_OF_DAY.exec(String(marker.$minuteOfDay));
  if (!m) throw new Error(`minute of day "${marker.$minuteOfDay}" is not understood (now[+-N[m|h]]..., startOfDay, endOfDay, closedStart, closedEnd, openStart or openEnd)`);
  if (m[1] === 'startOfDay') return 0;
  if (m[1] === 'endOfDay') return 1440;
  let v = localMinute(now.getTime(), now.timeZone ?? null);
  if (m[1]) { const [kind, side] = WINDOW_TOKENS[m[1]]; return minuteWindow(kind, v)[side]; }
  for (const o of m[2].matchAll(/([+-])\s*(\d+)\s*([mh]?)/g)) v += (o[1] === '-' ? -1 : 1) * Number(o[2]) * (o[3] === 'h' ? 60 : 1);
  if (marker.wrap === true) return ((v % 1440) + 1440) % 1440;
  return Math.min(1440, Math.max(0, v));
}

/** Minutes since local midnight of instant t in the zone (UTC when none). */
function localMinute(t, zone) {
  if (!zone) { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * A copy of `date` that carries the time zone relative markers resolve their day in (an IANA name,
 * e.g. the profile's testData.timeZone). Every seed path passes `now` through unchanged, so the
 * zone travels with it. Throws on a name the runtime does not know.
 * @param {Date} date
 * @param {string|null|undefined} timeZone
 */
export function zonedNow(date, timeZone) {
  const out = new Date(date.getTime());
  if (!timeZone) return out;
  new Intl.DateTimeFormat('en-US', { timeZone }); // throws RangeError on an unknown zone
  out.timeZone = timeZone;
  return out;
}

/** ctx's clock now, carrying the profile's testData.timeZone. */
export async function seedNow(ctx) {
  const profile = await ctx.profile().catch(() => null);
  return zonedNow(ctx.clock.now(), profile?.testData?.timeZone);
}

/** YYYY-MM-DD of instant t in the zone (UTC when none). */
function localDate(t, zone) {
  if (!zone) return new Date(t).toISOString().slice(0, 10);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** The zone's offset from UTC at instant t, in ms. */
function offsetAt(t, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** The instant the local day y-mo-d begins in the zone. */
function localMidnight(y, mo, d, zone) {
  const guess = Date.UTC(y, mo - 1, d);
  if (!zone) return guess;
  const first = guess - offsetAt(guess, zone);
  return guess - offsetAt(first, zone);
}

/** A deep copy of row values with every relative marker resolved at `now`. */
export function resolveValues(values, now) {
  if (isRelative(values)) return resolveRelative(values, now);
  if (isMinuteOfDay(values)) return resolveMinuteOfDay(values, now);
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
