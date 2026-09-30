// W1 of the 2026-09-30 improvement plan: the design pictures are right. A preset table is found
// and each of its keys becomes a "preset" candidate; a duplicate _bundle_src.dc.html is ignored;
// the renderer warns about a page that is mostly an iframe and a prop named like a state key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize } from '../../lib/design/js-tokens.mjs';
import { presetTables, propValues } from '../../lib/design/claude-dc.mjs';
import claudeDesign, { claudeDesignCandidates, findDcFile, BUNDLE_SRC } from '../../adapters/design/claude-design.mjs';
import { readExportComponents } from '../../lib/design/components.mjs';
import { designStateKeys, propStateClash, iframeShare, iframeWarning, planRenders } from '../../lib/design/render.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';

const PROPS = {
  callsState: { editor: 'enum', options: ['A1 Calls table', 'A2 Handled filter', 'B1 Every section filled'], default: 'A1 Calls table', section: 'Demo data' },
  screen: { editor: 'enum', options: ['Desktop', 'Phone'], default: 'Desktop' },
  dense: { editor: 'boolean', default: false },
};

// The shape of the Settings export: a top-level table of state patches, a method that indexes it
// with the first word of its argument, and componentDidUpdate calling it with the prop.
const PRESET_DC = (props = PROPS) => `<!doctype html><html><body>
<x-dc><div>{{ screen }}</div></x-dc>
<script type="text/x-dc" data-dc-script data-props="${JSON.stringify(props).replace(/"/g, '&quot;')}">
const WZ = (o) => Object.assign({ screen: 'home' }, o);
const CS = {
  A1: { screen: 'calls' },
  A2: { screen: 'calls', cf: { result: 'Handled' } },
  'B1': WZ({ rounds: 3 }),
};
const OTHER = { x: 1, y: 2 };
class Page {
  state = { screen: 'home', cs: '' };
  componentDidUpdate(prev) {
    if (this.props.callsState && this.props.callsState !== prev.callsState) this.csApply(this.props.callsState);
    if (this.props.dense !== prev.dense) this.set({ cs: '' });
  }
  csApply(label) {
    const code = String(label).split(' ')[0];
    const e = CS[code];
    if (!e) return;
    this.setState(Object.assign({ cs: code }, e));
  }
  unused(k) { return OTHER[k]; }
  go() { this.set({ screen: 'calls' }); }
}
</script></body></html>`;

test('a preset table is found: a method indexing a top-level const, called with this.props.P', () => {
  const html = PRESET_DC();
  const script = html.slice(html.indexOf('>', html.indexOf('data-dc-script')) + 1, html.lastIndexOf('</script>'));
  const found = presetTables(tokenize(script));
  assert.equal(found.length, 1, 'OTHER is indexed only by a method nothing calls with a prop');
  assert.deepEqual({ ...found[0], line: undefined }, { prop: 'callsState', table: 'CS', method: 'csApply', keys: ['A1', 'A2', 'B1'], line: undefined });
  assert.deepEqual(presetTables(tokenize('const T = { a: 1 }; class X { m(k) { return k; } go() { this.m(this.props.p); } }')), [], 'a method that never indexes the table');
  assert.deepEqual(presetTables(tokenize('function f() { const T = { a: 1 }; } class X { m(k) { return T[k]; } go() { this.m(this.props.p); } }')), [], 'a table inside a function is not top-level');
});

test('a preset prop takes each table key, with the designer\'s own label when the switch lists one', () => {
  const presets = [{ prop: 'callsState', table: 'CS', method: 'csApply', keys: ['A1', 'A2', 'B1', 'Z9'] }];
  const v = propValues(PROPS, { presets }).filter((p) => p.key === 'callsState');
  assert.deepEqual(v.map((p) => p.value), ['A1', 'A2', 'B1', 'Z9']);
  assert.deepEqual(v.map((p) => p.preset.option), ['A1 Calls table', 'A2 Handled filter', 'B1 Every section filled', null]);
  assert.deepEqual(v.map((p) => p.isDefault), [true, false, false, false]);
  assert.deepEqual(propValues(PROPS).filter((p) => p.key === 'callsState').map((p) => p.value), PROPS.callsState.options, 'without a table, the options as before');
});

