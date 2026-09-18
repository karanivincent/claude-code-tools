import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItems, modeMatrix, localisePath, parseVersionProbe, itemKey, checkFor, capturable, newCaptureRunId, profileLocales } from '../../lib/capture/job.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { widgetsPlan } from './helpers.mjs';

const profile = makeProfile();
const realOrg = { observerEmail: 'delivery+observer@example.invalid', role: 'admin' };

test('the widgets plan is a valid plan', () => {
  assert.deepEqual(validateAgainst('plan', widgetsPlan()).errors, []);
});

test('the matrix of each mode (spec 9)', () => {
  assert.deepEqual(modeMatrix('branch', profile), { widths: [1440], locales: ['en'], themes: ['light'] });
  assert.deepEqual(modeMatrix('wave', profile), { widths: [1440, 390], locales: ['en'], themes: ['light'] });
  assert.deepEqual(modeMatrix('full', profile), { widths: [1440, 390], locales: ['en', 'fr'], themes: ['light', 'dark'] });
  assert.deepEqual(modeMatrix('staging', profile), { widths: [1440, 390], locales: ['en'], themes: ['light'] });
  assert.deepEqual(profileLocales(profile), ['en', 'fr']);
});

test('branch mode captures the unit\'s seeded and intercepted states once, and clicks their free controls', () => {
  const { items, skipped } = buildItems({ mode: 'branch', profile, plan: widgetsPlan(), unit: { states: ['WG-01', 'WG-02', 'WG-03', 'WG-04', 'WG-05', 'WG-06'], capabilities: [] } });
  assert.deepEqual(items.map((i) => i.key), [
    'WG-01.design.admin.1440.en.light', 'WG-02.empty.admin.1440.en.light', 'WG-03.design.admin.1440.en.light', 'WG-04.design.admin.1440.en.light',
  ]);
  const wg1 = items[0];
  assert.equal(wg1.email, 'delivery+widgets-design-admin@example.invalid');
  assert.equal(wg1.clicks, true);
  assert.deepEqual(wg1.controls.map((c) => c.testid), ['widget-duplicate'], 'destructive and dialling controls are never sent');
  assert.equal(items[3].intercept.status, 500);
  assert.deepEqual(skipped.map((s) => s.state), ['WG-05', 'WG-06']);
  assert.match(skipped[1].why, /unseedable: verified by a component render test \(needs-live-call\)/);
  assert.ok(items.every((i) => i.check === 'markers' && !i.readOnly && i.axe));
});

test('full mode: every width, locale and theme; paths localised; a member variant; the founder\'s organisation read-only', () => {
  const { items } = buildItems({ mode: 'full', profile, plan: widgetsPlan(), realOrg });
  const wg1 = items.filter((i) => i.state === 'WG-01' && i.world === 'design' && i.role === 'admin');
  assert.equal(wg1.length, 2 * 2 * 2);
  const fr = wg1.find((i) => i.locale === 'fr');
  assert.deepEqual(fr.steps, [{ goto: '/fr/widgets' }]);
  assert.equal(wg1.filter((i) => i.clicks).length, 1, 'controls are clicked once, at the first width, locale and theme');
  const phone = wg1.find((i) => i.width === 390);
  assert.equal(phone.axe, false, 'axe runs on desktop captures only');
  const member = items.filter((i) => i.role === 'member');
  assert.equal(member.length, 1);
  assert.equal(member[0].check, 'permission');
  assert.equal(member[0].email, 'delivery+widgets-design-member@example.invalid');
  assert.deepEqual(member[0].controls, [], 'what a member sees of each control is read from dom.json; nothing is clicked');
  assert.equal(member[0].clicks, false);
  const org = items.filter((i) => i.world === 'real-org');
  assert.deepEqual(org.map((i) => `${i.state}.${i.width}`), ['WG-01.1440', 'WG-01.390'], 'one capture per distinct route, by URL alone');
  assert.ok(org.every((i) => i.readOnly && i.check === 'none' && !i.clicks && i.email === realOrg.observerEmail && i.steps.length === 1));
});

