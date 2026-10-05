// The Supabase data adapter: which project it will talk to, that it cannot write outside the seed
// write modes, and the exact requests it makes (against a fetch stub; no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { createRunner } from '../../lib/core/run.mjs';
import { createCtx } from '../../lib/core/ctx.mjs';
import { listTree } from '../../lib/core/hash.mjs';
import { createDataAdapter, assertReadOnlySql, isServiceKey } from '../../adapters/data/supabase.mjs';
import { createStubDb } from './stub-db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REF = 'testprojectref';
const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
const ENV = {
  SUPABASE_ACCESS_TOKEN: 'token-for-tests',
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role' }),
};

async function ctxWith(env = ENV) {
  const dir = makeTempDir();
  const { ctx } = await makeTestCtx({ repoRoot: dir.dir, profile: makeProfile(), safety: makeSafety(), env });
  return { ctx, cleanup: dir.cleanup };
}

function fetchStub(handler = () => ({ status: 200, body: [] })) {
  const requests = [];
  const fn = async (url, init = {}) => {
    const req = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null };
    requests.push(req);
    const r = handler(req);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
  fn.requests = requests;
  return fn;
}

test('only the profile test project, never a production one', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    ctx.dataBackend = createStubDb();
    await assert.rejects(createDataAdapter(ctx, { projectRef: 'prodprojectref' }), (e) => e.exit === 2 && e.code === 'production');
    await assert.rejects(createDataAdapter(ctx, { projectRef: 'otherref' }), (e) => e.exit === 2 && e.code === 'project');
    const db = await createDataAdapter(ctx);
    assert.equal(db.projectRef, REF);
    assert.equal(db.write, null);
  } finally { cleanup(); }
});

test('writes exist only in the seed write modes, each with its own methods', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const stub = createStubDb();
    ctx.dataBackend = stub;
    const ro = await createDataAdapter(ctx);
    await assert.rejects(ro.upsert('widgets', [{ id: 'a' }]), (e) => e.code === 'read-only');
    await assert.rejects(ro.deleteByIds('widgets', ['a']), (e) => e.code === 'read-only');
    await assert.rejects(ro.createUser({ id: 'u', email: 'x@example.invalid' }), (e) => e.code === 'read-only');
    await assert.rejects(ro.deleteUser('u'), (e) => e.code === 'read-only');
    const apply = await createDataAdapter(ctx, { write: 'seed-apply' });
    await apply.upsert('widgets', [{ id: 'a' }]);
    await assert.rejects(apply.deleteByIds('widgets', ['a']), (e) => e.code === 'read-only');
    const teardown = await createDataAdapter(ctx, { write: 'seed-teardown' });
    assert.equal(await teardown.deleteByIds('widgets', ['a']), 1);
    await assert.rejects(teardown.upsert('widgets', [{ id: 'b' }]), (e) => e.code === 'read-only');
    await assert.rejects(apply.upsert('public.widgets; drop', [{ id: 'a' }]), (e) => e.code === 'seed');
    await assert.rejects(teardown.deleteByIds('widgets', ["a') or true"]), (e) => e.code === 'seed');
    await assert.rejects(createDataAdapter(ctx, { write: 'anything' }), (e) => e.exit === 2);
    assert.deepEqual(stub.writes().map((w) => w.op), ['upsert', 'delete']);
  } finally { cleanup(); }
});

test('reads are single reading statements', () => {
  assert.doesNotThrow(() => assertReadOnlySql('select 1'));
  assert.doesNotThrow(() => assertReadOnlySql('with x as (select 1) select * from x;'));
  assert.throws(() => assertReadOnlySql('select 1; delete from widgets'), (e) => e.code === 'read-only');
  assert.throws(() => assertReadOnlySql('update widgets set a = 1'), (e) => e.code === 'read-only');
  assert.throws(() => assertReadOnlySql('-- select\ndelete from widgets'), (e) => e.code === 'read-only');
});

