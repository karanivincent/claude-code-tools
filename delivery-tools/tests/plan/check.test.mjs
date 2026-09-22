// plan check (M1) on synthetic plans: coverage, owners, reach, markers, cuts, budgets, Scope
// lines, file overlap, backend units, invariants, requested items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlan, filesOverlap, normaliseAdaptRule, planGate } from '../../lib/plan/check.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import { planWith, row, world, makeRun, validAgainstSchema } from '../checks/helpers.mjs';

const profile = makeProfile();
const inv = (ids) => ({ schemaVersion: 1, feature: 'widgets', designTreeSha256: '2'.repeat(64), candidates: [], states: ids.map((id) => ({ id, screen: 'Widgets', name: `state ${id}`, reach: { kind: 'click-path', steps: [{ click: 'Widgets' }] }, shots: [], render: { status: 'impossible', why: 'x' }, controls: [{ label: '', role: 'none', target: 'none', effect: 'none' }] })) });
const withMarkers = (id, o = {}) => row(id, { markers: { text: [`Text ${id}`], testids: [`t-${id}`], forbidden: [] }, ...o });
const codesFor = (failures, id) => failures.filter((f) => f.message.includes(id)).map((f) => f.code);

test('a complete plan is green', () => {
  const plan = planWith([withMarkers('WL-01'), withMarkers('WL-02')]);
  validAgainstSchema('plan', plan);
  assert.deepEqual(checkPlan({ plan, inventory: inv(['WL-01', 'WL-02']), profile }), []);
});

test('coverage: an inventory state with no row is unowned; a row nobody drew must be invented', () => {
  const plan = planWith([withMarkers('WL-01'), withMarkers('WL-07')]);
  const f = checkPlan({ plan, inventory: inv(['WL-01', 'WL-02']), profile });
  assert.deepEqual(codesFor(f, 'WL-02'), ['M1-missing-row']);
  assert.deepEqual(codesFor(f, 'WL-07'), ['M1-unknown-row']);
  const invented = planWith([withMarkers('WL-01'), withMarkers('WL-02'), withMarkers('WL-07', { invented: true })]);
  assert.deepEqual(checkPlan({ plan: invented, inventory: inv(['WL-01', 'WL-02']), profile }), []);
});

test('every built row has one owner that lists it, a reach, and markers', () => {
  const plan = planWith([
    withMarkers('WL-01', { owner: null }),
    withMarkers('WL-02', { owner: 'U9' }),
    withMarkers('WL-03', { reach: undefined }),
    row('WL-04'),
    withMarkers('WL-05', { reach: { class: 'prop', world: 'design', role: 'admin', steps: [] } }),
    withMarkers('WL-06', { reach: { class: 'unseedable', world: 'design', role: 'admin', steps: [] } }),
    withMarkers('WL-08', { reach: { class: 'seeded', world: 'nowhere', role: 'admin', steps: [{ goto: '/x' }] } }),
  ]);
  const f = checkPlan({ plan, inventory: inv(['WL-01', 'WL-02', 'WL-03', 'WL-04', 'WL-05', 'WL-06', 'WL-08']), profile });
  assert.ok(codesFor(f, 'WL-01').includes('M1-no-owner'));
  assert.ok(codesFor(f, 'WL-02').includes('M1-owner-unknown'));
  assert.deepEqual(codesFor(f, 'WL-03'), ['M1-no-reach']);
  assert.deepEqual(codesFor(f, 'WL-04').sort(), ['M1-no-markers', 'M1-no-markers']);
  const own = (id) => codesFor(f, id).filter((c) => c !== 'M1-prop-cap');
  assert.deepEqual(own('WL-05'), ['M1-reach-invalid']);
  assert.deepEqual(own('WL-06'), ['M1-reach-invalid']);
  assert.ok(f.some((x) => x.code === 'M1-prop-cap'), '2 of 7 built states are prop or unseedable');
  assert.deepEqual(codesFor(f, 'WL-08'), ['M1-reach-invalid']);
});

