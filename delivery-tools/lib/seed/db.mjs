// The database-backed inputs of seed safety, all read-only: the derived never-dial set (7.2), the
// fake-range probe (7.2), guard probes (7.3), and the rows fixture worlds hold right now (7.4).

import { sqlTokenize } from '../sidefx/sql.mjs';
import { ORG_COLUMNS } from './check.mjs';

const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const TABLE = /^[a-z_][a-z0-9_]*$/;

/** A Postgres array literal of ids for `= any(...)`; refuses anything but plain ids. */
export function idArrayLiteral(ids) {
  for (const id of ids) if (!SAFE_ID.test(String(id))) throw new Error(`"${id}" is not a plain id`);
  return `'{${ids.join(',')}}'`;
}

/**
 * Every number the safety file's never-dial queries return, across all organisations (7.2).
 * A number in the reserved fake range is left out: the fake-range probe proves it reaches nobody,
 * and a never-dial query over a table the seed writes (contacts, say) would otherwise read the
 * fixtures' own fake numbers back after the write and refuse every one of them.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {object} safety
 * @returns {Promise<{ numbers: string[], failures: { code: string, message: string }[] }>}
 */
export async function derivedNeverDial(db, safety) {
  const numbers = new Set();
  const failures = [];
  let fake = null;
  try { fake = safety.fakeNumbers?.pattern ? new RegExp(safety.fakeNumbers.pattern) : null; } catch { fake = null; }
  for (const sql of safety.neverDialQueries ?? []) {
    try {
      const rows = await db.query(sql);
      for (const row of rows) {
        for (const v of Object.values(row ?? {})) {
          if (v === null || v === undefined) continue;
          const digits = String(v).replace(/\D/g, '');
          if (fake && (fake.test(String(v)) || fake.test(digits))) continue;
          if (digits.length >= 7) numbers.add(String(v));
        }
      }
    } catch (err) {
      failures.push({ code: 'never-dial-query', message: `never-dial query "${sql}" did not run (${err.message}); the never-dial set cannot be derived` });
    }
  }
  return { numbers: [...numbers], failures };
}

/** The fake range must resolve to no country the product may dial (probeSql returns null). */
export async function fakeRangeProbe(db, safety) {
  const sql = safety.fakeNumbers.probeSql;
  if (!sql) return { ok: false, detail: 'safety.fakeNumbers.probeSql is empty, so the fake range is unproven' };
  try {
    const rows = await db.query(sql);
    const first = rows?.[0] ? Object.values(rows[0])[0] : undefined;
    return first === null || first === undefined
      ? { ok: true, detail: `${safety.fakeNumbers.sample} resolves to no country` }
      : { ok: false, detail: `the fake sample ${safety.fakeNumbers.sample} resolves to ${JSON.stringify(first)}, a country the product may dial` };
  } catch (err) {
    return { ok: false, detail: `the fake-range probe did not run (${err.message})` };
  }
}

/** Tables a probe reads: identifiers after from and join. */
export function tablesRead(sql) {
  const tokens = sqlTokenize(sql);
  const out = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    const tk = tokens[i];
    if (tk.t === 'id' && !tk.quoted && (tk.low === 'from' || tk.low === 'join')) {
      let n = tokens[i + 1];
      if (n?.t === 'id' && tokens[i + 2]?.t === 'p' && tokens[i + 2].v === '.' && tokens[i + 3]?.t === 'id') n = tokens[i + 3];
      if (n?.t === 'id') out.add(n.low);
    }
  }
  return out;
}

/**
 * Run every guard's probes. A guard holds only when every probe returns what it expects; a guard
 * whose probe reads a table the plan itself writes is not trusted for that plan (the seed could
 * be what breaks it). A guard's row rules are a property of the fixture rows themselves, so they
 * are checked against `rows`: the seed plan's rows before a write, the live rows after it.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {object} safety
 * @param {{ fixtureOrgs: string[], plannedTables?: Set<string>, rows?: { table: string, id?: string, values: object }[] }} ctxInfo
 * @returns {Promise<{ id: string, covers: string[], holds: boolean, why: string }[]>}
 */