test('http: reads go to the Management API with read_only; writes go to REST on the project host', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const fetch = fetchStub((req) => ({ status: 200, body: req.url.includes('/database/query') ? [{ ok: 1 }] : [] }));
    const db = await createDataAdapter(ctx, { fetch, write: 'seed-apply' });
    assert.deepEqual(await db.query('select 1 as ok'), [{ ok: 1 }]);
    const q = fetch.requests[0];
    assert.equal(q.url, `https://api.supabase.com/v1/projects/${REF}/database/query`);
    assert.deepEqual(q.body, { query: 'select 1 as ok', read_only: true });
    assert.equal(q.headers.Authorization, 'Bearer token-for-tests');
    await db.upsert('widgets', [{ id: 'a', state: 'x' }, { id: 'b', state: 'y' }, { id: 'c' }]);
    const posts = fetch.requests.slice(1);
    assert.equal(posts.length, 2, 'rows with different columns go in separate requests');
    assert.equal(posts[0].url, `https://${REF}.supabase.co/rest/v1/widgets?on_conflict=id`);
    assert.equal(posts[0].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
    assert.equal(posts[0].headers.apikey, ENV.SUPABASE_SERVICE_ROLE_KEY);
    assert.deepEqual(posts[0].body.map((r) => r.id), ['a', 'b']);
  } finally { cleanup(); }
});

test('http: a read survives a dropped connection; a write is never sent twice', async () => {
  // On a flaky line one dropped request among the never-dial queries refused a whole capture, twice
  // in a row. A read is safe to repeat; an upsert whose response was lost may already have landed.
  const { ctx, cleanup } = await ctxWith();
  try {
    const slept = [];
    const sleep = async (ms) => { slept.push(ms); };
    let drops = 2;
    const flaky = fetchStub((req) => {
      if (req.url.includes('/database/query') && drops-- > 0) throw new TypeError('fetch failed');
      return { status: 200, body: [{ ok: 1 }] };
    });
    const db = await createDataAdapter(ctx, { fetch: flaky, sleep, write: 'seed-apply' });
    assert.deepEqual(await db.query('select 1 as ok'), [{ ok: 1 }]);
    assert.equal(flaky.requests.length, 3);
    assert.equal(slept.length, 2);

    const dead = fetchStub(() => { throw new TypeError('fetch failed'); });
    const db2 = await createDataAdapter(ctx, { fetch: dead, sleep, write: 'seed-apply' });
    await assert.rejects(db2.query('select 1'), (e) => e.code === 'db-network' && /3 attempts/.test(e.message));
    assert.equal(dead.requests.length, 3);
    await assert.rejects(db2.upsert('widgets', [{ id: 'a' }]), (e) => e.code === 'db-network');
    assert.equal(dead.requests.length, 4, 'the write went once');
  } finally { cleanup(); }
});

test('http: a REST host of another project, or missing credentials, refuses', async () => {
  const other = await ctxWith({ ...ENV, SUPABASE_URL: 'https://someoneelse.supabase.co' });
  try {
    const db = await createDataAdapter(other.ctx, { fetch: fetchStub(), write: 'seed-apply' });
    await assert.rejects(db.upsert('widgets', [{ id: 'a' }]), (e) => e.exit === 2 && e.code === 'project');
    const probe = await db.probeAccess();
    assert.equal(probe.read, false);
  } finally { other.cleanup(); }
  const none = await ctxWith({});
  try {
    const fetch = fetchStub();
    const db = await createDataAdapter(none.ctx, { fetch });
    await assert.rejects(db.query('select 1'), (e) => e.exit === 2 && e.code === 'db-access');
    assert.deepEqual(await db.probeMigrationApply(), { ok: false, detail: 'SUPABASE_ACCESS_TOKEN is not set (the Management API applies migrations; the Supabase MCP is the other route)' });
    assert.equal(fetch.requests.length, 0);
  } finally { none.cleanup(); }
});

test('http: probes read and never write', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const fetch = fetchStub(() => ({ status: 200, body: {} }));
    const db = await createDataAdapter(ctx, { fetch });
    assert.deepEqual(await db.probeAccess(), { read: true, write: true, detail: `service role accepted by ${REF}` });
    assert.equal((await db.probeMigrationApply()).ok, true);
    assert.ok(fetch.requests.every((r) => r.method === 'GET'));
    assert.ok(isServiceKey('sb_secret_abc'));
    assert.ok(!isServiceKey(jwt({ role: 'anon' })));
  } finally { cleanup(); }
});

