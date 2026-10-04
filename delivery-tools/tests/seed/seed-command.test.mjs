// delivery seed, every mode, on a temporary repo with the synthetic workers and an in-memory
// database: plan, check, apply (refused, then accepted), scan catching a raw insert, refresh,
// teardown, and the refusals that come before any database call.
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import seedCommand from '../../lib/commands/seed.mjs';
import { seedCheckGate } from '../../lib/seed/safety.mjs';
import { teardownRows, refreshWorld } from '../../lib/seed/scan.mjs';
import { buildSeedPlan, uuidv5, fixtureId } from '../../lib/seed/plan.mjs';
import { applyRows } from '../../lib/seed/apply.mjs';
import { derivedNeverDial } from '../../lib/seed/db.mjs';
import { createStubDb, guardsWithFixtureTables } from './stub-db.mjs';
import { WORKER_FILES } from '../sidefx/fixtures.mjs';

const NOW = '2026-01-15T12:00:00.000Z';
const WORKERS = { tsGlobs: ['apps/server/src/jobs/**/*.ts'], sqlGlobs: ['db/migrations/*.sql'] };

const SAFE_WORLD = {
  schemaVersion: 1,
  world: 'design',
  rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } },
    { key: 'w1', table: 'widgets', values: { organization_id: { $ref: 'org' }, state: 'idle', created_at: { $rel: 'now-3d' }, contact_phone: '999700000001' } },
    { key: 'b1', table: 'outbound_batches', values: { organization_id: { $ref: 'org' }, status: 'completed' } },
    { key: 'c1', table: 'outbound_calls', values: { organization_id: { $ref: 'org' }, batch_id: { $ref: 'b1' }, status: 'done', release_at: { $rel: 'now-1d' }, phone_number: '+999700000002' } },
  ],
};

function unsafeWorld() {
  const w = structuredClone(SAFE_WORLD);
  w.rows.push({ key: 'c2', table: 'outbound_calls', values: { organization_id: { $ref: 'org' }, batch_id: { $ref: 'b1' }, status: 'queued', release_at: { $rel: 'now-5m' }, phone_number: '05550100001' } });
  return w;
}

function stubDb({ guardCount = 0, batch = false } = {}) {
  return createStubDb({
    batch,
    answers: [
      { match: /from org_phone_numbers/, rows: [{ phone_number: '+15550100077' }] },
      { match: /country_for_phone_number/, rows: [{ country_for_phone_number: null }] },
      { match: /from org_lines/, rows: () => [{ count: guardCount }] },
    ],
  });
}

async function setup({ world = SAFE_WORLD, db = stubDb(), safety = {} } = {}) {
  const repo = makeTempRepo({
    files: {
      ...WORKER_FILES,
      'docs/delivery/widgets/plan.json': validExample('plan'),
      'docs/delivery/widgets/worlds/design.json': world,
    },
  });
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const t = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ workers: WORKERS, ...safety, guards: guardsWithFixtureTables(makeSafety(), safety.guards) }),
    passthrough: ['git'], clock: fakeClock(NOW),
  });
  t.ctx.dataBackend = db;
  return { repo, db, ...t };
}

