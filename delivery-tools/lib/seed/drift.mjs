// What can change under the fixture worlds without anyone touching them (stable picture data, fix 7
// and fix 9): the shared tables a world reads but does not own (R7: voices, prompt layers, plan
// settings), the columns of the tables the worlds write (a migration mid-run), and another run's
// fixture organisation with the same name (a lane or a test that picks an organisation by name
// could write to the wrong one). Everything is read-only; pure helpers first.

import { join } from 'node:path';
import { sha256 } from '../core/hash.mjs';
import { readJson, writeJsonAtomic } from '../core/fs.mjs';
import { queryAll } from './db.mjs';

const TABLE = /^[a-z_][a-z0-9_]*$/;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

/** A Postgres text[] literal of arbitrary strings, for `= any(array[...])`. */
export function textArraySql(values) {
  return `array[${values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ')}]::text[]`;
}

/** The same rows always hash the same, whatever order the database returns them in. */
export function hashRows(rows) {
  const lines = (rows ?? []).map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort();
  return sha256(lines.join('\n'));
}

/** "voices" or "voices:<id>,<id>", the key a global dependency is recorded under. */
export function globalKey(g) {
  return g.ids?.length ? `${g.table}:${[...g.ids].sort().join(',')}` : g.table;
}

/**
 * R7: the read of each world's global dependencies (a world file's `globals`: `{ "table": "voices" }`
 * or with `"ids": [...]`). A table name or id that is not plain is skipped, never interpolated.
 * @param {{ worlds: { id: string, globals?: { table: string, ids?: string[] }[] }[] }} seedPlan
 * @param {string[]|null} [only] these worlds
 * @returns {{ world: string, key: string, sql: string }[]}
 */
export function globalReads(seedPlan, only = null) {
  const out = [];
  for (const w of seedPlan?.worlds ?? []) {
    if (only && !only.includes(w.id)) continue;
    for (const g of w.globals ?? []) {
      if (!TABLE.test(String(g.table ?? ''))) continue;
      const ids = g.ids ?? [];
      if (ids.some((id) => !SAFE_ID.test(String(id)))) continue;
      const where = ids.length ? ` where id::text = any('{${ids.join(',')}}')` : '';
      out.push({ world: w.id, key: globalKey(g), sql: `select * from public."${g.table}"${where}` });
    }
  }
  return out;
}

/**
 * Hash each world's global dependencies as the database holds them now.
 * @returns {Promise<Record<string, Record<string, string>>>} world -> key -> hash
 */
export async function readGlobalHashes(db, seedPlan, only = null) {
  const reads = globalReads(seedPlan, only);
  const answers = await queryAll(db, reads.map((r) => r.sql));
  const out = {};
  reads.forEach((r, i) => { (out[r.world] ??= {})[r.key] = hashRows(answers[i]); });
  return out;
}

/** .delivery/<feature>/globals.json: the hashes recorded when the worlds were seeded. */
export function globalsPath(paths) { return join(paths.runDir, 'globals.json'); }

/** Record the hashes at seed time (seed --apply). */
export async function recordGlobals(paths, hashes, at) {
  const worlds = Object.fromEntries(Object.entries(hashes).map(([w, h]) => [w, { at, tables: h }]));
  await writeJsonAtomic(globalsPath(paths), { schemaVersion: 1, worlds });
}

/**
 * The global dependencies whose rows changed since they were recorded.
 * @param {{ worlds?: Record<string, { at: string, tables: Record<string, string> }> }|null} recorded
 * @param {Record<string, Record<string, string>>} now
 * @returns {{ world: string, key: string, since: string }[]}
 */
export function changedGlobals(recorded, now) {
  const out = [];
  for (const [world, r] of Object.entries(recorded?.worlds ?? {})) {
    for (const [key, hash] of Object.entries(r.tables ?? {})) {
      const current = now?.[world]?.[key];
      if (current !== undefined && current !== hash) out.push({ world, key, since: r.at });
    }
  }
  return out;
}

/** Read globals.json, or null. */
export async function readRecordedGlobals(paths) {
  return readJson(globalsPath(paths), { optional: true });
}

// ---- Fix 9: the columns of the tables the worlds write ----

/** The tables a seed plan's rows write, sorted. */
export function plannedTables(seedPlan) {
  return [...new Set((seedPlan?.rows ?? []).map((r) => r.table).filter((t) => TABLE.test(t)))].sort();
}

