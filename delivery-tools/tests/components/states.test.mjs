// Component states (components-first spec §3): the states a components run pictures for one
// component, and the gallery/inventory data built from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExportComponents, componentOrder } from '../../lib/design/components.mjs';
import { componentStates, galleryStates, componentsInventory } from '../../lib/components/states.mjs';

const DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures', 'design', 'components');

test('Picker: defaults, then one state per distinct literal set (order of first appearance), no derived open/range (already present)', async () => {
  const { components } = await readExportComponents(DIR);
  const picker = components.find((c) => c.name === 'Picker');
  const states = componentStates(picker);
  assert.deepEqual(states, [
    { id: 'C-Picker-01', props: {} },
    { id: 'C-Picker-02', props: { label: 'Day' } },
    { id: 'C-Picker-03', props: { label: 'Dates', range: true } },
    { id: 'C-Picker-04', props: { label: 'Day', open: true } },
    { id: 'C-Picker-05', props: { label: 'Due', open: false } },
  ]);
});

test('a declared prop no site sets gets a derived state; a declared prop already present does not repeat', () => {
  const component = {
    name: 'Dialog',
    props: { title: {}, open: {}, note: {}, bad: {}, error: {} },
    sites: [
      { file: 'Main.dc.html', line: 2, attrs: { title: { literal: 'Hi' }, open: { literal: true } } },
    ],
  };
  const states = componentStates(component);
  assert.deepEqual(states, [
    { id: 'C-Dialog-01', props: {} },
    { id: 'C-Dialog-02', props: { open: true, title: 'Hi' } },
    // range is not declared, so no derived range state; open is declared but already present.
    { id: 'C-Dialog-03', props: { note: 'Example note' } },
    { id: 'C-Dialog-04', props: { bad: true } },
    { id: 'C-Dialog-05', props: { error: 'Example error' } },
  ]);
});

test('sites are ordered by file then line, an empty literal set is dropped, and duplicate sets are deduplicated', () => {
  const component = {
    name: 'Chip',
    props: {},
    sites: [
      { file: 'B.dc.html', line: 1, attrs: { label: { literal: 'B' } } },
      { file: 'A.dc.html', line: 5, attrs: { value: { expr: 'x.value' } } }, // all bound: empty set, dropped
      { file: 'A.dc.html', line: 2, attrs: { label: { literal: 'B' } } }, // duplicate of B.dc.html:1's set
      { file: 'A.dc.html', line: 1, attrs: { label: { literal: 'A' } } },
    ],
  };
  const states = componentStates(component);
  assert.deepEqual(states, [
    { id: 'C-Chip-01', props: {} },
    { id: 'C-Chip-02', props: { label: 'A' } },
    { id: 'C-Chip-03', props: { label: 'B' } },
  ]);
});

test('galleryStates: id, component name and props, in build order, across every component the caller passes', async () => {
  const { components } = await readExportComponents(DIR);
  const order = componentOrder(components); // ['Picker', 'Table']
  const gallery = galleryStates(components, order);
  assert.deepEqual(gallery.states[0], { id: 'C-Picker-01', component: 'Picker', props: {} });
  // Table is imported once (Main.dc.html), with a literal check="{{ true }}": defaults, then check:true.
  assert.deepEqual(gallery.states.map((s) => s.id), [
    'C-Picker-01', 'C-Picker-02', 'C-Picker-03', 'C-Picker-04', 'C-Picker-05',
    'C-Table-01', 'C-Table-02',
  ]);
  assert.deepEqual(gallery.states.at(-1), { id: 'C-Table-02', component: 'Table', props: { check: true } });
});

test('galleryStates and componentsInventory only cover the components passed in, in the order given', async () => {
  const { components } = await readExportComponents(DIR);
  const order = componentOrder(components);
  const table = components.filter((c) => c.name === 'Table');
  assert.deepEqual(galleryStates(table, order).states.map((s) => s.id), ['C-Table-01', 'C-Table-02']);
});

test('componentsInventory: name is "<Name>: defaults" or "<Name>: key=value, ...", reach is a prop state naming the component file', async () => {
  const { components } = await readExportComponents(DIR);
  const order = componentOrder(components);
  const picker = components.filter((c) => c.name === 'Picker');
  const inv = componentsInventory(picker, order);
  assert.deepEqual(inv.states[0], {
    id: 'C-Picker-01', screen: 'Picker', name: 'Picker: defaults',
    reach: { kind: 'prop', file: 'Picker.dc.html', props: {} },
    shots: [], render: { status: 'ok' }, controls: [],
  });
  assert.equal(inv.states[1].name, 'Picker: label=Day');
  assert.equal(inv.states[2].name, 'Picker: label=Dates, range=true');
  assert.deepEqual(inv.states[1].reach, { kind: 'prop', file: 'Picker.dc.html', props: { label: 'Day' } });
});
