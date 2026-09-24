// A refresh leaves a world exactly as its plan says: a row a capture's click added (a new knowledge
// entry, say) is deleted, so the next capture does not count 24 entries where the design has 23 and
// a state that adds the same entry again does not get a 409. Only the world's own organisation,
// only the tables its plan seeds, only ids the plan does not have.
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { makeTempRepo, makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import { DeliveryError, EXIT } from '../../lib/core/exit.mjs';
import seedCommand from '../../lib/commands/seed.mjs';
import { refreshWorld, refreshWorldReport } from '../../lib/seed/scan.mjs';
import { fixtureId } from '../../lib/seed/plan.mjs';
import { worldOrgId, extraReads, extraRows, deleteOrder } from '../../lib/seed/extras.mjs';
import { createDataAdapter } from '../../adapters/data/supabase.mjs';
import { createStubDb } from './stub-db.mjs';
import { WORKER_FILES } from '../sidefx/fixtures.mjs';

const NOW = '2026-01-15T12:00:00.000Z';
const WORKERS = { tsGlobs: ['apps/server/src/jobs/**/*.ts'], sqlGlobs: ['db/migrations/*.sql'] };

const world = (id) => ({
  schemaVersion: 1,
  world: id,
  rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } },
    { key: 'w1', table: 'widgets', values: { organization_id: { $ref: 'org' }, state: 'idle', created_at: { $rel: 'now-3d' } } },
    { key: 'b1', table: 'outbound_batches', values: { organization_id: { $ref: 'org' }, status: 'completed' } },
    { key: 'c1', table: 'outbound_calls', values: { organization_id: { $ref: 'org' }, batch_id: { $ref: 'b1' }, status: 'done', release_at: { $rel: 'now-1d' }, phone_number: '+999700000002' } },
  ],
});

function twoWorldPlan() {
  const plan = validExample('plan');
  const design = plan.worlds.find((w) => w.id === 'design');
  plan.worlds.push({ ...structuredClone(design), id: 'messy', orgName: 'Delivery fixture · widgets messy', users: [{ role: 'admin', email: 'delivery+widgets-messy-admin@example.invalid' }] });
  return plan;
}

function stubDb(opts = {}) {
  return createStubDb({
    batch: true,
    answers: [
      { match: /from org_phone_numbers/, rows: [{ phone_number: '+15550100077' }] },
      { match: /country_for_phone_number/, rows: [{ country_for_phone_number: null }] },
      { match: /from org_lines/, rows: () => [{ count: 0 }] },
    ],
    ...opts,
  });
}

async function setup({ db = stubDb() } = {}) {
  const repo = makeTempRepo({
    files: {
      ...WORKER_FILES,
      'docs/delivery/widgets/plan.json': twoWorldPlan(),
      'docs/delivery/widgets/worlds/design.json': world('design'),
      'docs/delivery/widgets/worlds/messy.json': world('messy'),
    },
  });
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const t = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ workers: WORKERS }),
    passthrough: ['git'], clock: fakeClock(NOW),
  });
  t.ctx.dataBackend = db;
  assert.equal(await seedCommand.run(t.ctx, ['--plan']), 0);
  assert.equal(await seedCommand.run(t.ctx, ['--apply']), 0, t.stdout.text());
  return { repo, db, ...t };
}

const DESIGN = fixtureId('widgets', 'design', 'org');
const MESSY = fixtureId('widgets', 'messy', 'org');
const ids = (db, table) => (db.tables.get(table) ?? []).map((r) => r.id).sort();

