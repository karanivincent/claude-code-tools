// Data adapter for Supabase-backed repos: seeding, probes, teardown. Owner: slice B2
// (docs/ARCHITECTURE.md). Every call goes through ctx.runner or fetch with credentials from the
// environment; nothing here is ever called by a unit test without a stub.
//
// Two routes, two credentials:
//   reads   SQL through the Management API with `read_only: true` (SUPABASE_ACCESS_TOKEN), so a
//           probe, a scan or a never-dial query cannot write even if its text tried to;
//   writes  PostgREST and the Auth admin API with the service role (SUPABASE_URL or
//           NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY), row by row, no SQL text.
// The adapter refuses a production project and any project but the profile's test project before
// it is even built, and its write methods exist only when the caller names a seed write mode:
// seed-apply, seed-refresh or seed-teardown. Only lib/seed/ asks for one.

import { pathToFileURL } from 'node:url';
import { ConfigError, DeliveryError, EXIT } from '../../lib/core/exit.mjs';

export const WRITE_MODES = Object.freeze({
  'seed-apply': ['upsert', 'createUser'],
  // A refresh may also remove rows a click added to its world, but only through deleteOrgRows,
  // whose every request carries the world's organisation as a filter the database applies.
  'seed-refresh': ['upsert', 'deleteOrgRows'],
  'seed-teardown': ['deleteByIds', 'deleteUser'],
});

const TABLE = /^[a-z_][a-z0-9_]*$/;
const ID = /^[A-Za-z0-9._:-]+$/;
const REF = /^[a-z0-9][a-z0-9-]{2,63}$/;
/** The organisation columns deleteOrgRows may filter by (lib/seed/check.mjs ORG_COLUMNS). */
const ORG_FILTER_COLUMNS = Object.freeze(['organization_id', 'organisation_id', 'org_id', 'tenant_id']);

/**
 * @typedef {object} DataAdapter
 * @property {string} projectRef   the project this adapter talks to
 * @property {string|null} write   the seed write mode it was built for, or null (read-only)
 * @property {(sql: string, params?: unknown[]) => Promise<object[]>} query  read-only SQL
 * @property {(sqls: string[]) => Promise<({ rows: object[] } | { error: Error })[]>} queryMany
 *   several read-only queries in one round trip where the backend can, each answered on its own
 * @property {(table: string, rows: object[]) => Promise<void>} upsert      by primary key `id`
 * @property {(table: string, ids: string[]) => Promise<number>} deleteByIds
 * @property {(table: string, ids: string[], org: { column: string, orgId: string }) => Promise<number>} deleteOrgRows
 *   delete by id, and only where the organisation column holds that organisation
 * @property {(user: { id: string, email: string, name?: string }) => Promise<'created'|'exists'>} createUser
 * @property {(id: string) => Promise<boolean>} deleteUser
 * @property {() => Promise<{ read: boolean, write: boolean, detail: string }>} probeAccess   preflight P3
 * @property {() => Promise<{ ok: boolean, detail: string }>} probeMigrationApply          preflight P4
 */

/**
 * Called by seed (B2) and preflight P3, P4, P13 (A2). Refuses (exit 2) a project listed in
 * safety.productionRefs and any project other than profile.environments.test.projectRef.
 * @param {import('../../lib/core/ctx.mjs').Ctx} ctx
 * @param {{ projectRef?: string, write?: 'seed-apply'|'seed-refresh'|'seed-teardown', fetch?: typeof fetch }} [opts]
 *   defaults to the profile's test project, read-only
 * @returns {Promise<DataAdapter>}
 */
export async function createDataAdapter(ctx, opts = {}) {
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  const testRef = profile.environments?.test?.projectRef ?? '';
  const projectRef = opts.projectRef ?? testRef;
  if (!projectRef) throw new ConfigError('the profile names no test project (environments.test.projectRef)', { code: 'project' });
  if ((safety.productionRefs ?? []).includes(projectRef)) {
    throw new ConfigError(`refusing project ${projectRef}: the safety file lists it as production`, { code: 'production' });
  }
  if (projectRef !== testRef) {
    throw new ConfigError(`refusing project ${projectRef}: only the profile's test project ${testRef} may be used`, { code: 'project' });
  }
  if (!REF.test(projectRef)) throw new ConfigError(`project ref "${projectRef}" is not a project ref`, { code: 'project' });
  const write = opts.write ?? null;
  if (write !== null && !WRITE_MODES[write]) throw new ConfigError(`unknown write mode "${write}"`, { code: 'write-mode' });

  const stub = await testBackend(ctx);
  const backend = stub
    ? await stub(ctx, { projectRef, write })
    : httpBackend(ctx.env ?? {}, projectRef, opts.fetch ?? globalThis.fetch, opts.sleep);
  return guard(backend, { projectRef, write, fixturePattern: safety.fixtureUserPattern ?? null });
}

