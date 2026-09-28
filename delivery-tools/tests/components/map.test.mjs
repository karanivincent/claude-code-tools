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
  effectiveComponents, refreshDesignEntries, scanBase, libraryTargets, missingFromDesignSystem,
  validateComponentsMap, findDesignSystemManifest,
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

// Fix round (I3): a page run's intake never calls refreshDesignEntries, so components.json's own
// design.hash/status can go stale, and a used component the map has never heard of at all used to
// be silently skipped. effectiveComponents computes status against the caller's real export instead.
test('effectiveComponents: missing from the map is "new", a moved-on hash is "stale", a matching one is "built"', () => {
  const map = {
    version: 1,
    components: [
      { kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H1 }, builtHash: H1, target: 'src/ui/picker.tsx', status: 'built', props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [] },
      { kind: 'design', name: 'Table', design: { file: 'Table.dc.html', hash: H1 }, builtHash: null, target: null, status: 'new', props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [] },
    ],
  };
  const exportComponents = [
    { name: 'Picker', hash: H1 }, // matches builtHash: built
    { name: 'Table', hash: H1 }, // never built (builtHash null): new
    { name: 'Sheet', hash: H2 }, // not in the map at all: new, the same as an unmapped component
  ];
  const effective = effectiveComponents(map, exportComponents);
  assert.equal(effective.get('Picker'), 'built');
  assert.equal(effective.get('Table'), 'new');
  assert.equal(effective.get('Sheet'), 'new');
});

test('effectiveComponents: a design that moved past what was built is "stale", regardless of the map\'s own recorded status', () => {
  const map = {
    version: 1,
    components: [
      { kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H1 }, builtHash: H1, target: 'src/ui/picker.tsx', status: 'built', props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [] },
    ],
  };
  const effective = effectiveComponents(map, [{ name: 'Picker', hash: H2 }]);
  assert.equal(effective.get('Picker'), 'stale');
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

// Fix round (I7): a design component's own target inside baseDir (built there, not a base part) is
// not also scanned as a base entry.
test('scanBase skips a file that is already a design entry\'s own target', () => {
  const withoutDesign = scanBase(FIXTURES_DIR, 'ui', ['@radix-ui/*']);
  assert.ok(withoutDesign.some((e) => e.target === 'ui/sheet.tsx'));
  const withDesign = scanBase(FIXTURES_DIR, 'ui', ['@radix-ui/*'], ['ui/sheet.tsx']);
  assert.equal(withDesign.some((e) => e.target === 'ui/sheet.tsx'), false);
  assert.deepEqual(withDesign.map((e) => e.name).sort(), ['Badge', 'Button']);
  // A Set works the same as an array.
  const withSet = scanBase(FIXTURES_DIR, 'ui', ['@radix-ui/*'], new Set(['ui/sheet.tsx']));
  assert.deepEqual(withSet.map((e) => e.name).sort(), ['Badge', 'Button']);
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

// Fix round (M6): a design entry still "new" or "stale" was never built here, so it was never
// going to be in the design system either — only a built design entry (and every base entry,
// which carries no status at all) counts as something /design-sync actually owes.
test('missingFromDesignSystem only counts built design entries, never a "new" or "stale" one', () => {
  const designEntry = (name, status) => ({
    kind: 'design', name, design: { file: `${name}.dc.html`, hash: H1 },
    target: `src/ui/${name.toLowerCase()}.tsx`, status, builtHash: status === 'built' ? H1 : null,
    props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
  });
  const map = {
    version: 1,
    components: [
      designEntry('Picker', 'built'),
      designEntry('Table', 'new'),
      designEntry('Chart', 'stale'),
      { kind: 'base', name: 'Sheet', target: 'ui/sheet.tsx', owns: [], source: 'scan' },
    ],
  };
  // The manifest has none of them: only the built design entry and the base entry are owed.
  assert.deepEqual(missingFromDesignSystem(map, []), ['Picker', 'Sheet']);
  // Once the manifest also has Picker, only the base entry is left.
  assert.deepEqual(missingFromDesignSystem(map, [{ name: 'Picker' }]), ['Sheet']);
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

// Fix round (I8): the mapper sets a design entry's target before the builder has created the file
// (status stays "new" until it is built), so a not-yet-existing target must not be reported there.
test('validateComponentsMap: a "new" entry\'s not-yet-built target is not reported missing; a "stale" one still is', () => {
  const entry = (over) => ({
    version: 1,
    components: [{
      kind: 'design', name: 'Picker',
      design: { file: 'Picker.dc.html', hash: H1 },
      target: 'src/ui/picker.tsx', builtHash: null,
      props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
      ...over,
    }],
  });
  assert.deepEqual(validateComponentsMap(entry({ status: 'new' }), { repoRoot: FIXTURES_DIR }), []);
  const stale = validateComponentsMap(entry({ status: 'stale', builtHash: H1 }), { repoRoot: FIXTURES_DIR });
  assert.ok(stale.some((p) => p.includes('target') && p.includes('does not exist')), stale.join('\n'));
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

// Fix round (I7): a design component and a base part sharing a pascal name (a base file that also
// happens to be a design component's own target) are different roles, not a collision.
test('validateComponentsMap: a design entry and a base entry sharing a name are not a duplicate', () => {
  const map = {
    version: 1,
    components: [
      { kind: 'base', name: 'Picker', target: 'ui/picker.tsx', owns: [], source: 'scan' },
      {
        kind: 'design', name: 'Picker',
        design: { file: 'Picker.dc.html', hash: H1 },
        target: 'ui/picker-panel.tsx', status: 'new', builtHash: null,
        props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [],
      },
    ],
  };
  const problems = validateComponentsMap(map, {});
  assert.deepEqual(problems.filter((p) => p.includes('duplicate')), []);
});
