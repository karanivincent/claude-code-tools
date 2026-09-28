// Intake (spec 4.0): idempotent on the archive hash; the epic before the branch; the snapshot with
// its runtime zipped and its hashes in the README; the intent drafted between two runs; the
// phase-0 gate recomputed from the files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeZip, readZip } from '../../lib/core/zip.mjs';
import { listTree } from '../../lib/core/hash.mjs';
import { loadState } from '../../lib/core/state.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { hasMarker, makeMarker } from '../../lib/core/markers.mjs';
import { validExample, makeProfile } from '../helpers/fixtures.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { runIntake, verifyIntake, slugify, stripCommonRoot, parseSnapshotReadme, renderIntentMd } from '../../lib/lifecycle/intake.mjs';
import intakeCommand from '../../lib/commands/intake.mjs';
import { makeRunRepo, ctxFor } from './support.mjs';

/** A stand-in for slice C's Claude Design adapter, with the same interface. */
const fakeAdapter = {
  name: 'claude-design',
  async detect(dir) {
    const files = await listTree(dir);
    const html = files.filter((f) => /^[^/]+\.dc\.html$/.test(f));
    return html.length === 1 ? { ok: true, project: 'Widgets', exportedAt: '2026-01-14' } : { ok: false, reason: `expected one *.dc.html, found ${html.length}` };
  },
  async snapshotLayout(dir) {
    const files = await listTree(dir);
    return { copy: files.filter((f) => !f.startsWith('uploads/') && !f.endsWith('.js')), zip: files.filter((f) => f.endsWith('.js')) };
  },
  async candidates() { return []; },
};
const deps = { getDesignAdapter: async () => fakeAdapter };

function exportZip(path, html = '<main>Widgets</main>') {
  writeFileSync(path, writeZip([
    { name: 'Widgets/widgets.dc.html', data: html },
    { name: 'Widgets/shots/01.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { name: 'Widgets/support.js', data: 'window.demo = 1;' },
    { name: 'Widgets/_ds/tokens.css', data: ':root { --x: 1; }' },
    { name: 'Widgets/uploads/round-1.png', data: Buffer.from([1, 2, 3]) },
  ]));
}

test('first intake: epic, worktree, snapshot, intent inputs, state and one commit; NEXT names the extractor', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    exportZip(zip);
    writeFileSync(join(repo.root, 'round-1-brief.md'), '# Round 1\n');
    const { ctx, gh, stdout } = await ctxFor(repo.primary, { feature: null, deps });
    const code = await intakeCommand.run(ctx, [zip, '--intent', 'Redesign the widgets page.', '--brief', join(repo.root, 'round-1-brief.md')]);
    assert.equal(code, 1, 'intent.json not drafted yet');
    const out = stdout.text();
    assert.match(out, /NEXT: switch this session into .*delivery-widgets with EnterWorktree .*; draft docs\/delivery\/widgets\/intent\.json with one delivery-extractor/);
    const epic = await gh.issueGet(1);
    assert.ok(hasMarker(epic.body, makeMarker({ feature: 'widgets', kind: 'epic' })));
    const wt = join(repo.primary, '.claude', 'worktrees', 'delivery-widgets');
    const snap = join(wt, 'docs/design/widgets');
    assert.deepEqual((await listTree(snap)).sort(), ['.gitignore', 'README.md', '_ds/tokens.css', 'runtime.zip', 'shots/01.png', 'widgets.dc.html']);
    assert.deepEqual(readZip(readFileSync(join(snap, 'runtime.zip'))).map((e) => e.name), ['support.js']);
    assert.match(readFileSync(join(snap, '.gitignore'), 'utf8'), /^\/support\.js$/m);
    assert.ok(parseSnapshotReadme(readFileSync(join(snap, 'README.md'), 'utf8')));
    assert.ok(existsSync(join(wt, 'docs/delivery/widgets/intent/uploads/round-1.png')));
    assert.ok(existsSync(join(wt, 'docs/delivery/widgets/intent/briefs/round-1-brief.md')));
    const state = await loadState(join(wt, '.delivery/widgets/state.json'));
    assert.equal(state.branch, 'epic/1-widgets');
    assert.equal(state.epic, 1);
    const g = (...a) => repo.git('-C', wt, ...a);
    assert.equal(g('rev-parse', '--abbrev-ref', 'HEAD'), 'epic/1-widgets');
    assert.equal(g('log', '-1', '--format=%s'), 'Snapshot the Widgets design export and the intent for widgets');
    assert.equal(g('status', '--porcelain'), '', 'everything intake wrote is committed');
  } finally { repo.cleanup(); }
});

