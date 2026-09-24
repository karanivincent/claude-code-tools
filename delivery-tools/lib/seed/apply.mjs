// Writing a seed plan: fixture users first, then each world's rows in plan order (organisation
// rows before anything that names them), with relative times resolved at the moment of writing.
// Only seed --apply and seed --refresh call this, through an adapter built for that write mode.

import { resolveValues } from './evaluate.mjs';

/**
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db built with write 'seed-apply' or 'seed-refresh'
 * @param {object} seedPlan
 * @param {{ worlds?: string[], now: Date, users?: boolean, live?: { table: string, id: string, values: object }[] | null }} opts
 *   live: the rows the database holds now (liveWorldRows); a planned row it already holds exactly
 *   as planned is not written again. Without it every row is written.
 * @returns {Promise<{ rows: number, unchanged: number, users: { created: number, existing: number } }>}
 */
export async function applyRows(db, seedPlan, opts) {
  const only = opts.worlds ? new Set(opts.worlds) : null;
  const inScope = (w) => !only || only.has(w);
  const userCounts = { created: 0, existing: 0 };
  if (opts.users !== false) {
    for (const u of seedPlan.users.filter((x) => inScope(x.world))) {
      const r = await db.createUser({ id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) });
      if (r === 'created') userCounts.created++;
      else userCounts.existing++;
    }
  }
  const orgIds = new Set(seedPlan.worlds.map((w) => w.orgId));
  const rows = seedPlan.rows.filter((r) => inScope(r.world));
  const ordered = [...rows.filter((r) => orgIds.has(r.id)), ...rows.filter((r) => !orgIds.has(r.id))];
  const holds = opts.live ? liveHolds(opts.live) : null;
  let written = 0;
  let unchanged = 0;
  let batch = null;
  const flush = async () => {
    if (!batch) return;
    await db.upsert(batch.table, batch.rows, { idless: batch.idless });
    written += batch.rows.length;
    batch = null;
  };
  for (const r of ordered) {
    // A join table has no id column, so the row is written as it stands and is identified by the
    // columns it joins; everything else carries its derived id, which is what makes a re-seed an
    // idempotent upsert.
    const resolved = resolveValues(r.values, opts.now);
    if (holds?.(r, resolved)) { unchanged++; continue; }
    const values = r.idless ? resolved : { ...resolved, id: r.id };
    if (batch && (batch.table !== r.table || batch.idless !== Boolean(r.idless))) await flush();
    batch ??= { table: r.table, idless: Boolean(r.idless), rows: [] };
    batch.rows.push(values);
  }
  await flush();
  return { rows: written, unchanged, users: userCounts };
}

/**
 * Whether the database already holds a planned row exactly as planned: the row with its id (for a
 * join table, any row of that table) carries every planned column with the planned value. Columns
 * the plan does not set are not the plan's to restore. Anything this cannot prove equal counts as
 * different, so a doubt costs one write and never leaves a row as a click left it.
 * @param {{ table: string, id: string, values: object }[]} live
 * @returns {(row: { table: string, id: string, idless?: boolean }, resolved: object) => boolean}
 */
export function liveHolds(live) {
  const byKey = new Map();
  const byTable = new Map();
  for (const l of live) {
    byKey.set(`${l.table}\0${l.id}`, l.values);
    if (!byTable.has(l.table)) byTable.set(l.table, []);
    byTable.get(l.table).push(l.values);
  }
  const matches = (stored, resolved) => Boolean(stored)
    && Object.entries(resolved).every(([k, v]) => Object.prototype.hasOwnProperty.call(stored, k) && sameStored(v, stored[k]));
  return (row, resolved) => (row.idless
    ? (byTable.get(row.table) ?? []).some((stored) => matches(stored, resolved))
    : matches(byKey.get(`${row.table}\0${row.id}`), resolved));
}

// A timestamp with its zone: `2026-09-15T09:00:22.5+00:00`, `2026-09-15 09:00:22+00`, `...Z`.
const ZONED_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * A planned value against the value the database returned for it. Equal only when certain: the
 * same text or number, the same instant for two zoned timestamps (to the microsecond), the same
 * elements in order for an array, the same keys and values for an object (jsonb keeps no key
 * order). A number the plan wrote as text compares as the number.
 * @param {unknown} planned
 * @param {unknown} stored
 * @returns {boolean}
 */
export function sameStored(planned, stored) {
  if (planned === stored) return true;
  if (planned === null || stored === null || planned === undefined || stored === undefined) return false;
  if (Array.isArray(planned) || Array.isArray(stored)) {
    return Array.isArray(planned) && Array.isArray(stored) && planned.length === stored.length
      && planned.every((v, i) => sameStored(v, stored[i]));
  }
  if (typeof planned === 'object' || typeof stored === 'object') {
    if (typeof planned !== 'object' || typeof stored !== 'object') return false;
    const a = Object.keys(planned);
    const b = Object.keys(stored);
    return a.length === b.length && a.every((k) => Object.prototype.hasOwnProperty.call(stored, k) && sameStored(planned[k], stored[k]));
  }
  if (typeof planned === 'number' || typeof stored === 'number') {
    if (planned === '' || stored === '' || typeof planned === 'boolean' || typeof stored === 'boolean') return false;
    const x = Number(planned);
    const y = Number(stored);
    return Number.isFinite(x) && Number.isFinite(y) && x === y;
  }
  if (typeof planned === 'string' && typeof stored === 'string') {
    const a = ZONED_TIME.exec(planned);
    const b = ZONED_TIME.exec(stored);
    if (!a || !b) return false;
    return instantMicros(a) === instantMicros(b);
  }
  return false;
}

function instantMicros(m) {
  const zone = m[4] === 'Z' ? 'Z' : m[4].length === 3 ? `${m[4]}:00` : m[4].includes(':') ? m[4] : `${m[4].slice(0, 3)}:${m[4].slice(3)}`;
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  const ms = Date.parse(`${m[1]}T${time}${zone}`);
  if (!Number.isFinite(ms)) return NaN;
  return BigInt(ms) * 1000n + BigInt((m[3] ?? '').padEnd(6, '0').slice(0, 6));
}
