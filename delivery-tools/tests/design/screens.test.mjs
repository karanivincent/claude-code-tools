// Which screens of a prototype a candidate belongs to (lib/design/screens.mjs). A run builds only
// its in-scope screens, and the assembler excludes a candidate tied to out-of-scope screens alone,
// so a wrong tag drops a state the run was asked to build. Every case below either ties a
// candidate to the screens that provably show it, or leaves it untied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../lib/design/js-tokens.mjs';
import { splitDcHtml, stateWrites } from '../../lib/design/claude-dc.mjs';
import { conditionScreens, screenKey, screenMap } from '../../lib/design/screens.mjs';
import { claudeDesignCandidates, claudeDesignScreens } from '../../adapters/design/claude-design.mjs';
import { checkInventory } from '../../lib/plan/inventory-check.mjs';
import { DC_TEXT } from './helpers.mjs';

const cond = (s) => conditionScreens(tokenize(s), 'screen');

test('a condition allows the screens it names, and nothing when it can hold on any other', () => {
  assert.deepEqual(cond("screen === 'calls'"), ['calls']);
  assert.deepEqual(cond("this.state.screen === 'calls' && !empty"), ['calls']);
  assert.deepEqual(cond("'calls' == s.screen"), ['calls']);
  assert.deepEqual(cond("(screen === 'call') || (screen === 'calls' && open)"), ['call', 'calls']);
  assert.equal(cond("screen === 'calls' || showAll"), null, 'one disjunct names no screen');
  assert.equal(cond("screen !== 'calls'"), null);
  assert.equal(cond('onCalls'), null);
  assert.equal(cond("screen === 'a' && screen === 'b'"), null, 'a contradiction allows no screen');
});

test('the screen key is the first of screen, page, view, route set to two values or more', () => {
  const writes = (src) => stateWrites(tokenize(src), src);
  assert.deepEqual(screenKey(writes("this.set({ screen: 'a' }); this.set({ screen: 'b', tab: 'x' });")), { key: 'screen', values: ['a', 'b'] });
  assert.deepEqual(screenKey(writes("this.set({ page: 'home' }); this.set({ page: 'calls' });")), { key: 'page', values: ['calls', 'home'] });
  assert.equal(screenKey(writes("this.set({ screen: 'only' }); this.set({ tab: 'x' });")), null, 'one screen is no screens');
});