test('a test database stub is refused when external commands are real', async () => {
  const dir = makeTempDir();
  try {
    const ctx = await createCtx({
      cwd: dir.dir, repoRoot: dir.dir, env: { DELIVERY_DATA_STUB: '/nonexistent/stub.mjs' },
      flags: { feature: null, json: false, help: false }, runner: createRunner(), profile: makeProfile(), safety: makeSafety(),
      out: { warn() {}, line() {}, fail() {}, set() {}, failures: () => [], finish: (e) => e, json: false },
    });
    await assert.rejects(createDataAdapter(ctx), (e) => e.code === 'data-stub');
  } finally { dir.cleanup(); }
});

test('only the seed code asks for a write mode', async () => {
  const files = (await listTree(ROOT)).filter((f) => f.endsWith('.mjs') && !f.startsWith('tests/'));
  const writers = files.filter((f) => /write:\s*'seed-/.test(readFileSync(join(ROOT, f), 'utf8')) || /createDataAdapter\(ctx,\s*write\s*\?/.test(readFileSync(join(ROOT, f), 'utf8')));
  for (const f of writers) assert.ok(f.startsWith('lib/seed/') || f === 'lib/commands/seed.mjs', `${f} asks the data adapter for a write mode`);
  assert.ok(writers.includes('lib/commands/seed.mjs'));
});

// A scan used to send each of its fifty-odd reads as its own request, about a second each: most of
// the minute and a half a world refresh took. They now travel as one statement.
test('http: several reads go as one read-only request, each answered on its own', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const fetch = fetchStub(() => ({
      status: 200,
      body: [{ i: 1, r: '[{"n":2}]' }, { i: 0, r: [{ phone_number: '+15550100077' }] }],
    }));
    const db = await createDataAdapter(ctx, { fetch });
    const out = await db.queryMany(['select phone_number from org_phone_numbers;', 'select count(*) as n from widgets -- trailing']);
    assert.deepEqual(out, [{ rows: [{ phone_number: '+15550100077' }] }, { rows: [{ n: 2 }] }]);
    assert.equal(fetch.requests.length, 1);
    const { query, read_only: readOnly } = fetch.requests[0].body;
    assert.equal(readOnly, true);
    assert.match(query, /^select 0 as i, \(select coalesce\(json_agg\(q\), '\[\]'::json\) from \(\nselect phone_number from org_phone_numbers\n\) q\) as r\nunion all\nselect 1 as i/);
    assert.match(query, /-- trailing\n\) q\) as r$/, 'a trailing comment cannot swallow the closing bracket');
    await assert.rejects(db.queryMany(['select 1', 'delete from widgets']), (e) => e.code === 'read-only');
    assert.equal(fetch.requests.length, 1, 'a batch holding a write is refused before any request');
  } finally { cleanup(); }
});

test('http: a batch that fails is asked again query by query, so each failure is its own', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const fetch = fetchStub((req) => {
      const q = req.body.query;
      if (q.startsWith('select 0 as i') || q.includes('carrier_dids')) return { status: 400, body: { message: 'relation "carrier_dids" does not exist' } };
      return { status: 200, body: [{ phone_number: '+15550100077' }] };
    });
    const db = await createDataAdapter(ctx, { fetch });
    const out = await db.queryMany(['select phone_number from org_phone_numbers', 'select phone_number from carrier_dids']);
    assert.deepEqual(out[0], { rows: [{ phone_number: '+15550100077' }] });
    assert.match(out[1].error.message, /HTTP 400 .*carrier_dids/);
    assert.equal(fetch.requests.length, 3);
  } finally { cleanup(); }
  const none = await ctxWith({});
  try {
    const db = await createDataAdapter(none.ctx, { fetch: fetchStub() });
    await assert.rejects(db.queryMany(['select 1', 'select 2']), (e) => e.code === 'db-access', 'missing credentials are not asked again one by one');
  } finally { none.cleanup(); }
});

