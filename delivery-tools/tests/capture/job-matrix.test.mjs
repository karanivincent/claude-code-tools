// The knowledge-page wave: 64 of 287 items "not reached", about 30 of them the matrix's own doing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItems } from '../../lib/capture/job.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { widgetsPlan } from './helpers.mjs';

const profile = makeProfile();

test('a same-as row is captured at the first width only; its partner at every width', () => {
  const plan = widgetsPlan();
  const [first, second] = plan.rows;
  second.markers.sameAs = { state: first.id, why: 'the same page' };
  const wave = buildItems({ mode: 'wave', profile, plan });
  const widthsOf = (id) => [...new Set(wave.items.filter((i) => i.state === id && i.check === 'markers').map((i) => i.width))];
  assert.ok(widthsOf(first.id).length > 1, 'the partner keeps every width');
  assert.deepEqual(widthsOf(second.id), [widthsOf(first.id)[0]]);
  assert.ok(wave.skipped.some((x) => x.state === second.id && /other widths: the same page as/.test(x.why)));
});

test('a messy world replays only a page as it lands: a click needs the design world\'s data', () => {
  const plan = widgetsPlan();
  plan.worlds.push({ id: 'messy', kind: 'messy', orgName: 'Delivery fixture · widgets messy', users: [{ role: 'admin', email: 'delivery+widgets-messy-admin@example.invalid' }], notes: 'five open drafts' });
  const row = plan.rows[0];
  row.invariants = ['never "undefined"'];
  const landed = buildItems({ mode: 'wave', profile, plan });
  assert.ok(landed.items.some((i) => i.world === 'messy' && i.state === row.id), 'a landing page is replayed');
  row.reach.steps = [...row.reach.steps, { click: { testid: 'w-open-0' } }];
  const clicked = buildItems({ mode: 'wave', profile, plan });
  assert.equal(clicked.items.filter((i) => i.world === 'messy' && i.state === row.id).length, 0);
  assert.ok(clicked.skipped.some((x) => x.state === row.id && /act on the .* world's own data/.test(x.why)));
});

test('a member is not sent through an indexed copy of a control the plan hides from members', () => {
  const plan = widgetsPlan();
  const row = plan.rows[0];
  row.permission = { member: 'enabled' };
  plan.rows.push({ ...plan.rows[1], id: 'EDIT-HOST', controls: [{ label: 'Edit', testid: 'w-edit', effect: 'none', target: 'external', permission: { member: 'hidden' } }] });
  row.reach.steps = [...row.reach.steps, { click: { testid: 'w-edit-0' } }];
  const { items, skipped } = buildItems({ mode: 'full', profile, plan });
  assert.equal(items.filter((i) => i.state === row.id && i.check === 'permission').length, 0);
  assert.ok(skipped.some((x) => x.state === row.id && /member check: reaching it clicks "w-edit"/.test(x.why)));
});