test('rows with invariants are captured again in each messy world, as data (spec 9, M12)', () => {
  const plan = widgetsPlan();
  plan.worlds.push({ id: 'messy', kind: 'messy', orgName: 'Delivery fixture · widgets messy', users: [{ role: 'admin', email: 'delivery+widgets-messy-admin@example.invalid' }], notes: 'five open drafts' });
  plan.rows[0].invariants = ['at most one widget row shows Publish'];
  plan.rows[2].invariants = ['the copy count matches the list'];
  plan.rows[2].reach.steps = [{ goto: '/en/widgets/0f8fad5b-d9cb-469f-a165-70867728950e' }];
  const { items, skipped } = buildItems({ mode: 'wave', profile, plan });
  const messy = items.filter((i) => i.world === 'messy');
  assert.deepEqual(messy.map((i) => i.key), ['WG-01.messy.admin.1440.en.light']);
  assert.ok(messy.every((i) => i.check === 'none' && !i.clicks && i.email === 'delivery+widgets-messy-admin@example.invalid'));
  assert.equal(checkFor(messy[0], 'wave', plan.rows[0]), 'none', 're-judged as data, never against the design world\'s markers');
  assert.ok(skipped.some((x) => x.state === 'WG-03' && /the steps name the design world's own ids/.test(x.why)));
  assert.equal(buildItems({ mode: 'branch', profile, plan, unit: { states: ['WG-01'], capabilities: [] } }).items.filter((i) => i.world === 'messy').length, 0, 'a unit gate stays in its own worlds');
});

test('routes with a fixture\'s own ids are not captured in the founder\'s organisation', () => {
  const plan = widgetsPlan();
  plan.rows[0].reach.steps = [{ goto: '/en/widgets/0f8fad5b-d9cb-469f-a165-70867728950e' }];
  plan.rows[1].reach.steps = [{ goto: '/en/widgets' }];
  const { items } = buildItems({ mode: 'staging', profile, plan, realOrg });
  assert.deepEqual([...new Set(items.filter((i) => i.world === 'real-org').map((i) => i.state))], ['WG-02']);
});

test('smoke: one state per world and role, first width only, no clicks', () => {
  const { items } = buildItems({ mode: 'branch', profile, plan: widgetsPlan(), smoke: true, realOrg });
  assert.deepEqual(items.map((i) => i.key), ['WG-01.design.admin.1440.en.light', 'WG-02.empty.admin.1440.en.light']);
  assert.ok(items.every((i) => !i.clicks));
});

test('baseline before any plan: today\'s static routes as the robots, read-only and not judged', () => {
  const baseline = {
    schemaVersion: 1, base: { ref: 'origin/main', sha: 'a'.repeat(40) }, refreshes: [],
    capabilities: [
      { id: 'CAP-001', kind: 'route', signature: 'route:/widgets', screen: 'Widgets', evidence: [] },
      { id: 'CAP-002', kind: 'route', signature: 'route:/widgets/[id]?tab=history', screen: 'Widgets', evidence: [] },
      { id: 'CAP-003', kind: 'control', signature: 'control:button "New"@widgets', screen: 'Widgets', evidence: [] },
    ],
  };
  const { items, skipped } = buildItems({ mode: 'baseline', profile, plan: null, baseline, realOrg, appLocalePrefix: true });
  const robots = items.filter((i) => i.world === 'baseline');
  assert.deepEqual(robots.map((i) => `${i.state}.${i.role}.${i.width}`), ['CAP-001.admin.1440', 'CAP-001.admin.390', 'CAP-001.member.1440', 'CAP-001.member.390']);
  assert.deepEqual(robots[0].steps, [{ goto: '/en/widgets' }]);
  assert.equal(robots[0].email, 'robot-admin@example.invalid');
  assert.ok(items.every((i) => i.readOnly && i.check === 'none'));
  assert.deepEqual(skipped, [{ state: 'CAP-002', why: 'dynamic route /widgets/[id]?tab=history needs an id' }]);
  assert.ok(items.some((i) => i.world === 'real-org' && i.steps[0].goto === '/en/widgets'));
});

test('helpers: keys, probes, localised paths, check rules, run ids', () => {
  assert.equal(itemKey({ state: 'WG-01', world: 'design', role: 'admin', width: 1440, locale: 'en', theme: 'light' }), 'WG-01.design.admin.1440.en.light');
  assert.deepEqual(parseVersionProbe('GET /api/version'), { method: 'GET', path: '/api/version' });
  assert.deepEqual(parseVersionProbe('/api/v'), { method: 'GET', path: '/api/v' });
  assert.equal(parseVersionProbe(''), null);
  assert.equal(localisePath('/en/widgets?x=1', 'fr', ['en', 'fr']), '/fr/widgets?x=1');
  assert.equal(localisePath('/en', 'fr', ['en', 'fr']), '/fr');
  assert.equal(localisePath('/widgets', 'fr', ['en', 'fr']), '/widgets');
  assert.equal(localisePath('/de/widgets', 'fr', ['en', 'fr']), '/de/widgets', 'an unknown segment is not a locale');
  const plan = widgetsPlan();
  assert.equal(checkFor({ world: 'design', role: 'admin' }, 'wave', plan.rows[0]), 'markers');
  assert.equal(checkFor({ world: 'design', role: 'member' }, 'wave', plan.rows[0]), 'permission');
  assert.equal(checkFor({ world: 'real-org', role: 'admin' }, 'full', plan.rows[0]), 'none');
  assert.equal(checkFor({ world: 'design', role: 'admin' }, 'baseline', plan.rows[0]), 'none');
  assert.deepEqual(plan.rows.map(capturable), [true, true, true, true, false, false, false]);
  assert.equal(newCaptureRunId(fakeClock('2026-01-15T20:01:02.000Z'), 'branch', 'U2'), 'c-20260115-200102-branch-U2');
  assert.equal(newCaptureRunId(fakeClock('2026-01-15T20:01:02.000Z'), 'wave', null, 's'), 's-20260115-200102-wave');
});
