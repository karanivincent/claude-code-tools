// delivery design review (components-first spec §8.4, plan task 8): readExportSnapshot's screens
// and components, diffExports on two fixture exports, statesToReview's state selection, the
// `delivery design review` command (offline: no renders when Playwright is not resolvable), and
// `delivery brief new --from-review`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  readExportSnapshot, diffExports, statesToReview, unpackExport, reviewExport, REVIEW_DIRNAME,
} from '../../lib/design/review.mjs';
import { fillSection, forbiddenNamesIn } from '../../lib/brief/brief.mjs';
import reviewCommand from '../../lib/commands/design-review.mjs';
import newCommand from '../../lib/commands/brief-new.mjs';
import { resolveCommand } from '../../lib/core/command.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { writeZip } from '../../lib/core/zip.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile, FIXTURES_DIR } from '../helpers/fixtures.mjs';

const FIXTURE_DIR = join(FIXTURES_DIR, 'design', 'review');
const BEFORE_DIR = join(FIXTURE_DIR, 'before');
const AFTER_DIR = join(FIXTURE_DIR, 'after');
// Main.dc.html and Table.dc.html unchanged from BEFORE_DIR; only Picker.dc.html differs (same
// change as AFTER_DIR's) -- a component-only edit, for the fallback statesToReview coverage below.
const COMPONENT_ONLY_AFTER_DIR = join(FIXTURE_DIR, 'component-only-after');