test('a cut needs one of the five reason codes, an issue, budget, and a Scope line when requested', () => {
  const cut = (id, o) => row(id, { class: 'cut', owner: null, reach: undefined, markers: undefined, ...o });
  const plan = planWith([
    withMarkers('WL-01'),
    cut('WL-02', {}),
    cut('WL-03', { reason: { code: 'unused', text: 'nobody' }, issue: 7 }),
    cut('WL-04', { reason: { code: 'money', text: 'paid per use' }, issue: 8, requested: 'R1-02' }),
    cut('WL-05', { reason: { code: 'dials', text: 'rings' }, issue: 9, requested: 'R1-03', scopeLine: 'S1' }),
  ], { scope: [{ line: 'S1', rows: ['WL-05'], kind: 'cut-requested', text: 'Cut it.', default: 'cut', appliesAtWave: 1, reply: null }] });
  const f = checkPlan({ plan, inventory: inv(['WL-01', 'WL-02', 'WL-03', 'WL-04', 'WL-05']), profile });
  assert.deepEqual(codesFor(f, 'WL-02').sort(), ['M1-cut-no-issue', 'M1-cut-no-reason']);
  assert.deepEqual(codesFor(f, 'WL-03'), ['M1-cut-no-reason']);
  assert.deepEqual(codesFor(f, 'WL-04'), ['M1-cut-no-scope']);
  assert.deepEqual(codesFor(f, 'WL-05'), []);

  const many = planWith([withMarkers('WL-01'), ...[2, 3, 4, 5, 6, 7].map((n) => cut(`WL-0${n}`, { reason: { code: 'money', text: 't' }, issue: 20 + n }))]);
  const g = checkPlan({ plan: many, inventory: null, profile });
  assert.deepEqual(g.map((x) => x.code), ['M1-cut-budget']);
  const sameFeature = planWith([withMarkers('WL-01'), ...[2, 3, 4, 5, 6, 7].map((n) => cut(`WL-0${n}`, { reason: { code: 'money', text: 't' }, issue: 20 + (n % 3) }))]);
  assert.deepEqual(checkPlan({ plan: sameFeature, inventory: null, profile }), [], 'a feature is the group of states one follow-up issue covers');
});

test('removes, migrates and adapts carry what their class needs; at most five Scope lines', () => {
  const plan = planWith([
    withMarkers('WL-01'),
    row('CAP-001', { class: 'remove', owner: null, reach: undefined, markers: undefined }),
    row('CAP-002', { class: 'migrate', reach: undefined, markers: undefined }),
    withMarkers('WL-02', { class: 'adapt' }),
    withMarkers('WL-03', { class: 'adapt', adapt: { rule: 'looks nicer', designText: 'a', productText: 'b' } }),
    withMarkers('WL-04', { class: 'adapt', adapt: { rule: 'The product behavior', designText: 'a', productText: 'b' } }),
  ], {
    scope: [1, 2, 3, 4, 5, 6].map((n) => ({ line: `S${n}`, rows: ['WL-01'], kind: 'adapt-behaviour', text: 't', default: 'd', appliesAtWave: 1, reply: null })),
  });
  plan.units[1].capabilities = ['CAP-002'];
  const f = checkPlan({ plan, inventory: null, profile });
  assert.deepEqual(codesFor(f, 'CAP-001').sort(), ['M1-remove-no-reason', 'M1-remove-no-scope']);
  assert.deepEqual(codesFor(f, 'CAP-002'), ['M1-migrate-no-target']);
  assert.deepEqual(codesFor(f, 'WL-02'), ['M1-adapt-invalid']);
  assert.deepEqual(codesFor(f, 'WL-03'), ['M1-adapt-invalid']);
  assert.deepEqual(codesFor(f, 'WL-04'), []);
  assert.ok(f.some((x) => x.code === 'M1-scope-too-long'));
  assert.equal(normaliseAdaptRule('Data not in the product'), 'data-not-in-product');
});

test('prop and unseedable states are capped; over the cap the plan must add a world or an intercept', () => {
  const prop = (id) => withMarkers(id, { reach: { class: 'prop', world: 'design', role: 'admin', steps: [], test: { file: `src/${id}.test.tsx`, name: 'renders' } } });
  const plan = planWith([withMarkers('WL-01'), withMarkers('WL-02'), withMarkers('WL-03'), prop('WL-04')]);
  assert.deepEqual(checkPlan({ plan, inventory: null, profile }).map((f) => f.code), ['M1-prop-cap']);
  const ok = planWith([withMarkers('WL-01'), withMarkers('WL-02'), withMarkers('WL-03'), withMarkers('WL-05'), prop('WL-04')]);
  assert.deepEqual(checkPlan({ plan: ok, inventory: null, profile }), [], '1 of 5 is 20%, the default cap');
});

