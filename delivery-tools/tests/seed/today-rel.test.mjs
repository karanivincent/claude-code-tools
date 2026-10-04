// `today: true` on a $rel marker: a time that must fall today (the page shows it under today) stays
// inside today at every hour (2026-10-05: a home-page shoot at 00:15 resolved now-80m to yesterday
// and the "New orders" strip vanished from most worlds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveValues, zonedNow } from '../../lib/seed/evaluate.mjs';
import { buildSeedPlan } from '../../lib/seed/plan.mjs';
import { isRelative } from '../../lib/seed/contacts.mjs';
import { makeSafety, validExample } from '../helpers/fixtures.mjs';

const ZONE = 'Africa/Nairobi'; // UTC+3, no daylight saving
const nairobi = (hhmm) => zonedNow(new Date(`2026-10-05T${hhmm}:00+03:00`), ZONE);
const localDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const ORG = { key: 'org', table: 'organizations', values: { name: { $orgName: true } } };
const MEMBER = { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } };
const TODAY_BACK = ['now-5m', 'now-80m', 'now-3h', 'now-9h', 'now-15h'];

function plan(rows) {
  const p = validExample('plan');
  p.worlds = [{ id: 'w', orgName: 'Acme Store', users: [{ role: 'admin', email: 'delivery+w-admin@example.invalid' }] }];
  return buildSeedPlan({ feature: 'f', runId: 'r-1', project: 'p', plan: p, worldFiles: { w: { schemaVersion: 1, world: 'w', rows } }, safety: makeSafety() });
}

function world() {
  return plan([
    ORG, MEMBER,
    ...TODAY_BACK.map((rel, i) => ({ key: `req-${i}`, table: 'requests', values: { organization_id: { $ref: 'org' }, received_at: { $rel: rel, today: true } } })),
    ...['today@08:10', 'today@09:20', 'today@17:45'].map((rel, i) => ({ key: `call-${i}`, table: 'calls', values: { organization_id: { $ref: 'org' }, started_at: { $rel: rel, today: true } } })),
    { key: 'next', table: 'tasks', values: { organization_id: { $ref: 'org' }, due_at: { $rel: 'now+2h', today: true } } },
    { key: 'old', table: 'tasks', values: { organization_id: { $ref: 'org' }, due_at: { $rel: 'now-80m' } } },
  ]);
}

for (const hhmm of ['00:05', '00:59', '03:00', '14:00']) {
  test(`a world resolved at ${hhmm} keeps every today value inside today, before now, in order`, () => {
    const now = nairobi(hhmm);
    const resolved = world().rows.map((r) => ({ key: r.id, table: r.table, values: resolveValues(r.values, now) }));
    const backs = resolved.filter((r) => r.table === 'requests').map((r) => r.values.received_at);
    const days = resolved.filter((r) => r.table === 'calls').map((r) => r.values.started_at);
    for (const iso of [...backs, ...days]) {
      assert.equal(localDay(iso), '2026-10-05', `${iso} is not today at ${hhmm}`);
      assert.ok(Date.parse(iso) < now.getTime(), `${iso} is not before now at ${hhmm}`);
    }
    // TODAY_BACK runs newest to oldest; strictly decreasing times keep that order.
    for (let i = 1; i < backs.length; i++) assert.ok(Date.parse(backs[i]) < Date.parse(backs[i - 1]), `requests out of order at ${hhmm}`);
    for (let i = 1; i < days.length; i++) assert.ok(Date.parse(days[i]) > Date.parse(days[i - 1]), `calls out of order at ${hhmm}`);
    const next = resolved.find((r) => r.table === 'tasks' && Date.parse(r.values.due_at) > now.getTime());
    assert.equal(Date.parse(next.values.due_at), now.getTime() + 2 * 3_600_000, 'a forward offset is never scaled');
  });
}

test('at 18:00 nothing is scaled: today values resolve exactly as written', () => {
  const now = nairobi('18:00');
  const rows = world().rows;
  const req = rows.find((r) => r.values.received_at?.$rel === 'now-80m');
  assert.equal(Date.parse(resolveValues(req.values, now).received_at), now.getTime() - 80 * 60_000);
  const call = rows.find((r) => r.values.started_at?.$rel === 'today@09:20');
  assert.equal(resolveValues(call.values, now).started_at, new Date('2026-10-05T09:20:00+03:00').toISOString());
});

test('at 00:05 the earliest today value lands about a minute after midnight', () => {
  const now = nairobi('00:05');
  const req = world().rows.find((r) => r.values.received_at?.$rel === 'now-15h');
  assert.equal(resolveValues(req.values, now).received_at, new Date('2026-10-05T00:01:00+03:00').toISOString());
});

test('a value without today: true is unchanged, so now-80m at 00:15 is still yesterday', () => {
  const now = nairobi('00:15');
  const old = world().rows.find((r) => r.values.due_at?.$rel === 'now-80m');
  assert.equal(localDay(resolveValues(old.values, now).due_at), '2026-10-04');
});

test('seed --plan stamps the world-wide spans and refuses a today that is not true', () => {
  const rows = world().rows;
  const req = rows.find((r) => r.values.received_at?.$rel === 'now-5m').values.received_at;
  assert.equal(req.todayBackMs, 15 * 3_600_000);
  assert.ok(isRelative(req));
  const call = rows.find((r) => r.values.started_at?.$rel === 'today@08:10').values.started_at;
  assert.equal(call.todayLatestMs, (17 * 60 + 45) * 60_000);
  assert.throws(
    () => plan([ORG, MEMBER, { key: 'r', table: 'requests', values: { received_at: { $rel: 'now-1h', today: 'yes' } } }]),
    (err) => err.failures.some((f) => /"today" on a \$rel marker takes only true/.test(f.message)),
  );
});