test('refresh deletes the rows a click added to its world, and keeps every planned row', async () => {
  const { repo, ctx, db, stdout } = await setup();
  try {
    const plan = await readArtefact(ctx.paths, 'seedplan');
    const planned = (table) => plan.rows.filter((r) => r.table === table).map((r) => r.id).sort();
    // A click added a widget, and a batch with a call in it, to the design world.
    db.tables.get('widgets').push({ id: 'clicked-w', organization_id: DESIGN, state: 'idle' });
    db.tables.get('outbound_batches').push({ id: 'clicked-b', organization_id: DESIGN, status: 'queued' });
    db.tables.get('outbound_calls').push({ id: 'clicked-c', organization_id: DESIGN, batch_id: 'clicked-b', status: 'queued' });
    const before = db.writes().length;

    assert.equal(await seedCommand.run(ctx, ['--refresh', 'design']), 0, stdout.text());
    assert.match(stdout.text(), /removed 3 row\(s\) the plan does not have \((?=.*widgets 1)(?=.*outbound_batches 1)(?=.*outbound_calls 1).*\)/);
    assert.match(stdout.text(), /world design refreshed and scanned: safe/);
    for (const table of ['widgets', 'outbound_batches', 'outbound_calls', 'organizations']) {
      assert.deepEqual(ids(db, table), planned(table), `${table} holds exactly the plan's rows`);
    }

    const deletes = db.writes().slice(before).filter((w) => w.op === 'delete');
    assert.deepEqual(deletes.map((d) => d.table), ['outbound_calls', 'outbound_batches', 'widgets'], 'a call goes before the batch it belongs to');
    for (const d of deletes) assert.deepEqual(d.where, { organization_id: DESIGN }, 'every delete carries the world organisation as a filter');

    // Nothing added since: a second refresh removes nothing and writes nothing.
    const again = db.writes().length;
    const r = await refreshWorldReport(ctx, 'design');
    assert.equal(r.gate.ok, true, JSON.stringify(r.gate.failures));
    assert.deepEqual(r.removed, { rows: 0, tables: {} });
    assert.equal(db.writes().length, again);
  } finally { repo.cleanup(); }
});

test('refresh leaves another world, a real organisation, join rows and unseeded tables alone', async () => {
  const { repo, ctx, db } = await setup();
  try {
    db.tables.get('widgets').push(
      { id: 'clicked-w', organization_id: DESIGN, state: 'idle' },
      { id: 'messy-click', organization_id: MESSY, state: 'idle' },
      { id: 'real-1', organization_id: '11111111-2222-4333-8444-555555555555', state: 'idle' },
    );
    db.tables.get('organization_members').push({ organization_id: DESIGN, user_id: 'someone-else', role: 'member' });
    db.tables.set('notes', [{ id: 'note-1', organization_id: DESIGN }]);
    const messyBefore = structuredClone(db.tables.get('widgets').filter((w) => w.organization_id === MESSY));

    assert.equal((await refreshWorld(ctx, 'design')).ok, true);
    const widgets = ids(db, 'widgets');
    assert.ok(!widgets.includes('clicked-w'), 'the design world\'s extra is gone');
    assert.ok(widgets.includes('messy-click'), 'another world\'s row is not the design refresh\'s to remove');
    assert.ok(widgets.includes('real-1'), 'a row of an organisation no world has is never touched');
    assert.deepEqual(db.tables.get('widgets').filter((w) => w.organization_id === MESSY), messyBefore, 'the messy world is exactly as it was');
    assert.ok(db.tables.get('organization_members').some((m) => m.user_id === 'someone-else'), 'a row with no id to judge by is left');
    assert.deepEqual(ids(db, 'notes'), ['note-1'], 'a table the plan does not seed is not the refresh\'s');
    assert.equal(db.tables.get('organizations').length, 2, 'no organisation is ever deleted');
  } finally { repo.cleanup(); }
});