test('no two units of one wave share a file; message files belong to the words unit alone', () => {
  const plan = planWith([withMarkers('WL-01'), withMarkers('WL-02', { owner: 'U2' })], {
    units: [
      { id: 'U0', title: 'Contracts', issue: null, kind: 'contract', wave: 0, files: ['src/contract.ts'], states: [], capabilities: [], risk: 'high', model: 'opus' },
      { id: 'U1', title: 'List', issue: null, kind: 'screen', wave: 1, files: ['src/widgets/**', 'apps/web/messages/en.json'], states: ['WL-01'], capabilities: [], risk: 'normal', model: 'sonnet' },
      { id: 'U2', title: 'Detail', issue: null, kind: 'screen', wave: 1, files: ['src/widgets/detail.tsx'], states: ['WL-02'], capabilities: [], risk: 'normal', model: 'sonnet' },
      { id: 'U3', title: 'Words', issue: null, kind: 'words', wave: 1, files: ['apps/web/messages/en.json', 'apps/web/messages/fr.json'], states: [], capabilities: [], risk: 'normal', model: 'sonnet' },
    ],
  });
  const f = checkPlan({ plan, inventory: null, profile });
  assert.deepEqual(f.map((x) => x.code).sort(), ['M1-file-overlap', 'M1-message-file']);
  assert.ok(filesOverlap('src/a/**', 'src/a/b/c.ts'));
  assert.ok(filesOverlap('src/a/*.ts', 'src/a/x.ts'));
  assert.ok(!filesOverlap('src/a/*.ts', 'src/a/b/x.ts'));
  assert.ok(!filesOverlap('src/a.ts', 'src/b.ts'));
});

test('every missing column or route has a unit to build it; wave 0 has the contract unit', () => {
  const plan = planWith([
    withMarkers('WL-01', { data: [{ table: 'widgets', column: 'colour', exists: false, verifiedBy: 'types' }] }),
    withMarkers('WL-02', { backend: [{ method: 'POST', route: '/api/widgets/[id]/copy', exists: false, verifiedBy: 'route-file' }] }),
    withMarkers('WL-03', { backend: [{ method: 'POST', route: '/api/widgets', exists: false, verifiedBy: 'route-file', unit: 'U7' }] }),
  ], { units: [{ id: 'U1', title: 'Widgets', issue: null, kind: 'screen', wave: 1, files: ['src/w.tsx'], states: ['WL-01', 'WL-02', 'WL-03'], capabilities: [], risk: 'normal', model: 'sonnet' }] });
  const f = checkPlan({ plan, inventory: null, profile });
  assert.deepEqual(f.map((x) => x.code).sort(), ['M1-backend-no-unit', 'M1-backend-no-unit', 'M1-backend-no-unit', 'M1-no-contract-unit']);
  plan.units.push({ id: 'U0', title: 'Contracts', issue: null, kind: 'contract', wave: 0, files: ['src/c.ts'], states: [], capabilities: [], risk: 'high', model: 'opus' });
  plan.units.push({ id: 'U7', title: 'Widget colour and copy routes', issue: null, kind: 'backend', wave: 1, files: ['supabase/migrations/1_widgets_colour.sql'], states: [], capabilities: [], risk: 'normal', model: 'sonnet' });
  plan.rows[1].backend[0].unit = 'U7';
  assert.deepEqual(checkPlan({ plan, inventory: null, profile }), []);
});

test('invariants must be machine-checkable; control targets must exist; requested items must be planned', () => {
  const plan = planWith([
    withMarkers('WL-01', { invariants: ['at most one widget row shows Publish', 'looks tidy on a busy day'], controls: [{ label: 'Open', testid: 't-open', effect: 'none', target: 'WL-99' }] }),
    withMarkers('WL-02', { requested: 'R1-01' }),
  ]);
  const intent = { requested: [{ id: 'R1-01', text: 'a', source: 'round 1', passWhen: 'x' }, { id: 'R2-04', text: 'the empty state', source: 'round 2', passWhen: 'y' }] };
  const f = checkPlan({ plan, inventory: null, intent, profile });
  assert.deepEqual(f.map((x) => x.code).sort(), ['M1-control-target', 'M1-invariant', 'M1-requested-unplanned']);
  assert.match(f.find((x) => x.code === 'M1-requested-unplanned').message, /R2-04/);
});

