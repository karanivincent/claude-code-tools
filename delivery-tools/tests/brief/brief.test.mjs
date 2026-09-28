// delivery brief (components-first spec §8.2, 0.9 plan task 6): nextBriefPath's numbering,
// fillTemplate's title and components list, briefProblems' four rules, packBrief's copy-and-refuse,
// and the `delivery brief new|check|pack` command wiring.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nextBriefPath, fillTemplate, briefProblems, packBrief,
} from '../../lib/brief/brief.mjs';
import newCommand from '../../lib/commands/brief-new.mjs';
import checkCommand from '../../lib/commands/brief-check.mjs';
import packCommand from '../../lib/commands/brief-pack.mjs';
import { resolveCommand } from '../../lib/core/command.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

function write(dir, rel, content) {
  const abs = join(dir, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
}

const H1 = `sha256:${'1'.repeat(64)}`;

function mapEntry(kind, name, target) {
  return {
    kind, name, target,
    ...(kind === 'design' ? { design: { file: `${name}.dc.html`, hash: H1 }, status: 'built', builtHash: H1, uses: [], states: [] } : { source: 'scan' }),
    props: {}, owns: [], builtOn: [], replaces: [],
  };
}

// --- nextBriefPath -----------------------------------------------------------------------------

test('nextBriefPath: 01 on an empty folder, 03 after 01 and 02 exist', () => {
  const t = makeTempDir();
  try {
    assert.equal(nextBriefPath(t.dir, 'widgets'), 'briefs/01-widgets.md');
    write(t.dir, 'briefs/01-widgets.md', '# one\n');
    write(t.dir, 'briefs/02-widgets.md', '# two\n');
    assert.equal(nextBriefPath(t.dir, 'widgets'), 'briefs/03-widgets.md');
  } finally { t.cleanup(); }
});

test('nextBriefPath: ignores files that do not start with a number', () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/sent.json', '{}');
    assert.equal(nextBriefPath(t.dir, 'widgets'), 'briefs/01-widgets.md');
  } finally { t.cleanup(); }
});

// --- fillTemplate --------------------------------------------------------------------------------

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../templates/design-brief.md', import.meta.url)), 'utf8');

