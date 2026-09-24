// A refresh skips a planned row only when the database provably holds it as planned. These pin
// the comparison: every doubt must count as different, because a false "same" leaves a row as a
// click left it and the next capture opens on changed data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameStored, liveHolds, applyRows } from '../../lib/seed/apply.mjs';

test('timestamps compare as instants, in either of the forms the database returns', () => {
  assert.equal(sameStored('2025-09-15T09:00:22.000Z', '2025-09-15 09:00:22+00'), true, 'the Management API form');
  assert.equal(sameStored('2025-09-15T09:00:22.000Z', '2025-09-15T09:00:22+00:00'), true, 'the json_agg form');
  assert.equal(sameStored('2025-09-15T12:00:22+03:00', '2025-09-15T09:00:22+00:00'), true);
  assert.equal(sameStored('2026-09-24T07:32:56.549Z', '2026-09-24T07:32:56.549517+00:00'), false, 'microseconds the plan does not have');
  assert.equal(sameStored('2025-09-15T09:00:22Z', '2025-09-15T09:00:23+00:00'), false);
  assert.equal(sameStored('2025-09-15T09:00:22', '2025-09-15T09:00:22+00:00'), false, 'a time with no zone is not provably the same instant');
  assert.equal(sameStored('2025-09-15', '2025-09-15'), true, 'a date is plain text');
});

test('numbers, arrays and objects compare by value; anything else by exact text', () => {
  assert.equal(sameStored(3, 3), true);
  assert.equal(sameStored('3', 3), true, 'a number the plan wrote as text');
  assert.equal(sameStored('', 0), false);
  assert.equal(sameStored(true, 'true'), false);
  assert.equal(sameStored(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameStored(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameStored({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }), true, 'jsonb keeps no key order');
  assert.equal(sameStored({ a: 1 }, { a: 1, b: null }), false);
  assert.equal(sameStored(null, null), true);
  assert.equal(sameStored(null, ''), false);
  assert.equal(sameStored('suggested', 'approved'), false);
  assert.equal(sameStored('Pelican', 'pelican'), false);
});

test('a row holds only when every planned column is there with the planned value', () => {
  const holds = liveHolds([
    { table: 'org_knowledge', id: 'k1', values: { id: 'k1', status: 'suggested', reviewed_at: '2026-09-24 07:00:00+00', title: 'Hours' } },
    { table: 'organization_members', id: '(join row)', values: { organization_id: 'o1', user_id: 'u1', role: 'admin' } },
  ]);
  assert.equal(holds({ table: 'org_knowledge', id: 'k1' }, { id: 'k1', status: 'suggested', title: 'Hours' }), true, 'a column the plan does not set is not compared');
  assert.equal(holds({ table: 'org_knowledge', id: 'k1' }, { id: 'k1', status: 'approved' }), false);
  assert.equal(holds({ table: 'org_knowledge', id: 'k1' }, { id: 'k1', ask_count: 0 }), false, 'a column the row does not have');
  assert.equal(holds({ table: 'org_knowledge', id: 'k2' }, { id: 'k2' }), false, 'a row that is not there');
  assert.equal(holds({ table: 'organization_members', id: 'm1', idless: true }, { organization_id: 'o1', user_id: 'u1', role: 'admin' }), true, 'a join row, by its columns');
  assert.equal(holds({ table: 'organization_members', id: 'm1', idless: true }, { organization_id: 'o1', user_id: 'u1', role: 'member' }), false);
});

test('applyRows with the live rows writes only the rows that differ, in plan order', async () => {
  const plan = {
    worlds: [{ id: 'w', orgId: 'o1' }],
    users: [],
    rows: [
      { world: 'w', table: 'organizations', id: 'o1', values: { id: 'o1', name: 'Org' } },
      { world: 'w', table: 'widgets', id: 'a', values: { id: 'a', organization_id: 'o1', state: 'idle' } },
      { world: 'w', table: 'widgets', id: 'b', values: { id: 'b', organization_id: 'o1', state: 'idle', seen_at: { $rel: 'now-1h' } } },
      { world: 'x', table: 'widgets', id: 'c', values: { id: 'c', organization_id: 'o2', state: 'idle' } },
    ],
  };
  const now = new Date('2026-01-15T12:00:00.000Z');
  const live = [
    { table: 'organizations', id: 'o1', values: { id: 'o1', name: 'Org' } },
    { table: 'widgets', id: 'a', values: { id: 'a', organization_id: 'o1', state: 'done' } },
    { table: 'widgets', id: 'b', values: { id: 'b', organization_id: 'o1', state: 'idle', seen_at: '2026-01-15 11:00:00+00' } },
  ];
  const upserts = [];
  const db = { upsert: async (table, rows) => { upserts.push({ table, ids: rows.map((r) => r.id) }); } };
  const r = await applyRows(db, plan, { worlds: ['w'], now, users: false, live });
  assert.deepEqual(upserts, [{ table: 'widgets', ids: ['a'] }]);
  assert.deepEqual([r.rows, r.unchanged], [1, 2]);
  const all = [];
  await applyRows({ upsert: async (table, rows) => { all.push(...rows.map((x) => x.id)); } }, plan, { worlds: ['w'], now, users: false });
  assert.deepEqual(all, ['o1', 'a', 'b'], 'without the live rows every row of the world is written');
});
