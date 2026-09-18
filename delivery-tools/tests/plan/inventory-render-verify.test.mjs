// inventory check, spec.md rendering, and plan verify on synthetic inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInventory, inventoryGate } from '../../lib/plan/inventory-check.mjs';
import { renderSpec } from '../../lib/plan/render.mjs';
import { parseDatabaseTypes, urlForRouteFile, routeMatches, exportedMethods, hasDiscriminator, verifyPlanClaims, globToRe } from '../../lib/plan/verify.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import { makeRun, planWith, row, validAgainstSchema } from '../checks/helpers.mjs';

const TREE = '2'.repeat(64);
const state = (id, o = {}) => ({ id, screen: 'Widgets', name: `state ${id}`, reach: { kind: 'click-path', steps: [{ click: 'Widgets' }] }, shots: [], render: { status: 'ok' }, controls: [{ label: 'Open', role: 'button', target: 'none', effect: 'none' }], ...o });
const inventory = (states, candidates = []) => ({ schemaVersion: 1, feature: 'widgets', designTreeSha256: TREE, candidates, states });
const candidates = (list) => ({ schemaVersion: 1, feature: 'widgets', adapter: 'claude-design', designTreeSha256: TREE, candidates: list });

test('inventory: every candidate mapped or excluded with a reason, and none left out', () => {
  const inv = inventory([state('WL-01')], [
    { id: 'C-001', kind: 'set-target', source: 'd.html:1', mappedTo: 'WL-01' },
    { id: 'C-002', kind: 'list', source: 'd.html:2', mappedTo: null },
    { id: 'C-003', kind: 'shot', source: 'shots/a.png', mappedTo: null, excluded: { reason: 'an earlier round' } },
    { id: 'C-004', kind: 'dialog', source: 'd.html:4', mappedTo: 'WL-09' },
  ]);
  validAgainstSchema('inventory', inv);
  const cands = candidates(['C-001', 'C-002', 'C-003', 'C-004', 'C-005'].map((id) => ({ id, kind: 'ternary', source: 'd.html:9' })));
  const f = checkInventory({ inventory: inv, candidates: cands });
  assert.deepEqual(f.map((x) => x.code).sort(), ['candidate-mapped-unknown', 'candidate-missing', 'candidate-unmapped']);
  assert.match(f.find((x) => x.code === 'candidate-missing').message, /C-005/);
});

test('inventory: each state has a reference, a render or a reason, and controls or an explicit none', () => {
  const inv = inventory([
    state('WL-01'),
    state('WL-02', { reach: { kind: 'click-path', steps: [] } }),
    state('WL-03', { render: { status: 'impossible' } }),
    state('WL-04', { reach: { kind: 'unspecified', unspecified: 'loading' } }),
    state('WL-05', { controls: [] }),
    state('WL-06', { controls: [{ label: '', role: 'none', target: 'none', effect: 'none' }] }),
    state('WL-07', { controls: [{ label: 'Go', role: 'link', target: 'WL-99', effect: 'none' }] }),
    state('WL-08', { reach: { kind: 'unspecified', unspecified: 'empty' }, render: { status: 'impossible', why: 'the design draws no empty list' } }),
  ]);
  const f = checkInventory({ inventory: inv, renderExists: (id, ext) => !(id === 'WL-01' && ext === 'png') });
  const by = (id) => f.filter((x) => x.message.includes(`${id} `) || x.message.includes(`${id}.`)).map((x) => x.code).sort();
  assert.deepEqual(by('WL-01'), ['state-no-render']);
  assert.deepEqual(by('WL-02'), ['state-no-reference']);
  assert.deepEqual(by('WL-03'), ['state-no-render']);
  assert.deepEqual(by('WL-04'), ['state-no-render']);
  assert.deepEqual(by('WL-05'), ['state-no-controls']);
  assert.deepEqual(by('WL-06'), []);
  assert.deepEqual(by('WL-07'), ['control-invalid']);
  assert.deepEqual(by('WL-08'), []);
});

