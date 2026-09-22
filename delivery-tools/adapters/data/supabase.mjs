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
  'seed-refresh': ['upsert'],
  'seed-teardown': ['deleteByIds', 'deleteUser'],
});

const TABLE = /^[a-z_][a-z0-9_]*$/;
const ID = /^[A-Za-z0-9._:-]+$/;
const REF = /^[a-z0-9][a-z0-9-]{2,63}$/;

/**
 * @typedef {object} DataAdapter
 * @property {string} projectRef   the project this adapter talks to
 * @property {string|null} write   the seed write mode it was built for, or null (read-only)
 * @property {(sql: string, params?: unknown[]) => Promise<object[]>} query  read-only SQL
 * @property {(table: string, rows: object[]) => Promise<void>} upsert      by primary key `id`
 * @property {(table: string, ids: string[]) => Promise<number>} deleteByIds
 * @property {(user: { id: string, email: string }) => Promise<'created'|'exists'>} createUser
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
    : httpBackend(ctx.env ?? {}, projectRef, opts.fetch ?? globalThis.fetch);
  return guard(backend, { projectRef, write });
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

function guard(backend, { projectRef, write }) {
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
    createUser: allowed.has('createUser') ? async (user) => backend.createUser(user) : refuse('createUser'),
    deleteUser: allowed.has('deleteUser') ? async (id) => backend.deleteUser(id) : refuse('deleteUser'),
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

function httpBackend(env, projectRef, fetchImpl) {
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

  return {
    async query(sql) {
      needToken();
      const res = await call(`${apiBase}/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql, read_only: true }),
      }, 'read query');
      if (!res.ok) await failWith(res, 'read query');
      const body = await res.json();
      if (!Array.isArray(body)) throw new DeliveryError(EXIT.RED, 'read query: the Management API did not return rows', { code: 'db' });
      return body;
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
    async createUser({ id, email }) {
      const base = rest();
      const res = await call(`${base}/auth/v1/admin/users`, {
        method: 'POST', headers: restHeaders(), body: JSON.stringify({ id, email, email_confirm: true }),
      }, `create user ${email}`);
      if (res.ok) return 'created';
      if (res.status === 422 || res.status === 409 || res.status === 400) {
        const got = await call(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'GET', headers: restHeaders() }, `read user ${id}`);
        if (got.ok) {
          const u = await got.json();
          if (String(u.email ?? '').toLowerCase() === String(email).toLowerCase()) return 'exists';
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