export async function runGuards(db, safety, { fixtureOrgs, plannedTables = new Set(), rows = [] }) {
  const out = [];
  for (const g of safety.guards ?? []) {
    let holds = true;
    let why = 'every probe and row rule holds';
    if (!(g.probes ?? []).length && !(g.rowRules ?? []).length) { out.push({ id: g.id, covers: g.covers, holds: false, why: 'it has neither a probe nor a row rule' }); continue; }
    const broken = rowRuleFailure(g.rowRules ?? [], rows);
    if (broken) { out.push({ id: g.id, covers: g.covers, holds: false, why: broken }); continue; }
    for (const probe of g.probes ?? []) {
      const read = [...tablesRead(probe.sql)].filter((t) => plannedTables.has(t));
      if (read.length) { holds = false; why = `its probe reads ${read.join(', ')}, which this seed plan writes`; break; }
      let sql;
      try { sql = probe.sql.replaceAll('$fixtureOrgs', idArrayLiteral(fixtureOrgs)); } catch (err) { holds = false; why = err.message; break; }
      try {
        const rows = await db.query(sql);
        const actual = rows?.[0] ? Object.values(rows[0])[0] : undefined;
        if (!sameExpect(actual, probe.expect)) { holds = false; why = `probe "${short(probe.sql)}" returned ${JSON.stringify(actual ?? null)}, expected ${JSON.stringify(probe.expect)}`; break; }
      } catch (err) {
        holds = false;
        why = `probe "${short(probe.sql)}" did not run (${err.message})`;
        break;
      }
    }
    out.push({ id: g.id, covers: g.covers, holds, why });
  }
  return out;
}

/**
 * The first row rule a row breaks, in words, or null. A row a rule selects (its table, and every
 * `where` value equal) must carry a string in `column` that the pattern matches; a missing or
 * non-string value breaks it, since "no address" is not "a fake address".
 * @param {{ table: string, column: string, pattern: string, where?: object }[]} rules
 * @param {{ table: string, id?: string, values: object }[]} rows
 * @returns {string|null}
 */
export function rowRuleFailure(rules, rows) {
  for (const rule of rules) {
    let re;
    try { re = new RegExp(rule.pattern); } catch (err) { return `row rule ${rule.table}.${rule.column} has an invalid pattern (${err.message})`; }
    const selected = rows.filter((r) => r.table === rule.table
      && Object.entries(rule.where ?? {}).every(([k, v]) => r.values?.[k] === v));
    const bad = selected.filter((r) => typeof r.values?.[rule.column] !== 'string' || !re.test(r.values[rule.column]));
    if (bad.length) {
      const first = bad[0];
      return `${bad.length} ${rule.table} row(s) break the row rule ${rule.column} ~ ${rule.pattern}, first ${first.id ?? '(no id)'} with ${JSON.stringify(first.values?.[rule.column] ?? null)}`;
    }
  }
  return null;
}

function sameExpect(actual, expect) {
  if (expect === null) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  if (typeof expect === 'number') return Number(actual) === expect;
  return String(actual) === String(expect);
}

function short(sql) { return String(sql).replace(/\s+/g, ' ').slice(0, 60); }

/**
 * Several reads in one round trip where the adapter can batch them, each answered on its own.
 * Throws the first query's error, in query order: a read the caller needs whole has no partial
 * answer.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {string[]} sqls
 * @returns {Promise<object[][]>}
 */
export async function queryAll(db, sqls) {
  const results = await settledReads(db, sqls);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return results.map((r) => r.rows);
}

async function settledReads(db, sqls) {
  if (!sqls.length) return [];
  if (typeof db.queryMany === 'function') return db.queryMany(sqls);
  const out = [];
  for (const sql of sqls) out.push(await db.query(sql).then((rows) => ({ rows }), (error) => ({ error })));
  return out;
}

/**
 * A reader that answers the given queries from one batched round trip, failures included, and
 * sends any other query on. derivedNeverDial, fakeRangeProbe and runGuards read through it
 * unchanged, so a batch cannot change what they conclude, only how many requests it took.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {string[]} sqls
 * @returns {Promise<{ query: (sql: string) => Promise<object[]> }>}
 */
