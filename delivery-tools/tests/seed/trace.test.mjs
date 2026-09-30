// W3 item 3, D13: world rows built from the data contract (seed --from-trace), the safety swaps it
// records, and the one-line answer to `seed --need`. The pure functions first, then the command on a
// temporary repo.
import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import seedCommand from '../../lib/commands/seed.mjs';
import { contractGaps } from '../../lib/picture/contract.mjs';
import { parseColumnTypes } from '../../lib/seed/validate.mjs';
import {
  addNeed, answerNeed, closeNeeds, columnValueFor, needsPath, openNeeds, readNeeds, readSwaps, relativeOf, swapsPath, traceWorld,
} from '../../lib/seed/trace.mjs';
import { createStubDb, guardsWithFixtureTables } from './stub-db.mjs';
import { WORKER_FILES } from '../sidefx/fixtures.mjs';

const NOW = new Date('2026-01-15T12:00:00.000Z');
const PREFIX = 'Delivery fixture · ';

// ---------------------------------------------------------------------------------------------
// relativeOf and columnValueFor
// ---------------------------------------------------------------------------------------------

test('relativeOf: a relative time text becomes a now marker, a fixed day becomes null', () => {
  assert.equal(relativeOf('2 min ago'), 'now-2m');
  assert.equal(relativeOf('3 hours ago'), 'now-3h');
  assert.equal(relativeOf('yesterday'), 'now-1d');
  assert.equal(relativeOf('in 5 days'), 'now+5d');
  assert.equal(relativeOf('Tue 14 Oct'), null);
  assert.equal(relativeOf(undefined), null);
});

const TYPES = parseColumnTypes(`export type Database = { public: {
  Tables: {
    members: { Row: { id: string; organization_id: string; name: string; email: string; role: Database["public"]["Enums"]["member_role"]; status: Database["public"]["Enums"]["member_status"]; seats: number; active: boolean; joined_at: string; extra: string; note: string | null } }
    organizations: { Row: { id: string; name: string } }
  }
  Enums: { member_role: "owner" | "admin"; member_status: "in_progress" | "done" }
} }`);

test('columnValueFor: an enum column gets its own literal, a number column a number, a boolean column a boolean', () => {
  const t = (col) => TYPES.get('members').get(col);
  assert.equal(columnValueFor('Owner', t('role'), TYPES.enums), 'owner');
  assert.equal(columnValueFor('In progress', t('status'), TYPES.enums), 'in_progress');
  assert.equal(columnValueFor('Unknown thing', t('role'), TYPES.enums), 'Unknown thing', 'no literal matches: the text is kept');
  assert.equal(columnValueFor('1,234', t('seats'), TYPES.enums), 1234);
  assert.equal(columnValueFor('Yes', t('active'), TYPES.enums), true);
  assert.equal(columnValueFor('off', t('active'), TYPES.enums), false);
  assert.equal(columnValueFor('12', t('name'), TYPES.enums), '12', 'a string column keeps a number-looking text as text');
});

test('columnValueFor: without types a plain number string becomes a number and other text stays', () => {
  assert.equal(columnValueFor('42', undefined, undefined), 42);
  assert.equal(columnValueFor('4.5', null, null), 4.5);
  assert.equal(columnValueFor('1,234', undefined, undefined), '1,234');
  assert.equal(columnValueFor('Owner', undefined, undefined), 'Owner');
});

// ---------------------------------------------------------------------------------------------
// traceWorld
// ---------------------------------------------------------------------------------------------

const ADMIN_EMAIL = 'delivery+widgets-design-admin@example.invalid';
const MEMBER_EMAIL = 'delivery+widgets-design-member@example.invalid';

function mapFor() {
  return {
    worlds: [
      { id: 'design', kind: 'design', orgName: 'Acme', users: [{ role: 'admin', email: ADMIN_EMAIL, name: 'Sam Kariuki' }, { role: 'member', email: MEMBER_EMAIL }] },
      { id: 'other', kind: 'design', orgName: 'Other', users: [] },
    ],
    states: [
      { id: 'W-01', reach: { world: 'design' } },
      { id: 'W-02', reach: { world: 'design' } },
      { id: 'W-03', reach: { world: 'design' } },
      { id: 'O-01', reach: { world: 'other' } },
    ],
  };
}

