// Stable picture data, fixes 7 and 9: global dependencies hashed at seed time (R7), a table the
// worlds write that changed mid-run, and another fixture organisation with one of this run's names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  changedGlobals, globalKey, globalReads, hashRows, orgNames, readGlobalHashes, schemaChangeMessage, schemaChanges, tableShapes, textArraySql,
} from '../../lib/seed/drift.mjs';
import { buildSeedPlan } from '../../lib/seed/plan.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import seedCommand from '../../lib/commands/seed.mjs';
import { createStubDb, guardsWithFixtureTables } from './stub-db.mjs';
import { WORKER_FILES } from '../sidefx/fixtures.mjs';

test('hashRows ignores row and key order; textArraySql quotes any text', () => {
  assert.equal(hashRows([{ a: 1, b: 2 }, { a: 3 }]), hashRows([{ a: 3 }, { b: 2, a: 1 }]));
  assert.notEqual(hashRows([{ a: 1 }]), hashRows([{ a: 2 }]));
  assert.equal(textArraySql(["Delivery fixture · O'Neil"]), "array['Delivery fixture · O''Neil']::text[]");
});

test('R7: a world\'s globals are read by table or by id, skipped when not plain, and a change since seeding is named', async () => {
  const plan = { worlds: [
    { id: 'design', globals: [{ table: 'voices' }, { table: 'plan_settings', ids: ['b', 'a'] }, { table: 'Bad Table' }, { table: 'x', ids: ["1'; drop"] }] },
    { id: 'messy' },
  ] };
  const reads = globalReads(plan);
  assert.deepEqual(reads.map((r) => r.key), ['voices', 'plan_settings:a,b']);
  assert.equal(reads[1].sql, `select * from public."plan_settings" where id::text = any('{b,a}')`);
  assert.equal(globalKey({ table: 'voices' }), 'voices');
  const db = createStubDb({ tables: { voices: [{ id: 'v1', name: 'Amani' }] }, answers: [{ match: /from public\."voices"$/, rows: [{ id: 'v1', name: 'Amani' }] }, { match: /plan_settings/, rows: [] }] });
  const hashes = await readGlobalHashes({ queryMany: undefined, query: (sql) => db.query(sql) }, plan);
  const recorded = { worlds: { design: { at: '2026-01-15T12:00:00Z', tables: hashes.design } } };
  assert.deepEqual(changedGlobals(recorded, hashes), []);
  const later = { design: { ...hashes.design, voices: hashRows([{ id: 'v1', name: 'Baraka' }]) } };
  assert.deepEqual(changedGlobals(recorded, later), [{ world: 'design', key: 'voices', since: '2026-01-15T12:00:00Z' }]);
});

test('a world file\'s globals travel into the seed plan', () => {
  const worldFiles = { design: { schemaVersion: 1, world: 'design', globals: [{ table: 'voices' }], rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'm', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' } } },
  ] } };
  const plan = buildSeedPlan({ feature: 'widgets', runId: 'r-1', project: 'p', plan: validExample('plan'), worldFiles, safety: makeSafety() });
  assert.deepEqual(plan.worlds[0].globals, [{ table: 'voices' }]);
});

test('fix 9: a planned table whose columns changed is named with what changed and the worlds that write it', () => {
  const cols = (t, names) => names.map((c) => ({ table_name: t, column_name: c, data_type: 'text', is_nullable: 'YES', column_default: null }));
  const before = tableShapes([...cols('calls', ['id', 'status']), ...cols('other', ['id'])], ['calls']);
  assert.deepEqual(Object.keys(before), ['calls']);
  const plan = { schema: before, rows: [{ world: 'design', table: 'calls' }, { world: 'messy', table: 'calls' }] };
  assert.deepEqual(schemaChanges(plan, before), []);
  const after = tableShapes(cols('calls', ['id', 'status', 'failure_reason']), ['calls']);
  const [c] = schemaChanges(plan, after);
  assert.deepEqual([c.table, c.added, c.removed, c.worlds], ['calls', ['failure_reason'], [], ['design', 'messy']]);
  assert.match(schemaChangeMessage(c), /table calls changed since seed --plan \(columns added: failure_reason\); worlds design, messy write it/);
});