export async function prefetch(db, sqls) {
  const unique = [...new Set(sqls)];
  const results = await settledReads(db, unique);
  const byText = new Map(unique.map((sql, i) => [sql, results[i]]));
  return {
    async query(sql) {
      const hit = byText.get(sql);
      if (!hit) return db.query(sql);
      if (hit.error) throw hit.error;
      return hit.rows;
    },
  };
}

/**
 * Every query derivedNeverDial, fakeRangeProbe and runGuards will send for these arguments, so
 * they can be fetched in one batch first.
 * @param {object} safety
 * @param {{ fixtureOrgs: string[], plannedTables?: Set<string> }} opts
 * @returns {string[]}
 */
export function safetyQueries(safety, { fixtureOrgs, plannedTables = new Set() }) {
  const out = [...(safety.neverDialQueries ?? [])];
  if (safety.fakeNumbers?.probeSql) out.push(safety.fakeNumbers.probeSql);
  for (const g of safety.guards ?? []) {
    for (const probe of g.probes ?? []) {
      if ([...tablesRead(probe.sql)].some((t) => plannedTables.has(t))) continue;
      try { out.push(probe.sql.replaceAll('$fixtureOrgs', idArrayLiteral(fixtureOrgs))); } catch { /* runGuards reports it */ }
    }
  }
  return out;
}

const SCHEMA_SQL = Object.freeze({
  columns: `select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in (${[...ORG_COLUMNS, 'user_id'].map((c) => `'${c}'`).join(', ')}) order by table_name, column_name`,
  profiles: "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'id' and table_name in ('users', 'profiles')",
});

/** The reads worldSchema sends, so a caller can put them in a batch with its own. */
export const WORLD_SCHEMA_SQL = Object.freeze([SCHEMA_SQL.columns, SCHEMA_SQL.profiles]);

/**
 * Which public tables carry an organisation or user column, and which of users and profiles exist:
 * what liveWorldRows reads by. A seed write never changes it, so a refresh reads it once, before
 * its write, and hands it to the scan after.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @returns {Promise<{ columns: { table_name: string, column_name: string }[], profiles: string[] }>}
 */
export async function worldSchema(db) {
  const [columns, profiles] = await queryAll(db, [SCHEMA_SQL.columns, SCHEMA_SQL.profiles]);
  return { columns, profiles: profiles.map((p) => p.table_name) };
}

/**
 * The reads plannedRowsNow sends: rows by id, and a join table's rows (no id) by the organisation
 * column the plan gives them.
 * @param {{ table: string, id: string, idless?: boolean, values: object }[]} rows
 * @returns {{ sql: string, table: string, idless: boolean }[]}
 */
export function plannedRowReads(rows) {
  const byId = new Map();
  const byOrg = new Map();
  for (const r of rows) {
    if (!TABLE.test(r.table)) continue;
    if (!r.idless) {
      if (!byId.has(r.table)) byId.set(r.table, new Set());
      byId.get(r.table).add(String(r.id));
      continue;
    }
    const col = ORG_COLUMNS.find((c) => typeof r.values?.[c] === 'string');
    if (!col) continue;
    const k = `${r.table}\0${col}`;
    if (!byOrg.has(k)) byOrg.set(k, { table: r.table, col, ids: new Set() });
    byOrg.get(k).ids.add(r.values[col]);
  }
  const reads = [];
  for (const [t, ids] of byId) reads.push({ table: t, idless: false, sql: `select * from public."${t}" where id::text = any(${idArrayLiteral([...ids])})` });
  for (const { table, col, ids } of byOrg.values()) reads.push({ table, idless: true, sql: `select * from public."${table}" where "${col}"::text = any(${idArrayLiteral([...ids])})` });
  return reads;
}

/**
 * What the database holds now for each planned row, in one batched read that needs no schema. A
 * planned row the reads cannot find (a join row with no organisation column) is simply not found,
 * which only means it is written.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {{ table: string, id: string, idless?: boolean, values: object }[]} rows
 * @returns {Promise<{ table: string, id: string, values: object }[]>}
 */
