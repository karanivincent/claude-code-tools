// Candidate groups (design candidates --groups): one group per in-scope screen, a shared group,
// an other-screens group, and a split by <sc-if> section when a group is over the maximum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { claudeDesignCandidates, claudeDesignScreens } from '../../adapters/design/claude-design.mjs';
import { candidateGroups, groupOfCandidate, prefixFor, SHARED, OTHER } from '../../lib/design/groups.mjs';
import { screenMap } from '../../lib/design/screens.mjs';
import { splitDcHtml } from '../../lib/design/claude-dc.mjs';
import { validExample, makeProfile } from '../helpers/fixtures.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import designCandidates from '../../lib/commands/design-candidates.mjs';
import { DC_TEXT, makeDesignRepo } from './helpers.mjs';

const slugOf = (doc, id) => groupOfCandidate(doc).get(id);

test('the widgets design: a candidate tied to one screen, or whose markup is read on one, goes to that screen; the header is shared', () => {
  const text = DC_TEXT();
  const hints = new Map();
  const candidates = claudeDesignCandidates({ file: 'widgets.dc.html', text, shots: ['list-empty.png'], hints });
  const doc = candidateGroups({ candidates, screens: claudeDesignScreens(text), hints, feature: 'widgets' });
  assert.deepEqual(doc.groups.map((g) => g.slug), ['list', 'settings', SHARED]);
  assert.equal(slugOf(doc, 'list:rows'), 'list', 'tied to the list screen');
  assert.equal(slugOf(doc, 'dialog:dlg:details'), 'list', 'untied, read by shared markup, opened from the list rows');
  assert.equal(slugOf(doc, 'shot:list-empty.png'), 'list', 'a shot named after a screen');
  assert.equal(slugOf(doc, 'list:tabs'), SHARED, 'shared markup');
  assert.equal(slugOf(doc, 'dialog:menuOpen:computed'), 'settings', 'set by the write that switches to settings');
  assert.equal(slugOf(doc, 'prop:tone:loud'), SHARED, 'colours a button on every screen');
  assert.equal(doc.counts.candidates, candidates.length);
  assert.equal(doc.groups.reduce((n, g) => n + g.candidates.length, 0), candidates.length, 'every candidate in exactly one group');
  assert.equal(new Set(doc.groups.map((g) => g.prefix)).size, doc.groups.length, 'prefixes are unique');
  assert.ok(doc.groups.every((g) => /^[A-Z]{1,6}$/.test(g.prefix)));
});

test('out-of-scope candidates go to no group; untied ones read only on screens with no group go to other screens', () => {
  const candidates = [
    { id: 'set:screen:a', kind: 'set-target', source: 'p.dc.html:10', screens: ['a'] },
    { id: 'set:screen:b', kind: 'set-target', source: 'p.dc.html:11', screens: ['b'] },
    { id: 'ternary:40', kind: 'ternary', source: 'p.dc.html:40' },
    { id: 'ternary:41', kind: 'ternary', source: 'p.dc.html:41' },
    { id: 'ternary:42', kind: 'ternary', source: 'p.dc.html:42' },
    { id: 'list:x', kind: 'list', source: 'p.dc.html:5', screens: ['a', 'c'] },
  ];
  const hints = new Map([
    ['ternary:40', { screens: ['a'], lines: [5], sections: [] }],
    ['ternary:41', { screens: ['c'], lines: [6], sections: [] }],
    ['ternary:42', { screens: ['a', 'c'], lines: [5, 6], sections: [] }],
  ]);
  const intent = { ...validExample('intent'), inScope: [{ screen: 'A', routes: ['/a'], designScreens: ['a'] }], outOfScope: [{ screen: 'B', why: 'later', designScreens: ['b'] }] };
  const doc = candidateGroups({ candidates, screens: { key: 'screen', values: ['a', 'b', 'c'] }, hints, intent });
  assert.deepEqual(doc.outOfScope, ['set:screen:b']);
  assert.equal(slugOf(doc, 'set:screen:a'), 'a');
  assert.equal(slugOf(doc, 'ternary:40'), 'a');
  assert.equal(slugOf(doc, 'ternary:41'), OTHER, 'c has no group: an unlisted screen');
  assert.equal(slugOf(doc, 'ternary:42'), 'a', 'of the screens it suggests, only a has a group');
  assert.equal(slugOf(doc, 'list:x'), SHARED, 'tied to two screens');
});