/** A test backend, honoured only when every external command is stubbed too. */
async function testBackend(ctx) {
  const injected = ctx.dataBackend ?? null;
  const path = ctx.env?.DELIVERY_DATA_STUB;
  if (!injected && !path) return null;
  if (!ctx.runner?.stubbed) {
    throw new ConfigError('a test data backend is set (DELIVERY_DATA_STUB) but external commands are real; refusing to mix them', { code: 'data-stub' });
  }
  if (injected) return typeof injected === 'function' ? injected : () => injected;
  const mod = await import(pathToFileURL(path).href);
  ctx.out?.warn?.(`the database is stubbed by ${path}`);
  return mod.default;
}

function guard(backend, { projectRef, write, fixturePattern = null }) {
  const allowed = new Set(write ? WRITE_MODES[write] : []);
  const refuse = (name) => async () => {
    throw new DeliveryError(EXIT.USAGE, `${name} refused: this data adapter is read-only (only delivery seed --apply, --refresh and --teardown write)`, { code: 'read-only' });
  };
  return Object.freeze({
    projectRef,
    write,
    async query(sql, params) {
      assertReadOnlySql(sql);
      return backend.query(sql, params);
    },
    // Every read a scan makes used to be its own request, about a second each over the Management
    // API, and a scan is some fifty of them. Each text is checked here exactly as a single query
    // is; a backend that cannot batch is asked one query at a time, in order.
    async queryMany(sqls) {
      for (const sql of sqls) assertReadOnlySql(sql);
      if (!sqls.length) return [];
      if (backend.queryMany) return backend.queryMany(sqls);
      const out = [];
      for (const sql of sqls) out.push(await backend.query(sql).then((rows) => ({ rows }), (error) => ({ error })));
      return out;
    },
    // `idless` is for a join table, whose primary key is the pair of columns it joins and which
    // has no id column to derive one into. Everything else still needs its derived id: that is
    // what makes a re-seed an upsert rather than a second row, and a teardown a delete by id.
    upsert: allowed.has('upsert') ? async (table, rows, o = {}) => {
      assertTable(table);
      for (const r of rows) {
        if (!r || typeof r !== 'object') throw new DeliveryError(EXIT.USAGE, `upsert into ${table}: every row is an object`, { code: 'seed' });
        if (o.idless) {
          if ('id' in r) throw new DeliveryError(EXIT.USAGE, `upsert into ${table}: the table has no id column, so a row may not carry one`, { code: 'seed' });
          continue;
        }
        if (!ID.test(String(r.id ?? ''))) throw new DeliveryError(EXIT.USAGE, `upsert into ${table}: every row needs an id`, { code: 'seed' });
      }
      return backend.upsert(table, rows, o);
    } : refuse('upsert'),
    deleteByIds: allowed.has('deleteByIds') ? async (table, ids) => {
      assertTable(table);
      for (const id of ids) if (!ID.test(String(id))) throw new DeliveryError(EXIT.USAGE, `delete from ${table}: "${id}" is not an id`, { code: 'seed' });
      return ids.length ? backend.deleteByIds(table, ids) : 0;
    } : refuse('deleteByIds'),
    deleteOrgRows: allowed.has('deleteOrgRows') ? async (table, ids, org = {}) => {
      assertTable(table);
      if (!ORG_FILTER_COLUMNS.includes(org.column)) throw new DeliveryError(EXIT.USAGE, `delete from ${table}: "${org.column}" is not an organisation column`, { code: 'seed' });
      if (!ID.test(String(org.orgId ?? ''))) throw new DeliveryError(EXIT.USAGE, `delete from ${table}: "${org.orgId}" is not an organisation id`, { code: 'seed' });
      for (const id of ids) if (!ID.test(String(id))) throw new DeliveryError(EXIT.USAGE, `delete from ${table}: "${id}" is not an id`, { code: 'seed' });
      return ids.length ? backend.deleteOrgRows(table, ids, { column: org.column, orgId: String(org.orgId) }) : 0;
    } : refuse('deleteOrgRows'),
    createUser: allowed.has('createUser') ? async (user) => backend.createUser(user) : refuse('createUser'),
    deleteUser: allowed.has('deleteUser') ? async (id) => backend.deleteUser(id) : refuse('deleteUser'),
    signInHash: async (email) => {
      if (!fixturePattern || !new RegExp(fixturePattern).test(String(email))) {
        throw new DeliveryError(EXIT.USAGE, `sign-in link refused: ${email} is not a fixture user (safety fixtureUserPattern)`, { code: 'fixture-user' });
      }
      return backend.signInHash(email);
    },
    probeAccess: () => backend.probeAccess(),
    probeMigrationApply: () => backend.probeMigrationApply(),
  });
}