test('ids are UUIDv5: the RFC test vector, and stable per feature, world and key', () => {
  assert.equal(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  assert.equal(fixtureId('widgets', 'design', 'w1'), fixtureId('widgets', 'design', 'w1'));
  assert.notEqual(fixtureId('widgets', 'design', 'w1'), fixtureId('widgets', 'messy', 'w1'));
});

test('seed --plan: world files become seedplan.json with derived ids, resolved refs and relative times kept', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    const plan = await readArtefact(ctx.paths, 'seedplan');
    const org = fixtureId('widgets', 'design', 'org');
    assert.deepEqual(plan.worlds, [{ id: 'design', orgId: org, seededTables: ['organization_members', 'organizations', 'outbound_batches', 'outbound_calls', 'widgets'] }]);
    assert.equal(plan.project, 'testprojectref');
    const member = plan.rows.find((r) => r.table === 'organization_members');
    assert.equal(member.values.organization_id, org);
    assert.equal(member.values.user_id, fixtureId('widgets', 'design', 'user:admin'));
    assert.equal(plan.rows.find((r) => r.id === org).values.name, 'Delivery fixture · widgets design');
    assert.deepEqual(plan.rows.find((r) => r.table === 'widgets').values.created_at, { $rel: 'now-3d' });
    assert.match(stdout.text(), /1 world\(s\), 5 row\(s\), 1 fixture user\(s\)/);
    const first = JSON.stringify(plan.rows);
    await seedCommand.run(ctx, ['--plan']);
    assert.equal(JSON.stringify((await readArtefact(ctx.paths, 'seedplan')).rows), first, 'a re-plan is identical');
  } finally { repo.cleanup(); }
});

test('seed --plan: a converted run seeds the map\'s worlds, not the old plan\'s', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    const plan = validExample('plan');
    const extra = { ...structuredClone(plan.worlds[0]), id: 'settled' };
    writeFileSync(join(repo.dir, 'docs/delivery/widgets/map.json'), JSON.stringify({ worlds: [...plan.worlds, extra] }));
    writeFileSync(join(repo.dir, 'docs/delivery/widgets/worlds/settled.json'), JSON.stringify({ ...SAFE_WORLD, world: 'settled' }));
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    const seeded = await readArtefact(ctx.paths, 'seedplan');
    assert.deepEqual(seeded.worlds.map((w) => w.id), ['design', 'settled']);
    assert.match(stdout.text(), /2 world\(s\)/);
  } finally { repo.cleanup(); }
});

test('seed --plan: a reference to a row the world does not have is a usage error', () => {
  assert.throws(() => buildSeedPlan({
    feature: 'widgets', runId: 'r-1', project: 'p', plan: validExample('plan'), safety: makeSafety(),
    worldFiles: { design: { schemaVersion: 1, world: 'design', rows: [{ key: 'org', table: 'organizations', values: { id: 'mine', x: { $ref: 'nope' } } }] } },
    // Three: the bad $ref, the row setting its own id, and the fixture user this world file
    // never joins to the organisation.
  }), (err) => err.exit === 2 && err.failures.length === 3);
});

// A world's users are created in the auth system by the seed and joined to the organisation by the
// world file, because only the repo knows the table that join lives in. A world file that never
// references a user leaves that user belonging to nothing, and the capture then signs in somebody
// with no organisation: the widgets rehearsal's four wave-0 smoke captures came back identical.
test('seed --plan: a fixture user no row of the world file references is refused', () => {
  const plan = validExample('plan');
  const world = (rows) => ({ design: { schemaVersion: 1, world: 'design', rows } });
  const org = { key: 'org', table: 'organizations', values: { name: { $orgName: true } } };
  const build = (rows) => buildSeedPlan({ feature: 'widgets', runId: 'r-1', project: 'p', plan, safety: makeSafety(), worldFiles: world(rows) });

  assert.throws(() => build([org]), (err) => err.exit === 2 && err.failures.some((x) =>
    /world design: the plan declares a admin user and no row of its world file references it; join it to the organisation with \{"\$ref": "user:admin"\}/.test(x.message)));

  const joined = build([org, { key: 'm-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } }]);
  assert.equal(joined.rows.length, 2);
  assert.equal(joined.rows[1].values.user_id, joined.users[0].id);
});

test('seed --plan: a $key that is not a placeholder is refused, never written through', () => {
  const world = { schemaVersion: 1, world: 'design', rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true }, slug: { $orgSlug: true } } },
  ] };
  assert.throws(() => buildSeedPlan({
    feature: 'widgets', runId: 'r-1', project: 'p', plan: validExample('plan'), safety: makeSafety(), worldFiles: { design: world },
  }), (err) => err.exit === 2 && err.failures.some((x) => /"\$orgSlug" is not a placeholder; the world file placeholders are \$ref, \$orgName, \$rel and \$minuteOfDay/.test(x.message)));

  // The three real ones still resolve.
  const ok = buildSeedPlan({
    feature: 'widgets', runId: 'r-1', project: 'p', plan: validExample('plan'), safety: makeSafety(),
    worldFiles: { design: { schemaVersion: 1, world: 'design', rows: [
      { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
      { key: 'w1', table: 'widgets', values: { organization_id: { $ref: 'org' }, owner: { $ref: 'user:admin' }, created_at: { $rel: 'now-1d' } } },
    ] } },
  });
  assert.equal(ok.rows.length, 2);
});

