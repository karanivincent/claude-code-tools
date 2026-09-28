// The `components` ready check's pure rules (components-first spec §5): usedComponents (the union
// of what the run's design states show) and componentProblems (rules 1-4). importsOf and
// importGraph are always faked here; the caller (lib/run/ready-compute.mjs) supplies the real
// file-reading versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentProblems, usedComponents } from '../../lib/components/check.mjs';

const H = `sha256:${'1'.repeat(64)}`;

/** Design Picker (built, target src/ui/picker.tsx, built on the base Sheet) plus base Sheet. */
function baseMap(over = {}) {
  return {
    version: 1,
    allowOwns: [],
    components: [
      {
        kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H },
        target: 'src/ui/picker.tsx', status: 'built', builtHash: H,
        props: {}, owns: [], builtOn: ['Sheet'], replaces: [], uses: [], states: ['C-Picker-01'],
      },
      { kind: 'base', name: 'Sheet', target: 'src/ui/sheet.tsx', owns: ['@radix-ui/react-dialog'], source: 'shadcn' },
    ],
    ...over,
  };
}

/** menu.tsx imports the Picker target (extensionless, as an alias/relative resolution would return). */
const importsOfOk = (file) => (file === 'src/pages/menu.tsx' ? ['src/ui/picker'] : []);
const importGraphIdentity = (paths) => new Set(paths);

test('usedComponents: the union of every state\'s component names, sorted and deduped', () => {
  assert.deepEqual(usedComponents([['Picker', 'Sheet'], ['Sheet'], []]), ['Picker', 'Sheet']);
  assert.deepEqual(usedComponents([]), []);
  assert.deepEqual(usedComponents(), []);
});

test('a used, built component imported by a changed file, with no lookalike added: no problems', () => {
  const map = baseMap();
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [],
    importsOf: importsOfOk, importGraph: importGraphIdentity,
  });
  assert.deepEqual(problems, []);
});

test('rule 1: a used component not built, or built from a hash the design has since moved past, is red', () => {
  const map = baseMap();
  map.components[0].status = 'stale';
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [],
    importsOf: importsOfOk, importGraph: importGraphIdentity,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Picker/);
  assert.match(problems[0], /not built/);
});

test('rule 1 is skipped for a component the run is building now', () => {
  const map = baseMap();
  map.components[0].status = 'stale';
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [],
    importsOf: importsOfOk, importGraph: importGraphIdentity, buildingNow: ['Picker'],
  });
  assert.deepEqual(problems, []);
});

test('rule 2: a changed file importing an owned library directly, not through its target, is red', () => {
  const map = baseMap();
  const importsOf = (file) => (file === 'src/pages/menu.tsx' ? ['@radix-ui/react-dialog'] : []);
  const problems = componentProblems({
    map, used: [], changed: ['src/pages/menu.tsx'], added: [], importsOf, importGraph: () => new Set(),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/pages\/menu\.tsx/);
  assert.match(problems[0], /@radix-ui\/react-dialog/);
});

test('rule 2 is not raised for the library\'s own target, or a file listed in allowOwns', () => {
  const map = baseMap();
  const importsOf = (file) => (file === 'src/ui/sheet.tsx' ? ['@radix-ui/react-dialog'] : file === 'src/pages/add-menu.tsx' ? ['@radix-ui/react-dialog'] : []);
  assert.deepEqual(componentProblems({
    map, used: [], changed: ['src/ui/sheet.tsx'], added: [], importsOf, importGraph: () => new Set(),
  }), []);
  map.allowOwns = [{ file: 'src/pages/add-menu.tsx', library: '@radix-ui/react-dialog', why: 'not yet moved onto Sheet' }];
  assert.deepEqual(componentProblems({
    map, used: [], changed: ['src/pages/add-menu.tsx'], added: [], importsOf, importGraph: () => new Set(),
  }), []);
});

test('rule 3: an added file named like a component that is not its target is red', () => {
  const map = baseMap();
  const problems = componentProblems({
    map, used: [], changed: [], added: ['src/pages/my-picker.tsx'], importsOf: () => [], importGraph: () => new Set(),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/pages\/my-picker\.tsx/);
  assert.match(problems[0], /Picker/);
});

test('rule 3 is not raised for the component\'s own target, or an unrelated added file', () => {
  const map = baseMap();
  assert.deepEqual(componentProblems({
    map, used: [], changed: [], added: ['src/ui/picker.tsx'], importsOf: () => [], importGraph: () => new Set(),
  }), []);
  assert.deepEqual(componentProblems({
    map, used: [], changed: [], added: ['src/pages/other.tsx'], importsOf: () => [], importGraph: () => new Set(),
  }), []);
});

test('rule 4: a used component whose target nothing this PR changes reaches is red', () => {
  const map = baseMap();
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/other.tsx'], added: [],
    importsOf: () => [], importGraph: importGraphIdentity,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Picker/);
  assert.match(problems[0], /src\/ui\/picker\.tsx/);
});

test('rule 4 is skipped for a component the run is building now', () => {
  const map = baseMap();
  const problems = componentProblems({
    map, used: ['Picker'], changed: [], added: [], importsOf: () => [], importGraph: () => new Set(), buildingNow: ['Picker'],
  });
  assert.deepEqual(problems, []);
});

test('rule 4 is satisfied through one hop: a changed file imports a file that imports the target', () => {
  const map = baseMap();
  const importsOf = (file) => {
    if (file === 'src/pages/menu.tsx') return ['src/pages/wrapper'];
    if (file === 'src/pages/wrapper.tsx') return ['src/ui/picker'];
    return [];
  };
  const importGraph = (paths) => new Set([...paths, 'src/pages/wrapper.tsx']);
  const problems = componentProblems({ map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [], importsOf, importGraph });
  assert.deepEqual(problems, []);
});

test('several problems at once, in rule order', () => {
  const map = baseMap();
  map.components[0].status = 'new';
  map.components[0].builtHash = null;
  // menu.tsx imports the owned library directly and never reaches Picker's target: rules 1-4 all fire.
  const importsOf = (file) => (file === 'src/pages/menu.tsx' ? ['@radix-ui/react-dialog'] : []);
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: ['src/pages/my-picker.tsx'],
    importsOf, importGraph: (paths) => new Set(paths),
  });
  assert.equal(problems.length, 4);
  assert.match(problems[0], /Picker.*not built/);
  assert.match(problems[1], /src\/pages\/menu\.tsx.*@radix-ui\/react-dialog/);
  assert.match(problems[2], /src\/pages\/my-picker\.tsx.*Picker/);
  assert.match(problems[3], /Picker.*src\/ui\/picker\.tsx/);
});