// B5: renaming a fixture user.
test('http: a refused rename of an existing fixture user fails the write instead of passing in silence', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const email = 'delivery+widgets-design-admin@example.invalid';
    const fetch = fetchStub((req) => {
      if (req.method === 'POST') return { status: 422, body: { msg: 'already registered' } };
      if (req.method === 'GET') return { status: 200, body: { id: 'u-1', email, user_metadata: { full_name: 'Old Name' } } };
      return { status: 500, body: { msg: 'metadata update refused' } };
    });
    const db = await createDataAdapter(ctx, { fetch, write: 'seed-apply' });
    await assert.rejects(db.createUser({ id: 'u-1', email, name: 'New Name' }), /name user/);
    assert.equal(fetch.requests.at(-1).method, 'PUT');
    const fine = fetchStub((req) => (req.method === 'POST' ? { status: 422, body: {} } : req.method === 'GET' ? { status: 200, body: { id: 'u-1', email, user_metadata: { full_name: 'Old Name' } } } : { status: 200, body: {} }));
    const ok = await createDataAdapter(ctx, { fetch: fine, write: 'seed-apply' });
    assert.equal(await ok.createUser({ id: 'u-1', email, name: 'New Name' }), 'exists');
  } finally { cleanup(); }
});

test('http: updateByColumn patches the rows whose column holds the id, and only in seed --apply', async () => {
  const { ctx, cleanup } = await ctxWith();
  try {
    const fetch = fetchStub(() => ({ status: 204, body: null }));
    const db = await createDataAdapter(ctx, { fetch, write: 'seed-apply' });
    await db.updateByColumn('profiles', 'user_id', 'u-1', { full_name: 'New Name' });
    assert.equal(fetch.requests[0].method, 'PATCH');
    assert.equal(fetch.requests[0].url, `https://${REF}.supabase.co/rest/v1/profiles?user_id=eq.u-1`);
    assert.deepEqual(fetch.requests[0].body, { full_name: 'New Name' });
    await assert.rejects(db.updateByColumn('profiles', 'user_id; drop', 'u-1', { full_name: 'x' }), (e) => e.code === 'seed');
    await assert.rejects(db.updateByColumn('profiles', 'user_id', 'u-1', { id: 'x' }), (e) => e.code === 'seed');
    const ro = await createDataAdapter(ctx, { fetch });
    await assert.rejects(ro.updateByColumn('profiles', 'user_id', 'u-1', { full_name: 'x' }), (e) => e.code === 'read-only');
  } finally { cleanup(); }
});

test('applyRows: with userNameColumns, each named fixture user\'s name is written to the app\'s own users table (stub db)', async () => {
  const { applyRows } = await import('../../lib/seed/apply.mjs');
  const { ctx, cleanup } = await ctxWith();
  try {
    // The insert trigger copied the old name once; the map now gives the user a new one.
    const stub = createStubDb({ tables: { users: [{ id: 'u-1', full_name: 'Old Name' }, { id: 'u-2', full_name: 'Someone' }] }, users: [{ id: 'u-1', email: 'delivery+a@example.invalid' }] });
    ctx.dataBackend = stub;
    const db = await createDataAdapter(ctx, { write: 'seed-apply' });
    const seedPlan = { worlds: [{ id: 'design', orgId: 'o-1' }], rows: [], users: [
      { world: 'design', role: 'admin', id: 'u-1', email: 'delivery+a@example.invalid', name: 'New Name' },
      { world: 'design', role: 'member', id: 'u-3', email: 'delivery+b@example.invalid' },
    ] };
    const r = await applyRows(db, seedPlan, { now: new Date(), userNameColumns: [{ table: 'users', column: 'full_name' }] });
    assert.equal(r.users.named, 1, 'a user with no name is left alone');
    assert.deepEqual(stub.tables.get('users').map((u) => u.full_name), ['New Name', 'Someone']);
    const none = await applyRows(db, seedPlan, { now: new Date() });
    assert.equal(none.users.named, 0, 'without userNameColumns nothing is written there');
  } finally { cleanup(); }
});
