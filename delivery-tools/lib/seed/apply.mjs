// Writing a seed plan: fixture users first, then each world's rows in plan order (organisation
// rows before anything that names them), with relative times resolved at the moment of writing.
// Only seed --apply and seed --refresh call this, through an adapter built for that write mode.

import { resolveValues } from './evaluate.mjs';

/**
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db built with write 'seed-apply' or 'seed-refresh'
 * @param {object} seedPlan
 * @param {{ worlds?: string[], now: Date, users?: boolean }} opts
 * @returns {Promise<{ rows: number, users: { created: number, existing: number } }>}
 */
export async function applyRows(db, seedPlan, opts) {
  const only = opts.worlds ? new Set(opts.worlds) : null;
  const inScope = (w) => !only || only.has(w);
  const userCounts = { created: 0, existing: 0 };
  if (opts.users !== false) {
    for (const u of seedPlan.users.filter((x) => inScope(x.world))) {
      const r = await db.createUser({ id: u.id, email: u.email });
      if (r === 'created') userCounts.created++;
      else userCounts.existing++;
    }
  }
  const orgIds = new Set(seedPlan.worlds.map((w) => w.orgId));
  const rows = seedPlan.rows.filter((r) => inScope(r.world));
  const ordered = [...rows.filter((r) => orgIds.has(r.id)), ...rows.filter((r) => !orgIds.has(r.id))];
  let written = 0;
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
    const values = r.idless ? resolveValues(r.values, opts.now) : { ...resolveValues(r.values, opts.now), id: r.id };
    if (batch && (batch.table !== r.table || batch.idless !== Boolean(r.idless))) await flush();
    batch ??= { table: r.table, idless: Boolean(r.idless), rows: [] };
    batch.rows.push(values);
  }
  await flush();
  return { rows: written, users: userCounts };
}