test('seed --check: a safe world passes, reading only; an unsafe one is refused and says why', async () => {
  const safe = await setup();
  try {
    await seedCommand.run(safe.ctx, ['--plan']);
    const exit = await seedCommand.run(safe.ctx, ['--check']);
    assert.equal(exit, 0, safe.stdout.text());
    assert.match(safe.stdout.text(), /seed check: 5 row\(s\), \d+ predicate\(s\); safe/);
    assert.deepEqual(safe.db.writes(), []);
  } finally { safe.repo.cleanup(); }
  const unsafe = await setup({ world: unsafeWorld(), db: stubDb({ guardCount: 1 }) });
  try {
    await seedCommand.run(unsafe.ctx, ['--plan']);
    assert.equal(await seedCommand.run(unsafe.ctx, ['--check']), 1);
    const out = unsafe.stdout.text();
    assert.match(out, /FAIL M13-L1 1 outbound_calls row\(s\) match sql:claim_outbound_calls\.\d \(status = queued AND release_at <= now\(\)\) now/);
    assert.match(out, /guard no-line does not hold/);
    assert.match(out, /FAIL M13-L2 1 outbound_calls\.phone_number value\(s\): phone-shaped/);
  } finally { unsafe.repo.cleanup(); }
});

test('seed --check: a holding guard accepts what it covers, and a guard the plan undermines does not hold', async () => {
  const world = unsafeWorld();
  world.rows.find((r) => r.key === 'c2').values.phone_number = '999700000009';
  const held = await setup({ world });
  try {
    await seedCommand.run(held.ctx, ['--plan']);
    assert.equal(await seedCommand.run(held.ctx, ['--check']), 0, held.stdout.text());
    assert.match(held.stdout.text(), /accepted: 1 row\(s\) matching sql:claim_outbound_calls\.\d under guard no-line/);
  } finally { held.repo.cleanup(); }
  const world2 = structuredClone(world);
  world2.rows.push({ key: 'line', table: 'org_lines', values: { organization_id: { $ref: 'org' }, channels: 2 } });
  const undermined = await setup({ world: world2, safety: { } });
  try {
    await seedCommand.run(undermined.ctx, ['--plan']);
    assert.equal(await seedCommand.run(undermined.ctx, ['--check']), 1);
    assert.match(undermined.stdout.text(), /its probe reads org_lines, which this seed plan writes/);
  } finally { undermined.repo.cleanup(); }
});