const data = (text, table, column, row, extra = {}) => ({ text, label: 'data', table, column, ...(row ? { row } : {}), ...extra });

function contractFor() {
  return {
    schemaVersion: 1,
    states: {
      'W-01': { texts: [
        data('Acme Corp', 'organizations', 'name', 'org'),
        data('Amina Otieno', 'members', 'name', 'm-1'),
        data('amina@acme.com', 'members', 'email', 'm-1'),
        data('Owner', 'members', 'role', 'm-1'),
        data('1,234', 'members', 'seats', 'm-1'),
        data('Yes', 'members', 'active', 'm-1'),
        data('2 min ago', 'members', 'joined_at', 'm-1', { kind: 'time' }),
        data('Brian Mutua', 'members', 'name', 'm-2'),
        data('Admin', 'members', 'role', 'm-2'),
        data('Tue 14 Oct', 'members', 'joined_at', 'm-2', { kind: 'date' }),
        data('Sam Kariuki', 'members', 'name', 'm-3'),
        data('sam@acme.com', 'members', 'email', 'm-3'),
        data('Hand Written', 'members', 'name', 'h-1'),
        data('Orphan', 'members', 'name'),
        data('8 calls', 'calls', undefined, undefined, { kind: 'count', value: '8', where: { status: 'done' } }),
        { text: 'Jo Wanjiru', label: 'data', user: 'member' },
        { text: 'Sam Kariuki', label: 'data', user: 'admin' },
        { text: 'Save', label: 'fixed' },
        { text: 'New text', label: null },
      ] },
      'W-02': { texts: [
        data('Amina Otieno', 'members', 'name', 'm-1'), // same value again: no conflict
        data('Admin', 'members', 'role', 'm-1'), // Owner in W-01: a conflict
      ] },
      'W-03': { inconsistent: 'the header says 6 and the list shows 8', texts: [data('Ghost', 'members', 'name', 'm-9')] },
      'O-01': { texts: [data('Other Person', 'members', 'name', 'o-1')] },
    },
  };
}