test('inventory: a stale tree is refused; a redesign needs capabilities with evidence', () => {
  const inv = inventory([state('WL-01')]);
  const stale = { ...candidates([]), designTreeSha256: '3'.repeat(64) };
  assert.deepEqual(checkInventory({ inventory: inv, candidates: stale }).map((x) => x.code), ['inventory-stale']);
  const baseline = { capabilities: [{ id: 'CAP-001', kind: 'route', signature: 'route:/w', screen: 'W', evidence: [] }] };
  assert.deepEqual(checkInventory({ inventory: inv, intent: { redesign: true }, baseline }).map((x) => x.code), ['capability-invalid']);
  assert.deepEqual(checkInventory({ inventory: inv, intent: { redesign: true } }).map((x) => x.code), ['baseline-missing']);
});

test('inventoryGate finds the render files on disk', async () => {
  const inv = inventory([state('WL-01'), state('WL-02')]);
  const run = await makeRun({ inventory: inv, designs: { 'WL-01': { txt: 'Widgets\n', dom: validExample('dom') } } });
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(run.paths.designRender('WL-01', 'png'), 'png');
    writeFileSync(run.paths.candidates, JSON.stringify(candidates([])));
    const r = await inventoryGate(run.ctx);
    assert.deepEqual(r.failures.map((f) => f.code), ['state-no-render']);
    assert.match(r.failures[0].message, /WL-02\.txt, WL-02\.dom\.json, WL-02\.png/);
  } finally { run.cleanup(); }
});

test('renderSpec is deterministic, covers every row, and escapes table cells', () => {
  const plan = planWith([
    row('WL-01', { copy: [{ key: 'widgets.title', en: 'Widgets | all', plural: false }], markers: { text: ['Widgets'], testids: ['w-list'], forbidden: ['w-empty'] }, controls: [{ label: 'New', testid: 'w-new', effect: 'free', target: 'WL-02' }], invariants: ['at most one row shows Publish'] }),
    row('WL-02', { class: 'cut', owner: null, reach: undefined, reason: { code: 'money', text: 'paid' }, issue: 7, requested: 'R1-01', scopeLine: 'S1' }),
  ], { scope: [{ line: 'S1', rows: ['WL-02'], kind: 'cut-requested', text: 'Cut "New widget" (reason money).', default: 'cut; follow-up #7', appliesAtWave: 1, reply: null }] });
  const a = renderSpec(plan);
  assert.equal(a, renderSpec(structuredClone(plan)));
  assert.ok(a.endsWith('\n') && !a.endsWith('\n\n'));
  for (const s of ['# widgets: the build spec', '### U1: Widgets', '#### WL-01 · new · U1', '#### WL-02 · cut', '- S1 · Cut "New widget"', 'Widgets \\| all', '`w-list`', 'at most one row shows Publish', 'Reason: money, paid.']) {
    assert.ok(a.includes(s), `missing: ${s}`);
  }
  assert.notEqual(renderSpec({ ...plan, epic: 102 }), a);
});

test('database types: tables and views with their columns', () => {
  const types = `export type Database = { public: { Tables: {
      widgets: { Row: { id: string; name: string | null; meta: { a: number } } Insert: { id?: string; name?: string } Update: {} Relationships: [] }
      "odd_table": { Row: { "weird": number } }
    } Views: { widget_counts: { Row: { total: number | null } } } } }`;
  const t = parseDatabaseTypes(types);
  assert.deepEqual([...t.get('widgets')].sort(), ['id', 'meta', 'name']);
  assert.deepEqual([...t.get('odd_table')], ['weird']);
  assert.deepEqual([...t.get('widget_counts')], ['total']);
});

