// An in-memory stand-in for the test database, answering exactly the read shapes lib/seed and
// lib/sidefx send and recording every write. Installed as ctx.dataBackend, which the adapter only
// honours while external commands are stubbed too. With `batch: true` it also answers several
// reads in one call, as the real backend does, and records that call as one round trip. With
// `foreignKeys: [{ table, column, references }]` it refuses a write that leaves a column naming a
// row the referenced table does not hold, checked once the whole write is done, as Postgres checks
// a plain (not deferrable) foreign key at the end of each statement.

export function createStubDb(opts = {}) {
  const tables = new Map(Object.entries(opts.tables ?? {}).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  const users = new Map((opts.users ?? []).map((u) => [u.id, { ...u }]));
  const answers = opts.answers ?? []; // [{ match: RegExp, rows: object[] | (sql) => object[] }]
  const calls = [];
  const foreignKeys = opts.foreignKeys ?? [];
  const rowsOf = (t) => tables.get(t) ?? [];
  // Run a write; if it breaks a foreign key, put every table back and refuse it.
  const write = (fn) => {
    const before = new Map([...tables].map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
    const out = fn();
    for (const fk of foreignKeys) {
      const held = new Set(rowsOf(fk.references).map((r) => r.id));
      const bad = rowsOf(fk.table).find((r) => r[fk.column] !== null && r[fk.column] !== undefined && !held.has(r[fk.column]));
      if (bad) {
        tables.clear();
        for (const [t, rows] of before) tables.set(t, rows);
        throw new Error(`insert or update on table "${fk.table}" violates foreign key constraint on ${fk.column}: ${bad[fk.column]} is not in ${fk.references}`);
      }
    }
    return out;
  };
  const ids = (text) => (/'\{([^}]*)\}'/.exec(text)?.[1] ?? '').split(',').filter(Boolean);
  const answer = async (sql) => {
    for (const a of answers) if (a.match.test(sql)) return typeof a.rows === 'function' ? a.rows(sql) : a.rows;
    if (/^select 1 as ok$/.test(sql)) return [{ ok: 1 }];
    if (/from pg_extension/.test(sql)) return [{ n: opts.cron ? 1 : 0 }];
    if (/from cron\.job/.test(sql)) return opts.cron ?? [];
    if (/information_schema\.columns/.test(sql) && /column_name in/.test(sql)) {
      const wanted = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((c) => c !== 'public');
      const out = [];
      for (const [t, rows] of tables) {
        const cols = new Set(rows.flatMap((r) => Object.keys(r)));
        for (const c of wanted) if (cols.has(c)) out.push({ table_name: t, column_name: c });
      }
      return out;
    }
    if (/information_schema\.columns/.test(sql)) {
      return [...tables.keys()].filter((t) => t === 'users' || t === 'profiles').map((t) => ({ table_name: t }));
    }
    // A2: CHECK constraints and enum labels. No table has either unless a test passes them via
    // opts.checks/opts.enums or a matching `answers` entry, so seed --plan finds nothing to refuse.
    if (/from pg_constraint/.test(sql)) return opts.checks ?? [];
    if (/from pg_enum/.test(sql)) return opts.enums ?? [];
    let m = /from auth\.users where id::text = any\((.*)\)/.exec(sql);
    if (m) return [...users.values()].filter((u) => ids(m[1]).includes(u.id)).map((u) => ({ id: u.id, email: u.email, phone: u.phone ?? null }));
    m = /from public\."([a-z_]+)" where "?([a-z_]+)"?::text = any\((.*)\)/.exec(sql);
    if (m) return rowsOf(m[1]).filter((r) => ids(m[3]).includes(String(r[m[2]]))).map((r) => ({ ...r }));
    throw new Error(`stub database has no answer for: ${sql}`);
  };
  const backend = {
    calls,
    tables,
    users,
    async query(sql) {
      calls.push({ op: 'query', sql });
      return answer(sql);
    },
    async upsert(table, rows) {
      calls.push({ op: 'upsert', table, ids: rows.map((r) => r.id) });
      write(() => {
        const list = tables.get(table) ?? [];
        for (const r of rows) {
          const i = list.findIndex((x) => x.id === r.id);
          if (i >= 0) list[i] = { ...list[i], ...r }; else list.push({ ...r });
        }
        tables.set(table, list);
      });
    },
    async updateById(table, id, values) {
      calls.push({ op: 'update', table, id, columns: Object.keys(values) });
      write(() => {
        const list = tables.get(table) ?? [];
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list[i] = { ...list[i], ...values };
      });
    },
    async updateByColumn(table, column, value, values) {
      calls.push({ op: 'update', table, where: { [column]: value }, columns: Object.keys(values) });
      write(() => {
        const list = tables.get(table) ?? [];
        for (let i = 0; i < list.length; i++) if (String(list[i][column]) === value) list[i] = { ...list[i], ...values };
      });
    },
    async deleteByIds(table, idList) {
      calls.push({ op: 'delete', table, ids: [...idList] });
      return write(() => {
        const list = tables.get(table) ?? [];
        const keep = list.filter((r) => !idList.includes(r.id));
        tables.set(table, keep);
        return list.length - keep.length;
      });
    },
    async deleteOrgRows(table, idList, { column, orgId }) {
      calls.push({ op: 'delete', table, ids: [...idList], where: { [column]: orgId } });
      const list = tables.get(table) ?? [];
      const keep = list.filter((r) => !(idList.includes(r.id) && String(r[column]) === orgId));
      tables.set(table, keep);
      return list.length - keep.length;
    },
    async createUser({ id, email }) {
      calls.push({ op: 'createUser', id, email });
      if (users.has(id)) return 'exists';
      users.set(id, { id, email });
      return 'created';
    },
    async deleteUser(id) {
      calls.push({ op: 'deleteUser', id });
      return users.delete(id);
    },
    async probeAccess() { return { read: true, write: true, detail: 'stub' }; },
    async probeMigrationApply() { return { ok: true, detail: 'stub' }; },
    writes() { return calls.filter((c) => c.op !== 'query' && c.op !== 'batch'); },
    /** The read requests a real backend would have sent: single queries plus batches. */
    readRoundTrips() { return calls.filter((c) => c.op === 'query' || c.op === 'batch').length; },
  };
  if (opts.batch) {
    backend.queryMany = async (sqls) => {
      calls.push({ op: 'batch', sqls: [...sqls] });
      const out = [];
      for (const sql of sqls) out.push(await answer(sql).then((rows) => ({ rows }), (error) => ({ error })));
      return out;
    };
  }
  return backend;
}

/**
 * A guard for the tables the seed tests' worlds write that side-effect rules watch (widgets,
 * outbound_batches). Since D5, seed --check refuses a watched table no guard covers at all, so a
 * test that means its world to pass adds this next to the guards it is about. Its row rule selects
 * no row of any test world, so it always holds and accepts nothing.
 */
export const FIXTURE_TABLES_GUARD = Object.freeze({
  id: 'fixture-tables',
  covers: ['widgets:*', 'outbound_batches:*'],
  why: 'the test worlds seed these tables and mean them to be seeded',
  probes: [],
  rowRules: [{ table: 'widgets', column: 'contact_phone', pattern: '^999\\d{9}$', where: { state: 'never-seeded' } }],
});

/** The safety file's guards with FIXTURE_TABLES_GUARD added (or those given, plus it). */
export function guardsWithFixtureTables(safety, guards) {
  return [...(guards ?? safety.guards ?? []), FIXTURE_TABLES_GUARD];
}