function worldFileFor() {
  return {
    schemaVersion: 1,
    world: 'design',
    rows: [
      { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
      { key: 'hand-1', table: 'members', values: { name: 'Hand Written', organization_id: { $ref: 'org' } } },
      { key: 't-m-1', table: 'members', values: { name: 'Stale' } },
      { key: 't-m-old', table: 'members', values: { name: 'No longer in the design' } },
    ],
  };
}

const trace = (o = {}) => traceWorld({
  contract: contractFor(), map: mapFor(), worldId: 'design', worldFile: worldFileFor(), safety: makeSafety(), types: TYPES, now: NOW, ...o,
});

test('traceWorld: values with one row key become one row, columns merged across states, by the column types', () => {
  const r = trace();
  const m1 = r.rows.find((x) => x.key === 't-m-1');
  assert.equal(m1.table, 'members');
  assert.deepEqual(m1.values, {
    name: 'Amina Otieno',
    email: 'amina@example.invalid',
    role: 'owner', // the first state's value; the second state's "Admin" is a need
    seats: 1234,
    active: true,
    joined_at: { $rel: 'now-2m' },
    organization_id: { $ref: 'org' },
  });
  const m2 = r.rows.find((x) => x.key === 't-m-2');
  assert.equal(m2.values.name, 'Brian Mutua');
  assert.equal(m2.values.role, 'admin');
  assert.equal(r.rows.filter((x) => x.table === 'members' && x.key.startsWith('t-')).length, 2, 'one row per (table, row)');
  assert.equal(r.rows.some((x) => x.values.name === 'Ghost' || x.values.name === 'Other Person'), false, 'an inconsistent state and another world add nothing');
});

test('traceWorld: what it cannot infer is a need line, never a guess', () => {
  const r = trace();
  assert.ok(r.needs.some((n) => /row m-1 \(members\): role is "Owner" in one state and "Admin" in another; the first was used/.test(n)), r.needs.join('\n'));
  assert.ok(r.needs.some((n) => /W-01: "Orphan" \(members\.name\) has no row key, so no row was built for it/.test(n)), r.needs.join('\n'));
  assert.ok(r.needs.some((n) => /row m-2 \(members\.joined_at\): the design shows a fixed day \("Tue 14 Oct"\)/.test(n)), r.needs.join('\n'));
  assert.ok(r.needs.some((n) => /row m-1 \(members\): the design does not show .*\bextra\b/.test(n)), 'a required column the design does not show is listed');
  assert.equal(r.needs.some((n) => /note/.test(n)), false, 'a nullable column is not asked for');
  assert.equal(r.needs.some((n) => /8 calls/.test(n)), false, 'a count is met by rows, never asked for');
});

test('traceWorld: an absolute date is written at the shoot\'s moment', () => {
  const r = trace();
  assert.deepEqual(r.rows.find((x) => x.key === 't-m-2').values.joined_at, { $rel: 'now' });
});

test('traceWorld: a count entry never produces rows', () => {
  const r = trace();
  assert.equal(r.rows.some((x) => x.table === 'calls'), false);
});

test('traceWorld: a row that is a fixture user is skipped and its email swapped to that user\'s own', () => {
  const r = trace();
  assert.equal(r.rows.some((x) => x.key === 't-m-3'), false);
  assert.ok(r.skipped.some((s) => /^m-3: the admin fixture user/.test(s)), r.skipped.join('\n'));
  assert.equal(r.swaps['sam@acme.com'], ADMIN_EMAIL);
});

test('traceWorld: another email is swapped to local@<the fake domain>, and the org name to the fixture prefix', () => {
  const r = trace();
  assert.equal(r.swaps['amina@acme.com'], 'amina@example.invalid');
  assert.equal(r.swaps['Acme Corp'], `${PREFIX}Acme`);
  assert.equal(r.rows.some((x) => x.values?.name === 'Acme Corp'), false, 'the organisation is never rebuilt from the design');
  const custom = trace({ safety: makeSafety({ fakeEmailDomain: 'fake.test' }) });
  assert.equal(custom.swaps['amina@acme.com'], 'amina@fake.test');
  // A design email that is already a fixture address needs no swap.
  const c = contractFor();
  c.states['W-01'].texts.push(data(MEMBER_EMAIL, 'members', 'email', 'm-2'));
  const kept = trace({ contract: c });
  assert.equal(kept.swaps[MEMBER_EMAIL], undefined);
  assert.equal(kept.rows.find((x) => x.key === 't-m-2').values.email, MEMBER_EMAIL);
});

test('traceWorld: a world with no org row swaps nothing for the org name and asks for the types when they are unreadable', () => {
  const r = trace({ worldFile: null, types: null });
  assert.equal(r.swaps['Acme Corp'], undefined);
  assert.ok(r.needs.some((n) => /the database types are not readable/.test(n)), r.needs.join('\n'));
  const m1 = r.rows.find((x) => x.key === 't-m-1');
  assert.equal(m1.values.organization_id, undefined);
  assert.equal(m1.values.seats, '1,234', 'without types a number with a comma stays text');
  assert.equal(m1.values.role, 'Owner');
});

test('traceWorld: hand-written rows are kept, earlier t- rows are replaced, and a group the hand rows hold is skipped', () => {
  const r = trace();
  assert.ok(r.rows.some((x) => x.key === 'org'));
  assert.deepEqual(r.rows.find((x) => x.key === 'hand-1').values, { name: 'Hand Written', organization_id: { $ref: 'org' } });
  assert.equal(r.rows.some((x) => x.key === 't-m-old'), false, 'an earlier t- row the design no longer shows is dropped');
  assert.equal(r.rows.find((x) => x.key === 't-m-1').values.name, 'Amina Otieno', 'an earlier t- row is rebuilt');
  assert.equal(r.rows.some((x) => x.key === 't-h-1'), false, 'the hand row already holds "Hand Written"');
  assert.ok(r.skipped.some((s) => /^t-h-1: the world already holds it/.test(s)), r.skipped.join('\n'));
  assert.deepEqual([r.added, r.replaced, r.kept], [1, 1, 2]);
  // Run again on its own output: nothing is added twice.
  const again = trace({ worldFile: { schemaVersion: 1, world: 'design', rows: r.rows } });
  assert.deepEqual(again.rows, r.rows);
  assert.deepEqual([again.added, again.replaced, again.kept], [0, 2, 2]);
});

test('traceWorld: a fixture user without a name gets the design\'s, one that has a name is left alone', () => {
  const r = trace();
  assert.deepEqual(r.userNames, { member: 'Jo Wanjiru' });
});

test('traceWorld: a world the map does not have throws', () => {
  assert.throws(() => trace({ worldId: 'nope' }), /the map has no world "nope"/);
});

// ---------------------------------------------------------------------------------------------
// answerNeed
// ---------------------------------------------------------------------------------------------

const needMap = { worlds: mapFor().worlds, states: mapFor().states };
const needContract = {
  states: {
    'W-01': { texts: [
      data('Amina Otieno', 'members', 'name', 'm-1'),
      data('amina@acme.com', 'members', 'email', 'm-1'),
      { text: 'Save', label: 'fixed' },
    ] },
  },
};
const planWith = (rows) => ({ rows: rows.map((r) => ({ world: 'design', ...r })), users: [] });

test('answerNeed: held when a contract value of the state matches and the seed plan holds it', () => {
  const a = answerNeed({ contract: needContract, map: needMap, seedPlan: planWith([{ table: 'members', values: { name: 'Amina Otieno' } }]), state: 'W-01', need: 'Amina Otieno', now: NOW });
  assert.equal(a.world, 'design');
  assert.equal(a.held, true);
  assert.deepEqual(a.matched, [{ text: 'Amina Otieno', ok: true }]);
  // A swapped value is held under the safe value.
  const b = answerNeed({
    contract: needContract, map: needMap, seedPlan: planWith([{ table: 'members', values: { email: 'amina@example.invalid' } }]),
    state: 'W-01', need: 'amina@acme.com', now: NOW, swaps: { design: { 'amina@acme.com': 'amina@example.invalid' } },
  });
  assert.equal(b.held, true);
});

test('answerNeed: a matched value the plan lacks is not held, and says why', () => {
  const a = answerNeed({ contract: needContract, map: needMap, seedPlan: planWith([{ table: 'members', values: { name: 'Someone Else' } }]), state: 'W-01', need: 'Amina Otieno', now: NOW });
  assert.equal(a.held, false);
  assert.equal(a.matched.length, 1);
  assert.equal(a.matched[0].ok, false);
  assert.match(a.matched[0].why, /no members row has name = "Amina Otieno"/);
});

test('answerNeed: no contract value matches, or no seed plan, is not held with nothing matched', () => {
  const rows = planWith([{ table: 'members', values: { name: 'Amina Otieno' } }]);
  assert.deepEqual(answerNeed({ contract: needContract, map: needMap, seedPlan: rows, state: 'W-01', need: 'zebra crossing', now: NOW }), { world: 'design', held: false, matched: [] });
  assert.deepEqual(answerNeed({ contract: needContract, map: needMap, seedPlan: null, state: 'W-01', need: 'Amina', now: NOW }), { world: 'design', held: false, matched: [] });
  assert.deepEqual(answerNeed({ contract: null, map: needMap, seedPlan: rows, state: 'W-01', need: 'Amina', now: NOW }), { world: 'design', held: false, matched: [] });
});

test('answerNeed: a number in the request must match a value\'s number whole, so "40 seats" is not met by 12 seats', () => {
  const contract = { states: { 'W-01': { texts: [data('12', 'widgets', 'seats', 'w-1')] } } };
  const seedPlan = planWith([{ table: 'widgets', values: { seats: 12 } }]);
  assert.equal(answerNeed({ contract, map: needMap, seedPlan, state: 'W-01', need: '12 seats', now: NOW }).held, true);
  assert.deepEqual(answerNeed({ contract, map: needMap, seedPlan, state: 'W-01', need: '40 seats', now: NOW }).matched, []);
  assert.deepEqual(answerNeed({ contract, map: needMap, seedPlan, state: 'W-01', need: '2 seats', now: NOW }).matched, [], '2 is not inside 12');
});

test('answerNeed: a state the map does not have throws', () => {
  assert.throws(() => answerNeed({ contract: needContract, map: needMap, seedPlan: null, state: 'NOPE-1', need: 'x', now: NOW }), /the map has no state "NOPE-1"/);
});

// ---------------------------------------------------------------------------------------------
// contractGaps with swaps
// ---------------------------------------------------------------------------------------------

test('contractGaps: a contract value present only as its swapped value passes, and fails without the swap list', () => {
  const contract = { states: { 'W-01': { texts: [data('amina@acme.com', 'members', 'email', 'm-1'), data('Acme Corp', 'organizations', 'name', 'org')] } } };
  const seedPlan = {
    rows: [
      { world: 'design', table: 'members', values: { email: 'amina@example.invalid' } },
      { world: 'design', table: 'organizations', values: { name: `${PREFIX}Acme` } },
    ],
    users: [],
  };
  const swaps = { design: { 'amina@acme.com': 'amina@example.invalid', 'Acme Corp': `${PREFIX}Acme` } };
  assert.deepEqual(contractGaps(contract, mapFor(), seedPlan, NOW, swaps).gaps, []);
  const bare = contractGaps(contract, mapFor(), seedPlan, NOW, null);
  assert.equal(bare.gaps.length, 2);
  assert.match(bare.gaps[0].why, /no members row has email = "amina@acme.com"/);
  // A swap list for another world does not help this one.
  assert.equal(contractGaps(contract, mapFor(), seedPlan, NOW, { other: swaps.design }).gaps.length, 2);
});

// ---------------------------------------------------------------------------------------------
// needs and swaps files
// ---------------------------------------------------------------------------------------------

test('needs.json: addNeed numbers each need, openNeeds lists the open ones, closeNeeds closes by number or all', async () => {
  const repo = makeTempRepo({ files: {} });
  try {
    const paths = { deliveryDir: join(repo.dir, 'docs/delivery/widgets') };
    mkdirSync(paths.deliveryDir, { recursive: true });
    assert.deepEqual(readNeeds(paths), { schemaVersion: 1, needs: [] }, 'no file is no needs');
    assert.deepEqual(openNeeds(paths), []);
    assert.equal(await addNeed(paths, { state: 'W-01', world: 'design', need: 'a', at: 't1' }), 1);
    assert.equal(await addNeed(paths, { state: 'W-02', world: 'design', need: 'b', at: 't2' }), 2);
    assert.equal(await addNeed(paths, { state: 'W-03', world: 'design', need: 'c', at: 't3' }), 3);
    assert.deepEqual(openNeeds(paths).map((x) => x.n), [1, 2, 3]);
    assert.equal(await closeNeeds(paths, [2]), 1);
    assert.deepEqual(openNeeds(paths).map((x) => x.n), [1, 3]);
    assert.equal(await closeNeeds(paths, [2]), 0, 'a closed need is not closed twice');
    assert.equal(await addNeed(paths, { state: 'W-04', world: 'design', need: 'd', at: 't4' }), 4, 'numbers keep counting past closed needs');
    assert.equal(await closeNeeds(paths, 'all'), 3);
    assert.deepEqual(openNeeds(paths), []);
    assert.equal(readNeeds(paths).needs.length, 4, 'closed needs stay on file');
    assert.equal(JSON.parse(readFileSync(needsPath(paths), 'utf8')).needs[1].done, true);
    assert.equal(readSwaps(paths), null, 'no swaps.json is no swap list');
    assert.ok(swapsPath(paths).endsWith('swaps.json'));
  } finally { repo.cleanup(); }
});

// ---------------------------------------------------------------------------------------------
// The command, end to end
// ---------------------------------------------------------------------------------------------

const TYPES_FILE = 'packages/types/src/database.ts';
const CMD_TYPES = `export type Database = { public: { Tables: {
  organizations: { Row: { id: string; name: string } }
  organization_members: { Row: { id: string; organization_id: string; user_id: string; role: string } }
  widgets: { Row: { id: string; organization_id: string; state: string; contact_email: string; seats: number } }
} } }`;
const WORKERS = { tsGlobs: ['apps/server/src/jobs/**/*.ts'], sqlGlobs: ['db/migrations/*.sql'] };

const CMD_WORLD = {
  schemaVersion: 1,
  world: 'design',
  rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } },
  ],
};