test('capabilities: every baseline capability has a row; route and control rows are captured like states', () => {
  const baseline = { schemaVersion: 1, base: { ref: 'origin/main', sha: 'a'.repeat(40) }, refreshes: [], capabilities: [
    { id: 'CAP-001', kind: 'route', signature: 'route:/widgets', screen: 'Widgets', evidence: [{ file: 'a.tsx', line: 1 }] },
    { id: 'CAP-002', kind: 'copy-key', signature: 'copy:widgets.title', screen: 'Widgets', evidence: [{ file: 'a.tsx', line: 2 }] },
    { id: 'CAP-003', kind: 'api-call', signature: 'api:POST /api/widgets', screen: 'Widgets', evidence: [{ file: 'a.tsx', line: 3 }] },
  ] };
  const plan = planWith([row('CAP-001', { class: 'keep', reach: undefined, markers: undefined }), row('CAP-002', { class: 'keep', reach: undefined, markers: undefined })]);
  plan.units[1].capabilities = ['CAP-001', 'CAP-002'];
  const f = checkPlan({ plan, inventory: null, baseline, profile });
  assert.deepEqual(f.map((x) => x.code).sort(), ['M1-missing-row', 'M1-no-markers', 'M1-no-reach']);
  assert.match(f.find((x) => x.code === 'M1-missing-row').message, /CAP-003/);
  assert.ok(f.filter((x) => x.code !== 'M1-missing-row').every((x) => x.message.includes('CAP-001')), 'only the route capability needs reach and markers');
});

test('planGate refuses a plan whose worlds have no world file, or an invalid one', async () => {
  const plan = planWith([withMarkers('WL-01')]);
  const inventory = inv(['WL-01']);

  const missing = await makeRun({ profile, plan, inventory, worldFiles: false });
  try {
    const r = await planGate(missing.ctx);
    assert.deepEqual(r.failures.map((f) => f.code), ['M1-no-world-file']);
    assert.match(r.failures[0].message, /world design has no world file at .*worlds\/design\.json/);
  } finally { missing.cleanup(); }

  const wrong = await makeRun({ profile, plan, inventory, worldFiles: { design: { schemaVersion: 1, world: 'day-one', rows: [] } } });
  try {
    const r = await planGate(wrong.ctx);
    assert.deepEqual(r.failures.map((f) => f.code), ['M1-world-file']);
    assert.match(r.failures[0].message, /says world "day-one", not "design"/);
  } finally { wrong.cleanup(); }

  const bad = await makeRun({ profile, plan, inventory, worldFiles: { design: { schemaVersion: 1, world: 'design' } } });
  try {
    const r = await planGate(bad.ctx);
    assert.deepEqual(r.failures.map((f) => f.code), ['M1-world-file']);
  } finally { bad.cleanup(); }
});

test('planGate reads the files: no plan, no inventory, a redesign without a baseline', async () => {
  const empty = await makeRun({ profile });
  try {
    const r = await planGate(empty.ctx);
    assert.deepEqual(r.failures.map((f) => f.code), ['M1-no-plan']);
  } finally { empty.cleanup(); }
  const run = await makeRun({ profile, plan: planWith([withMarkers('WL-01')]), inventory: inv(['WL-01']) });
  try {
    assert.deepEqual(await planGate(run.ctx), { ok: true, failures: [] });
  } finally { run.cleanup(); }
  const intent = { ...validExample('intent'), redesign: true };
  const red = await makeRun({ profile, plan: planWith([withMarkers('WL-01')]), files: {} });
  try {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(red.paths.deliveryDir, { recursive: true });
    writeFileSync(red.paths.intentJson, JSON.stringify(intent));
    const r = await planGate(red.ctx);
    assert.deepEqual(r.failures.map((f) => f.code).sort(), ['M1-no-baseline', 'M1-no-inventory', 'M1-requested-unplanned'].sort());
  } finally { red.cleanup(); }
});