test('refresh refuses, and writes nothing, when the world\'s organisation cannot be resolved from the plan', async () => {
  const { repo, ctx, db, stdout } = await setup();
  try {
    const plan = await readArtefact(ctx.paths, 'seedplan');
    db.tables.get('widgets').push({ id: 'clicked-w', organization_id: DESIGN, state: 'idle' });
    const cases = [
      // The organisation id names no row of the world: which organisation is it?
      (p) => { p.worlds.find((w) => w.id === 'design').orgId = 'not-a-row-of-the-plan'; },
      // The organisation is another world's.
      (p) => { p.worlds.find((w) => w.id === 'design').orgId = MESSY; },
    ];
    for (const mutate of cases) {
      const broken = structuredClone(plan);
      mutate(broken);
      await writeArtefact(ctx.paths, 'seedplan', broken);
      const before = db.writes().length;
      const gate = await refreshWorld(ctx, 'design');
      assert.equal(gate.ok, false);
      assert.equal(gate.exit, EXIT.USAGE);
      assert.ok(gate.failures.some((f) => f.code === 'M13-refresh' && /cannot tell which rows are the world's; nothing was written/.test(f.message)), JSON.stringify(gate.failures));
      assert.equal(db.writes().length, before, 'nothing written, nothing deleted');
    }
    assert.equal(await seedCommand.run(ctx, ['--refresh', 'design']), 2);
    assert.match(stdout.text(), /FAIL M13-refresh/);

    // No organisation id at all: the seed plan itself is refused on reading, before any write.
    const missing = structuredClone(plan);
    delete missing.worlds.find((w) => w.id === 'design').orgId;
    writeFileSync(ctx.paths.seedplan, JSON.stringify(missing));
    const before = db.writes().length;
    await assert.rejects(refreshWorld(ctx, 'design'), (e) => e instanceof DeliveryError && /does not match schema seedplan/.test(e.message));
    assert.equal(db.writes().length, before);
    assert.ok(ids(db, 'widgets').includes('clicked-w'), 'the added row is still there: a refused refresh deletes nothing');
  } finally { repo.cleanup(); }
});

test('a delete that fails is a refresh failure, and the scan still runs', async () => {
  const db = stubDb();
  const { repo, ctx } = await setup({ db });
  try {
    db.tables.get('widgets').push({ id: 'clicked-w', organization_id: DESIGN, state: 'idle' });
    db.deleteOrgRows = async () => { throw new DeliveryError(EXIT.RED, 'delete from widgets: HTTP 409 foreign key', { code: 'db' }); };
    const scansBefore = db.calls.filter((c) => c.op === 'batch' && c.sqls.some((s) => /from org_phone_numbers/.test(s))).length;
    const gate = await refreshWorld(ctx, 'design');
    assert.equal(gate.ok, false);
    assert.ok(gate.failures.some((f) => f.code === 'M13-refresh' && /1 widgets row\(s\).*could not be deleted/.test(f.message)), JSON.stringify(gate.failures));
    const scansAfter = db.calls.filter((c) => c.op === 'batch' && c.sqls.some((s) => /from org_phone_numbers/.test(s))).length;
    assert.ok(scansAfter >= scansBefore + 2, 'the check before and the scan after both read the safety inputs');
  } finally { repo.cleanup(); }
});

test('the organisation is resolved from the plan alone', () => {
  const plan = {
    worlds: [{ id: 'a', orgId: 'o-a' }, { id: 'b', orgId: 'o-b' }],
    rows: [
      { world: 'a', table: 'organizations', id: 'o-a', values: { id: 'o-a' } },
      { world: 'b', table: 'organizations', id: 'o-b', values: { id: 'o-b' } },
    ],
  };
  assert.deepEqual(worldOrgId(plan, 'a'), { orgId: 'o-a' });
  assert.match(worldOrgId(plan, 'z').error, /no world "z"/);
  assert.match(worldOrgId({ ...plan, worlds: [{ id: 'a' }] }, 'a').error, /names no organisation id/);
  assert.match(worldOrgId({ ...plan, worlds: [{ id: 'a', orgId: "o') or true" }] }, 'a').error, /names no organisation id/);
  assert.match(worldOrgId({ ...plan, worlds: [{ id: 'a', orgId: 'o-b' }, { id: 'b', orgId: 'o-b' }] }, 'a').error, /is not one of its own rows/);
  assert.match(worldOrgId({ worlds: [{ id: 'a', orgId: 'o-a' }, { id: 'b', orgId: 'o-a' }], rows: plan.rows }, 'a').error, /also another world's/);
});

test('extras: read by the organisation column the planned rows carry; a returned row outside it is still ignored', () => {
  const plan = {
    worlds: [{ id: 'a', orgId: 'o-a' }, { id: 'b', orgId: 'o-b' }],
    rows: [
      { world: 'a', table: 'organizations', id: 'o-a', values: { id: 'o-a' } },
      { world: 'a', table: 'org_knowledge', id: 'k1', values: { id: 'k1', organization_id: 'o-a' } },
      { world: 'a', table: 'members', id: 'm', idless: true, values: { organization_id: 'o-a', user_id: 'u' } },
      { world: 'a', table: 'settings', id: 's1', values: { id: 's1', name: 'global' } },
      { world: 'b', table: 'org_knowledge', id: 'k2', values: { id: 'k2', organization_id: 'o-b' } },
    ],
  };
  const { reads, unscoped } = extraReads(plan, 'a', 'o-a');
  assert.deepEqual(reads.map((r) => [r.table, r.column]), [['org_knowledge', 'organization_id']], 'the organisation row, a join table and a table with no organisation column are not read');
  assert.deepEqual(unscoped, ['settings']);
  assert.match(reads[0].sql, /^select id, "organization_id" from public\."org_knowledge" where "organization_id"::text = any\('\{o-a\}'\)$/);
  const found = extraRows(plan, 'o-a', reads, [[
    { id: 'k1', organization_id: 'o-a' },
    { id: 'added', organization_id: 'o-a' },
    { id: 'k2', organization_id: 'o-a' },
    { id: 'o-b', organization_id: 'o-a' },
    { id: 'theirs', organization_id: 'o-b' },
    { id: "x') or true", organization_id: 'o-a' },
    { id: null, organization_id: 'o-a' },
  ]]);
  assert.deepEqual(found, [{ table: 'org_knowledge', column: 'organization_id', id: 'added' }]);
});

test('delete order: a table whose planned rows reference another goes first, whatever the plan order', () => {
  const plan = {
    worlds: [{ id: 'a', orgId: 'o' }],
    rows: [
      { world: 'a', table: 'organizations', id: 'o', values: { id: 'o' } },
      { world: 'a', table: 'answers', id: 'x1', values: { id: 'x1', organization_id: 'o', entry_id: 'e1' } },
      { world: 'a', table: 'entries', id: 'e1', values: { id: 'e1', organization_id: 'o', meta: { topic: 't1' } } },
      { world: 'a', table: 'topics', id: 't1', values: { id: 't1', organization_id: 'o' } },
      { world: 'a', table: 'tags', id: 'g1', values: { id: 'g1', organization_id: 'o' } },
    ],
  };
  assert.deepEqual(deleteOrder(plan, 'a', ['topics', 'entries', 'answers', 'tags']), ['tags', 'answers', 'entries', 'topics'], 'children first; an unrelated table latest seeded first');
  assert.deepEqual(deleteOrder(plan, 'a', ['topics', 'answers']), ['topics', 'answers'], 'unrelated in the set: latest seeded first');
});

test('adapter: a refresh deletes only through the organisation filter', async () => {
  const dir = makeTempDir();
  const REF = 'testprojectref';
  const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
  const env = { SUPABASE_ACCESS_TOKEN: 't', SUPABASE_URL: `https://${REF}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role' }) };
  try {
    const { ctx } = await makeTestCtx({ repoRoot: dir.dir, profile: makeProfile(), safety: makeSafety(), env });
    const stub = createStubDb({ tables: { widgets: [{ id: 'a', organization_id: 'o1' }, { id: 'b', organization_id: 'o2' }] } });
    ctx.dataBackend = stub;
    const refresh = await createDataAdapter(ctx, { write: 'seed-refresh' });
    await assert.rejects(refresh.deleteByIds('widgets', ['a']), (e) => e.code === 'read-only', 'no unfiltered delete in a refresh');
    await assert.rejects(refresh.deleteOrgRows('widgets', ['a'], { column: 'name', orgId: 'o1' }), (e) => e.code === 'seed');
    await assert.rejects(refresh.deleteOrgRows('widgets', ['a'], { column: 'organization_id', orgId: "o1') or true" }), (e) => e.code === 'seed');
    await assert.rejects(refresh.deleteOrgRows('widgets', ["a') or true"], { column: 'organization_id', orgId: 'o1' }), (e) => e.code === 'seed');
    assert.equal(await refresh.deleteOrgRows('widgets', ['a', 'b'], { column: 'organization_id', orgId: 'o1' }), 1, 'b is o2\'s and stays');
    for (const mode of [null, 'seed-apply', 'seed-teardown']) {
      const other = await createDataAdapter(ctx, mode ? { write: mode } : {});
      await assert.rejects(other.deleteOrgRows('widgets', ['b'], { column: 'organization_id', orgId: 'o2' }), (e) => e.code === 'read-only');
    }
    delete ctx.dataBackend;
    const requests = [];
    const fetch = async (url, init = {}) => { requests.push({ url: String(url), method: init.method }); return { ok: true, status: 200, json: async () => [{ id: 'a' }], text: async () => '' }; };
    const http = await createDataAdapter(ctx, { fetch, write: 'seed-refresh' });
    assert.equal(await http.deleteOrgRows('widgets', ['a'], { column: 'organization_id', orgId: 'o1' }), 1);
    assert.deepEqual(requests, [{ url: `https://${REF}.supabase.co/rest/v1/widgets?id=in.(${encodeURIComponent('"a"')})&organization_id=eq.o1`, method: 'DELETE' }]);
  } finally { dir.cleanup(); }
});