const CMD_CONTRACT = {
  schemaVersion: 1,
  states: {
    'W-01': { texts: [
      data('Acme Corp', 'organizations', 'name', 'org'),
      data('idle', 'widgets', 'state', 'w-1'),
      data('ops@acme.com', 'widgets', 'contact_email', 'w-1'),
      data('12', 'widgets', 'seats', 'w-1'),
      { text: 'Sam Kariuki', label: 'data', user: 'admin' },
      { text: 'Save', label: 'fixed' },
    ] },
  },
};

function stubDb() {
  return createStubDb({
    answers: [
      { match: /from org_phone_numbers/, rows: [{ phone_number: '+15550100077' }] },
      { match: /country_for_phone_number/, rows: [{ country_for_phone_number: null }] },
      { match: /from org_lines/, rows: () => [{ count: 0 }] },
    ],
  });
}

async function setup({ types = CMD_TYPES } = {}) {
  const worlds = validExample('plan').worlds;
  const repo = makeTempRepo({
    files: {
      ...WORKER_FILES,
      'docs/delivery/widgets/plan.json': validExample('plan'),
      'docs/delivery/widgets/worlds/design.json': CMD_WORLD,
      'docs/delivery/widgets/map.json': { worlds, states: [{ id: 'W-01', reach: { world: 'design', role: 'admin', steps: [] } }] },
      'docs/delivery/widgets/contract.json': CMD_CONTRACT,
    },
  });
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  if (types) {
    mkdirSync(join(repo.dir, 'packages/types/src'), { recursive: true });
    writeFileSync(join(repo.dir, TYPES_FILE), types);
  }
  const t = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ workers: WORKERS, guards: guardsWithFixtureTables(makeSafety()) }),
    passthrough: ['git'], clock: fakeClock(NOW.toISOString()),
  });
  const db = stubDb();
  t.ctx.dataBackend = db;
  const file = (p) => JSON.parse(readFileSync(join(repo.dir, 'docs/delivery/widgets', p), 'utf8'));
  return { repo, db, file, ...t };
}