export async function plannedRowsNow(db, rows) {
  const reads = plannedRowReads(rows);
  const answers = await queryAll(db, reads.map((r) => r.sql));
  const out = [];
  reads.forEach((read, i) => {
    for (const row of answers[i]) out.push({ table: read.table, id: read.idless ? '(join row)' : String(row.id), values: row });
  });
  return out;
}

/**
 * The reads liveWorldRows sends for this plan and schema, each with how to name the world a row
 * it returns belongs to.
 * @param {object} seedPlan
 * @param {{ columns: { table_name: string, column_name: string }[], profiles: string[] }} schema
 * @returns {{ sql: string, table: string, world: (row: object) => string|undefined }[]}
 */
export function liveWorldReads(seedPlan, schema) {
  const worldByOrg = new Map(seedPlan.worlds.map((w) => [w.orgId, w.id]));
  const worldByUser = new Map(seedPlan.users.map((u) => [u.id, u.world]));
  const orgIds = [...worldByOrg.keys()];
  const userIds = [...worldByUser.keys()];
  const reads = [];
  if (!orgIds.length) return reads;
  for (const { table_name: t, column_name: c } of schema.columns) {
    if (!TABLE.test(t) || !TABLE.test(c)) continue;
    const ids = c === 'user_id' ? userIds : orgIds;
    if (!ids.length) continue;
    reads.push({
      sql: `select * from public."${t}" where "${c}"::text = any(${idArrayLiteral(ids)})`,
      table: t,
      world: (r) => (c === 'user_id' ? worldByUser.get(String(r[c])) : worldByOrg.get(String(r[c]))),
    });
  }
  const byTable = new Map();
  for (const r of seedPlan.rows) {
    const hasOrgCol = ORG_COLUMNS.some((c) => Object.prototype.hasOwnProperty.call(r.values, c));
    if (hasOrgCol) continue;
    if (!byTable.has(r.table)) byTable.set(r.table, []);
    byTable.get(r.table).push(r);
  }
  for (const [t, rows] of byTable) {
    if (!TABLE.test(t)) continue;
    const worldOf = new Map(rows.map((r) => [r.id, r.world]));
    reads.push({ sql: `select * from public."${t}" where id::text = any(${idArrayLiteral(rows.map((r) => r.id))})`, table: t, world: (r) => worldOf.get(String(r.id)) });
  }
  if (userIds.length) {
    reads.push({ sql: `select id, email, phone from auth.users where id::text = any(${idArrayLiteral(userIds)})`, table: 'auth.users', world: (u) => worldByUser.get(String(u.id)) });
    for (const t of schema.profiles) {
      if (!TABLE.test(t)) continue;
      reads.push({ sql: `select * from public."${t}" where id::text = any(${idArrayLiteral(userIds)})`, table: t, world: (r) => worldByUser.get(String(r.id)) });
    }
  }
  return reads;
}

/**
 * Every row the fixture worlds hold right now, from the live database: rows of every public table
 * with an organisation column naming a fixture organisation, the organisation rows, the plan's
 * global rows by id, the fixture users (auth.users) and rows keyed to them. All of it is one
 * batched read after the schema, which used to be one request per table.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {object} seedPlan
 * @param {{ schema?: { columns: object[], profiles: string[] } }} [opts] a schema already read
 * @returns {Promise<{ world: string, table: string, id: string, values: object }[]>}
 */
export async function liveWorldRows(db, seedPlan, opts = {}) {
  const out = [];
  if (!seedPlan.worlds.length) return out;
  const seen = new Set();
  const push = (table, row, world) => {
    const id = String(row.id ?? row.user_id ?? '(no id)');
    const k = `${table}\0${id}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ world: world ?? '(unknown)', table, id, values: row });
  };
  const schema = opts.schema ?? await worldSchema(db);
  const reads = liveWorldReads(seedPlan, schema);
  const answers = await queryAll(db, reads.map((r) => r.sql));
  reads.forEach((read, i) => { for (const row of answers[i]) push(read.table, row, read.world(row)); });
  return out;
}
