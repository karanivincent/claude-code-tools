import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDesignComponents, readExportComponents, componentOrder, kebabToCamel, declaredProps } from '../../lib/design/components.mjs';

const DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/design/components');

test('kebab attributes become the camelCase prop names', () => {
  assert.equal(kebabToCamel('allowed-days'), 'allowedDays');
  assert.equal(kebabToCamel('on-range-change'), 'onRangeChange');
  assert.equal(kebabToCamel('label'), 'label');
});

test('the export has two components, with sites, props, preview and uses', async () => {
  const { components, errors } = await readExportComponents(DIR);
  assert.deepEqual(errors, []);
  assert.deepEqual(components.map((c) => c.name), ['Picker', 'Table']);
  const picker = components[0];
  assert.equal(picker.file, 'Picker.dc.html');
  assert.match(picker.hash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(picker.preview, { width: 320, height: 420 });
  assert.deepEqual(Object.keys(picker.props).sort(), ['label', 'onPick', 'open', 'range', 'value']);
  assert.deepEqual(picker.events, ['onPick']);
  assert.equal(picker.sites.length, 4); // three in Main, one in Table
  const [first, second, third] = picker.sites.filter((s) => s.file === 'Main.dc.html');
  assert.deepEqual(first.attrs.label, { literal: 'Day' });
  assert.deepEqual(first.attrs.open, { expr: 'md.day.open' });
  assert.equal(first.attrs.hintSize, undefined);
  assert.deepEqual(second.attrs.range, { literal: true });
  assert.deepEqual(third.attrs.allowedDays, { expr: '[1,2]' });
  assert.equal(first.line, 2);
  assert.deepEqual(components[1].uses, ['Picker']);
  assert.deepEqual(picker.uses, []);
});

test('a dc-import naming a file the export lacks is an error with file and line', () => {
  const { errors } = readDesignComponents([{ file: 'Main.dc.html', html: '<x-dc>\n<dc-import name="Ghost"></dc-import></x-dc>' }]);
  assert.deepEqual(errors, ['Main.dc.html:2: dc-import names Ghost, but Ghost.dc.html is not in the export']);
});

test('build order is leaves first, and a cycle throws', async () => {
  const { components } = await readExportComponents(DIR);
  assert.deepEqual(componentOrder(components), ['Picker', 'Table']);
  const cyc = readDesignComponents([
    { file: 'A.dc.html', html: '<dc-import name="B"></dc-import>' },
    { file: 'B.dc.html', html: '<dc-import name="A"></dc-import>' },
  ]).components;
  assert.throws(() => componentOrder(cyc), /component import cycle: A -> B -> A/);
});

test('a file without data-props declares nothing', () => {
  assert.deepEqual(declaredProps('<x-dc></x-dc>'), { props: {}, preview: null });
});
