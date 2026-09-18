// The checks that reach outside the capture files: M9's click results, M11 (e2e specs against the
// preview, on a real temp repository with a stub runner) and M14 (rows left behind, with a stub
// data adapter). Nothing real is started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runChecksWith } from '../../lib/checks/index.mjs';
import { clickProblems } from '../../lib/checks/m9.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeRun, planWith, row, itemKey } from './helpers.mjs';

test('M9 reads the click results the capture writes beside an item: a dead control and a wrong target are P1', async () => {
  const controls = [
    { label: 'New widget', testid: 'w-new', effect: 'free', target: 'WL-02' },
    { label: 'Help', testid: 'w-help', effect: 'none', target: 'external' },
    { label: 'Buy', testid: 'w-buy', effect: 'metered', target: 'WL-03' },
  ];
  assert.deepEqual(clickProblems({ controls }, [
    { testid: 'w-new', target: 'WL-09', reached: false },
    { testid: 'w-help', target: null, reached: false, why: 'nothing happened' },
    { testid: 'w-buy', target: 'WL-03', reached: false },
  ]).map((p) => `${p.rule} ${p.testid}`), ['wrong-target w-new', 'dead-control w-help']);

  const run = await makeRun({
    plan: planWith([row('WL-01', { controls })]),
    captures: [{ runId: 'c-1', mode: 'branch', items: [{ state: 'WL-01', lines: ['Widgets'], dom: null }] }],
  });
  try {
    const key = itemKey({ state: 'WL-01', world: 'design', role: 'admin', width: 1440, locale: 'en', theme: 'light' });
    const { domFor } = await import('./helpers.mjs');
    writeFileSync(join(run.paths.captureDir('c-1'), `${key}.dom.json`), JSON.stringify(domFor(['Widgets'], { extra: [{ text: 'New widget', testid: 'w-new' }, { text: 'Help', testid: 'w-help' }, { text: 'Buy', testid: 'w-buy' }] })));
    writeFileSync(join(run.paths.captureDir('c-1'), `${key}.controls.json`), JSON.stringify([{ testid: 'w-new', target: 'WL-02', reached: false, why: 'the dialog did not open' }, { testid: 'w-help', target: 'external', reached: true }]));
    const res = await runChecksWith(run.ctx, ['M9'], { captureRunId: 'c-1' });
    assert.deepEqual(res.findings.map((f) => `${f.rule} ${f.severity}`), ['dead-control P1']);
    assert.match(res.findings[0].live, /the dialog did not open/);
    assert.deepEqual(res.notes, []);
  } finally { run.cleanup(); }
});

function repoWithSpecs() {
  const repo = makeTempRepo({ files: { 'apps/web/e2e/old.spec.ts': 'test("old", () => {});\n', 'README.md': 'x' } });
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  repo.write({ 'apps/web/e2e/widgets.spec.ts': 'test("widgets", () => {});\n', 'apps/web/e2e/delivery-capture.spec.ts': 'capture\n', 'apps/web/e2e/support/x.ts': 'x\n' });
  repo.commit('add a spec');
  return repo;
}

