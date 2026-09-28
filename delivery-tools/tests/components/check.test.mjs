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
  map.components[0].builtHash = `sha256:${'2'.repeat(64)}`; // stale: no longer matches design.hash
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [],
    importsOf: importsOfOk, importGraph: importGraphIdentity,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Picker/);
  assert.match(problems[0], /not built/);
});

// Fix round: rule 1's status now comes from effectiveComponents (hash-driven), not the map's own
// possibly-stale "status" field, so flipping status alone no longer means anything on its own.
test('rule 1 does not trust a "status" field that disagrees with the hashes: builtHash matching design.hash is built regardless', () => {
  const map = baseMap();
  map.components[0].status = 'stale'; // the hashes still agree; this field alone must not matter
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [],
    importsOf: importsOfOk, importGraph: importGraphIdentity,
  });
  assert.deepEqual(problems, []);
});

test('rule 1: a used component absent from the map entirely blocks the same as "new"', () => {
  const map = baseMap();
  map.components = map.components.filter((c) => c.name !== 'Picker');
  const problems = componentProblems({
    map, used: ['Picker'], changed: [], added: [],
    importsOf: () => [], importGraph: () => new Set(),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Picker/);
  assert.match(problems[0], /not built/);
});

test('rule 1 uses the real design snapshot when the caller has one, over the map\'s own recorded hash', () => {
  const map = baseMap(); // Picker built at H, and the map's own design.hash still says H too
  const staleExport = [{ name: 'Picker', hash: `sha256:${'9'.repeat(64)}` }]; // the live design moved on
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/menu.tsx'], added: [],
    importsOf: importsOfOk, importGraph: importGraphIdentity, exportComponents: staleExport,
  });
  assert.equal(problems.length, 1, problems.join('; '));
  assert.match(problems[0], /Picker/);
  assert.match(problems[0], /not built/);
});

test('rule 1\'s message tells a page run to run the components run, and a components run to mark built and commit', () => {
  const map = baseMap();
  map.components = map.components.filter((c) => c.name !== 'Picker');
  const page = componentProblems({ map, used: ['Picker'], changed: [], added: [], importsOf: () => [], importGraph: () => new Set() });
  assert.match(page[0], /delivery intake --components/);
  const componentsRun = componentProblems({ map, used: ['Picker'], changed: [], added: [], importsOf: () => [], importGraph: () => new Set(), isComponentsRun: true });
  assert.match(componentsRun[0], /delivery components --mark-built Picker/);
  assert.match(componentsRun[0], /commit components\.json/);
});

test('rule 1 is skipped for a component the run is building now', () => {
  const map = baseMap();
  map.components[0].builtHash = `sha256:${'2'.repeat(64)}`;
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

// 0.9.2: the first real components run's ready went red on the design snapshot's own
// docs/design/components/DatePicker.dc.html — the design itself, not a redraw of it.
test('rule 3 is not raised for a file under the design or delivery folders', () => {
  const map = baseMap();
  assert.deepEqual(componentProblems({
    map, used: [], changed: [], added: ['docs/design/components/Picker.dc.html', 'docs/delivery/picker/notes.md'],
    importsOf: () => [], importGraph: () => new Set(), docDirs: ['docs/design', 'docs/delivery/'],
  }), []);
  assert.equal(componentProblems({
    map, used: [], changed: [], added: ['docs/designs-old/picker.tsx'],
    importsOf: () => [], importGraph: () => new Set(), docDirs: ['docs/design'],
  }).length, 1, 'a sibling folder whose name only starts the same is still checked');
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

// Fix round: rule 3 used to flag a component's own colocated test file (its target's path plus
// .test/.spec/.stories) as a redraw. Only the exact colocated companion is exempt; a same-named
// file elsewhere (rule 3's own "picker.stories.tsx" case above, under src/pages/) still counts.
test('rule 3 does not flag a component\'s own colocated .test/.spec/.stories companion', () => {
  const map = baseMap();
  const noArgs = { map, used: [], changed: [], importsOf: () => [], importGraph: () => new Set() };
  assert.deepEqual(componentProblems({ ...noArgs, added: ['src/ui/picker.test.tsx'] }), []);
  assert.deepEqual(componentProblems({ ...noArgs, added: ['src/ui/picker.spec.tsx'] }), []);
  assert.deepEqual(componentProblems({ ...noArgs, added: ['src/ui/picker.stories.tsx'] }), []);
});

/** Table and PeopleTable, both built, for the rule-3 segment-matching cases. */
function tableMap() {
  return {
    version: 1,
    allowOwns: [],
    components: [
      { kind: 'design', name: 'Table', design: { file: 'Table.dc.html', hash: H }, target: 'src/ui/table.tsx', status: 'built', builtHash: H, props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [] },
      { kind: 'design', name: 'PeopleTable', design: { file: 'PeopleTable.dc.html', hash: H }, target: 'src/pages/people-table.tsx', status: 'built', builtHash: H, props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: [] },
    ],
  };
}

test('rule 3 matches a whole run of the basename\'s -/_/. segments, never a bare substring', () => {
  const noArgs = { used: [], changed: [], importsOf: () => [], importGraph: () => new Set() };

  // A prefix or suffix segment around the component's own kebab name: still red.
  assert.equal(componentProblems({ map: baseMap(), ...noArgs, added: ['src/pages/my-picker.tsx'] }).length, 1);
  assert.equal(componentProblems({ map: baseMap(), ...noArgs, added: ['src/pages/picker-panel.tsx'] }).length, 1);
  // Underscore and dot separators split segments the same way as a hyphen.
  assert.equal(componentProblems({ map: baseMap(), ...noArgs, added: ['src/pages/my_picker.tsx'] }).length, 1);
  assert.equal(componentProblems({ map: baseMap(), ...noArgs, added: ['src/pages/picker.stories.tsx'] }).length, 1);

  const tm = tableMap();
  // "timetable" is one word (no separator before "table"): not a segment match for Table.
  assert.deepEqual(componentProblems({ map: tm, ...noArgs, added: ['src/pages/timetable.tsx'] }), []);
  // "people-table-row" carries "people-table" as a contiguous run: red for PeopleTable.
  const hit = componentProblems({ map: tm, ...noArgs, added: ['src/pages/people-table-row.tsx'] });
  assert.ok(hit.some((p) => p.includes('PeopleTable')), hit.join('; '));
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

// Fix round: an update run that touches only, say, a copy fix never re-imports the component's
// own caller, which used to go red on rule 4 even though the target is wired in somewhere in the
// repo. importedAnywhere is the weaker form: it passes when any tracked file imports the target,
// not only ones this PR's changes reach.
test('rule 4 passes when nothing this PR changes reaches the target, but some other tracked file imports it', () => {
  const map = baseMap();
  const problems = componentProblems({
    map, used: ['Picker'], changed: ['src/pages/other.tsx'], added: [],
    importsOf: () => [], importGraph: importGraphIdentity, importedAnywhere: new Set(['src/ui/picker']),
  });
  assert.deepEqual(problems, []);
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
