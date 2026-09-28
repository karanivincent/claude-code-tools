// The component map (components-first spec §2): schema, refreshDesignEntries' lifecycle
// (new -> built -> stale), scanBase against a fixture, libraryTargets, missingFromDesignSystem
// and validateComponentsMap's structural checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { validExample, loadFixture } from '../helpers/fixtures.mjs';
import {
  refreshDesignEntries, scanBase, libraryTargets, missingFromDesignSystem, validateComponentsMap,
  findDesignSystemManifest,
} from '../../lib/components/map.mjs';

const FIXTURES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures', 'components');
const H1 = `sha256:${'1'.repeat(64)}`;
const H2 = `sha256:${'2'.repeat(64)}`;

test('the schema accepts the synthetic example, and refuses state:"left" without why', () => {
  assert.deepEqual(validateAgainst('components', validExample('components')), { ok: true, errors: [] });
  const bad = loadFixture('schemas/components.invalid.json');
  assert.equal(validateAgainst('components', bad).ok, false);

  const left = { ...validExample('components') };
  left.components = [{
    ...left.components[0],
    replaces: [{ file: 'src/old-picker.tsx', state: 'left' }],
  }, ...left.components.slice(1)];
  assert.equal(validateAgainst('components', left).ok, false);
  const withWhy = { ...left, components: [{ ...left.components[0], replaces: [{ file: 'src/old-picker.tsx', state: 'left', why: 'callers moved to Table' }] }, ...left.components.slice(1)] };
  assert.equal(validateAgainst('components', withWhy).ok, true);
});

test('refreshDesignEntries: new, then built once builtHash matches, then stale on a hash change; target and props untouched', () => {
  const design = [{ name: 'Picker', file: 'Picker.dc.html', hash: H1, uses: [] }];
  let { map, changed } = refreshDesignEntries({ version: 1, components: [] }, design);
  assert.deepEqual(changed, ['Picker']);
  let picker = map.components.find((c) => c.name === 'Picker');
  assert.equal(picker.status, 'new');
  assert.equal(picker.target, null);
  assert.deepEqual(picker.props, {});

  // The mapper does its work; the builder marks it built at the current hash.
  picker.target = 'src/ui/picker.tsx';
  picker.props = { label: 'label' };
  picker.builtHash = H1;

  ({ map, changed } = refreshDesignEntries(map, design));
  picker = map.components.find((c) => c.name === 'Picker');
  assert.equal(picker.status, 'built');
  assert.equal(picker.target, 'src/ui/picker.tsx');
  assert.deepEqual(picker.props, { label: 'label' });
  assert.deepEqual(changed, []); // the hash did not move this time

  const changedDesign = [{ name: 'Picker', file: 'Picker.dc.html', hash: H2, uses: [] }];
  ({ map, changed } = refreshDesignEntries(map, changedDesign));
  picker = map.components.find((c) => c.name === 'Picker');
  assert.equal(picker.status, 'stale');
  assert.equal(picker.design.hash, H2);
  assert.equal(picker.target, 'src/ui/picker.tsx'); // kept, not touched
  assert.deepEqual(picker.props, { label: 'label' }); // kept, not touched
  assert.deepEqual(changed, ['Picker']);
});

test('scanBase: Badge owns nothing, Button owns @radix-ui/react-slot, Sheet owns @radix-ui/react-dialog; the test file is skipped', () => {
  const entries = scanBase(FIXTURES_DIR, 'ui', ['@radix-ui/*']);
  assert.deepEqual(entries.map((e) => e.name).sort(), ['Badge', 'Button', 'Sheet']);
  const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
  assert.deepEqual(byName.Badge.owns, []);
  assert.deepEqual(byName.Button.owns, ['@radix-ui/react-slot']);
  assert.deepEqual(byName.Sheet.owns, ['@radix-ui/react-dialog']);
  assert.equal(byName.Sheet.target, 'ui/sheet.tsx');
  assert.equal(byName.Sheet.kind, 'base');
  assert.equal(byName.Sheet.source, 'scan');
});

test('libraryTargets maps an owned library to every target owning it', () => {
  const entries = scanBase(FIXTURES_DIR, 'ui', ['@radix-ui/*']);
  const map = { version: 1, components: entries };
  const targets = libraryTargets(map);
  assert.deepEqual([...targets.get('@radix-ui/react-dialog')], ['ui/sheet.tsx']);
  assert.deepEqual([...targets.get('@radix-ui/react-slot')], ['ui/button.tsx']);
  assert.equal(targets.has('@radix-ui/react-slot2'), false);
});

test('missingFromDesignSystem: every name but Sheet, against the fixture manifest', () => {
  const entries = scanBase(FIXTURES_DIR, 'ui', ['@radix-ui/*']);
  const map = { version: 1, components: entries };
  const manifestPath = findDesignSystemManifest(FIXTURES_DIR);
  assert.match(manifestPath, /_ds_manifest\.json$/);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(missingFromDesignSystem(map, manifest.components), ['Badge', 'Button']);
});

test('validateComponentsMap: a missing target file, and a builtOn naming no base entry', () => {
  const map = {
    version: 1,
    components: [
      {
        kind: 'design', name: 'Picker',
        design: { file: 'Picker.dc.html', hash: H1 },
        target: 'src/ui/picker.tsx', status: 'built', builtHash: H1,
        props: {}, owns: [], builtOn: ['Popover'], replaces: [], uses: [], states: [],
      },
    ],
  };
  const problems = validateComponentsMap(map, { repoRoot: FIXTURES_DIR });
  assert.ok(problems.some((p) => p.includes('target') && p.includes('does not exist')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('builtOn') && p.includes('Popover')), problems.join('\n'));
});

test('validateComponentsMap: duplicate names, and owns with no target', () => {
  const map = {
    version: 1,
    components: [
      { kind: 'base', name: 'Sheet', target: 'ui/sheet.tsx', owns: ['@radix-ui/react-dialog'], source: 'scan' },
      { kind: 'base', name: 'Sheet', target: 'ui/other-sheet.tsx', owns: [], source: 'scan' },
      {
        kind: 'design', name: 'Table',
        design: { file: 'Table.dc.html', hash: H1 },
        target: null, status: 'new', builtHash: null,
        props: {}, owns: ['some-lib'], builtOn: [], replaces: [], uses: [], states: [],
      },
    ],
  };
  const problems = validateComponentsMap(map, { repoRoot: FIXTURES_DIR });
  assert.ok(problems.some((p) => p.includes('duplicate component name "Sheet"')), problems.join('\n'));
  assert.ok(problems.some((p) => p === 'Table: owns a library but has no target yet'), problems.join('\n'));
});