function write(dir, rel, content) {
  const abs = join(dir, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  if (typeof content === 'string' || Buffer.isBuffer(content)) writeFileSync(abs, content);
  else writeFileSync(abs, JSON.stringify(content, null, 2) + '\n');
}

// --- readExportSnapshot / diffExports (pure) ---------------------------------------------------

test('readExportSnapshot: two components, and screens fall back to one "main" entry when there is only one screen value', async () => {
  const before = await readExportSnapshot(BEFORE_DIR);
  assert.deepEqual(before.errors, []);
  assert.deepEqual(before.components.map((c) => c.name), ['Picker', 'Table']);
  assert.equal(before.screenKey, null);
  assert.deepEqual(Object.keys(before.screens), ['main']);
  assert.match(before.screens.main, /^sha256:[0-9a-f]{64}$/);
});

test('diffExports: on the review fixtures, Picker changed, nothing added or removed, the main screen changed', async () => {
  const before = await readExportSnapshot(BEFORE_DIR);
  const after = await readExportSnapshot(AFTER_DIR);
  assert.deepEqual(diffExports(before, after), {
    componentsChanged: ['Picker'], componentsAdded: [], componentsRemoved: [], screensChanged: ['main'],
  });
});

test('diffExports: identical exports change nothing', async () => {
  const before = await readExportSnapshot(BEFORE_DIR);
  assert.deepEqual(diffExports(before, before), { componentsChanged: [], componentsAdded: [], componentsRemoved: [], screensChanged: [] });
});

test('diffExports: a component present only in one export is added or removed, not changed', () => {
  const before = { components: [{ name: 'A', hash: 'h1' }], screens: {} };
  const after = { components: [{ name: 'B', hash: 'h2' }], screens: {} };
  assert.deepEqual(diffExports(before, after), { componentsChanged: [], componentsAdded: ['B'], componentsRemoved: ['A'], screensChanged: [] });
});

test('diffExports: a component-only change (Main.dc.html untouched) changes no screen', async () => {
  const before = await readExportSnapshot(BEFORE_DIR);
  const after = await readExportSnapshot(COMPONENT_ONLY_AFTER_DIR);
  assert.deepEqual(diffExports(before, after), {
    componentsChanged: ['Picker'], componentsAdded: [], componentsRemoved: [], screensChanged: [],
  });
});

test('diffExports: when the two exports disagree on whether the screen state resolves, screens are compared on the whole-file hash instead of the mismatched maps', () => {
  const before = { components: [], screens: { main: 'h1' }, screenKey: null, mainHash: 'h1' };
  const resolvedDifferent = { components: [], screens: { Desktop: 'x', Settings: 'y' }, screenKey: 'screen', mainHash: 'h2' };
  assert.deepEqual(diffExports(before, resolvedDifferent), { componentsChanged: [], componentsAdded: [], componentsRemoved: [], screensChanged: ['main'] });
  const resolvedSameMain = { ...resolvedDifferent, mainHash: 'h1' };
  assert.deepEqual(diffExports(before, resolvedSameMain), { componentsChanged: [], componentsAdded: [], componentsRemoved: [], screensChanged: [] });
});

// --- unpackExport --------------------------------------------------------------------------------

test('unpackExport: accepts a directory as-is, with a no-op cleanup', async () => {
  const { dir, cleanup } = await unpackExport(BEFORE_DIR);
  assert.equal(dir, BEFORE_DIR);
  await cleanup();
});

test('unpackExport: unpacks a zip, stripping a shared top-level folder', async () => {
  const t = makeTempDir();
  try {
    const mainText = readFileSync(join(BEFORE_DIR, 'Main.dc.html'));
    const zip = writeZip([{ name: 'MyExport/Main.dc.html', data: mainText }]);
    const zipPath = join(t.dir, 'export.zip');
    writeFileSync(zipPath, zip);
    const { dir, cleanup } = await unpackExport(zipPath);
    try {
      assert.ok(existsSync(join(dir, 'Main.dc.html')));
      assert.equal(readFileSync(join(dir, 'Main.dc.html'), 'utf8'), mainText.toString('utf8'));
    } finally { await cleanup(); }
  } finally { t.cleanup(); }
});

test('unpackExport: refuses a file that is neither a zip nor a directory', async () => {
  const t = makeTempDir();
  try {
    writeFileSync(join(t.dir, 'notes.txt'), 'hello');
    await assert.rejects(unpackExport(join(t.dir, 'notes.txt')), (err) => err.exit === 2 && /not a \.zip archive/.test(err.message));
  } finally { t.cleanup(); }
});

// --- statesToReview (pure apart from reading <ID>.components.json) -------------------------------

test('statesToReview: a resolvable screen key selects a state by a changed component or its own screen value', async () => {
  const t = makeTempDir();
  try {
    const paths = featurePaths(t.dir, 'widgets');
    mkdirSync(paths.designRenders, { recursive: true });
    write(t.dir, join('.delivery/widgets/design/WL-01.components.json'), { names: ['Picker'] });
    write(t.dir, join('.delivery/widgets/design/WL-02.components.json'), { names: ['Table'] });
    write(t.dir, join('.delivery/widgets/design/WL-03.components.json'), { names: [] });
    const inventory = {
      states: [
        { id: 'WL-01', reach: { kind: 'click-path', steps: [] } },
        { id: 'WL-02', reach: { kind: 'prop', props: { screen: 'Settings' } } },
        { id: 'WL-03', reach: { kind: 'click-path', steps: [{ set: { screen: 'Widgets' } }] } },
      ],
    };
    const diff = { componentsChanged: ['Picker'], screensChanged: ['Settings'] };
    assert.deepEqual(await statesToReview(paths, inventory, diff, 'screen'), ['WL-01', 'WL-02']);
  } finally { t.cleanup(); }
});

test('statesToReview: an unresolved screen key renders every state once anything changed (a screen or a component-only change), none when nothing did', async () => {
  const paths = featurePaths('/unused', 'widgets');
  const inventory = { states: [{ id: 'A' }, { id: 'B' }] };
  assert.deepEqual(await statesToReview(paths, inventory, { screensChanged: ['main'], componentsChanged: [] }, null), ['A', 'B']);
  // a component-only edit (Main.dc.html untouched) gives screensChanged: [] but componentsChanged
  // non-empty -- every state still needs re-checking, since there is no per-state usage record to
  // consult once the screen state cannot be resolved at all
  assert.deepEqual(await statesToReview(paths, inventory, { screensChanged: [], componentsChanged: ['Picker'] }, null), ['A', 'B']);
  assert.deepEqual(await statesToReview(paths, inventory, { screensChanged: [], componentsChanged: [] }, null), []);
});

// --- reviewExport / delivery design review (offline: Playwright not resolvable) ------------------

const inventory = () => ({
  schemaVersion: 1, feature: 'widgets', designTreeSha256: '0'.repeat(64), candidates: [],
  states: [
    { id: 'WL-01', screen: 'Widgets', name: 'the list', reach: { kind: 'click-path', steps: [] }, shots: [], render: { status: 'ok' }, controls: [] },
    { id: 'WL-02', screen: 'Widgets', name: 'the dialog', reach: { kind: 'click-path', steps: [{ click: 'Open' }] }, shots: [], render: { status: 'ok' }, controls: [] },
  ],
});

function seedRun(dir, o = {}) {
  for (const name of ['Main.dc.html', 'Picker.dc.html', 'Table.dc.html']) {
    write(dir, join('docs/design/widgets', name), readFileSync(join(BEFORE_DIR, name)));
  }
  write(dir, 'docs/delivery/widgets/inventory.json', o.inventory ?? inventory());
  if (o.rules) write(dir, 'docs/delivery/widgets/rules.json', o.rules);
}

test('reviewExport: writes review.json and compare.html, and skips pictures with no Playwright resolvable', async () => {
  const t = makeTempDir();
  try {
    seedRun(t.dir);
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const review = await reviewExport(ctx, { exportDir: AFTER_DIR });
    assert.deepEqual(review.diff, { componentsChanged: ['Picker'], componentsAdded: [], componentsRemoved: [], screensChanged: ['main'] });
    // the screen state cannot be resolved (only "main"), so every state needs a fresh render
    assert.deepEqual(review.changedStates, ['WL-01', 'WL-02']);
    assert.match(review.pictures.skippedWhy, /Playwright not found/);
    assert.deepEqual(review.pictures.rendered, { desktop: [], phone: [] });
    assert.deepEqual(review.rulesGaps, []); // no rules.json: skipped silently
    assert.deepEqual(review.forbiddenNames, []); // nothing rendered to scan
    assert.deepEqual(review.findings, ['Component Picker changed.', 'Screen main changed.']);

    const reviewDir = join(t.dir, '.delivery/widgets', REVIEW_DIRNAME);
    assert.ok(existsSync(join(reviewDir, 'review.json')));
    const onDisk = JSON.parse(readFileSync(join(reviewDir, 'review.json'), 'utf8'));
    assert.deepEqual(onDisk.diff, review.diff);
    assert.ok(existsSync(join(reviewDir, 'compare.html')));
    assert.match(readFileSync(join(reviewDir, 'compare.html'), 'utf8'), /WL-01/);
  } finally { t.cleanup(); }
});

test('reviewExport: a component-only change (Main.dc.html untouched, so screensChanged is empty) still selects every state', async () => {
  const t = makeTempDir();
  try {
    seedRun(t.dir);
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const review = await reviewExport(ctx, { exportDir: COMPONENT_ONLY_AFTER_DIR });
    assert.deepEqual(review.diff, { componentsChanged: ['Picker'], componentsAdded: [], componentsRemoved: [], screensChanged: [] });
    assert.deepEqual(review.changedStates, ['WL-01', 'WL-02']);
    assert.deepEqual(review.findings, ['Component Picker changed.']);
  } finally { t.cleanup(); }
});

test('delivery design review: exits 0 with nothing to report beyond the diff', async () => {
  const t = makeTempDir();
  try {
    seedRun(t.dir);
    const { ctx, stdout, stderr } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await reviewCommand.run(ctx, [AFTER_DIR]);
    assert.equal(code, 0, stdout.text());
    assert.match(stdout.text(), /component changed: Picker/);
    assert.match(stdout.text(), /screen changed: main/);
    assert.match(stderr.text(), /pictures skipped/);
  } finally { t.cleanup(); }
});

test('delivery design review: a rules.json gap is exit 1 (reused from lib/picture/rules.mjs, skipped silently with no rules.json)', async () => {
  const t = makeTempDir();
  try {
    seedRun(t.dir, { rules: { rules: [{ id: 'R1', text: '', source: 'brief 01', proof: 'test' }] } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await reviewCommand.run(ctx, [AFTER_DIR]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /FAIL rule R1: no text/);
  } finally { t.cleanup(); }
});

test('delivery design review resolves as a two-word command', async () => {
  const { module, rest } = await resolveCommand(['design', 'review', BEFORE_DIR]);
  assert.equal(module.name, 'design review');
  assert.deepEqual(rest, [BEFORE_DIR]);
});

// --- fillSection / forbiddenNamesIn (pure) --------------------------------------------------------

test('fillSection: inserts one bullet per item right under the heading', () => {
  const text = ['# Widgets', '', '## What changes and why', '', '## Screens', ''].join('\n');
  const out = fillSection(text, 'What changes and why', ['Component Picker changed.', 'Screen main changed.']);
  assert.equal(out, ['# Widgets', '', '## What changes and why', '- Component Picker changed.', '- Screen main changed.', '', '## Screens', ''].join('\n'));
});

test('fillSection: no items, or no matching heading, leaves the text unchanged', () => {
  const text = ['## What changes and why', ''].join('\n');
  assert.equal(fillSection(text, 'What changes and why', []), text);
  assert.equal(fillSection(text, 'Nowhere', ['x']), text);
});

test('forbiddenNamesIn: the same whole-word, case-insensitive match briefProblems uses', () => {
  assert.deepEqual(forbiddenNamesIn('we spoke with Acme today', ['Acme', 'Spectrum Corp']), ['Acme']);
  assert.deepEqual(forbiddenNamesIn('we spoke with Acmes today', ['Acme']), []);
  assert.deepEqual(forbiddenNamesIn('a note about Spectrum-Corp today', ['Spectrum Corp']), ['Spectrum Corp']);
});

// --- delivery brief new --from-review --------------------------------------------------------------

test('brief new --from-review: pre-fills "What changes and why" with one bullet per finding', async () => {
  const t = makeTempDir();
  try {
    seedRun(t.dir);
    const { ctx: reviewCtx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    await reviewExport(reviewCtx, { exportDir: AFTER_DIR });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await newCommand.run(ctx, ['picker-fix', '--from-review']);
    assert.equal(code, 0, stdout.text());
    const text = readFileSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/01-picker-fix.md'), 'utf8');
    assert.match(text, /^## What changes and why\n- Component Picker changed\.\n- Screen main changed\.$/m);
  } finally { t.cleanup(); }
});

test('brief new --from-review: refuses cleanly when there is no review yet (exit 2)', async () => {
  const t = makeTempDir();
  try {
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    await assert.rejects(newCommand.run(ctx, ['picker-fix', '--from-review']), (err) => err.exit === 2 && /no design review yet/.test(err.message));
  } finally { t.cleanup(); }
});
