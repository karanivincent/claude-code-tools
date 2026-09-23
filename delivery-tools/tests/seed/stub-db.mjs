// An in-memory stand-in for the test database, answering exactly the read shapes lib/seed and
// lib/sidefx send and recording every write. Installed as ctx.dataBackend, which the adapter only
// honours while external commands are stubbed too.

export function createStubDb(opts = {}) {
  const tables = new Map(Object.entries(opts.tables ?? {}).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  const users = new Map((opts.users ?? []).map((u) => [u.id, { ...u }]));
  const answers = opts.answers ?? []; // [{ match: RegExp, rows: object[] | (sql) => object[] }]
  const calls = [];
  const rowsOf = (t) => tables.get(t) ?? [];
  const ids = (text) => (/'\{([^}]*)\}'/.exec(text)?.[1] ?? '').split(',').filter(Boolean);
  const backend = {
    calls,
    tables,
    users,
    async query(sql) {
      calls.push({ op: 'query', sql });
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
      let m = /from auth\.users where id::text = any\((.*)\)/.exec(sql);
      if (m) return [...users.values()].filter((u) => ids(m[1]).includes(u.id)).map((u) => ({ id: u.id, email: u.email, phone: u.phone ?? null }));
      m = /from public\."([a-z_]+)" where "?([a-z_]+)"?::text = any\((.*)\)/.exec(sql);
      if (m) return rowsOf(m[1]).filter((r) => ids(m[3]).includes(String(r[m[2]])));
      throw new Error(`stub database has no answer for: ${sql}`);
    },
    async upsert(table, rows) {
      calls.push({ op: 'upsert', table, ids: rows.map((r) => r.id) });
      const list = tables.get(table) ?? [];
      for (const r of rows) {
        const i = list.findIndex((x) => x.id === r.id);
        if (i >= 0) list[i] = { ...list[i], ...r }; else list.push({ ...r });
      }
      tables.set(table, list);
    },
    async deleteByIds(table, idList) {
      calls.push({ op: 'delete', table, ids: [...idList] });
      const list = tables.get(table) ?? [];
      const keep = list.filter((r) => !idList.includes(r.id));
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
    writes() { return calls.filter((c) => c.op !== 'query'); },
  };
  return backend;
}