test('seed --check: a guard\'s row rule holds on the planned rows it selects, and refuses when one breaks it', async () => {
  const guards = [{
    id: 'queued-calls-are-fake', covers: ['outbound_calls:*'], why: 'every queued fixture call is to the reserved range', probes: [],
    rowRules: [{ table: 'outbound_calls', column: 'phone_number', pattern: '^999\\d{9}$', where: { status: 'queued' } }],
  }];
  const world = unsafeWorld();
  world.rows.find((r) => r.key === 'c2').values.phone_number = '999700000009';
  const held = await setup({ world, safety: { guards } });
  try {
    await seedCommand.run(held.ctx, ['--plan']);
    assert.equal(await seedCommand.run(held.ctx, ['--check']), 0, held.stdout.text());
    assert.match(held.stdout.text(), /accepted: 1 row\(s\) matching sql:claim_outbound_calls\.\d under guard queued-calls-are-fake/);
  } finally { held.repo.cleanup(); }
  const broken = await setup({ world: unsafeWorld(), safety: { guards } });
  try {
    await seedCommand.run(broken.ctx, ['--plan']);
    assert.equal(await seedCommand.run(broken.ctx, ['--check']), 1);
    assert.match(broken.stdout.text(), /guard queued-calls-are-fake does not hold \(1 outbound_calls row\(s\) break the row rule phone_number/);
  } finally { broken.repo.cleanup(); }
});

test('seed --apply: refused plans write nothing; safe plans write users then rows, then scan', async () => {
  const unsafe = await setup({ world: unsafeWorld() });
  try {
    await seedCommand.run(unsafe.ctx, ['--plan']);
    assert.equal(await seedCommand.run(unsafe.ctx, ['--apply']), 1);
    assert.match(unsafe.stdout.text(), /nothing was written/);
    assert.deepEqual(unsafe.db.writes(), []);
  } finally { unsafe.repo.cleanup(); }
  const safe = await setup();
  try {
    await seedCommand.run(safe.ctx, ['--plan']);
    assert.equal(await seedCommand.run(safe.ctx, ['--apply']), 0, safe.stdout.text());
    const writes = safe.db.writes();
    assert.equal(writes[0].op, 'createUser');
    assert.equal(writes[1].op, 'upsert');
    assert.equal(writes[1].table, 'organizations', 'the organisation before anything that names it');
    const widget = safe.db.tables.get('widgets')[0];
    assert.equal(widget.created_at, '2026-01-12T12:00:00.000Z', 'relative times resolved when written');
    assert.equal(widget.id, fixtureId('widgets', 'design', 'w1'));
    assert.match(safe.stdout.text(), /wrote 5 row\(s\) and 1 new fixture user\(s\)/);
    assert.match(safe.stdout.text(), /scan after write: \d+ row\(s\)/);
  } finally { safe.repo.cleanup(); }
});

test('the derived never-dial set leaves out numbers in the reserved fake range, which reach nobody', async () => {
  const db = createStubDb({ answers: [{ match: /from contacts/, rows: [{ phone_number: '+15550100077' }, { phone_number: '999700000431' }, { phone_number: '+999 700 000 208' }] }] });
  const got = await derivedNeverDial(db, makeSafety({ neverDialQueries: ['select phone_number from contacts'] }));
  assert.deepEqual(got.numbers, ['+15550100077']);
  assert.deepEqual(got.failures, []);
});

test('seed --apply: a production or foreign project is refused before the database is touched', async () => {
  const { repo, ctx, db } = await setup();
  try {
    await seedCommand.run(ctx, ['--plan']);
    db.calls.length = 0; // --plan itself reads CHECK constraints; what follows must touch nothing
    const plan = await readArtefact(ctx.paths, 'seedplan');
    await writeArtefact(ctx.paths, 'seedplan', { ...plan, project: 'prodprojectref' });
    await assert.rejects(seedCommand.run(ctx, ['--apply']), (err) => err.exit === 2 && err.code === 'production');
    await writeArtefact(ctx.paths, 'seedplan', { ...plan, project: 'someotherref' });
    await assert.rejects(seedCommand.run(ctx, ['--apply']), (err) => err.exit === 2 && err.code === 'project');
    assert.deepEqual(db.calls, []);
  } finally { repo.cleanup(); }
});

test('seed --scan reads the database as it is: a raw insert into a world is caught', async () => {
  const { repo, ctx, db, stdout } = await setup({ db: stubDb({ guardCount: 0 }) });
  try {
    await seedCommand.run(ctx, ['--plan']);
    assert.equal(await seedCommand.run(ctx, ['--apply']), 0);
    const org = fixtureId('widgets', 'design', 'org');
    db.tables.get('outbound_calls').push({ id: 'raw-1', organization_id: org, status: 'queued', release_at: '2026-01-15T11:00:00Z', phone_number: '05550100002' });
    db.tables.set('practice_runs', [{ id: 'raw-2', organization_id: org, status: 'queued', deferred_at: '2026-01-15T10:00:00Z', to_number: '+15550100077' }]);
    assert.equal(await seedCommand.run(ctx, ['--scan']), 1);
    const out = stdout.text();
    assert.match(out, /FAIL M13-L2 live: 1 outbound_calls\.phone_number value\(s\): phone-shaped/);
    assert.match(out, /FAIL M13-L1 live: 1 practice_runs row\(s\) match ts:jobs\.sweep\.ts#resumeRuns/);
    assert.match(out, /FAIL M13-L2 live: 1 practice_runs\.to_number value\(s\): a number in the never-dial set/, 'the derived never-dial set, from the database');
  } finally { repo.cleanup(); }
});

test('refresh re-applies one world with fresh dates; teardown deletes only rows inside the worlds', async () => {
  const { repo, ctx, db, clock } = await setup();
  try {
    await seedCommand.run(ctx, ['--plan']);
    await seedCommand.run(ctx, ['--apply']);
    clock.advance(3_600_000);
    const r = await refreshWorld(ctx, 'design');
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    assert.equal(db.tables.get('widgets')[0].created_at, '2026-01-12T13:00:00.000Z');
    assert.equal(db.writes().filter((w) => w.op === 'createUser').length, 1, 'refresh leaves users alone');
    const org = fixtureId('widgets', 'design', 'org');
    db.tables.get('widgets').push({ id: 'clicked-1', organization_id: org, state: 'idle' });
    db.tables.set('notes', [{ id: 'elsewhere-1', organization_id: 'not-a-world' }]);
    const refused = await teardownRows(ctx, [{ table: 'notes', id: 'elsewhere-1' }]);
    assert.equal(refused.ok, false);
    assert.match(refused.failures[0].message, /not in one of the run's worlds/);
    assert.equal(db.tables.get('notes').length, 1);
    const done = await teardownRows(ctx, [{ table: 'widgets', id: 'clicked-1' }]);
    assert.equal(done.ok, true, JSON.stringify(done.failures));
    assert.ok(!db.tables.get('widgets').some((w) => w.id === 'clicked-1'));
    assert.equal(await seedCommand.run(ctx, ['--teardown']), 0);
    assert.equal(db.tables.get('organizations').length, 0);
    assert.equal(db.users.size, 0);
  } finally { repo.cleanup(); }
});

// A capture refreshes a world between clicks, so a refresh has to cost seconds, not the minute and
// a half it did when every read was its own request and every row was written whatever it held.
test('refresh writes back only what changed, and every planned row ends as planned', async () => {
  const { repo, ctx, db, clock, stdout } = await setup({ db: stubDb({ batch: true }) });
  try {
    await seedCommand.run(ctx, ['--plan']);
    await seedCommand.run(ctx, ['--apply']);
    const plan = await readArtefact(ctx.paths, 'seedplan');
    const batch = db.tables.get('outbound_batches')[0];
    const org = db.tables.get('organizations')[0];

    // Nothing changed and no time passed: nothing is written, and the scan still ran whole.
    let before = db.writes().length;
    let reads = db.readRoundTrips();
    assert.equal(await seedCommand.run(ctx, ['--refresh', 'design']), 0);
    assert.equal(db.writes().length, before, 'a world already as planned is not written again');
    assert.match(stdout.text(), /rewrote 0 row\(s\); \d+ already as planned/);
    assert.ok(db.readRoundTrips() - reads <= 8, `a refresh reads in a handful of requests, not one per table (${db.readRoundTrips() - reads})`);

    // A click settled the batch and renamed the organisation; an hour passed, so the relative dates
    // moved. Exactly those rows are written, and each ends as the plan says.
    batch.status = 'cancelled';
    org.name = 'Renamed by a click';
    clock.advance(3_600_000);
    before = db.writes().length;
    assert.equal(await refreshWorld(ctx, 'design').then((g) => g.ok), true);
    const written = db.writes().slice(before).filter((w) => w.op === 'upsert').map((w) => w.table).sort();
    assert.deepEqual(written, ['organizations', 'outbound_batches', 'outbound_calls', 'widgets']);
    assert.equal(db.tables.get('outbound_batches')[0].status, 'completed');
    assert.equal(db.tables.get('organizations')[0].name, plan.rows.find((r) => r.table === 'organizations').values.name);
    assert.equal(db.tables.get('widgets')[0].created_at, '2026-01-12T13:00:00.000Z');

    // A row a click deleted comes back.
    db.tables.set('outbound_batches', []);
    assert.equal((await refreshWorld(ctx, 'design')).ok, true);
    assert.equal(db.tables.get('outbound_batches').length, 1);
  } finally { repo.cleanup(); }
});

test('refresh still refuses an unsafe row, and writes nothing', async () => {
  const { repo, ctx, db } = await setup();
  try {
    await seedCommand.run(ctx, ['--plan']);
    await seedCommand.run(ctx, ['--apply']);
    const plan = await readArtefact(ctx.paths, 'seedplan');
    plan.rows.find((r) => r.table === 'outbound_calls').values.phone_number = '05550100001';
    await writeArtefact(ctx.paths, 'seedplan', plan);
    const before = db.writes().length;
    const gate = await refreshWorld(ctx, 'design');
    assert.equal(gate.ok, false);
    assert.ok(gate.failures.some((f) => f.code === 'M13-L2'), JSON.stringify(gate.failures));
    assert.equal(db.writes().length, before, 'a refused refresh writes nothing');
  } finally { repo.cleanup(); }
});

test('no database access refuses the check (exit 2), never passes it', async () => {
  const { repo, ctx, stdout } = await setup();
  delete ctx.dataBackend;
  try {
    await seedCommand.run(ctx, ['--plan']);
    assert.equal(await seedCommand.run(ctx, ['--check']), 2);
    assert.match(stdout.text(), /FAIL M13-db the test database could not be read \(SUPABASE_ACCESS_TOKEN is not set/);
  } finally { repo.cleanup(); }
});

test('an empty seed plan passes seedCheckGate (preflight P6), and a mode is required', async () => {
  const { repo, ctx } = await setup();
  try {
    const gate = await seedCheckGate(ctx, { seedPlan: { schemaVersion: 1, runId: 'r-1', project: 'testprojectref', worlds: [], rows: [], users: [] } });
    assert.deepEqual(gate, { ok: true, failures: [] });
    await assert.rejects(seedCommand.run(ctx, []), (err) => err.exit === 2);
    await assert.rejects(seedCommand.run(ctx, ['--check', '--scan']), (err) => err.exit === 2);
  } finally { repo.cleanup(); }
});

// A membership is a join table: its key is the pair of columns it joins and it has no id column
// to derive one into. Every row used to be written with an id, so the one row a world needs to
// make its fixture users members of its organisation was the one row that could not be seeded.
test('seed --plan: a table the types show with no id column is written without one', async () => {
  const plan = validExample('plan');
  const worldFiles = { design: SAFE_WORLD };
  const built = (tablesWithoutId) => buildSeedPlan({ feature: 'widgets', runId: 'r-1', project: 'p', plan, safety: makeSafety(), worldFiles, tablesWithoutId });

  const withId = built(new Set());
  const member = withId.rows.find((r) => r.table === 'organization_members');
  assert.equal(member.idless, undefined);
  assert.equal(member.values.id, member.id);

  const idless = built(new Set(['organization_members']));
  const joined = idless.rows.find((r) => r.table === 'organization_members');
  assert.equal(joined.idless, true);
  assert.equal('id' in joined.values, false, 'no id is written into a table that has no id column');
  assert.ok(joined.id, 'the row still has a derived id, so $ref and the reports can name it');
  // Every other row is unchanged.
  assert.equal(idless.rows.find((r) => r.table === 'widgets').values.id, idless.rows.find((r) => r.table === 'widgets').id);

  const upserts = [];
  await applyRows({ createUser: async () => 'created', upsert: async (table, rows, o) => upserts.push({ table, ids: rows.map((r) => r.id ?? null), idless: Boolean(o?.idless) }) }, idless, { now: new Date(NOW) });
  const call = upserts.find((u) => u.table === 'organization_members');
  assert.deepEqual(call.ids, [null]);
  assert.equal(call.idless, true);
  assert.equal(upserts.find((u) => u.table === 'widgets').idless, false);
});

test("a world's user carries the name the design gives them, all the way to the account", async () => {
  // A design draws a person's name and the product reads it off the account, so a fixture user
  // with no name renders its own email address where the design says "Sam" -- and the state's own
  // marker is what fails, which reads as a screen bug and is a fixture with no name.
  const plan = validExample('plan');
  plan.worlds[0].users = plan.worlds[0].users.map((u) => (u.role === 'admin' ? { ...u, name: 'Sam' } : u));
  const seed = buildSeedPlan({ feature: 'widgets', runId: 'r-1', project: 'p', plan, safety: makeSafety(), worldFiles: { design: SAFE_WORLD } });
  const admin = seed.users.find((u) => u.world === plan.worlds[0].id && u.role === 'admin');
  assert.equal(admin.name, 'Sam');
  assert.equal(seed.users.find((u) => u.world === plan.worlds[0].id && u.role === 'member')?.name, undefined, 'a user the plan does not name carries no name');

  const made = [];
  await applyRows({ createUser: async (u) => { made.push(u); return 'created'; }, upsert: async () => undefined }, seed, { now: new Date(NOW) });
  assert.equal(made.find((u) => u.email === admin.email).name, 'Sam');
});

test('A1: a world missing one row a state needs makes seed --check name that state and exit non-zero', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    const plan = validExample('plan');
    const states = [
      { id: 'KC-05', reach: { world: 'design' }, data: [{ table: 'widgets', where: { state: 'idle' }, min: 2 }] },
      { id: 'KC-06', reach: { world: 'design' }, data: [{ table: 'widgets', where: { state: 'idle' }, min: 1 }] },
      { id: 'KC-07', reach: { world: 'design' } },
    ];
    writeFileSync(join(repo.dir, 'docs/delivery/widgets/map.json'), JSON.stringify({ worlds: plan.worlds, states }));
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    const exit = await seedCommand.run(ctx, ['--check']);
    assert.equal(exit, 1);
    assert.match(stdout.text(), /state KC-05: widgets where state = "idle" wants at least 2, found 1/);
    assert.doesNotMatch(stdout.text(), /state KC-06|state KC-07/);
  } finally { repo.cleanup(); }
});

test('A2: seed --plan lists tables no guard covers, and refuses a world value outside a CHECK list', async () => {
  const db = createStubDb({ checks: [{ table_name: 'widgets', definition: "CHECK ((state IN ('busy', 'done')))" }] });
  const { repo, ctx, stdout } = await setup({ db });
  try {
    const exit = await seedCommand.run(ctx, ['--plan']);
    assert.equal(exit, 1);
    assert.match(stdout.text(), /widgets\.state = "idle".*is not one of busy, done/);
    assert.match(stdout.text(), /guards to approve/);
  } finally { repo.cleanup(); }
});

// Stable picture data, fix 2: every value the data contract labels "data" has a row behind it, and
// the fixture user carries the design's name, before anything is written.
test('seed --check: a contract data value no world holds, or an unlabelled text, refuses the plan', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    const worlds = validExample('plan').worlds;
    worlds[0].users[0].name = 'Sam Kariuki';
    writeFileSync(join(repo.dir, 'docs/delivery/widgets/map.json'), JSON.stringify({ worlds, states: [{ id: 'W-01', reach: { world: 'design', role: 'admin', steps: [] } }] }));
    const contract = (texts) => writeFileSync(join(repo.dir, 'docs/delivery/widgets/contract.json'), JSON.stringify({ schemaVersion: 1, states: { 'W-01': { texts } } }));
    const held = [
      { text: 'idle', label: 'data', table: 'widgets', column: 'state' },
      { text: 'Sam Kariuki', label: 'data', user: 'admin' },
      { text: '1 widget', label: 'data', kind: 'count', table: 'widgets', value: '1' },
      { text: 'Widgets', label: 'fixed' },
    ];
    contract([...held, { text: 'busy', label: 'data', table: 'widgets', column: 'state' }, { text: 'New', label: null }]);
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    assert.equal(await seedCommand.run(ctx, ['--check']), 1);
    const out = stdout.text();
    assert.match(out, /FAIL M13-contract state W-01 shows "busy": no widgets row has state = "busy" \(world design\)/);
    assert.match(out, /FAIL M13-contract 1 text\(s\) of the contract are not labelled yet/);
    contract(held);
    assert.equal(await seedCommand.run(ctx, ['--check']), 0, stdout.text());
  } finally { repo.cleanup(); }
});