test('seed --from-trace: writes the world file with t- rows, swaps.json and a fixture user\'s name, and never needs a database', async () => {
  const { repo, ctx, stdout, file } = await setup();
  delete ctx.dataBackend;
  try {
    assert.equal(await seedCommand.run(ctx, ['--from-trace']), 0, stdout.text());
    const world = file('worlds/design.json');
    assert.equal(world.world, 'design');
    assert.deepEqual(world.rows.slice(0, 2).map((r) => r.key), ['org', 'member-admin'], 'hand-written rows are kept');
    const widget = world.rows.find((r) => r.key === 't-w-1');
    assert.deepEqual(widget, { key: 't-w-1', table: 'widgets', values: { state: 'idle', contact_email: 'ops@example.invalid', seats: 12, organization_id: { $ref: 'org' } } });
    assert.deepEqual(file('swaps.json'), { schemaVersion: 1, worlds: { design: { 'ops@acme.com': 'ops@example.invalid', 'Acme Corp': 'Delivery fixture · widgets design' } } });
    assert.equal(file('map.json').worlds[0].users.find((u) => u.role === 'admin').name, 'Sam Kariuki');
    const out = stdout.text();
    assert.match(out, /world design: 1 row\(s\) added, 0 rebuilt, 2 kept; 2 value\(s\) swapped for safe ones/);
    assert.match(out, /the admin fixture user is now named "Sam Kariuki", as the design shows/);
    assert.match(out, /next: delivery seed --plan, then --check/);

    // Again: the same rows, rebuilt rather than added twice.
    assert.equal(await seedCommand.run(ctx, ['--from-trace', 'design']), 0);
    assert.equal(file('worlds/design.json').rows.filter((r) => r.key === 't-w-1').length, 1);
    assert.match(stdout.text(), /world design: 0 row\(s\) added, 1 rebuilt, 2 kept/);
  } finally { repo.cleanup(); }
});