test('the same archive again changes nothing; the drafted intent is fixed up, rendered, committed and shown on the epic', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    exportZip(zip);
    const { ctx, gh } = await ctxFor(repo.primary, { feature: null, deps });
    await runIntake(ctx, { source: zip, sentence: 'Redesign the widgets page.' });
    const wt = join(repo.primary, '.claude', 'worktrees', 'delivery-widgets');
    const g = (...a) => repo.git('-C', wt, ...a);
    const head = g('rev-parse', 'HEAD');
    const writes = gh.db.writes.length;
    const again = await runIntake(ctx, { source: zip });
    assert.ok(again.lines.some((l) => /snapshot unchanged/.test(l)));
    assert.equal(g('rev-parse', 'HEAD'), head, 'no new commit');
    assert.equal(gh.db.writes.length, writes, 'no GitHub write');

    const draft = { ...validExample('intent'), feature: 'widgets', epic: null, job: 'Owners keep their widgets tidy.' };
    writeFileSync(join(wt, 'docs/delivery/widgets/intent.json'), JSON.stringify(draft, null, 2));
    const done = await runIntake(ctx, { source: zip });
    assert.equal(done.exit, 0);
    const intent = JSON.parse(readFileSync(join(wt, 'docs/delivery/widgets/intent.json'), 'utf8'));
    assert.equal(intent.epic, 1);
    assert.equal(intent.design.project, 'Widgets');
    assert.equal(intent.design.snapshotDir, 'docs/design/widgets');
    assert.match(readFileSync(join(wt, 'docs/delivery/widgets/intent.md'), 'utf8'), /Owners keep their widgets tidy\./);
    assert.match((await gh.issueGet(1)).body, /Owners keep their widgets tidy\./);
    assert.equal(g('status', '--porcelain'), '');
    assert.notEqual(g('rev-parse', 'HEAD'), head);

    const wctx = (await ctxFor(wt, { deps })).ctx;
    wctx.gh = gh;
    assert.deepEqual((await verifyIntake(wctx)).failures, []);
    writeFileSync(join(wt, 'docs/design/widgets/widgets.dc.html'), '<main>edited by hand</main>');
    const red = await verifyIntake(wctx);
    assert.ok(red.failures.some((f) => /edited after intake/.test(f.message)));
  } finally { repo.cleanup(); }
});

test('a new export replaces the snapshot wholesale and asks for a re-inventory', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    exportZip(zip);
    const { ctx } = await ctxFor(repo.primary, { feature: null, deps });
    await runIntake(ctx, { source: zip, sentence: 'Redesign the widgets page.' });
    const wt = join(repo.primary, '.claude', 'worktrees', 'delivery-widgets');
    writeFileSync(join(wt, 'docs/delivery/widgets/intent.json'), JSON.stringify({ ...validExample('intent'), feature: 'widgets' }, null, 2));
    await runIntake(ctx, { source: zip });
    exportZip(zip, '<main>Widgets, round 2</main>');
    const res = await runIntake(ctx, { source: zip });
    assert.ok(res.lines.some((l) => /replaced the snapshot with the new export/.test(l)));
    assert.match(res.next, /re-run design candidates and design render/);
    assert.equal(repo.git('-C', wt, 'log', '-1', '--format=%s'), 'Replace the widgets design snapshot with the new Widgets export');
    const paths = featurePaths(wt, 'widgets', {});
    const intent = JSON.parse(readFileSync(paths.intentJson, 'utf8'));
    const readme = parseSnapshotReadme(readFileSync(join(paths.designSnapshot, 'README.md'), 'utf8'));
    assert.equal(intent.design.archiveSha256, readme.archive);
  } finally { repo.cleanup(); }
});