test('route files: the URL they serve, planned routes matched to them, methods and discriminators', () => {
  const glob = 'apps/web/src/app/api/**/route.ts';
  assert.ok(globToRe(glob).test('apps/web/src/app/api/widgets/[id]/copy/route.ts'));
  assert.ok(globToRe('apps/web/src/app/[[]locale]/**/page.tsx').test('apps/web/src/app/[locale]/widgets/page.tsx'));
  assert.equal(urlForRouteFile('apps/web/src/app/api/widgets/[id]/copy/route.ts', glob), '/api/widgets/[id]/copy');
  assert.equal(urlForRouteFile('apps/web/src/app/(group)/api/x/route.ts', 'apps/web/src/app/**/route.ts'), '/api/x');
  assert.ok(routeMatches('/api/widgets/[widgetId]/copy', '/api/widgets/[id]/copy'));
  assert.ok(routeMatches('/widgets/[id]', '/[locale]/widgets/[id]'));
  assert.ok(!routeMatches('/api/widgets/copy', '/api/widgets/[id]/copy'));
  assert.deepEqual([...exportedMethods('export async function POST(r) {}\nexport const GET = h;\nexport { h as PATCH, other }')].sort(), ['GET', 'PATCH', 'POST']);
  assert.ok(hasDiscriminator(["const body = z.object({ mode: z.enum(['draft', 'final']) })"], 'mode=draft'));
  assert.ok(!hasDiscriminator(["const body = z.object({ kind: z.enum(['draft']) })"], 'mode=draft'));
});

test('verifyPlanClaims: true claims pass, false ones in either direction fail, the rest are listed', async () => {
  const profile = makeProfile();
  const files = {
    'apps/web/src/app/api/widgets/route.ts': "import { schema } from './schema';\nexport async function POST(req) { return schema.parse(req); }\n",
    'apps/web/src/app/api/widgets/schema.ts': "export const schema = z.object({ mode: z.enum(['draft', 'final']) });\n",
    'apps/web/src/app/api/widgets/[id]/route.ts': 'export async function GET() {}\n',
    'packages/types/src/database.ts': 'Tables: { widgets: { Row: { id: string; name: string } } }',
  };
  const run = await makeRun({ files });
  try {
    const plan = planWith([row('WL-01', {
      data: [
        { table: 'widgets', column: 'name', exists: true, verifiedBy: 'types' },
        { table: 'widgets', column: 'colour', exists: true, verifiedBy: 'types' },
        { table: 'widgets', column: 'id', exists: false, verifiedBy: 'types' },
        { table: 'gadgets', column: 'x', exists: true, verifiedBy: 'verify-spec' },
      ],
      backend: [
        { method: 'POST', route: '/api/widgets', discriminator: 'mode=draft', exists: true, verifiedBy: 'route-file' },
        { method: 'POST', route: '/api/widgets', discriminator: 'mode=archive', exists: true, verifiedBy: 'route-file' },
        { method: 'DELETE', route: '/api/widgets/[widgetId]', exists: true, verifiedBy: 'route-file' },
        { method: 'GET', route: '/api/widgets/[id]', exists: false, verifiedBy: 'route-file', unit: 'U1' },
        { method: 'POST', route: '/api/widgets/[id]/copy', exists: false, verifiedBy: 'route-file', unit: 'U1' },
      ],
    })]);
    const res = await verifyPlanClaims({ plan, repoRoot: run.dir, files: Object.keys(files), profile, typesText: files['packages/types/src/database.ts'] });
    assert.equal(res.checked, 8);
    assert.deepEqual(res.left, ['WL-01: gadgets.x exists']);
    const msgs = res.failures.map((f) => f.message);
    assert.equal(msgs.length, 5);
    assert.ok(msgs.some((m) => /widgets\.colour is claimed to exist/.test(m)));
    assert.ok(msgs.some((m) => /widgets\.id is claimed missing/.test(m)));
    assert.ok(msgs.some((m) => /mode=archive/.test(m) && /never names/.test(m)));
    assert.ok(msgs.some((m) => /DELETE/.test(m) && /does not export DELETE/.test(m)));
    assert.ok(msgs.some((m) => /GET \/api\/widgets\/\[id\] is claimed missing/.test(m)));
  } finally { run.cleanup(); }
});
