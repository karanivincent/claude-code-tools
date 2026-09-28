// Forward references: two tables that name each other (a script's live version, a version's
// script), on a stub database that enforces plain foreign keys. Whichever row comes first names a
// row not yet written, so the plan writes that column as null and sets it once every row is there;
// a re-seed stays a no-op, and teardown clears the column before it deletes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { readArtefact } from '../../lib/core/artefacts.mjs';
import seedCommand from '../../lib/commands/seed.mjs';
import { buildSeedPlan, fixtureId } from '../../lib/seed/plan.mjs';
import { applyRows } from '../../lib/seed/apply.mjs';
import { plannedRowsNow } from '../../lib/seed/db.mjs';
import { createStubDb } from './stub-db.mjs';
import { WORKER_FILES } from '../sidefx/fixtures.mjs';

const NOW = '2026-01-15T12:00:00.000Z';
const WORKERS = { tsGlobs: ['apps/server/src/jobs/**/*.ts'], sqlGlobs: ['db/migrations/*.sql'] };
const FOREIGN_KEYS = [
  { table: 'call_scripts', column: 'live_version_id', references: 'call_script_versions' },
  { table: 'call_script_versions', column: 'script_id', references: 'call_scripts' },
  { table: 'call_scripts', column: 'organization_id', references: 'organizations' },
  { table: 'call_script_versions', column: 'organization_id', references: 'organizations' },
];

const WORLD = {
  schemaVersion: 1,
  world: 'design',
  rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } },
    { key: 's1', table: 'call_scripts', values: { organization_id: { $ref: 'org' }, name: 'Renewals', live_version_id: { $ref: 'v1' } } },
    { key: 'v1', table: 'call_script_versions', values: { organization_id: { $ref: 'org' }, script_id: { $ref: 's1' }, body: 'Hello' } },
  ],
};

const id = (key) => fixtureId('widgets', 'design', key);

function plan(world = WORLD, extra = {}) {
  return buildSeedPlan({ feature: 'widgets', runId: 'r-1', project: 'p', plan: validExample('plan'), safety: makeSafety(), worldFiles: { design: world }, ...extra });
}

function stubDb() {
  return createStubDb({
    foreignKeys: FOREIGN_KEYS,
    answers: [
      { match: /from org_phone_numbers/, rows: [{ phone_number: '+15550100077' }] },
      { match: /country_for_phone_number/, rows: [{ country_for_phone_number: null }] },
      { match: /from org_lines/, rows: () => [{ count: 0 }] },
    ],
  });
}

async function setup() {
  const repo = makeTempRepo({
    files: { ...WORKER_FILES, 'docs/delivery/widgets/plan.json': validExample('plan'), 'docs/delivery/widgets/worlds/design.json': WORLD },
  });
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const t = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ workers: WORKERS }),
    passthrough: ['git'], clock: fakeClock(NOW),
  });
  const db = stubDb();
  t.ctx.dataBackend = db;
  return { repo, db, ...t };
}

test('a $ref to a row written later is planned as null, with the id it names kept as deferred', () => {
  const p = plan();
  const script = p.rows.find((r) => r.table === 'call_scripts');
  const version = p.rows.find((r) => r.table === 'call_script_versions');
  assert.equal(script.values.live_version_id, null);
  assert.deepEqual(script.deferred, { live_version_id: id('v1') });
  assert.equal(script.values.organization_id, id('org'), 'the organisation is written first, so it is never a forward reference');
  assert.equal(version.values.script_id, id('s1'), 'a reference to an earlier row is written with its row');
  assert.equal(version.deferred, undefined);
  assert.equal(p.rows.find((r) => r.table === 'organizations').deferred, undefined);
});