test('design candidates lists one preset candidate per key, in place of that prop\'s values', () => {
  const c = claudeDesignCandidates({ file: 'page.dc.html', text: PRESET_DC() });
  const presets = c.filter((x) => x.kind === 'preset');
  assert.deepEqual(presets.map((x) => x.id), ['preset:callsState:A1', 'preset:callsState:A2', 'preset:callsState:B1']);
  assert.match(presets[0].detail, /CS\.A1 through csApply\(this\.props\.callsState\) · "A1 Calls table" \(the default\): reach\.kind "preset" with props \{"callsState": "A1"\}/);
  assert.match(presets[0].source, /^page\.dc\.html:\d+$/);
  assert.ok(!c.some((x) => x.id.startsWith('prop:callsState:')), 'a baked default never applies a preset: no prop-value candidates for it');
  assert.ok(c.some((x) => x.id === 'prop:screen:Phone'), 'other props are listed as before');
  const doc = { schemaVersion: 1, feature: 'rounds', adapter: 'claude-design', designTreeSha256: 'a'.repeat(64), candidates: c };
  assert.deepEqual(validateAgainst('candidates', doc).errors, []);
});

test('the Settings export\'s 275-key table, when it is on this machine', { skip: !process.env.DELIVERY_SETTINGS_EXPORT && 'DELIVERY_SETTINGS_EXPORT not set (the Settings run\'s served .dc.html)' }, async () => {
  const { readFileSync } = await import('node:fs');
  const c = claudeDesignCandidates({ file: 'x.dc.html', text: readFileSync(process.env.DELIVERY_SETTINGS_EXPORT, 'utf8') });
  const cs = c.filter((x) => x.id.startsWith('preset:callsState:'));
  assert.equal(cs.length, 275);
});

test('a _bundle_src.dc.html beside the page is ignored, and said so; alone it is the page', async () => {
  const d = makeTempDir();
  try {
    const exp = join(d.dir, 'export');
    mkdirSync(exp);
    writeFileSync(join(exp, 'support.js'), '');
    writeFileSync(join(exp, 'Dashboard.dc.html'), PRESET_DC());
    writeFileSync(join(exp, BUNDLE_SRC), PRESET_DC());
    assert.deepEqual(await findDcFile(exp), { file: 'Dashboard.dc.html', ignored: [BUNDLE_SRC] });
    const found = await claudeDesign.detect(exp);
    assert.equal(found.ok, true);
    assert.equal(found.project, 'Dashboard');
    assert.match(found.notes[0], /ignored _bundle_src\.dc\.html: a second copy of the page's source, not a page \(the page is Dashboard\.dc\.html\)/);
    writeFileSync(join(exp, 'DatePicker.dc.html'), '<x-dc></x-dc>');
    writeFileSync(join(exp, 'Dashboard.dc.html'), '<x-dc><dc-import name="DatePicker"></dc-import></x-dc>');
    writeFileSync(join(exp, BUNDLE_SRC), '<x-dc><dc-import name="DatePicker"></dc-import></x-dc>');
    assert.deepEqual(await findDcFile(exp), { file: 'Dashboard.dc.html', components: ['DatePicker.dc.html'], ignored: [BUNDLE_SRC] });
    const { components } = await readExportComponents(exp);
    assert.deepEqual(components[0].sites.map((x) => x.file), ['Dashboard.dc.html'], 'the copy is not a second place the component is used');

    const alone = join(d.dir, 'alone');
    mkdirSync(alone);
    writeFileSync(join(alone, BUNDLE_SRC), '<x-dc></x-dc>');
    assert.deepEqual(await findDcFile(alone), { file: BUNDLE_SRC });
  } finally { d.cleanup(); }
});

test('the renderer warns about a reach that sets a prop named like a state key', () => {
  const keys = designStateKeys(PRESET_DC());
  assert.ok(keys.has('screen') && keys.has('cs'));
  assert.equal(propStateClash({ callsState: 'A1' }, keys), null);
  assert.match(propStateClash({ screen: 'Phone', dense: true }, keys), /prop "screen", which is also a state key of the design; a prop never sets the state of the same name\. If the state was meant, reach it with a \{"set": \{"screen": \.\.\.\}\} step/);
  assert.equal(propStateClash(null, keys), null);
  assert.equal(designStateKeys('<x-dc></x-dc>').size, 0);
  // a preset's props are what the render sets, so they are what the check reads
  const plan = planRenders({ states: [{ id: 'RB-01', reach: { kind: 'preset', props: { callsState: 'A1' } } }] }, { adapter: 'claude-design' });
  assert.deepEqual(plan[0].preset, { callsState: 'A1' });
});

test('the renderer warns when an iframe covers more than half the page', () => {
  const page = { w: 1440, h: 900 };
  assert.equal(iframeShare([], page), 0);
  assert.equal(iframeWarning(iframeShare([{ w: 390, h: 844 }], page)), null, 'a phone frame beside a desktop page');
  assert.equal(iframeWarning(iframeShare([{ w: 720, h: 900 }], page)), null, 'exactly half is not more than half');
  const w = iframeWarning(iframeShare([{ w: 200, h: 200 }, { w: 1440, h: 800 }], page));
  assert.match(w, /an iframe covers 89% of the page, and its words are not read .*--width phone, never through a phone-frame prop/);
});