test('--epic adopts the founder\'s issue; an unrecognised export is a usage error', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    exportZip(zip);
    const { ctx, gh } = await ctxFor(repo.primary, { feature: null, deps });
    await gh.issueCreate({ title: 'Widgets, redesigned', body: 'What I want.' });
    const res = await runIntake(ctx, { source: zip, sentence: 'Redesign the widgets page.', epic: 1 });
    assert.equal(res.epic, 1);
    assert.equal(res.branch, 'epic/1-widgets');
    const body = (await gh.issueGet(1)).body;
    assert.match(body, /^What I want\./);
    assert.ok(hasMarker(body, makeMarker({ feature: 'widgets', kind: 'epic' })));
    await assert.rejects(runIntake(ctx, { source: zip, epic: 7 }), (e) => e.exit === 2 && /would move it/.test(e.message));

    const bad = join(repo.root, 'bad.zip');
    writeFileSync(bad, writeZip([{ name: 'notes.txt', data: 'hi' }]));
    await assert.rejects(runIntake(ctx, { source: bad, sentence: 'x' }), (e) => e.exit === 2 && /not a recognised claude-design export/.test(e.message));
    await assert.rejects(runIntake(ctx, { source: join(repo.root, 'missing.zip'), sentence: 'x' }), (e) => e.exit === 2);
  } finally { repo.cleanup(); }
});

test('a standalone HTML download is refused by name, with what to export instead', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const { ctx } = await ctxFor(repo.primary, { feature: null, deps });
    const html = join(repo.root, 'Calls (standalone).html');
    writeFileSync(html, '<!DOCTYPE html><script type="__bundler/manifest">{}</script>');
    await assert.rejects(runIntake(ctx, { source: html, sentence: 'x' }),
      (e) => e.exit === 2 && /standalone HTML/.test(e.message) && /\.zip/.test(e.message) && !/zip entry|central directory/i.test(e.message));
    const other = join(repo.root, 'notes.txt');
    writeFileSync(other, 'hi');
    await assert.rejects(runIntake(ctx, { source: other, sentence: 'x' }), (e) => e.exit === 2 && /not a \.zip archive/.test(e.message));
  } finally { repo.cleanup(); }
});

test('a feature named on the first intake is kept by later runs inside its worktree', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    exportZip(zip);
    const first = await ctxFor(repo.primary, { feature: 'gizmos', deps });
    const res = await runIntake(first.ctx, { source: zip, sentence: 'Build the gizmos page.' });
    assert.equal(res.feature, 'gizmos');
    const inside = await ctxFor(res.worktree, { feature: null, deps, gh: first.gh });
    const again = await runIntake(inside.ctx, { source: zip });
    assert.equal(again.feature, 'gizmos');
    assert.equal(again.worktree, res.worktree);
    assert.equal(first.gh.db.writes.filter((w) => w.op === 'issueCreate').length, 1);
  } finally { repo.cleanup(); }
});

/** A real (not faked) Claude Design export of one page importing one component. */
function componentsExportZip(path, pickerHtml = '<x-dc><div>{{ label }}</div></x-dc>') {
  writeFileSync(path, writeZip([
    { name: 'Components/Main.dc.html', data: '<x-dc>\n<dc-import name="Picker" label="Day"></dc-import>\n</x-dc>' },
    { name: 'Components/Picker.dc.html', data: pickerHtml },
    { name: 'Components/support.js', data: 'window.demo = 1;' },
  ]));
}