test('orgNames finds each world\'s organisation row and the column its fixture name is in', () => {
  const plan = { worlds: [{ id: 'design', orgId: 'o1' }], rows: [{ id: 'o1', table: 'organizations', values: { id: 'o1', name: 'Delivery fixture · Scripts', plan: 'free' } }] };
  assert.deepEqual(orgNames(plan, 'Delivery fixture · '), [{ world: 'design', table: 'organizations', id: 'o1', column: 'name', name: 'Delivery fixture · Scripts' }]);
});

const SAFE_WORLD = {
  schemaVersion: 1,
  world: 'design',
  rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } },
    { key: 'w1', table: 'widgets', values: { organization_id: { $ref: 'org' }, state: 'idle', created_at: { $rel: 'now-3d' } } },
  ],
};

async function setup(answers) {
  const repo = makeTempRepo({ files: {
    ...WORKER_FILES,
    'docs/delivery/widgets/plan.json': validExample('plan'),
    'docs/delivery/widgets/worlds/design.json': SAFE_WORLD,
  } });
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const t = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(),
    safety: makeSafety({ workers: { tsGlobs: ['apps/server/src/jobs/**/*.ts'], sqlGlobs: ['db/migrations/*.sql'] }, guards: guardsWithFixtureTables(makeSafety()) }),
    passthrough: ['git'], clock: fakeClock('2026-01-15T12:00:00.000Z'),
  });
  const state = { answers };
  t.ctx.dataBackend = createStubDb({ answers: [
    { match: /from org_phone_numbers/, rows: [{ phone_number: '+15550100077' }] },
    { match: /country_for_phone_number/, rows: [{ country_for_phone_number: null }] },
    { match: /from org_lines/, rows: () => [{ count: 0 }] },
    { match: /column_default from information_schema\.columns/, rows: () => state.answers.columns },
    { match: /as name from public\."organizations"/, rows: () => state.answers.orgs },
    { match: /^select \* from public\."widgets"$/, rows: [{ id: 'w', state: 'idle' }] },
  ] });
  return { repo, state, ...t };
}

const COLS = (extra = []) => ['id', 'organization_id', 'state', 'created_at', ...extra].map((c) => ({ table_name: 'widgets', column_name: c, data_type: 'text', is_nullable: 'YES', column_default: null }));

test('seed --plan records the planned tables\' columns; seed --check refuses once a migration changed one, and passes after a new plan', async () => {
  const { repo, state, ctx, stdout } = await setup({ columns: COLS(), orgs: [] });
  try {
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    assert.equal(await seedCommand.run(ctx, ['--check']), 0, stdout.text());
    state.answers.columns = COLS(['failure_reason']);
    assert.equal(await seedCommand.run(ctx, ['--check']), 1);
    assert.match(stdout.text(), /FAIL M13-schema table widgets changed since seed --plan \(columns added: failure_reason\); worlds design write it/);
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0);
    assert.equal(await seedCommand.run(ctx, ['--check']), 0);
  } finally { repo.cleanup(); }
});

test('seed --check refuses when another fixture organisation has this world\'s name', async () => {
  const { repo, state, ctx, stdout } = await setup({ columns: COLS(), orgs: [] });
  try {
    await seedCommand.run(ctx, ['--plan']);
    state.answers.orgs = [{ id: 'someone-elses-org', name: 'Delivery fixture · widgets design' }];
    assert.equal(await seedCommand.run(ctx, ['--check']), 1);
    assert.match(stdout.text(), /FAIL M13-owner world design's organisation "Delivery fixture · widgets design" has the same name as fixture organisation someone-elses-org/);
  } finally { repo.cleanup(); }
});

test('seed --apply records the worlds\' global dependencies in globals.json', async () => {
  const { repo, ctx, stdout } = await setup({ columns: COLS(), orgs: [] });
  try {
    writeFileSync(join(repo.dir, 'docs/delivery/widgets/worlds/design.json'), JSON.stringify({ ...SAFE_WORLD, globals: [{ table: 'widgets' }] }));
    await seedCommand.run(ctx, ['--plan']);
    assert.equal(await seedCommand.run(ctx, ['--apply']), 0, stdout.text());
    assert.match(stdout.text(), /recorded 1 global dependenc\(ies\)/);
    const { readRecordedGlobals } = await import('../../lib/seed/drift.mjs');
    const g = await readRecordedGlobals(ctx.paths);
    assert.ok(g.worlds.design.tables.widgets);
  } finally { repo.cleanup(); }
});