test('seed --from-trace: without a map or a contract it is a usage error, and a world file is never half-written', async () => {
  const noContract = await setup();
  try {
    await import('node:fs').then((fs) => fs.rmSync(join(noContract.repo.dir, 'docs/delivery/widgets/contract.json')));
    await assert.rejects(seedCommand.run(noContract.ctx, ['--from-trace']), (err) => err.exit === 2 && /no contract\.json/.test(err.message));
  } finally { noContract.repo.cleanup(); }
  const noMap = await setup();
  try {
    await import('node:fs').then((fs) => fs.rmSync(join(noMap.repo.dir, 'docs/delivery/widgets/map.json')));
    await assert.rejects(seedCommand.run(noMap.ctx, ['--from-trace']), (err) => err.exit === 2 && /no map\.json/.test(err.message));
  } finally { noMap.repo.cleanup(); }
});

test('seed --from-trace, then --plan and --check: the check finds the swapped values, and fails without swaps.json', async () => {
  const { repo, ctx, stdout, file } = await setup();
  try {
    assert.equal(await seedCommand.run(ctx, ['--from-trace']), 0, stdout.text());
    assert.equal(await seedCommand.run(ctx, ['--plan']), 0, stdout.text());
    assert.equal(await seedCommand.run(ctx, ['--check']), 0, stdout.text());
    assert.doesNotMatch(stdout.text(), /M13-contract/);

    await import('node:fs').then((fs) => fs.rmSync(join(repo.dir, 'docs/delivery/widgets/swaps.json')));
    assert.equal(await seedCommand.run(ctx, ['--check']), 1);
    const out = stdout.text();
    assert.match(out, /FAIL M13-contract state W-01 shows "ops@acme\.com": no widgets row has contact_email = "ops@acme\.com" \(world design\)/);
    assert.match(out, /FAIL M13-contract state W-01 shows "Acme Corp": no organizations row has name = "Acme Corp" \(world design\)/);
    assert.ok(file('worlds/design.json').rows.some((r) => r.key === 't-w-1'));
  } finally { repo.cleanup(); }
});