test('fillTemplate: title and "none yet" with no components', () => {
  const out = fillTemplate(TEMPLATE, { title: 'Widgets', components: [] });
  assert.match(out, /^# Widgets$/m);
  assert.match(out, /^none yet$/m);
});

test('fillTemplate: one line per design component, then a sorted Base components line', () => {
  const components = [
    mapEntry('design', 'DatePicker', 'src/ui/date-picker.tsx'),
    mapEntry('design', 'Table', 'src/ui/table.tsx'),
    mapEntry('base', 'Sheet', 'ui/sheet.tsx'),
    mapEntry('base', 'Button', 'ui/button.tsx'),
  ];
  const out = fillTemplate(TEMPLATE, { title: 'Widgets', components });
  assert.match(out, /^- DatePicker$/m);
  assert.match(out, /^- Table$/m);
  assert.match(out, /^- Base components: Button, Sheet$/m);
  assert.ok(!out.includes('none yet'));
});

test('fillTemplate: "none yet" only when there are neither design nor base entries', () => {
  const out = fillTemplate(TEMPLATE, { title: 'Widgets', components: [mapEntry('base', 'Button', 'ui/button.tsx')] });
  assert.match(out, /^- Base components: Button$/m);
  assert.ok(!out.includes('none yet'));
});

test('fillTemplate: design components with no base entries prints no "Base components:" line', () => {
  const components = [mapEntry('design', 'DatePicker', 'src/ui/date-picker.tsx'), mapEntry('design', 'Table', 'src/ui/table.tsx')];
  const out = fillTemplate(TEMPLATE, { title: 'Widgets', components });
  assert.match(out, /^- DatePicker$/m);
  assert.match(out, /^- Table$/m);
  assert.ok(!out.includes('Base components'));
  assert.ok(!out.includes('none yet'));
});

// --- briefProblems ---------------------------------------------------------------------------

const okBrief = () => [
  '# Widgets',
  '',
  '## What changes and why',
  '',
  '## Screens',
  '### Screen: List',
  'Desktop: shows every widget in a table',
  'Phone: the same table, one column',
  '',
  '## Components to use',
  '- DatePicker',
  '',
  '## Behaviours',
  '1. Saving closes the dialog',
  '',
  '## Data',
  'Acme Store, Summit Interiors',
  '',
].join('\n');

test('briefProblems: a clean brief has no problems', () => {
  assert.deepEqual(briefProblems(okBrief(), { componentNames: ['DatePicker'] }), []);
});

test('briefProblems: a forbidden name in the text', () => {
  const text = okBrief().replace('Acme Store', 'Spectrum Corp');
  const problems = briefProblems(text, { forbiddenNames: ['Spectrum Corp'] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Spectrum Corp.*forbidden/);
});

test('briefProblems: forbidden-name matching is case-insensitive, whole-word, and Acme does not match Acmes', () => {
  assert.deepEqual(briefProblems('we spoke with acme today', { forbiddenNames: ['Acme'] }).length, 1);
  assert.deepEqual(briefProblems('we spoke with Acmes today', { forbiddenNames: ['Acme'] }), []);
});

test('briefProblems: a multi-word forbidden name matches across any run of whitespace', () => {
  const problems = briefProblems('a note about Spectrum   Corp today', { forbiddenNames: ['Spectrum Corp'] });
  assert.equal(problems.length, 1);
});

test('briefProblems: a multi-word forbidden name matches across a hyphen or an underscore, in text and in a file name', () => {
  assert.equal(briefProblems('a note about Spectrum-Corp today', { forbiddenNames: ['Spectrum Corp'] }).length, 1);
  assert.equal(briefProblems('a note about Spectrum_Corp today', { forbiddenNames: ['Spectrum Corp'] }).length, 1);
  const kebab = briefProblems(okBrief(), { forbiddenNames: ['Spectrum Corp'], fileNames: ['spectrum-corp-dashboard.png'] });
  assert.equal(kebab.length, 1);
  assert.match(kebab[0], /file name/);
  const snake = briefProblems(okBrief(), { forbiddenNames: ['Spectrum Corp'], fileNames: ['Spectrum_Corp.png'] });
  assert.equal(snake.length, 1);
});

test('briefProblems: a forbidden name in an attached file name', () => {
  const problems = briefProblems(okBrief(), { forbiddenNames: ['Spectrum'], fileNames: ['spectrum-dashboard.png'] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /file name/);
});

test('briefProblems: a Screen heading with no Phone: line', () => {
  const text = okBrief().replace('Phone: the same table, one column\n', '');
  const problems = briefProblems(text, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Screen: List has no Phone: line/);
});

test('briefProblems: a second screen with its own Phone: line stays clean even when the first has none', () => {
  const text = okBrief().replace(
    '## Data',
    ['### Screen: Detail', 'Desktop: one widget', 'Phone: one widget, stacked', '', '## Data'].join('\n'),
  );
  const missingFirst = text.replace('Phone: the same table, one column\n', '');
  const problems = briefProblems(missingFirst, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Screen: List/);
});

test('briefProblems: a multi-word component described in words instead of named', () => {
  const text = okBrief().replace('- DatePicker', 'a date picker for the due date');
  const problems = briefProblems(text, { componentNames: ['DatePicker'] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /date picker.*DatePicker/);
});

test('briefProblems: the kebab form (date-picker) also describes DatePicker in words', () => {
  const text = okBrief().replace('- DatePicker', 'add a date-picker for the due date');
  const problems = briefProblems(text, { componentNames: ['DatePicker'] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /date picker.*DatePicker/);
});

test('briefProblems: naming the component exactly clears the words rule even though the words also appear', () => {
  const text = okBrief().replace('- DatePicker', 'a date picker: use DatePicker');
  assert.deepEqual(briefProblems(text, { componentNames: ['DatePicker'] }), []);
});

test('briefProblems: a single-word component name never trips the words rule', () => {
  const text = okBrief().replace('- DatePicker', 'a table of every widget');
  assert.deepEqual(briefProblems(text, { componentNames: ['Table'] }), []);
});

test('briefProblems: an unnumbered line under ## Behaviours', () => {
  const text = okBrief().replace('1. Saving closes the dialog', 'Saving closes the dialog');
  const problems = briefProblems(text, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## Behaviours is not numbered/);
});

test('briefProblems: a blank line under ## Behaviours is not a problem', () => {
  const text = okBrief().replace('1. Saving closes the dialog', '1. Saving closes the dialog\n\n2. Discarding asks first');
  assert.deepEqual(briefProblems(text, {}), []);
});

// --- packBrief -------------------------------------------------------------------------------

test('packBrief: copies the brief as 00-brief.md and images as NN-<basename>, in order', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/01-widgets.md', okBrief());
    write(t.dir, 'shots/list.png', 'not-really-a-png');
    write(t.dir, 'shots/dialog.png', 'not-really-a-png-either');
    const res = await packBrief(
      join(t.dir, 'briefs/01-widgets.md'),
      [join(t.dir, 'shots/list.png'), join(t.dir, 'shots/dialog.png')],
      join(t.dir, 'pack'),
      { componentNames: ['DatePicker'] },
    );
    assert.equal(res.dir, join(t.dir, 'pack'));
    assert.deepEqual(res.files, ['00-brief.md', '01-list.png', '02-dialog.png']);
    assert.equal(readFileSync(join(t.dir, 'pack/00-brief.md'), 'utf8'), okBrief());
    assert.ok(existsSync(join(t.dir, 'pack/01-list.png')));
    assert.ok(existsSync(join(t.dir, 'pack/02-dialog.png')));
  } finally { t.cleanup(); }
});

test('packBrief: refuses an image named after a forbidden name, and writes nothing', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/01-widgets.md', okBrief());
    write(t.dir, 'shots/spectrum-dashboard.png', 'x');
    await assert.rejects(
      packBrief(join(t.dir, 'briefs/01-widgets.md'), [join(t.dir, 'shots/spectrum-dashboard.png')], join(t.dir, 'pack'), { forbiddenNames: ['Spectrum'] }),
      (err) => err.exit === 1 && /Spectrum/.test(err.message),
    );
    assert.ok(!existsSync(join(t.dir, 'pack')));
  } finally { t.cleanup(); }
});

test('packBrief: refuses on a problem in the brief text itself (an unnumbered behaviour)', async () => {
  const t = makeTempDir();
  try {
    const bad = okBrief().replace('1. Saving closes the dialog', 'Saving closes the dialog');
    write(t.dir, 'briefs/01-widgets.md', bad);
    await assert.rejects(
      packBrief(join(t.dir, 'briefs/01-widgets.md'), [], join(t.dir, 'pack'), {}),
      (err) => err.exit === 1 && /not numbered/.test(err.message),
    );
  } finally { t.cleanup(); }
});

test('packBrief: a missing brief file is reported cleanly (exit 1, no raw ENOENT), and writes nothing', async () => {
  const t = makeTempDir();
  try {
    await assert.rejects(
      packBrief(join(t.dir, 'briefs/01-widgets.md'), [], join(t.dir, 'pack'), {}),
      (err) => err.exit === 1 && /01-widgets\.md does not exist/.test(err.message) && !/ENOENT/.test(err.message),
    );
    assert.ok(!existsSync(join(t.dir, 'pack')));
  } finally { t.cleanup(); }
});

// --- command: delivery brief new|check|pack ----------------------------------------------------

test('brief new: writes intent/briefs/01-<slug>.md from the template, titled from the slug', async () => {
  const t = makeTempDir();
  try {
    const profile = makeProfile();
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    const code = await newCommand.run(ctx, ['first-look']);
    assert.equal(code, 0, stdout.text());
    const full = join(t.dir, 'docs/delivery/widgets/intent/briefs/01-first-look.md');
    assert.ok(existsSync(full));
    const text = readFileSync(full, 'utf8');
    assert.match(text, /^# First Look$/m);
    assert.match(stdout.text(), /wrote .*01-first-look\.md/);
  } finally { t.cleanup(); }
});

test('brief new: --title overrides the slug-derived title, and the map\'s components are listed', async () => {
  const t = makeTempDir();
  try {
    const mapRel = 'docs/delivery/components.json';
    write(t.dir, mapRel, { version: 1, components: [mapEntry('design', 'DatePicker', 'src/ui/date-picker.tsx')] });
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    const code = await newCommand.run(ctx, ['first-look', '--title', 'The First Look']);
    assert.equal(code, 0, stdout.text());
    const text = readFileSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/01-first-look.md'), 'utf8');
    assert.match(text, /^# The First Look$/m);
    assert.match(text, /^- DatePicker$/m);
  } finally { t.cleanup(); }
});

test('brief new: refuses a slug with an uppercase letter (exit 2)', async () => {
  const t = makeTempDir();
  try {
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    await assert.rejects(newCommand.run(ctx, ['First-Look']), (err) => err.exit === 2);
  } finally { t.cleanup(); }
});

// --- delivery brief new --from-run -------------------------------------------------------------

function writeReviewRound(t, feature, n, states) {
  const paths = featurePaths(t.dir, feature);
  write(t.dir, join('.delivery', feature, 'rounds', String(n), 'review.json'), { round: n, states });
  return paths;
}

test('brief new --from-run: pre-fills "What changes and why" with one bullet per design: item, from the current run', async () => {
  const t = makeTempDir();
  try {
    writeReviewRound(t, 'widgets', 1, {
      'KC-08': { verdict: 'back-to-design', must: [], small: [], design: ['use the shared Table component, like every other list.'] },
      'KC-04': { verdict: 'match', must: [], small: [], design: [] },
    });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await newCommand.run(ctx, ['picker-fix', '--from-run']);
    assert.equal(code, 0, stdout.text());
    const text = readFileSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/01-picker-fix.md'), 'utf8');
    assert.match(text, /^## What changes and why\n- KC-08: use the shared Table component, like every other list\.$/m);
  } finally { t.cleanup(); }
});

test('brief new --from-run <feature>: reads another run\'s rounds instead of the current one', async () => {
  const t = makeTempDir();
  try {
    writeReviewRound(t, 'other-run', 1, {
      'W-01': { verdict: 'back-to-design', must: [], small: [], design: ['this state belongs to the other run.'] },
    });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await newCommand.run(ctx, ['picker-fix', '--from-run', 'other-run']);
    assert.equal(code, 0, stdout.text());
    const text = readFileSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/01-picker-fix.md'), 'utf8');
    assert.match(text, /^## What changes and why\n- W-01: this state belongs to the other run\.$/m);
  } finally { t.cleanup(); }
});

test('brief new --from-run: no rounds yet leaves "What changes and why" untouched, and still writes the brief', async () => {
  const t = makeTempDir();
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await newCommand.run(ctx, ['picker-fix', '--from-run']);
    assert.equal(code, 0, stdout.text());
    const text = readFileSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/01-picker-fix.md'), 'utf8');
    assert.match(text, /## What changes and why\n\n## Screens/);
  } finally { t.cleanup(); }
});

test('brief new: a stray second positional with no --from-run is refused as an unexpected argument (exit 2)', async () => {
  const t = makeTempDir();
  try {
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    await assert.rejects(newCommand.run(ctx, ['picker-fix', 'other-run']), (err) => err.exit === 2 && /unexpected argument "other-run"/.test(err.message));
  } finally { t.cleanup(); }
});

test('brief check: with no file, checks every file in intent/ and intent/briefs/, exit 1 on a problem', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'docs/delivery/widgets/intent/briefs/01-widgets.md', okBrief().replace('1. Saving closes the dialog', 'Saving closes the dialog'));
    const profile = makeProfile();
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    const code = await checkCommand.run(ctx, []);
    assert.equal(code, 1);
    assert.match(stdout.text(), /not numbered/);
  } finally { t.cleanup(); }
});

test('brief check: a clean run exits 0 and needs no --feature run when a file is given directly', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'standalone.md', okBrief());
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile: makeProfile() });
    const code = await checkCommand.run(ctx, [join(t.dir, 'standalone.md')]);
    assert.equal(code, 0, stdout.text());
    assert.match(stdout.text(), /1 brief\(s\) checked, no problems/);
  } finally { t.cleanup(); }
});

