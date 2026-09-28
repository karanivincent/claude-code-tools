// delivery components: --scan-base, --mark-built, and the plain listing's stale/NEXT behaviour.
// Product-wide: none of these need --feature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import command from '../../lib/commands/components.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

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

test('plain components: exits 1 on a stale entry, and prints the design-sync NEXT line when the export manifest misses an entry', async () => {
  const t = makeTempDir();
  const mapRel = 'docs/delivery/components.json';
  try {
    write(t.dir, 'src/ui/picker.tsx', 'export const Picker = () => null;\n');
    write(t.dir, mapRel, {
      version: 1,
      components: [{
        kind: 'design', name: 'Picker',
        design: { file: 'Picker.dc.html', hash: H2 },
        target: 'src/ui/picker.tsx', status: 'stale', builtHash: H1,
        props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
      }],
    });
    write(t.dir, 'export/_ds/x/_ds_manifest.json', { components: [{ name: 'Sheet' }] });
    const profile = makeProfile({ components: { map: mapRel } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, profile });
    const code = await command.run(ctx, ['--export', join(t.dir, 'export')]);
    assert.equal(code, 1);
    assert.match(stdout.text(), /stale/);
    assert.match(stdout.text(), /NEXT: run \/design-sync on the design-system project: it lacks Picker/);
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