test('the widgets design: what shows only on the list screen is tied to it; the shared header is not', () => {
  const text = DC_TEXT();
  assert.deepEqual(claudeDesignScreens(text), { key: 'screen', values: ['list', 'settings'] });
  const byId = new Map(claudeDesignCandidates({ file: 'widgets.dc.html', text }).map((c) => [c.id, c]));
  const screensOf = (id) => byId.get(id)?.screens ?? null;
  const lineOf = (needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
  assert.deepEqual(screensOf('set:screen:list'), ['list']);
  assert.deepEqual(screensOf('set:screen:settings'), ['settings']);
  assert.deepEqual(screensOf('list:rows'), ['list'], 'the rows loop sits inside the onList block');
  assert.deepEqual(screensOf(`ternary:${lineOf('countLine:')}`), ['list'], 'countLine is read only inside onList');
  assert.deepEqual(screensOf(`ternary:${lineOf("stock: w.stock === 0")}`), ['list'], 'a ternary in the rows value');
  assert.deepEqual(screensOf('dialog:dlg:details'), null, 'opened from a row, but the dialog value is read by shared markup');
  assert.deepEqual(screensOf('prop:empty:true'), ['list'], 'empty feeds items, which only the list screen reads');
  assert.deepEqual(screensOf('prop:limit:3'), ['list']);
  assert.equal(screensOf(`ternary:${lineOf("title: this.state.screen === 'list'")}`), null, 'the title shows on every screen');
  assert.equal(screensOf('list:tabs'), null, 'the tabs are shared chrome');
  assert.equal(screensOf('prop:tone:loud'), null, 'the accent colours a button on every screen');
});

const proto = (template, script) => `<x-dc>\n${template}\n</x-dc>\n<script data-dc-script>\n${script}\n</script>`;

test('a method is tied to the screens whose values call it; an if on the screen ties its block', () => {
  const text = proto([
    '<h1>{{ heading }}</h1>',
    '<sc-if value="{{ onA }}"><p>{{ aLine }}</p><sc-for list="{{ both }}" as="x"></sc-for></sc-if>',
    '<sc-if value="{{ onB }}"><p>{{ bLine }}</p><sc-for list="{{ both }}" as="x"></sc-for></sc-if>',
  ].join('\n'), [
    'class C extends DCLogic {',
    "  state = { screen: 'a', n: 0 }",
    '  lineFor(n) {',
    "    return n > 1 ? 'Many things' : 'One thing';",
    '  }',
    '  renderVals() {',
    '    const s = this.state;',
    "    const screen = s.screen;",
    "    let heading = 'Home';",
    "    if (screen === 'b') { heading = s.n ? 'Some of B' : 'None of B'; }",
    '    return {',
    '      heading,',
    "      onA: screen === 'a', onB: screen === 'b',",
    '      aLine: this.lineFor(s.n),',
    "      bLine: s.n ? 'B has items' : 'B is empty',",
    '      both: [],',
    "      go: () => this.set({ screen: 'b' }),",
    '    };',
    '  }',
    '}',
  ].join('\n'));
  const c = claudeDesignCandidates({ file: 'p.dc.html', text });
  const tern = (needle) => c.find((x) => x.kind === 'ternary' && x.detail.includes(needle))?.screens ?? null;
  assert.deepEqual(tern('Many things'), ['a'], 'lineFor is called only from aLine, read only on a');
  assert.deepEqual(tern('Some of B'), ['b'], 'the block of if (screen === b)');
  assert.deepEqual(tern('B has items'), ['b']);
  assert.deepEqual(c.find((x) => x.id === 'list:both').screens, ['a', 'b'], 'a list used on two screens is tied to both');
});

test('any use outside a screen block unties a value, and nothing untied is ever tied by guesswork', () => {
  const text = proto([
    '<sc-if value="{{ onA }}"><p>{{ line }}</p></sc-if>',
    '<footer>{{ line }}</footer>',
  ].join('\n'), [
    'class C extends DCLogic {',
    "  state = { screen: 'a' }",
    '  renderVals() {',
    '    const screen = this.state.screen;',
    '    return {',
    "      onA: screen === 'a' || this.props.always,",
    "      line: this.state.x ? 'With x' : 'Without x',",
    "      go: () => this.set({ screen: 'b' }),",
    '    };',
    '  }',
    '}',
  ].join('\n'));
  const tern = claudeDesignCandidates({ file: 'p.dc.html', text }).find((x) => x.kind === 'ternary');
  assert.equal(tern.screens, undefined, 'read in the footer, and onA can hold on any screen');
  const map = screenMap(splitDcHtml(text), { key: 'screen', values: ['a', 'b'] });
  assert.equal(map.templateLine(2), null);
});

test('inventory check refuses an out-of-scope exclusion for a screen intent.json does not leave out', () => {
  const intent = {
    inScope: [{ screen: 'Calls', routes: [], designScreens: ['calls'] }],
    outOfScope: [{ screen: 'Scripts', why: 'context', designScreens: ['scripts'] }],
  };
  const candidates = {
    designTreeSha256: 'a'.repeat(64),
    candidates: [
      { id: 'list:callRows', kind: 'list', source: 'x:1', screens: ['calls'] },
      { id: 'list:scriptRows', kind: 'list', source: 'x:2', screens: ['scripts'] },
      { id: 'ternary:9', kind: 'ternary', source: 'x:9' },
    ],
  };
  const inventory = {
    designTreeSha256: 'a'.repeat(64),
    states: [],
    candidates: [
      { id: 'list:callRows', kind: 'list', source: 'x:1', mappedTo: null, excluded: { reason: 'out of scope: Scripts' } },
      { id: 'list:scriptRows', kind: 'list', source: 'x:2', mappedTo: null, excluded: { reason: 'out of scope: Scripts' } },
      { id: 'ternary:9', kind: 'ternary', source: 'x:9', mappedTo: null, excluded: { reason: 'out of scope: Home' } },
    ],
  };
  const scope = checkInventory({ inventory, candidates, intent }).filter((f) => f.code === 'candidate-scope').map((f) => f.message);
  assert.equal(scope.length, 2, scope.join('\n'));
  assert.match(scope[0], /list:callRows .*only on in-scope screens \(calls\)/);
  assert.match(scope[1], /ternary:9 .*"Home" is not an out-of-scope screen/);
});