// W3 item 4: seed --plan checks every world value against the generated database types, then the
// Json values against the profile's commands.validateSeedJson, and refuses on either.
const TYPES_FILE = 'packages/types/src/database.ts';
const putTypes = (repo, text) => { mkdirSync(join(repo.dir, 'packages/types/src'), { recursive: true }); writeFileSync(join(repo.dir, TYPES_FILE), text); };
const typesFor = (widgetColumns) => `export type Database = { public: { Tables: {
  organizations: { Row: { id: string; name: string } }
  organization_members: { Row: { id: string; organization_id: string; user_id: string; role: string } }
  widgets: { Row: { id: string; organization_id: string; ${widgetColumns} } }
  outbound_batches: { Row: { id: string; organization_id: string; status: string } }
  outbound_calls: { Row: { id: string; organization_id: string; batch_id: string; status: string; release_at: string; phone_number: string } }
} } }`;
const WIDGET_COLUMNS = 'state: string; created_at: string; contact_phone: string | null; settings: Json | null';

test('W3: seed --plan refuses a column the types lack and a value of the wrong kind, and passes once they fit', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    putTypes(repo, typesFor('state: number; created_at: string'));
    assert.equal(await seedCommand.run(ctx, ['--plan']), 1);
    assert.match(stdout.text(), /FAIL seed-plan-type world design: widgets\.contact_phone does not exist in database\.types\.ts/);
    assert.match(stdout.text(), /FAIL seed-plan-type world design: widgets\.state is number, and a string does not fit it/);
    putTypes(repo, typesFor(WIDGET_COLUMNS));
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0, stdout.text());
  } finally { repo.cleanup(); }
});

test('W3: seed --plan gives a Json column to commands.validateSeedJson and refuses what it reports; a broken one only notes', async () => {
  const world = structuredClone(SAFE_WORLD);
  world.rows.find((r) => r.key === 'w1').values.settings = { theme: 'dark' };
  const { repo, ctx, stdout } = await setup({ world });
  try {
    putTypes(repo, typesFor(WIDGET_COLUMNS));
    const profile = await ctx.profile();
    profile.commands = { ...profile.commands, validateSeedJson: `node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s).entries[0];console.log(JSON.stringify({problems:[{world:e.world,table:e.table,row:e.row,column:e.column,message:'no headline'}]}));process.exit(1)})"` };
    assert.equal(await seedCommand.run(ctx, ['--plan']), 1);
    assert.match(stdout.text(), /FAIL seed-plan-json widgets\.settings \(world design, row .+\): no headline/);
    profile.commands.validateSeedJson = 'echo not json';
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0, stdout.text());
    assert.match(stdout.text(), /note: commands\.validateSeedJson did not print JSON/);
  } finally { repo.cleanup(); }
});