test('M11 runs the specs this branch changes, against the preview for its head, one P1 per failing spec', async () => {
  const repo = repoWithSpecs();
  const seen = [];
  try {
    const run = await makeRun({
      repoRoot: repo.dir, plan: planWith([row('WL-01')]), passthrough: ['git'],
      rules: [{ match: /playwright test/, result: (call, text) => { seen.push({ text, env: call.env }); return { code: 1, stdout: '  1 failed\n    widgets.spec.ts:1:1 › widgets\n' }; } }],
    });
    const preview = async (ctx, { sha }) => ({ url: `https://preview.example.invalid/${sha.slice(0, 7)}`, pending: false, detail: '' });
    const res = await runChecksWith(run.ctx, ['M11'], {}, { checkOpts: { resolvePreview: preview } });
    assert.equal(seen.length, 1, 'only the changed spec, not the capture spec or support files');
    assert.match(seen[0].text, /^node scripts\/heavy\.mjs -- 'npx playwright test apps\/web\/e2e\/widgets\.spec\.ts'$/);
    assert.match(seen[0].env.E2E_BASE_URL, /^https:\/\/preview\.example\.invalid\//);
    assert.deepEqual(res.findings.map((f) => `${f.rule} ${f.severity} ${f.state}`), ['e2e-failed P1 apps/web/e2e/widgets.spec.ts']);
    assert.match(res.findings[0].live, /1 failed/);

    await assert.rejects(runChecksWith(run.ctx, ['M11'], {}, { checkOpts: { resolvePreview: async () => ({ url: null, pending: true, detail: 'building' }) } }), (e) => e.exit === 4);
    const none = await runChecksWith(run.ctx, ['M11'], {}, { checkOpts: { resolvePreview: async () => ({ url: null, pending: false, detail: 'no previews in this repository' }) } });
    assert.match(none.failures[0].message, /needs a preview URL/);
  } finally { repo.cleanup(); }
});

test('M11 with no changed spec runs nothing and says so', async () => {
  const repo = makeTempRepo({ files: { 'README.md': 'x' } });
  try {
    repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const run = await makeRun({ repoRoot: repo.dir, plan: planWith([row('WL-01')]), passthrough: ['git'] });
    const res = await runChecksWith(run.ctx, ['M11'], {}, { checkOpts: { resolvePreview: async () => assert.fail('no preview needed') } });
    assert.deepEqual(res.findings, []);
    assert.match(res.notes[0], /no e2e spec/);
  } finally { repo.cleanup(); }
});

test('M14: rows a capture created and did not tear down are P2 leftovers; odd ids are noted, never queried', async () => {
  const run = await makeRun({
    plan: planWith([row('WL-01')]),
    captures: [{ runId: 'c-2', items: [{ state: 'WL-01', lines: ['A'], createdRowIds: ['widgets:abc', 'widgets:def', 'Bad Table:x', 'noid'] }] }],
  });
  try {
    const queries = [];
    const adapter = async () => ({ query: async (sql, params) => { queries.push({ sql, params }); return [{ id: 'abc' }]; } });
    const res = await runChecksWith(run.ctx, ['M14'], { captureRunId: 'c-2' }, { checkOpts: { createDataAdapter: adapter } });
    assert.deepEqual(res.findings.map((f) => `${f.rule} ${f.severity} ${f.where}`), ['leftover-rows P2 widgets:abc']);
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /from "widgets"/);
    assert.deepEqual(queries[0].params, [['abc', 'def']]);
    assert.ok(res.notes.some((n) => /2 created row id/.test(n)));
  } finally { run.cleanup(); }
});

test('the unit gate flags a stub still imported after the stub swap', async () => {
  const { unitGateStatusWith } = await import('../../lib/gate/unit.mjs');
  const { featurePaths } = await import('../../lib/core/paths.mjs');
  const { makeProfile } = await import('../helpers/fixtures.mjs');
  const { makeTestCtx } = await import('../helpers/ctx.mjs');
  const repo = makeTempRepo({ files: { 'src/widgets/list.tsx': "import { data } from './data.stub';\n", 'src/widgets/data.stub.ts': 'export const data = [];\n', 'src/widgets/list.test.tsx': "import { data } from './data.stub';\n" } });
  try {
    const head = repo.git('rev-parse', 'HEAD');
    repo.git('branch', 'unit/swap');
    const profile = makeProfile();
    const paths = featurePaths(repo.dir, 'widgets', profile.paths);
    const plan = planWith([], { units: [{ id: 'U5', title: 'Stub swap', issue: null, kind: 'stub-swap', wave: 2, files: ['src/widgets/**'], states: [], capabilities: [], risk: 'normal', model: 'sonnet' }] });
    mkdirSync(paths.units, { recursive: true });
    mkdirSync(paths.deliveryDir, { recursive: true });
    writeFileSync(paths.plan, JSON.stringify(plan));
    writeFileSync(paths.unitReport('U5'), JSON.stringify({ schemaVersion: 1, unit: 'U5', branch: 'unit/swap', commits: [head], statesDone: [], statesNotDone: [], testsAdded: [], unitCheck: { command: 'npm test', exit: 0 }, decisions: [], looseEnds: [] }));
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile, passthrough: ['git'] });
    const r = await unitGateStatusWith(ctx, 'U5', {});
    assert.deepEqual(r.failures.map((f) => f.message), [`src/widgets/list.tsx still imports a stub at ${head.slice(0, 12)}`]);
  } finally { repo.cleanup(); }
});