test('a group over the maximum splits by its <sc-if> sections, whole sections first, then in source order', () => {
  const candidates = [];
  const hints = new Map();
  const add = (n, section) => {
    for (let i = 0; i < n; i++) {
      const id = `ternary:${section.line * 10 + i}`;
      candidates.push({ id, kind: 'ternary', source: `p.dc.html:${section.line * 10 + i}`, screens: ['a'] });
      hints.set(id, { screens: ['a'], lines: [section.line], sections: [{ ...section, screens: ['a'] }] });
    }
  };
  add(3, { line: 10, label: 'tabOverview' });
  add(3, { line: 20, label: 'tabEdit' });
  add(7, { line: 30, label: 'exportDlg' });
  const doc = candidateGroups({ candidates, screens: { key: 'screen', values: ['a', 'b'] }, hints, max: 6 });
  const a = doc.groups.filter((g) => g.screens[0] === 'a');
  assert.deepEqual(a.map((g) => [g.slug, g.part, g.parts, g.candidates.length, g.sections]), [
    ['a-1', 1, 3, 6, ['tabOverview', 'tabEdit']],
    ['a-2', 2, 3, 6, ['exportDlg']],
    ['a-3', 3, 3, 1, ['exportDlg']],
  ]);
  assert.equal(new Set(a.map((g) => g.prefix)).size, 3);
  assert.equal(prefixFor('calls', new Set(['CA'])), 'CAL');
});

test('screenMap: the section of a template line is the outermost <sc-if> below its screen block', () => {
  const text = `<x-dc>
<sc-if value="{{ onA }}">
  <sc-if value="{{ tabOne }}">
    <sc-if value="{{ inner }}"><p>{{ x }}</p></sc-if>
  </sc-if>
</sc-if>
</x-dc>
<script data-dc-script>
class C extends DCLogic {
  state = { screen: 'a' }
  go() { this.set({ screen: 'b' }); }
  vals(screen) { return { onA: screen === 'a' }; }
  renderVals() { return { ...this.vals(this.state.screen), tabOne: true, inner: true, x: 1 }; }
}
</script>`;
  const parts = splitDcHtml(text);
  const map = screenMap(parts, { key: 'screen', values: ['a', 'b'] });
  assert.equal(map.templateLine(4), null, 'onA is not provably a screen block (defined outside renderVals)');
  assert.deepEqual(map.looseTemplateLine(4), ['a'], 'but the suggestion finds its one definition');
  assert.deepEqual(map.section(4), { line: 3, label: 'tabOne' });
  assert.deepEqual(map.suggest.lines([4]), { screens: ['a'], lines: [4] });
});

test('design candidates --groups writes candidate-groups.json; --max without --groups is refused', async () => {
  const repo = makeDesignRepo();
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile() });
    assert.equal(await designCandidates.run(ctx, ['--groups', '--max', '5']), 0, stdout.text());
    const path = join(ctx.paths.runDir, 'candidate-groups.json');
    assert.ok(existsSync(path));
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(doc.max, 5);
    assert.ok(doc.groups.length >= 3);
    assert.ok(doc.groups.every((g) => g.candidates.length <= 5));
    assert.match(stdout.text(), /group list-1 \(prefix LI\): \d+ candidates/);
    await assert.rejects(designCandidates.run(ctx, ['--max', '5']), (e) => e.exit === 2 && /--max needs --groups/.test(e.message));
  } finally { repo.cleanup(); }
});
