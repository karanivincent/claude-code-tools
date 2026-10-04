// $minuteOfDay world values: time-of-day settings (calling hours) relative to the moment a world is
// seeded or reset, so no picture depends on when the shoot runs (2026-10-04: a home-page shoot in
// the evening pictured "calling hours closed" because the worlds had no hours of their own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMinuteOfDay, resolveValues, zonedNow } from '../../lib/seed/evaluate.mjs';
import { buildSeedPlan } from '../../lib/seed/plan.mjs';
import { clockProblems } from '../../lib/picture/map.mjs';
import { makeSafety, validExample } from '../helpers/fixtures.mjs';

const at = new Date('2026-10-04T19:30:00Z'); // 22:30 in Nairobi

test('resolveMinuteOfDay: now, offsets in minutes and hours, the whole day, in the profile zone', () => {
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now' }, at), 19 * 60 + 30, 'no zone: the UTC minute');
  const nbo = zonedNow(at, 'Africa/Nairobi');
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now' }, nbo), 22 * 60 + 30);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now-60' }, nbo), 21 * 60 + 30);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now-90m' }, nbo), 21 * 60);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now+1h-15' }, nbo), 23 * 60 + 15);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'startOfDay' }, nbo), 0);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'endOfDay' }, nbo), 1440);
});

test('resolveMinuteOfDay clamps to 0..1440 across midnight, or wraps when asked', () => {
  const nbo = zonedNow(at, 'Africa/Nairobi');
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now+2h' }, nbo), 1440);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now+2h', wrap: true }, nbo), 30);
  const early = zonedNow(new Date('2026-10-04T21:20:00Z'), 'Africa/Nairobi'); // 00:20
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now-60' }, early), 0);
  assert.equal(resolveMinuteOfDay({ $minuteOfDay: 'now-60', wrap: true }, early), 1440 - 40);
  assert.throws(() => resolveMinuteOfDay({ $minuteOfDay: 'today@08:00' }, at), /not understood/);
});

test('resolveValues resolves $minuteOfDay inside a row, and a re-resolve later follows the clock', () => {
  const values = { days: [0, 1, 2, 3, 4, 5, 6], start_minute: { $minuteOfDay: 'now-240' }, end_minute: { $minuteOfDay: 'now-60' } };
  const first = resolveValues(values, zonedNow(at, 'Africa/Nairobi'));
  assert.deepEqual(first, { days: [0, 1, 2, 3, 4, 5, 6], start_minute: 18 * 60 + 30, end_minute: 21 * 60 + 30 });
  const later = resolveValues(values, zonedNow(new Date(at.getTime() + 3_600_000), 'Africa/Nairobi'));
  assert.equal(later.end_minute, 22 * 60 + 30, 'a reset an hour later: the hours still ended an hour ago');
});

function plan(rows) {
  const p = validExample('plan');
  p.worlds = [{ id: 'w', orgName: 'Acme Store', users: [{ role: 'admin', email: 'delivery+w-admin@example.invalid' }] }];
  return buildSeedPlan({ feature: 'f', runId: 'r-1', project: 'p', plan: p, worldFiles: { w: { schemaVersion: 1, world: 'w', rows } }, safety: makeSafety() });
}
const MEMBER = { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } };
const ORG = { key: 'org', table: 'organizations', values: { name: { $orgName: true } } };

test('seed --plan keeps a $minuteOfDay marker to resolve when written, and refuses a malformed one', () => {
  const sp = plan([ORG, MEMBER, { key: 'hours', table: 'org_calling_hours', values: { organization_id: { $ref: 'org' }, start_minute: { $minuteOfDay: 'startOfDay' }, end_minute: { $minuteOfDay: 'endOfDay' } } }]);
  const row = sp.rows.find((r) => r.table === 'org_calling_hours');
  assert.deepEqual(row.values.start_minute, { $minuteOfDay: 'startOfDay' });
  assert.throws(
    () => plan([ORG, MEMBER, { key: 'hours', table: 'org_calling_hours', values: { start_minute: { $minuteOfDay: 'eight' }, end_minute: { $minuteOfDay: 'now', as: 'date' } } }]),
    (err) => err.failures.some((f) => /minute of day "eight" is not understood/.test(f.message)) && err.failures.some((f) => /\$minuteOfDay marker takes a string .*not as/.test(f.message)),
  );
});

test('clockProblems: a clock state\'s world with no row in testData.timeOfDayTables fails; one with hours passes', () => {
  const map = { states: [{ id: 'S1', clock: true, reach: { world: 'w' } }, { id: 'S2', reach: { world: 'x' } }] };
  const bare = { rows: [{ key: 'org', table: 'organizations', values: {} }] };
  const withHours = { rows: [...bare.rows, { key: 'hours', table: 'org_calling_hours', values: { start_minute: { $minuteOfDay: 'now-240' }, end_minute: { $minuteOfDay: 'now-60' } } }] };
  const opts = { timeOfDayTables: ['org_calling_hours'] };
  const p = clockProblems(map, { w: bare, x: bare }, opts);
  assert.equal(p.length, 1, 'only the clock state\'s world');
  assert.match(p[0], /world w writes no row to org_calling_hours, and S1 depend\(s\) on the time of day/);
  assert.match(p[0], /"\$minuteOfDay": "startOfDay"/);
  assert.deepEqual(clockProblems(map, { w: withHours }, opts), []);
  assert.deepEqual(clockProblems(map, { w: bare }), [], 'no tables named in the profile: nothing to check');
});
