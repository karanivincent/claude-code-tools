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
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {object} safety
 * @returns {Promise<{ numbers: string[], failures: { code: string, message: string }[] }>}
 */
export async function derivedNeverDial(db, safety) {
  const numbers = new Set();
  const failures = [];
  for (const sql of safety.neverDialQueries ?? []) {
    try {
      const rows = await db.query(sql);
      for (const row of rows) {
        for (const v of Object.values(row ?? {})) {
          if (v === null || v === undefined) continue;
          const digits = String(v).replace(/\D/g, '');
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
 * be what breaks it).
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {object} safety
 * @param {{ fixtureOrgs: string[], plannedTables?: Set<string> }} ctxInfo
 * @returns {Promise<{ id: string, covers: string[], holds: boolean, why: string }[]>}
 */
export async function runGuards(db, safety, { fixtureOrgs, plannedTables = new Set() }) {
  const out = [];
  for (const g of safety.guards ?? []) {
    let holds = true;
    let why = 'every probe holds';
    for (const probe of g.probes) {
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

function sameExpect(actual, expect) {
  if (expect === null) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  if (typeof expect === 'number') return Number(actual) === expect;
  return String(actual) === String(expect);
}

function short(sql) { return String(sql).replace(/\s+/g, ' ').slice(0, 60); }

/**
 * Every row the fixture worlds hold right now, from the live database: rows of every public table
 * with an organisation column naming a fixture organisation, the organisation rows, the plan's
 * global rows by id, the fixture users (auth.users) and rows keyed to them.
 * @param {import('../../adapters/data/supabase.mjs').DataAdapter} db
 * @param {object} seedPlan
 * @returns {Promise<{ world: string, table: string, id: string, values: object }[]>}
 */
export async function liveWorldRows(db, seedPlan) {
  const worldByOrg = new Map(seedPlan.worlds.map((w) => [w.orgId, w.id]));
  const worldByUser = new Map(seedPlan.users.map((u) => [u.id, u.world]));
  const orgIds = [...worldByOrg.keys()];
  const userIds = [...worldByUser.keys()];
  const out = [];
  const seen = new Set();
  const push = (table, row, world) => {
    const id = String(row.id ?? row.user_id ?? '(no id)');
    const k = `${table}\0${id}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ world: world ?? '(unknown)', table, id, values: row });
  };
  if (!orgIds.length) return out;
  const cols = await db.query(
    `select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in (${[...ORG_COLUMNS, 'user_id'].map((c) => `'${c}'`).join(', ')}) order by table_name, column_name`,
  );
  for (const { table_name: t, column_name: c } of cols) {
    if (!TABLE.test(t) || !TABLE.test(c)) continue;
    const ids = c === 'user_id' ? userIds : orgIds;
    if (!ids.length) continue;
    const rows = await db.query(`select * from public."${t}" where "${c}"::text = any(${idArrayLiteral(ids)})`);
    for (const r of rows) push(t, r, c === 'user_id' ? worldByUser.get(String(r[c])) : worldByOrg.get(String(r[c])));
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
    const found = await db.query(`select * from public."${t}" where id::text = any(${idArrayLiteral(rows.map((r) => r.id))})`);
    const worldOf = new Map(rows.map((r) => [r.id, r.world]));
    for (const r of found) push(t, r, worldOf.get(String(r.id)));
  }
  if (userIds.length) {
    const users = await db.query(`select id, email, phone from auth.users where id::text = any(${idArrayLiteral(userIds)})`);
    for (const u of users) push('auth.users', u, worldByUser.get(String(u.id)));
    const profiles = await db.query(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'id' and table_name in ('users', 'profiles')",
    );
    for (const { table_name: t } of profiles) {
      const rows = await db.query(`select * from public."${t}" where id::text = any(${idArrayLiteral(userIds)})`);
      for (const r of rows) push(t, r, worldByUser.get(String(r.id)));
    }
  }
  return out;
}