function assertTable(table) {
  if (!TABLE.test(String(table))) throw new DeliveryError(EXIT.USAGE, `"${table}" is not a plain table name in the public schema`, { code: 'seed' });
}

/** One statement, and a reading one. The Management API's read_only flag is the real guard. */
export function assertReadOnlySql(sql) {
  const text = String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim().replace(/;\s*$/, '');
  if (text.includes(';')) throw new DeliveryError(EXIT.USAGE, 'read query refused: more than one statement', { code: 'read-only' });
  if (!/^(select|with|show|explain|values|table)\b/i.test(text)) throw new DeliveryError(EXIT.USAGE, `read query refused: "${text.slice(0, 40)}..." is not a read`, { code: 'read-only' });
}

// ---------------------------------------------------------------------------------------------

/** How many times a read is tried, and the wait before each retry. Writes are tried once. */
const READ_ATTEMPTS = 3;
const READ_BACKOFF_MS = [2000, 5000];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function httpBackend(env, projectRef, fetchImpl, sleep = wait) {
  const apiBase = String(env.SUPABASE_API_URL ?? 'https://api.supabase.com').replace(/\/+$/, '');
  const token = env.SUPABASE_ACCESS_TOKEN ?? '';
  const serviceKey = env.DELIVERY_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const restRaw = env.DELIVERY_SUPABASE_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  const needToken = () => {
    if (!token) throw new ConfigError('SUPABASE_ACCESS_TOKEN is not set: reads go through the Management API with read_only (create a personal access token and export it)', { code: 'db-access' });
  };
  /** The REST base, only when it is this project's own host. */
  const rest = () => {
    if (!serviceKey || !restRaw) throw new ConfigError('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set for the service role', { code: 'db-access' });
    let url;
    try { url = new URL(restRaw); } catch { throw new ConfigError(`SUPABASE_URL "${restRaw}" is not a URL`, { code: 'db-access' }); }
    const m = /^([a-z0-9]+)\.supabase\.(co|in|net)$/.exec(url.hostname);
    if (!m) throw new ConfigError(`SUPABASE_URL host ${url.hostname} cannot be tied to project ${projectRef}; refusing to write through it`, { code: 'project' });
    if (m[1] !== projectRef) throw new ConfigError(`SUPABASE_URL points at project ${m[1]}, not the test project ${projectRef}`, { code: 'project' });
    return `${url.protocol}//${url.host}`;
  };
  const batchQuery = async (chunk) => {
    const sql = chunk
      .map((q, i) => `select ${i} as i, (select coalesce(json_agg(q), '[]'::json) from (\n${String(q).replace(/;\s*$/, '')}\n) q) as r`)
      .join('\nunion all\n');
    const rows = await backend.query(sql);
    const out = new Array(chunk.length);
    for (const row of rows) {
      const r = typeof row.r === 'string' ? JSON.parse(row.r) : row.r;
      if (!Array.isArray(r)) throw new DeliveryError(EXIT.RED, 'read query: a batched answer was not rows', { code: 'db' });
      out[Number(row.i)] = { rows: r };
    }
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) throw new DeliveryError(EXIT.RED, `read query: the batch did not answer query ${i}`, { code: 'db' });
    }
    return out;
  };
  const restHeaders = (extra = {}) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...extra });
  const call = async (url, init, what) => {
    let res;
    try { res = await fetchImpl(url, init); } catch (err) {
      throw new DeliveryError(EXIT.WAIT, `${what}: network error (${err.message}); retry`, { code: 'db-network' });
    }
    return res;
  };
  const failWith = async (res, what) => {
    const detail = (await res.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    throw new DeliveryError(res.status >= 500 ? EXIT.WAIT : EXIT.RED, `${what}: HTTP ${res.status} ${detail}`, { code: 'db' });
  };

  const backend = {
    async query(sql) {
      needToken();
      // A read is safe to repeat, and on a flaky line one dropped request used to refuse a whole
      // capture (the never-dial set is a dozen reads). Writes are never retried: an upsert whose
      // response was lost may already have landed.
      let res;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await call(`${apiBase}/v1/projects/${projectRef}/database/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql, read_only: true }),
          }, 'read query');
          break;
        } catch (err) {
          if (err?.code !== 'db-network') throw err;
          if (attempt >= READ_ATTEMPTS) throw new DeliveryError(EXIT.WAIT, `${err.message} (${READ_ATTEMPTS} attempts)`, { code: 'db-network' });
          await sleep(READ_BACKOFF_MS[attempt - 1] ?? READ_BACKOFF_MS.at(-1));
        }
      }
      if (!res.ok) await failWith(res, 'read query');
      const body = await res.json();
      if (!Array.isArray(body)) throw new DeliveryError(EXIT.RED, 'read query: the Management API did not return rows', { code: 'db' });
      return body;
    },
    // Several reads as one statement: each query becomes a json_agg subquery, one row per query,
    // so a scan of fifty tables is one request rather than fifty. A batch that fails for any reason
    // but missing credentials is asked again query by query, a few at a time, so one query that
    // cannot sit inside another (a SHOW, a comment after its semicolon) or that fails on its own
    // is reported as itself and does not take the others with it.
    async queryMany(sqls) {
      const settle = (p) => p.then((rows) => ({ rows }), (error) => ({ error }));
      if (sqls.length === 1) return [await settle(backend.query(sqls[0]))];
      const chunks = [];
      for (let i = 0; i < sqls.length; i += BATCH_MAX) chunks.push(sqls.slice(i, i + BATCH_MAX));
      const answered = await Promise.all(chunks.map(async (chunk) => {
        try {
          return await batchQuery(chunk);
        } catch (err) {
          if (err instanceof ConfigError) throw err;
          return inPool(chunk, SINGLE_CONCURRENCY, (sql) => settle(backend.query(sql)));
        }
      }));
      return answered.flat();
    },
    async upsert(table, rows, o = {}) {
      const base = rest();
      // A join table has no id column to conflict on; leaving on_conflict off makes PostgREST use
      // the table's own primary key, which for a join table is the pair of columns it joins.
      const conflict = o.idless ? '' : '?on_conflict=id';
      const groups = new Map();
      for (const r of rows) {
        const k = Object.keys(r).sort().join(',');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      for (const group of groups.values()) {
        for (let i = 0; i < group.length; i += 500) {
          const res = await call(`${base}/rest/v1/${table}${conflict}`, {
            method: 'POST',
            headers: restHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(group.slice(i, i + 500)),
          }, `upsert into ${table}`);
          if (!res.ok) await failWith(res, `upsert into ${table}`);
        }
      }
    },
    async deleteByIds(table, ids) {
      const base = rest();
      let n = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const list = ids.slice(i, i + 100).map((id) => `"${id}"`).join(',');
        const res = await call(`${base}/rest/v1/${table}?id=in.(${encodeURIComponent(list)})`, {
          method: 'DELETE',
          headers: restHeaders({ Prefer: 'return=representation' }),
        }, `delete from ${table}`);
        if (!res.ok) await failWith(res, `delete from ${table}`);
        const body = await res.json().catch(() => []);
        n += Array.isArray(body) ? body.length : 0;
      }
      return n;
    },
    async deleteOrgRows(table, ids, { column, orgId }) {
      const base = rest();
      let n = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const list = ids.slice(i, i + 100).map((id) => `"${id}"`).join(',');
        const res = await call(`${base}/rest/v1/${table}?id=in.(${encodeURIComponent(list)})&${column}=eq.${encodeURIComponent(orgId)}`, {
          method: 'DELETE',
          headers: restHeaders({ Prefer: 'return=representation' }),
        }, `delete from ${table}`);
        if (!res.ok) await failWith(res, `delete from ${table}`);
        const body = await res.json().catch(() => []);
        n += Array.isArray(body) ? body.length : 0;
      }
      return n;
    },
    // A one-time sign-in link's token for a fixture user, for delivery shoot. The guard allows it
    // only for an address matching the safety file's fixtureUserPattern.
    async signInHash(email) {
      const base = rest();
      const res = await call(`${base}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: restHeaders(),
        body: JSON.stringify({ type: 'magiclink', email }),
      }, `sign-in link for ${email}`);
      if (!res.ok) await failWith(res, `sign-in link for ${email}`);
      const body = await res.json();
      const hash = body.hashed_token ?? body.properties?.hashed_token;
      if (!hash) throw new DeliveryError(EXIT.RED, `sign-in link for ${email}: the answer had no token`, { code: 'db' });
      return hash;
    },
    async createUser({ id, email, name }) {
      const base = rest();
      // A design draws a person's name, and a product reads it from the account. A fixture user
      // with no name renders its own email address where the design says "Sam", and the state's
      // own marker is what fails -- so the world's user carries the name the design gives them.
      const body = { id, email, email_confirm: true, ...(name ? { user_metadata: { full_name: name, name } } : {}) };
      const res = await call(`${base}/auth/v1/admin/users`, {
        method: 'POST', headers: restHeaders(), body: JSON.stringify(body),
      }, `create user ${email}`);
      if (res.ok) return 'created';
      if (res.status === 422 || res.status === 409 || res.status === 400) {
        const got = await call(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'GET', headers: restHeaders() }, `read user ${id}`);
        if (got.ok) {
          const u = await got.json();
          if (String(u.email ?? '').toLowerCase() === String(email).toLowerCase()) {
            // A world that gains a name for a user it already created would otherwise keep
            // rendering that user's email address where the design draws their name.
            if (name && String(u.user_metadata?.full_name ?? '') !== name) {
              await call(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
                method: 'PUT', headers: restHeaders(), body: JSON.stringify({ user_metadata: { full_name: name, name } }),
              }, `name user ${email}`);
            }
            return 'exists';
          }
          throw new DeliveryError(EXIT.RED, `user ${id} exists with a different email; refusing to reuse it`, { code: 'seed' });
        }
      }
      return failWith(res, `create user ${email}`);
    },
    async deleteUser(id) {
      const base = rest();
      const res = await call(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: restHeaders() }, `delete user ${id}`);
      if (res.ok) return true;
      if (res.status === 404) return false;
      return failWith(res, `delete user ${id}`);
    },
    async probeAccess() {
      let base;
      try { base = rest(); } catch (err) { return { read: false, write: false, detail: err.message }; }
      const res = await call(`${base}/rest/v1/`, { method: 'GET', headers: restHeaders() }, 'service role probe').catch((err) => ({ ok: false, status: 0, text: async () => err.message }));
      const read = Boolean(res.ok);
      const write = read && isServiceKey(serviceKey);
      return {
        read,
        write,
        detail: read
          ? (write ? `service role accepted by ${projectRef}` : `a key was accepted by ${projectRef}, but it is not the service role`)
          : `the REST API refused the key (HTTP ${res.status})`,
      };
    },
    async probeMigrationApply() {
      if (!token) return { ok: false, detail: 'SUPABASE_ACCESS_TOKEN is not set (the Management API applies migrations; the Supabase MCP is the other route)' };
      const res = await call(`${apiBase}/v1/projects/${projectRef}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, 'migration apply probe')
        .catch((err) => ({ ok: false, status: 0, text: async () => err.message }));
      return res.ok
        ? { ok: true, detail: `the Management API accepts the token for ${projectRef}` }
        : { ok: false, detail: `the Management API refused the token for ${projectRef} (HTTP ${res.status})` };
    },
  };
  return backend;
}

/** Queries per batched request, and single queries in flight when a batch is asked again. */
const BATCH_MAX = 80;
const SINGLE_CONCURRENCY = 6;

async function inPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** A service-role key: a JWT whose role claim is service_role, or a new-style secret key. */
export function isServiceKey(key) {
  if (/^sb_secret_/.test(key)) return true;
  const parts = String(key).split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload.role === 'service_role';
  } catch { return false; }
}