test('a forward reference nested in a column defers the whole column; a join row may not have one', () => {
  const world = structuredClone(WORLD);
  world.rows[2].values.settings = { fallback: [{ $ref: 'v1' }], tone: 'warm' };
  const script = plan(world).rows.find((r) => r.table === 'call_scripts');
  assert.equal(script.values.settings, null);
  assert.deepEqual(script.deferred.settings, { fallback: [id('v1')], tone: 'warm' });

  const joined = structuredClone(WORLD);
  joined.rows.splice(1, 0, { key: 'tag', table: 'script_tags', values: { organization_id: { $ref: 'org' }, script_id: { $ref: 's1' } } });
  assert.throws(() => plan(joined, { tablesWithoutId: new Set(['script_tags']) }), (err) => err.exit === 2
    && err.failures.some((f) => /row "tag": script_id names a row written after it, and a script_tags row has no id to set it by later/.test(f.message)));
});

test('a $ref naming no row is still refused at plan time', () => {
  const world = structuredClone(WORLD);
  world.rows[2].values.live_version_id = { $ref: 'v9' };
  assert.throws(() => plan(world), (err) => err.exit === 2
    && err.failures.some((f) => /\$ref "v9" names no row of this world/.test(f.message)));
});

test('the stub refuses a forward reference written with its row, as the database does', async () => {
  const db = stubDb();
  await db.upsert('organizations', [{ id: id('org'), name: 'x' }]);
  await assert.rejects(db.upsert('call_scripts', [{ id: id('s1'), organization_id: id('org'), live_version_id: id('v1') }]), /violates foreign key/);
  assert.equal((db.tables.get('call_scripts') ?? []).length, 0, 'a refused write leaves nothing behind');
});

test('apply writes every row, then sets the forward references; a re-apply against what is there writes nothing', async () => {
  const db = stubDb();
  const p = plan();
  const now = new Date(NOW);
  const first = await applyRows(db, p, { now, users: false });
  assert.equal(first.deferred, 1);
  const writes = db.writes().map((w) => `${w.op} ${w.table}`);
  assert.deepEqual(writes, ['upsert organizations', 'upsert organization_members', 'upsert call_scripts', 'upsert call_script_versions', 'update call_scripts']);
  assert.equal(db.tables.get('call_scripts')[0].live_version_id, id('v1'));
  assert.equal(db.tables.get('call_script_versions')[0].script_id, id('s1'));

  const before = db.writes().length;
  const live = await plannedRowsNow(db, p.rows);
  const again = await applyRows(db, p, { now, users: false, live });
  assert.equal(db.writes().length, before, 'a world already as planned is not written again');
  assert.equal(again.deferred, 0);
  assert.equal(again.unchanged, p.rows.length);

  // A click pointed the script at another version: the row is written again and its reference set back.
  db.tables.get('call_scripts')[0].live_version_id = null;
  const fixed = await applyRows(db, p, { now, users: false, live: await plannedRowsNow(db, p.rows) });
  assert.equal(fixed.rows, 1);
  assert.equal(fixed.deferred, 1);
  assert.equal(db.tables.get('call_scripts')[0].live_version_id, id('v1'));
});

test('seed --apply, --refresh and --teardown with the two tables naming each other', async () => {
  const { repo, ctx, db, stdout } = await setup();
  try {
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    const p = await readArtefact(ctx.paths, 'seedplan');
    assert.deepEqual(p.rows.find((r) => r.table === 'call_scripts').deferred, { live_version_id: id('v1') }, 'seedplan.json carries deferred and still validates');
    assert.equal(await seedCommand.run(ctx, ['--apply']), 0, stdout.text());
    assert.match(stdout.text(), /then set the forward references of 1 row\(s\)/);
    assert.equal(db.tables.get('call_scripts')[0].live_version_id, id('v1'));

    const before = db.writes().length;
    assert.equal(await seedCommand.run(ctx, ['--refresh', 'design']), 0, stdout.text());
    assert.equal(db.writes().length, before, 'a refresh of a world already as planned writes nothing');

    assert.equal(await seedCommand.run(ctx, ['--apply']), 0, 'a second apply succeeds too');
    assert.equal(db.tables.get('call_scripts')[0].live_version_id, id('v1'));

    assert.equal(await seedCommand.run(ctx, ['--teardown']), 0, stdout.text());
    assert.equal(db.tables.get('call_scripts').length, 0);
    assert.equal(db.tables.get('call_script_versions').length, 0);
    assert.equal(db.tables.get('organizations').length, 0);
  } finally { repo.cleanup(); }
});