test('brief check: reports a forbidden name from profile.design.forbiddenNames', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'standalone.md', okBrief().replace('Acme Store', 'Spectrum Corp'));
    const profile = makeProfile({ design: { forbiddenNames: ['Spectrum Corp'] } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await checkCommand.run(ctx, [join(t.dir, 'standalone.md')]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /Spectrum Corp/);
  } finally { t.cleanup(); }
});

// Fix round (I13): the template's own "<!-- Numbered, one behaviour per line. ... -->" comment
// under a fresh "## Behaviours" was itself an unnumbered line, so a brief nobody had touched yet
// already failed its own check. A fresh brief must pass, with only its bare "1." allowed to stay
// unfilled — brief check never requires it to be filled in; pack and sent do.
test('brief new then brief check: a fresh, untouched brief passes', async () => {
  const t = makeTempDir();
  try {
    const profile = makeProfile();
    const { ctx: newCtx, stdout: newOut } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    assert.equal(await newCommand.run(newCtx, ['first-look']), 0, newOut.text());
    const file = join(t.dir, 'docs/delivery/widgets/intent/briefs/01-first-look.md');
    assert.match(readFileSync(file, 'utf8'), /## Behaviours\n<!-- Numbered, one behaviour per line\..*-->\n1\.\n/s);

    const { ctx: checkCtx, stdout: checkOut } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await checkCommand.run(checkCtx, [file]);
    assert.equal(code, 0, checkOut.text());
    assert.match(checkOut.text(), /1 brief\(s\) checked, no problems/);
  } finally { t.cleanup(); }
});

test('briefProblems ignores template comments everywhere, single- and multi-line', () => {
  const text = [
    '# T',
    '## Screens',
    '<!-- One "### Screen: <name>" per screen, each with a Phone: line. -->',
    '### Screen: Main',
    'Desktop: something',
    '<!--',
    'a multi-line comment that would otherwise read as an unnumbered line',
    'and could even mention a forbidden name -->',
    '## Behaviours',
    '<!-- Numbered, one behaviour per line. -->',
    '1.',
    '## Data',
    '<!-- Generic names only. -->',
  ].join('\n');
  assert.deepEqual(briefProblems(text, { forbiddenNames: ['Acme'] }), ['Screen: Main has no Phone: line']);
});

test('briefProblems requireBehaviours: only the template\'s bare "1." is "no behaviours yet"; real content clears it', () => {
  const bare = ['# T', '## Behaviours', '<!-- Numbered, one behaviour per line. -->', '1.', ''].join('\n');
  assert.deepEqual(briefProblems(bare, { requireBehaviours: true }), ['no behaviours yet: fill in at least one under ## Behaviours']);
  assert.deepEqual(briefProblems(bare), [], 'brief check itself never requires it');

  const filled = ['# T', '## Behaviours', '1. Saving closes the dialog', ''].join('\n');
  assert.deepEqual(briefProblems(filled, { requireBehaviours: true }), []);

  const noSection = ['# T', '## Data', ''].join('\n');
  assert.deepEqual(briefProblems(noSection, { requireBehaviours: true }), ['no behaviours yet: fill in at least one under ## Behaviours']);
});

test('brief pack: packs the brief and images under .delivery/<feature>/pack/ by default', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'brief.md', okBrief());
    write(t.dir, 'shot.png', 'x');
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await packCommand.run(ctx, [join(t.dir, 'brief.md'), join(t.dir, 'shot.png')]);
    assert.equal(code, 0, stdout.text());
    const dir = join(t.dir, '.delivery/widgets/pack');
    assert.ok(existsSync(join(dir, '00-brief.md')));
    assert.ok(existsSync(join(dir, '01-shot.png')));
  } finally { t.cleanup(); }
});

test('brief pack: --out places the pack elsewhere', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'brief.md', okBrief());
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await packCommand.run(ctx, [join(t.dir, 'brief.md'), '--out', join(t.dir, 'custom-pack')]);
    assert.equal(code, 0, stdout.text());
    assert.ok(existsSync(join(t.dir, 'custom-pack/00-brief.md')));
  } finally { t.cleanup(); }
});

test('brief new/check/pack resolve as two-word commands, and an unknown "brief" subcommand lists them', async () => {
  const { module: n, rest: r1 } = await resolveCommand(['brief', 'new', 'slug']);
  assert.equal(n.name, 'brief new');
  assert.deepEqual(r1, ['slug']);
  const { module: c } = await resolveCommand(['brief', 'check']);
  assert.equal(c.name, 'brief check');
  const { module: p } = await resolveCommand(['brief', 'pack', 'file.md']);
  assert.equal(p.name, 'brief pack');
  await assert.rejects(resolveCommand(['brief', 'launch']), (err) => err.exit === 2 && /new/.test(err.message) && /check/.test(err.message) && /pack/.test(err.message));
});