test('seed --need: held when the seed plan holds the value, otherwise queued in needs.json; --need-done closes them', async () => {
  const { repo, ctx, stdout, file } = await setup();
  try {
    // No seed plan yet: nothing is held, so the ask is queued (need #1).
    assert.equal(await seedCommand.run(ctx, ['--need', 'W-01: idle']), 0);
    assert.match(stdout.text(), /queued: need #1 for world design \(W-01: idle\) is in needs\.json/);

    await seedCommand.run(ctx, ['--from-trace']);
    await seedCommand.run(ctx, ['--plan']);
    assert.equal(await seedCommand.run(ctx, ['--need', 'W-01: ops@acme.com']), 0);
    assert.match(stdout.text(), /held: world design has it for W-01 \("ops@acme\.com"\)/);
    assert.equal(file('needs.json').needs.length, 1, 'a held value queues nothing');

    assert.equal(await seedCommand.run(ctx, ['--need', 'W-01: 12 seats']), 0);
    assert.match(stdout.text(), /held: world design has it for W-01 \("12"\)/, 'a number matches as a whole word');
    assert.equal(file('needs.json').needs.length, 1);

    assert.equal(await seedCommand.run(ctx, ['--need', 'W-01: 40 seats']), 0);
    assert.match(stdout.text(), /queued: need #2 for world design \(W-01: 40 seats\)/);
    const needs = file('needs.json').needs;
    assert.deepEqual(needs.map((x) => [x.n, x.state, x.world, x.need]), [[1, 'W-01', 'design', 'idle'], [2, 'W-01', 'design', '40 seats']]);
    assert.ok(needs.every((x) => typeof x.at === 'string' && !x.done));

    assert.equal(await seedCommand.run(ctx, ['--need-done', '1']), 0);
    assert.match(stdout.text(), /closed 1 need\(s\)/);
    assert.deepEqual(file('needs.json').needs.map((x) => Boolean(x.done)), [true, false]);
    assert.equal(await seedCommand.run(ctx, ['--need-done', 'all']), 0);
    assert.match(stdout.text(), /closed 1 need\(s\)/);
    assert.ok(file('needs.json').needs.every((x) => x.done));
  } finally { repo.cleanup(); }
});

test('seed --need: a request that is not "<STATE>: <what>", a state the map lacks, and a bad --need-done are usage errors', async () => {
  const { repo, ctx } = await setup();
  try {
    await assert.rejects(seedCommand.run(ctx, ['--need', 'bad']), (err) => err.exit === 2 && /--need takes "<STATE>: <what>"/.test(err.message));
    await assert.rejects(seedCommand.run(ctx, ['--need-done', 'soon']), (err) => err.exit === 2 && /--need-done takes need numbers/.test(err.message));
    await assert.rejects(seedCommand.run(ctx, ['--need', 'ZZ-99: anything']));
    await assert.rejects(seedCommand.run(ctx, ['--need', 'W-01: idle', '--need-done', 'all']), (err) => err.exit === 2);
  } finally { repo.cleanup(); }
});
