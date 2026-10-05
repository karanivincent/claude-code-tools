// A reach that puts a state key in props (screen, tab, dlg...) renders it as a {set} step: a prop
// never sets the state of the same name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designReachKeys, splitReachProps, planRenders } from '../../lib/design/render.mjs';
import { widgetsInventory } from './helpers.mjs';

const esc = (o) => JSON.stringify(o).replace(/"/g, '&quot;');
const PAGE = `<!doctype html><html><body><x-dc><div>{{ title }}</div></x-dc>
<script type="text/x-dc" data-dc-script data-props="${esc({
  screen: { editor: 'enum', options: ['Desktop', 'Phone'], default: 'Desktop', tsType: 'string' },
  dense: { editor: 'boolean', default: false, tsType: 'boolean' },
  callsState: { editor: 'enum', options: ['A1', 'A2'], default: 'A1', tsType: 'string' },
})}">
class Logic {
  state = { screen: 'home', tab: 'all', dlg: '' };
  open() { this.set({ screen: 'calls', tab: 'missed' }); }
  menu() { this.set({ dlg: 'export' }); }
}
</script></body></html>`;

test('designReachKeys: state keys, and each prop with the values its editor offers', () => {
  const d = designReachKeys(PAGE);
  assert.deepEqual([...d.stateKeys].sort(), ['dlg', 'screen', 'tab']);
  assert.deepEqual(d.props.screen.options, ['Desktop', 'Phone']);
  assert.deepEqual(d.props.dense.options, [true, false]);
});

test('splitReachProps: a state key the design does not declare, or declares without that value, is state', () => {
  const d = designReachKeys(PAGE);
  assert.deepEqual(splitReachProps({ tab: 'missed', dense: true }, d), { props: { dense: true }, set: { tab: 'missed' } });
  assert.deepEqual(splitReachProps({ screen: 'calls' }, d), { props: null, set: { screen: 'calls' } });
  assert.deepEqual(splitReachProps({ screen: 'Phone' }, d), { props: { screen: 'Phone' }, set: null }, 'a value the prop offers stays a prop');
  assert.deepEqual(splitReachProps({ callsState: 'A2' }, null), { props: { callsState: 'A2' }, set: null });
});

test('planRenders: prop and preset keys that are state become a {set} step first, and the item says which moved', () => {
  const design = designReachKeys(PAGE);
  const inv = widgetsInventory([
    { id: 'CL-01', screen: 'Calls', name: 'missed', reach: { kind: 'prop', props: { screen: 'calls', tab: 'missed', dense: true } }, shots: [], render: { status: 'ok' }, controls: [] },
    { id: 'CL-02', screen: 'Calls', name: 'export', reach: { kind: 'preset', props: { callsState: 'A2', dlg: 'export' }, steps: [{ click: 'Export' }] }, shots: [], render: { status: 'ok' }, controls: [] },
    { id: 'CL-03', screen: 'Calls', name: 'state only', reach: { kind: 'prop', props: { dlg: 'export' } }, shots: [], render: { status: 'ok' }, controls: [] },
    { id: 'PK-01', screen: 'Picker', name: 'open', reach: { kind: 'prop', file: 'Picker.dc.html', props: { dlg: 'x' } }, shots: [], render: { status: 'ok' }, controls: [] },
  ]);
  const by = Object.fromEntries(planRenders(inv, { adapter: 'claude-design', design }).map((p) => [p.id, p]));
  assert.deepEqual(by['CL-01'].steps, [{ set: { screen: 'calls', tab: 'missed' } }]);
  assert.deepEqual(by['CL-01'].props, { dense: true });
  assert.deepEqual(by['CL-01'].moved, { screen: 'calls', tab: 'missed' });
  assert.deepEqual(by['CL-02'].preset, { callsState: 'A2' });
  assert.deepEqual(by['CL-02'].steps, [{ set: { dlg: 'export' } }, { click: 'Export' }]);
  assert.equal(by['CL-03'].action, 'render');
  assert.equal(by['CL-03'].props, null);
  assert.deepEqual(by['CL-03'].steps, [{ set: { dlg: 'export' } }]);
  assert.deepEqual(by['PK-01'].props, { dlg: 'x' }, 'a component file keeps its own props');
  assert.equal(by['PK-01'].moved, undefined);
  // Without the design's keys nothing moves (every caller before this one).
  assert.deepEqual(planRenders(inv, { adapter: 'claude-design' }).find((p) => p.id === 'CL-01').props, { screen: 'calls', tab: 'missed', dense: true });
});