/** The read of those tables' columns. */
export function schemaSql(tables) {
  return `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = any(${textArraySql(tables)}) order by table_name, column_name`;
}

/**
 * Each planned table's columns and their hash, from information_schema rows. Rows for other tables
 * (or without a column name) are ignored.
 * @returns {Record<string, { hash: string, columns: string[] }>}
 */
export function tableShapes(rows, tables) {
  const by = new Map(tables.map((t) => [t, []]));
  for (const r of rows ?? []) if (by.has(r.table_name) && r.column_name) by.get(r.table_name).push(r);
  const out = {};
  for (const [t, cols] of by) {
    if (!cols.length) continue;
    out[t] = { hash: hashRows(cols), columns: cols.map((c) => c.column_name).sort() };
  }
  return out;
}

/** Read the planned tables' shapes from the database. */
export async function readTableShapes(db, seedPlan) {
  const tables = plannedTables(seedPlan);
  if (!tables.length) return {};
  const [rows] = await queryAll(db, [schemaSql(tables)]);
  return tableShapes(rows, tables);
}

/**
 * Fix 9: the planned tables whose columns changed since seed --plan recorded them, each with the
 * columns added and removed and the worlds that write it.
 * @param {{ schema?: Record<string, { hash: string, columns: string[] }>, rows: object[] }} seedPlan
 * @param {Record<string, { hash: string, columns: string[] }>} now
 */
export function schemaChanges(seedPlan, now) {
  const out = [];
  for (const [table, was] of Object.entries(seedPlan?.schema ?? {})) {
    const is = now?.[table];
    if (!is || is.hash === was.hash) continue;
    const worlds = [...new Set(seedPlan.rows.filter((r) => r.table === table).map((r) => r.world))];
    out.push({
      table, worlds,
      added: is.columns.filter((c) => !was.columns.includes(c)),
      removed: was.columns.filter((c) => !is.columns.includes(c)),
    });
  }
  return out;
}

/** One sentence per schema change. */
export function schemaChangeMessage(c) {
  const what = [c.added.length ? `columns added: ${c.added.join(', ')}` : null, c.removed.length ? `removed: ${c.removed.join(', ')}` : null].filter(Boolean).join('; ') || 'a column changed type, default or nullability';
  return `table ${c.table} changed since seed --plan (${what}); worlds ${c.worlds.join(', ')} write it: run delivery seed --plan and --check again (a seed-writer adds any value the design shows)`;
}

// ---- Fixture organisations belong to one run ----

/**
 * The organisation row of each world and the text column its fixture name sits in.
 * @returns {{ world: string, table: string, id: string, column: string, name: string }[]}
 */
export function orgNames(seedPlan, prefix) {
  const out = [];
  for (const w of seedPlan?.worlds ?? []) {
    const row = (seedPlan.rows ?? []).find((r) => r.id === w.orgId);
    if (!row || !TABLE.test(row.table)) continue;
    const hit = Object.entries(row.values ?? {}).find(([c, v]) => TABLE.test(c) && typeof v === 'string' && prefix && v.startsWith(prefix));
    if (hit) out.push({ world: w.id, table: row.table, id: w.orgId, column: hit[0], name: hit[1] });
  }
  return out;
}

/**
 * Other fixture organisations with one of this run's names: a lane or a test that picks an
 * organisation by name could write to theirs, or they to this run's.
 * @returns {Promise<{ world: string, name: string, other: string }[]>}
 */
export async function sameNameOrgs(db, seedPlan, prefix) {
  const mine = orgNames(seedPlan, prefix);
  const out = [];
  const groups = new Map();
  for (const o of mine) {
    const k = `${o.table}\0${o.column}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const reads = [...groups.values()].map((list) => ({
    list, sql: `select id, "${list[0].column}" as name from public."${list[0].table}" where "${list[0].column}"::text = any(${textArraySql(list.map((o) => o.name))})`,
  }));
  const answers = await queryAll(db, reads.map((r) => r.sql));
  reads.forEach((r, i) => {
    for (const row of answers[i] ?? []) {
      const o = r.list.find((x) => x.name === row.name);
      if (o && String(row.id) !== o.id) out.push({ world: o.world, name: o.name, other: String(row.id) });
    }
  });
  return out;
}
