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
import { validExample } from '../helpers/fixtures.mjs';
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

test('pure helpers', () => {
  assert.equal(slugify('Widgets dashboard — design v2'), 'widgets-dashboard-design-v2');
  assert.deepEqual(stripCommonRoot([{ name: 'P/a.html' }, { name: 'P/shots/1.png' }]).map((e) => e.name), ['a.html', 'shots/1.png']);
  assert.deepEqual(stripCommonRoot([{ name: 'a.html' }, { name: 'shots/1.png' }]).map((e) => e.name), ['a.html', 'shots/1.png']);
  const md = renderIntentMd({ ...validExample('intent'), epic: 5 });
  assert.match(md, /^# Intent: widgets/);
  assert.match(md, /Epic: #5\./);
  assert.match(md, /Generated from intent\.json/);
});
