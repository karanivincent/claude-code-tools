// W8: skipped tests do not block a push, and the map warns about test ids a redesign will retire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import mapCommand from '../../lib/commands/map.mjs';
import { likelyRetiredIds, mapTestIds, prepushProblems, specNames, withoutSkipped } from '../../lib/lifecycle/prepush.mjs';
import { makeTempRepo, makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { commitAll, startRun, writeFiles } from '../run/support.mjs';

const PAGE = 'apps/web/src/components/widgets/toolbar.tsx';
const SPEC = 'apps/web/e2e/widgets.spec.ts';
const ROUTE = 'apps/web/src/app/w/page.tsx';

test('withoutSkipped cuts test.skip, test.describe.skip and .fixme calls, whole, and keeps the rest', () => {
  const src = [
    "test('live', async ({ page }) => { await page.getByTestId('live-id').click(); });",
    "test.skip('off', async ({ page }) => { await page.getByTestId('skipped-id').click(); });",
    "test.describe.skip('group', () => { test('inner', async ({ page }) => { await page.getByTestId('group-id').click(); }); });",
    "test.fixme('broken', async ({ page }) => { await page.getByTestId('fixme-id').click(); });",
    "it.skip('jest style', () => { getByTestId('it-skip-id'); });",
    "test('after', async ({ page }) => { await page.getByTestId('after-id').click(); });",
  ].join('\n');
  const out = withoutSkipped(src);
  assert.match(out, /live-id/);
  assert.match(out, /after-id/);
  for (const id of ['skipped-id', 'group-id', 'fixme-id', 'it-skip-id', 'inner']) assert.doesNotMatch(out, new RegExp(id), `${id} is cut`);
  assert.equal(withoutSkipped('no skips here'), 'no skips here');
});

test('specNames ignores ids in skipped tests, through nested parentheses, strings with parentheses and template literals', () => {
  const src = [
    "test.skip('title with ) and ( parens', async ({ page }) => {",
    "  await expect(page.getByTestId('nested-id')).toBeVisible();",
    "  const s = `template ) ${'x'} getByTestId('template-id')`;",
    "  await page.getByText('Text in skipped').click();",
    '});',
    "test('kept', async ({ page }) => { await page.getByTestId('kept-id').click(); await page.getByText('Kept text').click(); });",
  ].join('\n');
  const { testIds, texts } = specNames(src);
  assert.deepEqual([...testIds], ['kept-id']);
  assert.deepEqual([...texts], ['Kept text']);
});

/** A repo on main with a bare origin and a feature branch; base files are committed and pushed first. */
async function setup({ base = {}, profile = makeProfile(), feature = null } = {}) {
  const repo = makeTempRepo({ files: { '.gitignore': '.delivery/\n', '.claude/delivery-profile.json': profile, '.claude/delivery-safety.json': makeSafety(), ...base } });
  const bare = makeTempDir('delivery-origin-');
  execFileSync('git', ['clone', '-q', '--bare', repo.dir, bare.dir]);
  repo.git('remote', 'add', 'origin', bare.dir);
  repo.git('fetch', '-q', 'origin');
  repo.git('checkout', '-q', '-b', 'feature');
  const t = await makeTestCtx({ repoRoot: repo.dir, passthrough: ['git'], profile, feature });
  return { repo, ...t, cleanup() { repo.cleanup(); bare.cleanup(); } };
}

test('prepush: an id only inside a skipped test is no longer a removed-name problem; the same id in a live test still is', async () => {
  const skipped = "test.skip('off', async ({ page }) => { await page.getByTestId('save-widget').click(); });\n";
  const live = "test('on', async ({ page }) => { await page.getByTestId('save-widget').click(); });\n";
  for (const [spec, expected] of [[skipped, []], [live, ['removed-name']], [`${skipped}${live}`, ['removed-name']]]) {
    const s = await setup({ base: { [SPEC]: spec, [PAGE]: '<button data-testid="save-widget">Save</button>\n' } });
    try {
      writeFiles(s.repo.dir, { [PAGE]: '<button>Save</button>\n' });
      commitAll(s.repo.dir, 'drop the id');
      const problems = await prepushProblems(s.ctx);
      assert.deepEqual(problems.map((p) => p.code), expected);
      if (expected.length) assert.match(problems[0].message, /test id "save-widget"/);
    } finally { s.cleanup(); }
  }
});

const MAP_SOURCES = { '/w': ['apps/web/src/app/w/**'] };
const specNaming = (...ids) => `${ids.map((id) => `test('${id}', async ({ page }) => { await page.getByTestId('${id}').click(); });`).join('\n')}\n`;
const mapKeeping = (...ids) => ({ sources: MAP_SOURCES, states: [{ id: 'W-01', buttons: ids.map((testid) => ({ testid })) }] });

test('mapTestIds: buttons, reach steps on both widths, and masks', () => {
  const ids = mapTestIds({ states: [{ id: 'A', buttons: [{ testid: 'b1' }], reach: { steps: [{ click: { testid: 'r1' } }, { type: { testid: 'r2', text: 'x' } }, { goto: '/x' }], phone: { steps: [{ open: { testid: 'p1' } }] } }, mask: [{ testid: 'm1' }] }] });
  assert.deepEqual([...ids].sort(), ['b1', 'm1', 'p1', 'r1', 'r2']);
  assert.deepEqual([...mapTestIds(null)], []);
});

test('likelyRetiredIds: a base spec id the route code has and the map does not keep is likely retired; a kept one is not', async () => {
  const s = await setup({ base: {
    [SPEC]: specNaming('old-id', 'kept-id', 'not-in-code'),
    [ROUTE]: '<a data-testid="old-id">x</a><b data-testid="kept-id">y</b>\n',
  } });
  try {
    const r = await likelyRetiredIds(s.ctx, { profile: await s.ctx.profile(), map: mapKeeping('kept-id') });
    assert.equal(r.note, null);
    assert.deepEqual(r.ids, [{ id: 'old-id', spec: SPEC }], 'not-in-code is not in the page today, kept-id is kept');
  } finally { s.cleanup(); }
});

test('likelyRetiredIds: an id only inside a skipped spec test is not counted; a map with no sources says so', async () => {
  const s = await setup({ base: {
    [SPEC]: `test.skip('off', async ({ page }) => { await page.getByTestId('old-id').click(); });\n${specNaming('live-old')}`,
    [ROUTE]: '<a data-testid="old-id">x</a><a data-testid="live-old">y</a>\n',
  } });
  try {
    const profile = await s.ctx.profile();
    assert.deepEqual((await likelyRetiredIds(s.ctx, { profile, map: mapKeeping() })).ids.map((x) => x.id), ['live-old']);
    const none = await likelyRetiredIds(s.ctx, { profile, map: { states: [] } });
    assert.deepEqual(none.ids, []);
    assert.match(none.note, /names no route sources/);
  } finally { s.cleanup(); }
});

test('delivery map prints the retired-id warning and the overlap result set, and still exits 0', async () => {
  const s = await setup({ feature: 'widgets', base: {
    [SPEC]: specNaming('old-id', 'kept-id'),
    [ROUTE]: '<a data-testid="old-id">x</a><b data-testid="kept-id">y</b>\n',
  } });
  try {
    const map = { schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/w', pageArea: { left: 240, designLeft: 240 }, sources: MAP_SOURCES, worlds: [],
      states: [{ id: 'W-01', screen: 'Main', name: 'Everything', design: false, reach: { test: 'w.state.test.tsx :: W-01' }, buttons: [{ label: 'Keep', testid: 'kept-id', effect: 'free' }] }] };
    writeFiles(s.repo.dir, { 'docs/delivery/widgets/map.json': map });
    commitAll(s.repo.dir, 'map');
    const paths = await startRun(s.repo.dir, { phase: 'build' });
    assert.equal(await mapCommand.run(s.ctx, []), 0, 'a warning never changes the exit');
    assert.match(s.stderr.text(), /WARN test id "old-id" is named by apps\/web\/e2e\/widgets\.spec\.ts on the base branch/);
    assert.doesNotMatch(s.stderr.text(), /"kept-id"/);
    assert.match(readFileSync(paths.deliveryDir + '/checklist.md', 'utf8'), /W-01/, 'checklist.md is still written');
  } finally { s.cleanup(); }
});

test('delivery map --json carries retiredTestIds and overlap', async () => {
  const s = await setup({ feature: 'widgets', base: { [SPEC]: specNaming('old-id'), [ROUTE]: '<a data-testid="old-id">x</a>\n' } });
  try {
    const t = await makeTestCtx({ repoRoot: s.repo.dir, passthrough: ['git'], profile: makeProfile(), feature: 'widgets', json: true });
    const map = { schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/w', pageArea: { left: 240, designLeft: 240 }, sources: MAP_SOURCES, worlds: [],
      states: [{ id: 'W-01', screen: 'Main', name: 'Everything', design: false, reach: { test: 'w.state.test.tsx :: W-01' }, buttons: [] }] };
    writeFiles(s.repo.dir, { 'docs/delivery/widgets/map.json': map });
    commitAll(s.repo.dir, 'map');
    await startRun(s.repo.dir, { phase: 'build' });
    assert.equal(t.ctx.out.finish(await mapCommand.run(t.ctx, [])), 0);
    const j = JSON.parse(t.stdout.text());
    const m = j.map ?? j.data?.map ?? j;
    assert.deepEqual(m.retiredTestIds, [{ id: 'old-id', spec: SPEC }]);
    assert.deepEqual(m.overlap, []);
  } finally { s.cleanup(); }
});
