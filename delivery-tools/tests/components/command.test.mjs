// delivery components: --scan-base, --mark-built, --used, and the plain listing's stale/NEXT
// behaviour. --scan-base, --mark-built and the plain listing are product-wide (no --feature);
// --used needs a run resolved in the worktree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import command from '../../lib/commands/components.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { sha256Text } from '../../lib/design/components.mjs';

const H1 = `sha256:${'1'.repeat(64)}`;
const H2 = `sha256:${'2'.repeat(64)}`;

function write(dir, rel, content) {
  const abs = join(dir, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
}

test('components: no profile.components block prints that they are not configured, exit 0', async () => {
  const t = makeTempDir();
  try {
    const profile = makeProfile();
    delete profile.components;
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    assert.equal(await command.run(ctx, []), 0);
    assert.match(stdout.text(), /not configured/);
  } finally { t.cleanup(); }
});

test('--scan-base writes base entries into a temp repo\'s map', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'ui/sheet.tsx', `import * as Dialog from '@radix-ui/react-dialog';\nexport const Sheet = Dialog.Root;\n`);
    write(t.dir, 'ui/button.tsx', `import { Slot } from '@radix-ui/react-slot';\nexport const Button = Slot;\n`);
    write(t.dir, 'ui/badge.tsx', `export const Badge = (p) => p;\n`);
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json', baseDir: 'ui', baseLibraries: ['@radix-ui/*'] } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--scan-base']);
    assert.equal(code, 0, stdout.text());
    const map = JSON.parse(readFileSync(join(t.dir, 'docs/delivery/components.json'), 'utf8'));
    assert.deepEqual(map.components.map((c) => c.name).sort(), ['Badge', 'Button', 'Sheet']);
    const sheet = map.components.find((c) => c.name === 'Sheet');
    assert.equal(sheet.kind, 'base');
    assert.deepEqual(sheet.owns, ['@radix-ui/react-dialog']);
    assert.equal(sheet.target, 'ui/sheet.tsx');
  } finally { t.cleanup(); }
});

// Fix round (I7): a design entry built inside baseDir is not also scanned as a base part, and a
// second --scan-base after a base file is deleted drops its entry and reports the removal.
test('--scan-base skips a design entry\'s own target, and reports a base entry whose file is gone', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'ui/sheet.tsx', `import * as Dialog from '@radix-ui/react-dialog';\nexport const Sheet = Dialog.Root;\n`);
    write(t.dir, 'ui/picker.tsx', `export const Picker = () => null;\n`);
    write(t.dir, 'docs/delivery/components.json', {
      version: 1,
      components: [{
        kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H1 },
        target: 'ui/picker.tsx', status: 'built', builtHash: H1,
        props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
      }],
    });
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json', baseDir: 'ui', baseLibraries: ['@radix-ui/*'] } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const first = await command.run(ctx, ['--scan-base']);
    assert.equal(first, 0, stdout.text());
    let map = JSON.parse(readFileSync(join(t.dir, 'docs/delivery/components.json'), 'utf8'));
    // ui/picker.tsx is the design entry's own target: no base entry for it, no Picker/Picker clash.
    assert.deepEqual(map.components.filter((c) => c.kind === 'base').map((c) => c.target), ['ui/sheet.tsx']);

    rmSync(join(t.dir, 'ui/sheet.tsx'));
    const { ctx: ctx2, stdout: stdout2 } = await makeTestCtx({ repoRoot: t.dir, profile });
    const second = await command.run(ctx2, ['--scan-base']);
    assert.equal(second, 0, stdout2.text());
    assert.match(stdout2.text(), /removed Sheet \(ui\/sheet\.tsx\): the file no longer exists/);
    map = JSON.parse(readFileSync(join(t.dir, 'docs/delivery/components.json'), 'utf8'));
    assert.deepEqual(map.components.filter((c) => c.kind === 'base'), []);
  } finally { t.cleanup(); }
});

test('--mark-built refuses a design entry with no target (exit 2), succeeds once one is set', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  const pickerMap = () => ({
    version: 1,
    components: [{
      kind: 'design', name: 'Picker',
      design: { file: 'Picker.dc.html', hash: H1 },
      target: null, status: 'new', builtHash: null,
      props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
    }],
  });
  try {
    write(t.dir, mapRel, pickerMap());
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx: ctx1 } = await makeTestCtx({ repoRoot: t.dir, profile });
    await assert.rejects(command.run(ctx1, ['--mark-built', 'Picker']), (e) => e.exit === 2 && /no target yet/.test(e.message));

    write(t.dir, 'src/ui/picker.tsx', 'export const Picker = () => null;\n');
    const withTarget = pickerMap();
    withTarget.components[0].target = 'src/ui/picker.tsx';
    write(t.dir, mapRel, withTarget);
    const { ctx: ctx2, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx2, ['--mark-built', 'Picker']);
    assert.equal(code, 0, stdout.text());
    const saved = JSON.parse(readFileSync(join(t.dir, mapRel), 'utf8'));
    const picker = saved.components.find((c) => c.name === 'Picker');
    assert.equal(picker.status, 'built');
    assert.equal(picker.builtHash, H1);
  } finally { t.cleanup(); }
});

// Fix round (I14): the builder deletes a replaced file in the same PR (briefs/builder-picture.md);
// once it is actually gone, "open" (a caller still to switch over) is stale. --mark-built retires
// it, and reports the ones it actually retired — a "left" replacement is never touched, whether or
// not its file happens to exist.
test('--mark-built retires a replaces[] entry whose file no longer exists; a "left" one is untouched', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  try {
    write(t.dir, 'src/ui/picker.tsx', 'export const Picker = () => null;\n');
    write(t.dir, 'src/old-picker-kept.tsx', 'export const OldPicker = () => null;\n');
    write(t.dir, mapRel, {
      version: 1,
      components: [{
        kind: 'design', name: 'Picker',
        design: { file: 'Picker.dc.html', hash: H1 },
        target: 'src/ui/picker.tsx', status: 'new', builtHash: null,
        props: {}, owns: [], builtOn: [],
        replaces: [
          { file: 'src/old-picker-deleted.tsx', state: 'open', why: null },
          { file: 'src/old-picker-kept.tsx', state: 'open', why: null },
          { file: 'src/old-picker-left.tsx', state: 'left', why: 'props do not map' },
        ],
        uses: [], states: [],
      }],
    });
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--mark-built', 'Picker']);
    assert.equal(code, 0, stdout.text());
    assert.match(stdout.text(), /src\/old-picker-deleted\.tsx: retired \(the file no longer exists\)/);
    assert.doesNotMatch(stdout.text(), /old-picker-kept/);
    assert.doesNotMatch(stdout.text(), /old-picker-left/);

    const saved = JSON.parse(readFileSync(join(t.dir, mapRel), 'utf8'));
    const replaces = saved.components[0].replaces;
    assert.equal(replaces.find((r) => r.file === 'src/old-picker-deleted.tsx').state, 'retired');
    assert.equal(replaces.find((r) => r.file === 'src/old-picker-kept.tsx').state, 'open', 'still on disk: not switched over yet');
    assert.equal(replaces.find((r) => r.file === 'src/old-picker-left.tsx').state, 'left', 'a deliberate "left" is never retired');
  } finally { t.cleanup(); }
});

// Fix round (I9): the builder used to be told its prompt "also lists" the components; it does not
// — the builder now runs this command itself.
test('--used prints the run\'s used components with their target and props, and refuses with no run resolved', async () => {
  const t = makeTempDir();
  try {
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json' } });
    write(t.dir, 'docs/delivery/components.json', {
      version: 1,
      components: [{
        kind: 'design', name: 'Picker',
        design: { file: 'Picker.dc.html', hash: H1 },
        target: 'src/ui/picker.tsx', status: 'built', builtHash: H1,
        props: { label: 'label', onPick: 'onPick' }, owns: [], builtOn: [], replaces: [], uses: [], states: [],
      }],
    });
    write(t.dir, 'docs/delivery/widgets/map.json', {
      schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
      pageArea: { left: 240, designLeft: 240 },
      worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+widgets-design-admin@example.invalid' }] }],
      states: [{ id: 'W-01', screen: 'Main', name: 'Everything', reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] }, buttons: [] }],
    });
    const paths = featurePaths(t.dir, 'widgets');
    mkdirSync(paths.designRenders, { recursive: true });
    writeFileSync(join(paths.designRenders, 'W-01.components.json'), JSON.stringify({ names: ['Picker'] }));

    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile, feature: 'widgets' });
    const code = await command.run(ctx, ['--used']);
    assert.equal(code, 0, stdout.text());
    assert.match(stdout.text(), /Picker -> src\/ui\/picker\.tsx \(props: label->label, onPick->onPick\)/);

    const { ctx: noFeature } = await makeTestCtx({ repoRoot: t.dir, profile });
    await assert.rejects(command.run(noFeature, ['--used']), (e) => e.exit === 2 && /needs a run resolved/.test(e.message));
  } finally { t.cleanup(); }
});

test('plain components: exits 1 on a stale entry, and prints the design-sync NEXT line when the export manifest misses a built entry', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  try {
    write(t.dir, 'src/ui/picker.tsx', 'export const Picker = () => null;\n');
    write(t.dir, 'src/ui/table.tsx', 'export const Table = () => null;\n');
    write(t.dir, mapRel, {
      version: 1,
      components: [
        {
          kind: 'design', name: 'Picker',
          design: { file: 'Picker.dc.html', hash: H2 },
          target: 'src/ui/picker.tsx', status: 'stale', builtHash: H1,
          props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
        },
        // Fix round (M6): a still-stale entry is never something /design-sync owes; Table (built)
        // is what should show up as missing from the manifest below.
        {
          kind: 'design', name: 'Table',
          design: { file: 'Table.dc.html', hash: H1 },
          target: 'src/ui/table.tsx', status: 'built', builtHash: H1,
          props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
        },
      ],
    });
    write(t.dir, 'export/_ds/x/_ds_manifest.json', { components: [{ name: 'Sheet' }] });
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--export', join(t.dir, 'export')]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /stale/);
    assert.match(stdout.text(), /NEXT: run \/design-sync on the design-system project: it lacks Table/);
    assert.doesNotMatch(stdout.text(), /it lacks.*Picker/);
  } finally { t.cleanup(); }
});

test('export drift: a Picker file whose live hash differs from the recorded one is stale, exit 1, and components.json is left unchanged on disk', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  const persisted = {
    version: 1,
    components: [{
      kind: 'design', name: 'Picker',
      design: { file: 'Picker.dc.html', hash: H1 },
      target: 'src/ui/picker.tsx', status: 'built', builtHash: H1,
      props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
    }],
  };
  try {
    write(t.dir, 'src/ui/picker.tsx', 'export const Picker = () => null;\n');
    write(t.dir, mapRel, persisted);
    write(t.dir, 'export/Main.dc.html', '<x-dc><dc-import name="Picker"></dc-import></x-dc>');
    write(t.dir, 'export/Picker.dc.html', '<x-dc><div>Pick a day</div></x-dc>');
    const before = readFileSync(join(t.dir, mapRel), 'utf8');
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--export', join(t.dir, 'export')]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /Picker: built -> stale \(the design file changed\)/);
    assert.equal(readFileSync(join(t.dir, mapRel), 'utf8'), before, 'a plain run never writes the map back');
  } finally { t.cleanup(); }
});

test('export drift: a component in the export but not in the map is reported, and counts toward exit 1', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  try {
    write(t.dir, mapRel, { version: 1, components: [] });
    write(t.dir, 'export/Main.dc.html', '<x-dc><dc-import name="Table"></dc-import></x-dc>');
    write(t.dir, 'export/Table.dc.html', '<x-dc><table></table></x-dc>');
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--export', join(t.dir, 'export')]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /Table: not in the map yet/);
  } finally { t.cleanup(); }
});

test('an export whose dc-import names a file the export lacks is a problem that fails the command (exit 1), not a silent pass', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  try {
    write(t.dir, mapRel, { version: 1, components: [] });
    write(t.dir, 'export/Main.dc.html', '<x-dc><dc-import name="Ghost"></dc-import></x-dc>');
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--export', join(t.dir, 'export')]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /FAIL components Main\.dc\.html:1: dc-import names Ghost, but Ghost\.dc\.html is not in the export/);
  } finally { t.cleanup(); }
});

test('a design cycle (A uses B, B uses A) is reported as a problem, not a crash, and still lists every entry (by name)', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  const designEntry = (name, uses, hash) => ({
    kind: 'design', name, design: { file: `${name}.dc.html`, hash },
    target: `src/ui/${name.toLowerCase()}.tsx`, status: 'built', builtHash: hash,
    props: {}, owns: [], builtOn: [], replaces: [], uses, states: [],
  });
  try {
    write(t.dir, 'src/ui/a.tsx', 'export const A = () => null;\n');
    write(t.dir, 'src/ui/b.tsx', 'export const B = () => null;\n');
    write(t.dir, mapRel, { version: 1, components: [designEntry('A', ['B'], H1), designEntry('B', ['A'], H2)] });
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, []);
    assert.equal(code, 1);
    assert.match(stdout.text(), /FAIL components component import cycle: A -> B -> A/);
    assert.match(stdout.text(), /design A: built/);
    assert.match(stdout.text(), /design B: built/);
  } finally { t.cleanup(); }
});

// A page run's intake never refreshes components.json, so the map can record an older export's
// hash. --mark-built inside a run takes the hash from the run's own snapshot instead.
test('--mark-built inside a run takes the hash from the run\'s design snapshot, not the stale recorded one', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  try {
    const pickerHtml = '<x-dc><div>{{ label }}</div></x-dc>';
    write(t.dir, 'docs/design/widgets/Main.dc.html', '<x-dc><dc-import name="Picker" label="Day"></dc-import></x-dc>');
    write(t.dir, 'docs/design/widgets/Picker.dc.html', pickerHtml);
    write(t.dir, 'src/ui/picker.tsx', 'export const Picker = () => null;\n');
    write(t.dir, mapRel, {
      version: 1,
      components: [{
        kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H1 },
        target: 'src/ui/picker.tsx', status: 'new', builtHash: null,
        props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
      }],
    });
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    await command.run(ctx, ['--mark-built', 'Picker']);
    const saved = JSON.parse(readFileSync(join(t.dir, mapRel), 'utf8'));
    assert.equal(saved.components[0].builtHash, sha256Text(pickerHtml));
    assert.notEqual(saved.components[0].builtHash, H1);
    assert.match(stdout.text(), /marked Picker built at sha256:[0-9a-f]{64} \(from the run's design snapshot\)/);
  } finally { t.cleanup(); }
});