test('--components: refuses while a design entry has no target (NEXT names the mapper); once one is set it writes components.json, the inventory, the map and gallery-states.json', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'components-export.zip');
    componentsExportZip(zip);
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json', galleryRoute: '/admin/design/components' } });
    const { ctx } = await ctxFor(repo.primary, { feature: null, profile });

    const first = await runIntake(ctx, { source: zip, components: true });
    assert.equal(first.exit, 1);
    assert.equal(first.feature, 'components');
    assert.match(first.next, /NEXT: dispatch the mapper with briefs\/components-mapper\.md/);
    assert.ok(first.failures.some((f) => /Picker: no target yet/.test(f.message)), JSON.stringify(first.failures));

    const wt = first.worktree;
    const mapFile = join(wt, 'docs/delivery/components.json');
    const written = JSON.parse(readFileSync(mapFile, 'utf8'));
    const picker = written.components.find((c) => c.name === 'Picker');
    assert.equal(picker.status, 'new');
    assert.equal(picker.target, null);
    assert.equal(existsSync(join(wt, 'docs/delivery/components/inventory.json')), false, 'refused before the inventory was written');
    assert.equal(repo.git('-C', wt, 'status', '--porcelain'), '', 'the refusal still commits the drift into components.json');

    // The mapper (briefs/components-mapper.md) sets a target; a second components intake builds it.
    picker.target = 'src/ui/picker.tsx';
    writeFileSync(mapFile, `${JSON.stringify(written, null, 2)}\n`);

    const second = await runIntake(ctx, { source: zip, components: true });
    assert.equal(second.exit, 0, JSON.stringify(second.failures));
    assert.equal(second.next, null);

    const inventory = JSON.parse(readFileSync(join(wt, 'docs/delivery/components/inventory.json'), 'utf8'));
    assert.deepEqual(inventory.states.map((s) => s.id), ['C-Picker-01', 'C-Picker-02']);
    assert.equal(inventory.states[0].name, 'Picker: defaults');
    assert.deepEqual(inventory.states[0].reach, { kind: 'prop', file: 'Picker.dc.html', props: {} });
    assert.equal(inventory.states[1].name, 'Picker: label=Day');
    assert.deepEqual(inventory.states[1].reach, { kind: 'prop', file: 'Picker.dc.html', props: { label: 'Day' } });
    // Fix round 1: components-run ids ("C-Picker-01") widened schemas/common.schema.json's Id;
    // this is the end-to-end check that the file intake actually writes still validates.
    const invCheck = validateAgainst('inventory', inventory);
    assert.equal(invCheck.ok, true, JSON.stringify(invCheck.errors));

    const gallery = JSON.parse(readFileSync(join(wt, 'docs/delivery/components/gallery-states.json'), 'utf8'));
    assert.deepEqual(gallery.states, [
      { id: 'C-Picker-01', component: 'Picker', props: {} },
      { id: 'C-Picker-02', component: 'Picker', props: { label: 'Day' } },
    ]);

    const map = JSON.parse(readFileSync(join(wt, 'docs/delivery/components/map.json'), 'utf8'));
    assert.equal(map.kind, 'components');
    assert.equal(map.route, '/admin/design/components');
    assert.deepEqual(map.widths, ['desktop', 'phone']);
    assert.deepEqual(map.worlds, [{ id: 'components', users: [{ role: 'admin', email: profile.auth.robotAdminEmail }] }]);
    assert.deepEqual(map.states.map((s) => s.id), ['C-Picker-01', 'C-Picker-02']);
    assert.equal(map.states[0].design, 'C-Picker-01');
    assert.deepEqual(map.states[0].reach, { world: 'components', role: 'admin', steps: [{ goto: '/admin/design/components' }] });

    const world = JSON.parse(readFileSync(join(wt, 'docs/delivery/components/worlds/components.json'), 'utf8'));
    assert.deepEqual(world, { schemaVersion: 1, world: 'components', rows: [{ key: 'org', table: 'organizations', values: { name: { $orgName: true } } }] });

    const rewritten = JSON.parse(readFileSync(mapFile, 'utf8'));
    assert.equal(rewritten.components.find((c) => c.name === 'Picker').status, 'new'); // still new: builtHash is only set by land / --mark-built
    assert.equal(repo.git('-C', wt, 'status', '--porcelain'), '', 'the inventory, map and world file are committed with the run');
  } finally { repo.cleanup(); }
});

// Fix round (I12): a later components export used to be refused outright — --from components
// defaulted its own feature to "components" too (a components run's own default), which is exactly
// what --from names, so the "an update run needs a new feature slug" check always fired.
test('--components --from components gets its own dated feature slug, once "components" is already taken', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'components-export.zip');
    componentsExportZip(zip);
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json', galleryRoute: '/admin/design/components' } });
    const { ctx } = await ctxFor(repo.primary, { feature: null, profile }); // clock frozen at 2026-01-15

    const first = await runIntake(ctx, { source: zip, components: true });
    assert.equal(first.feature, 'components');
    const mapFile = join(first.worktree, 'docs/delivery/components.json');
    const written = JSON.parse(readFileSync(mapFile, 'utf8'));
    written.components.find((c) => c.name === 'Picker').target = 'src/ui/picker.tsx';
    writeFileSync(mapFile, `${JSON.stringify(written, null, 2)}\n`);
    const second = await runIntake(ctx, { source: zip, components: true });
    assert.equal(second.exit, 0, JSON.stringify(second.failures));

    // --from reads the earlier run's files from the base branch, same as any other update run: the
    // "components" run has to actually land before a later export can carry it over. Simulate that
    // by merging its branch into main and pushing, the way `delivery land` would.
    const branch = repo.git('-C', first.worktree, 'rev-parse', '--abbrev-ref', 'HEAD');
    repo.git('checkout', 'main');
    repo.git('merge', '--no-ff', '-m', 'merge components', branch);
    repo.git('push', 'origin', 'main');

    // A later export, explicitly continuing "components": no --feature given, so it would collide
    // with --from's own name under the old default. It must not be refused, and must land on a
    // fresh, dated feature slug distinct from "components".
    const third = await runIntake(ctx, { source: zip, components: true, from: 'components' });
    assert.equal(third.exit, 0, JSON.stringify(third.failures));
    assert.equal(third.feature, 'components-20260115');
    assert.notEqual(third.worktree, first.worktree);
  } finally { repo.cleanup(); }
});

// A components run that has never happened yet still gets the plain "components" slug — the dated
// form only kicks in once that slug is already taken (--from given, or a prior run exists).
test('the first ever components run still gets the plain "components" feature slug', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'components-export.zip');
    componentsExportZip(zip);
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json', galleryRoute: '/admin/design/components' } });
    const { ctx } = await ctxFor(repo.primary, { feature: null, profile });
    const first = await runIntake(ctx, { source: zip, components: true });
    assert.equal(first.feature, 'components');
  } finally { repo.cleanup(); }
});

test('--components refuses when profile.components is not configured', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'components-export.zip');
    componentsExportZip(zip);
    const { ctx } = await ctxFor(repo.primary, { feature: null });
    await assert.rejects(runIntake(ctx, { source: zip, components: true }), (e) => e.exit === 2 && /profile\.components is not configured/.test(e.message));
  } finally { repo.cleanup(); }
});

test('a page run reports component drift but never writes components.json', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    // A page export can itself import a component: the page run must report it, not build it.
    const zip = join(repo.root, 'components-export.zip');
    componentsExportZip(zip);
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json', galleryRoute: '/admin/design/components' } });
    const { ctx } = await ctxFor(repo.primary, { feature: 'main-page', profile });
    const res = await runIntake(ctx, { source: zip, sentence: 'Redesign the main page.' });
    assert.ok(res.lines.some((l) => /Picker: new component \(found in the export\)/.test(l)), res.lines.join('\n'));
    assert.equal(existsSync(join(res.worktree, 'docs/delivery/components.json')), false, 'a page run never writes the product-wide component map');
  } finally { repo.cleanup(); }
});

test('pure helpers', () => {
  assert.equal(slugify('Widgets dashboard — design v2'), 'widgets-dashboard-design-v2');
  assert.deepEqual(stripCommonRoot([{ name: 'P/a.html' }, { name: 'P/shots/1.png' }]).map((e) => e.name), ['a.html', 'shots/1.png']);
  assert.deepEqual(stripCommonRoot([{ name: 'a.html' }, { name: 'shots/1.png' }]).map((e) => e.name), ['a.html', 'shots/1.png']);
  const md = renderIntentMd({ ...validExample('intent'), epic: 5 });
  assert.match(md, /^# Intent: widgets/);
  assert.match(md, /Epic: #5\./);
  assert.match(md, /Generated from intent\.json/);
});
