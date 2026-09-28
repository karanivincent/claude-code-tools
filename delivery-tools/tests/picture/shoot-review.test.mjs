// delivery shoot's pure helpers, the review compiler, and picture-mode NEXT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureOrder, isLocal, resultLine, selectStates, signInUrl, testidSelector, userFor } from '../../lib/picture/shoot.mjs';
import { backToDesignItems, parseReview, renderCompare, summarise } from '../../lib/picture/review.mjs';
import { MAX_ROUNDS, pictureFacts, pictureNext } from '../../lib/picture/next.mjs';
import { sampleMap } from './map.test.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

test('a shoot takes every capture-reachable state, or the ids given, minus !ids', () => {
  const m = sampleMap();
  assert.deepEqual(selectStates(m).states.map((s) => s.id), ['KC-05', 'KC-04', 'KC-08']);
  assert.deepEqual(selectStates(m, ['KC-04']).states.map((s) => s.id), ['KC-04']);
  assert.deepEqual(selectStates(m, ['!KC-08']).states.map((s) => s.id), ['KC-05', 'KC-04']);
  assert.deepEqual(selectStates(m, ['KC-77']).unknown, ['KC-77']);
});

test('states that write data are taken last, and groups that write after those that do not', () => {
  const m = sampleMap();
  m.states.push({ id: 'KC-06', screen: 'To check', name: 'Member', reach: { world: 'design', role: 'member', steps: [{ goto: '/dashboard/knowledge' }] } });
  const order = captureOrder(selectStates(m).items, m);
  assert.deepEqual(order.map((g) => `${g.world}/${g.role}`), ['design/member', 'design/admin']);
  assert.deepEqual(order[1].items.map((i) => i.key), ['KC-05', 'KC-04', 'KC-08']);
  assert.deepEqual(order.map((g) => g.width), ['desktop', 'desktop']);
  assert.deepEqual(order[1].writes, ['KC-08']);
});

test('sign-in helpers', () => {
  assert.equal(userFor(sampleMap(), 'design', 'member').email, 'delivery+kp-design-member@example.invalid');
  assert.equal(userFor(sampleMap(), 'design', 'owner'), null);
  const u = new URL(signInUrl('http://localhost:3210', '/auth/confirm', 'abc', '/dashboard/knowledge'));
  assert.equal(u.pathname, '/auth/confirm');
  assert.equal(u.searchParams.get('token_hash'), 'abc');
  assert.equal(u.searchParams.get('type'), 'magiclink');
  assert.equal(u.searchParams.get('next'), '/dashboard/knowledge');
  assert.equal(isLocal('http://localhost:3210'), true);
  assert.equal(isLocal('https://x.vercel.app'), false);
  assert.equal(testidSelector('kb-save'), '[data-testid="kb-save"], [data-testid^="kb-save-"]');
});

test('a result line names missing buttons and ones a member should not see', () => {
  const line = resultLine('KC-06', { reached: true, problems: [], buttons: [
    { label: 'Undo', onPage: false, shouldBe: 'shown' },
    { label: 'Add', onPage: true, shouldBe: 'hidden' },
  ] });
  assert.equal(line, 'KC-06 reached · missing: Undo · shown to a member: Add');
  assert.equal(resultLine('KC-07', { reached: false, problems: ['timeout'], buttons: [] }), 'KC-07 NOT REACHED · timeout');
});

const REVIEW = `2 states match, 2 have problems.

## KC-05
- must fix: the Add knowledge button is a small pill; the design has a large button with a +
  icon and a chevron.
- small: the focus ring is blue, not orange.

## KC-04 (menu)
- \`must fix\` The menu is missing "Upload a document".
- The divider is lighter than the design. \`small\`

## Matching
KC-08
`;

test('a review parses into must-fix and small notes per state, wrapped lines joined', () => {
  const r = parseReview(REVIEW);
  assert.deepEqual(Object.keys(r), ['KC-05', 'KC-04']);
  assert.equal(r['KC-05'].must[0], 'the Add knowledge button is a small pill; the design has a large button with a + icon and a chevron.');
  assert.deepEqual(r['KC-05'].small, ['the focus ring is blue, not orange.']);
  assert.deepEqual(r['KC-04'].must, ['The menu is missing "Upload a document".']);
  assert.deepEqual(r['KC-04'].small, ['The divider is lighter than the design.']);
});

// Fix round 1: a components run's gallery state ids ("C-<Name>-NN") need no change here — the
// heading regex was already id-shape-agnostic — but nothing pinned that down, so this does.
test('a reviewer note headed by a components-run gallery state id parses, "@phone" included', () => {
  const r = parseReview('## C-Picker-01@phone\n- must fix: the padding is tighter than the design.\n');
  assert.deepEqual(Object.keys(r), ['C-Picker-01@phone']);
  assert.deepEqual(r['C-Picker-01@phone'].must, ['the padding is tighter than the design.']);
});

test('summarise gives every state a verdict', () => {
  const m = sampleMap();
  const shoot = { states: { 'KC-05': { reached: true }, 'KC-04': { reached: true }, 'KC-08': { reached: false } } };
  const s = summarise({ map: m, shoot, notes: parseReview(REVIEW) });
  assert.equal(s.states['KC-05'].verdict, 'must');
  assert.equal(s.states['KC-08'].verdict, 'not-reached');
  assert.equal(s.states['KC-01'].verdict, 'test-only');
  assert.deepEqual(s.counts, { match: 0, small: 0, must: 2, notReached: 1, testOnly: 1, backToDesign: 0 });
});

// --- the "design:" bullet and the "back-to-design" verdict --------------------------------------

const DESIGN_REVIEW = `1 states match, 1 has problems.

## KC-08
- design: the design shows a plain "Add" link; the product already uses a large button with a
  + icon everywhere else on this page.

## Matching
KC-04
`;

test('a review parses a "design:" bullet, wrapped lines joined, distinct from must/small', () => {
  const r = parseReview(DESIGN_REVIEW);
  assert.deepEqual(Object.keys(r), ['KC-08']);
  assert.deepEqual(r['KC-08'].must, []);
  assert.deepEqual(r['KC-08'].small, []);
  assert.equal(r['KC-08'].design[0], 'the design shows a plain "Add" link; the product already uses a large button with a + icon everywhere else on this page.');
});

test('"design" ending a plain sentence is never mistaken for a trailing design: marker', () => {
  const r = parseReview('## KC-08\n- small: the focus ring does not match the design.\n');
  assert.deepEqual(r['KC-08'].small, ['the focus ring does not match the design.']);
  assert.deepEqual(r['KC-08'].design, []);
});

test('an item whose only bullets are design: gets back-to-design, ranked after small and before test-only; a must/small item keeps its worse verdict but still collects its design notes', () => {
  const m = sampleMap();
  const shoot = { states: { 'KC-05': { reached: true }, 'KC-04': { reached: true }, 'KC-08': { reached: true } } };
  const mixedReview = `## KC-05\n- must fix: the button is missing.\n- design: the empty state should show an illustration, like the rest of the product does.\n\n## KC-08\n- design: this screen should use the shared Table component, like every other list.\n`;
  const s = summarise({ map: m, shoot, notes: parseReview(mixedReview) });
  assert.equal(s.states['KC-05'].verdict, 'must');
  assert.deepEqual(s.states['KC-05'].design, ['the empty state should show an illustration, like the rest of the product does.']);
  assert.equal(s.states['KC-08'].verdict, 'back-to-design');
  assert.deepEqual(s.states['KC-08'].design, ['this screen should use the shared Table component, like every other list.']);
  assert.equal(s.counts.must, 1);
  assert.equal(s.counts.backToDesign, 1);
  // back-to-design does not count as open (must + notReached), matching the fix-round rule.
  assert.equal(s.counts.notReached, 0);
});

test('back-to-design renders in its own group: pill text, tally and the design note, without being mistaken for a match', () => {
  const m = sampleMap();
  const shoot = { states: { 'KC-05': { reached: true }, 'KC-04': { reached: true }, 'KC-08': { reached: true } } };
  const s = summarise({ map: m, shoot, notes: parseReview('## KC-05\n- design: use the shared empty state.\n') });
  const html = renderCompare({ title: 't', round: 1, beforeRound: null, map: m, summary: s, pictures: () => ({ design: null, before: null, now: null }) });
  assert.match(html, /<span class="pill back-to-design">1 back to design<\/span>/);
  assert.match(html, /<li class="d">use the shared empty state\.<\/li>/);
  assert.match(html, /<li><b>1<\/b>back to design<\/li>/);
});

function writeReviewRound(paths, n, states) {
  const dir = join(paths.runDir, 'rounds', String(n));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'review.json'), JSON.stringify({ round: n, states }));
}

test('backToDesignItems: one entry per design: bullet, from the last round with a compiled review only', () => {
  const repo = makeTempDir();
  try {
    const paths = featurePaths(repo.dir, 'widgets');
    assert.deepEqual(backToDesignItems(paths), [], 'no rounds yet');
    writeReviewRound(paths, 1, {
      'KC-05': { verdict: 'back-to-design', must: [], small: [], design: ['first note'] },
      'KC-04': { verdict: 'match', must: [], small: [], design: [] },
    });
    assert.deepEqual(backToDesignItems(paths), [{ id: 'KC-05', note: 'first note' }]);
    // A must/small item's design notes count too, and multiple design bullets on one item
    // become multiple entries. Only the newest round with a review.json is read.
    writeReviewRound(paths, 2, {
      'KC-05': { verdict: 'must', must: ['still broken'], small: [], design: ['a', 'b'] },
      'KC-08': { verdict: 'back-to-design', must: [], small: [], design: ['c'] },
    });
    assert.deepEqual(backToDesignItems(paths), [
      { id: 'KC-05', note: 'a' }, { id: 'KC-05', note: 'b' }, { id: 'KC-08', note: 'c' },
    ]);
  } finally { repo.cleanup(); }
});

test('the comparison page shows each state, its pictures and notes, escaped', () => {
  const m = sampleMap();
  m.states[0].name = 'Everything <b>';
  const summary = summarise({ map: m, shoot: { states: { 'KC-05': { reached: true } } }, notes: parseReview(REVIEW) });
  const html = renderCompare({ title: 'Knowledge: round 2', round: 2, beforeRound: 1, map: m, summary,
    pictures: (id) => ({ design: `${id}.design.png`, before: `before/${id}.live.png`, now: `${id}.live.png` }) });
  assert.match(html, /<title>Knowledge: round 2<\/title>/);
  assert.match(html, /Everything &lt;b&gt;/);
  assert.match(html, /src="before\/KC-05.live.png"/);
  assert.match(html, /Round 1/);
  assert.match(html, /1 to fix/);
  assert.match(html, /prefers-color-scheme: dark/);
});

const facts = (over = {}) => ({ designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [], ...over });
const next = (f) => pictureNext(f, { cli: 'node scripts/delivery.mjs' });

test('picture NEXT walks the loop', () => {
  assert.equal(next(facts({ designed: 0 })).step, 'pictures');
  assert.equal(next(facts({ hasMap: false })).step, 'map');
  assert.match(next(facts({ mapError: 'state KC-01 has no reach', problemCount: 2 })).text, /2 problem\(s\); first: state KC-01 has no reach/);
  assert.equal(next(facts({ seedStale: true })).step, 'worlds');
  assert.equal(next(facts()).step, 'build');
  assert.equal(next(facts({ rounds: [{ round: 1, shot: false }] })).step, 'shoot');
  assert.equal(next(facts({ rounds: [{ round: 1, shot: true, reviews: 0 }] })).step, 'review');
  assert.match(next(facts({ rounds: [{ round: 1, shot: true, reviews: 4, compiled: false }] })).text, /review --round 1/);
  const open = { round: 1, shot: true, reviews: 4, compiled: true, counts: { must: 3, notReached: 1 } };
  assert.match(next(facts({ rounds: [open] })).text, /fix round.*4 state\(s\) open.*round 2/);
  assert.equal(next(facts({ rounds: [{ ...open, round: MAX_ROUNDS }] })).step, 'ship');
  assert.match(next(facts({ rounds: [{ ...open, round: MAX_ROUNDS }] })).text, /go to the founder as a list/);
  assert.equal(next(facts({ rounds: [{ ...open, counts: { must: 0, notReached: 0 } }] })).step, 'ship');
  // A partial re-shoot: the newest round lists unshot states as not reached, the latest verdicts do not.
  const partial = { ...open, round: MAX_ROUNDS + 1, counts: { must: 1, notReached: 47 } };
  assert.match(next(facts({ rounds: [partial], open: { must: 1, notReached: 0 } })).text, /1 state\(s\) stay open/);
  const shipped = pictureNext(facts({ rounds: [{ ...open, round: MAX_ROUNDS }] }), { cli: 'node scripts/delivery.mjs', readyOk: true, epic: 1947 });
  assert.equal(shipped.step, 'land');
  assert.match(shipped.text, /after the founder's merge, node scripts\/delivery\.mjs land --epic 1947/);
});

test('picture NEXT: items sent back to the design get their own tail line at ship, independent of open must/not-reached items', () => {
  const clean = { round: 1, shot: true, reviews: 1, compiled: true, counts: { must: 0, notReached: 0 } };
  // back-to-design items never trigger another fix round on their own.
  const shipClean = next(facts({ rounds: [clean], backToDesign: 2 }));
  assert.equal(shipClean.step, 'ship');
  assert.match(shipClean.text, /; 2 item\(s\) go back to the design: node scripts\/delivery\.mjs brief new <slug> --from-run$/);
  // No back-to-design items: no such tail at all.
  assert.doesNotMatch(next(facts({ rounds: [clean], backToDesign: 0 })).text, /back to the design/);
  // Combines with the "stay open after MAX_ROUNDS" tail when both are true.
  const stillOpen = { round: MAX_ROUNDS, shot: true, reviews: 1, compiled: true, counts: { must: 1, notReached: 0 } };
  const both = next(facts({ rounds: [stillOpen], backToDesign: 1 }));
  assert.match(both.text, /go to the founder as a list; 1 item\(s\) go back to the design: node scripts\/delivery\.mjs brief new <slug> --from-run$/);
});

test('picture NEXT: components-first branches (page blocked, components run unbuilt, landed components run owing design-sync)', () => {
  // A page run whose screens use a component that is not built yet stops right after "no map",
  // before phone render, rules or worlds.
  const blocked = next(facts({ phoneRenderOwed: true, pageBlockedComponents: ['Picker'] }));
  assert.equal(blocked.step, 'components');
  assert.match(blocked.text, /run the components run first/);
  assert.match(blocked.text, /intake --components/);
  assert.match(blocked.text, /Picker/);

  // A components run whose gallery still has an unmarked component is stopped before land/ship,
  // even once every round is clean.
  const openNone = { round: MAX_ROUNDS, shot: true, reviews: 1, compiled: true, counts: { must: 0, notReached: 0 } };
  const unbuilt = next(facts({ rounds: [openNone], componentsUnbuilt: ['Picker', 'TimePicker'] }));
  assert.equal(unbuilt.step, 'components-build');
  assert.match(unbuilt.text, /components --mark-built Picker TimePicker/);

  // No other step is reachable for a landed components run whose manifest still lacks entries.
  const synced = next(facts({ designed: 0, landedComponentsRun: true, designSyncMissing: ['Picker', 'Sheet'] }));
  assert.equal(synced.step, 'design-sync');
  assert.equal(synced.skill, null);
  assert.match(synced.text, /run \/design-sync on the design-system project: it lacks Picker, Sheet/);

  // Facts with no components-first fields at all (every run before this task) walk the loop exactly
  // as before: nothing here regresses a run with no profile.components block.
  assert.equal(next(facts()).step, 'build');
});

const H = `sha256:${'3'.repeat(64)}`;

function writeJson(abs, value) {
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, JSON.stringify(value));
}

function componentsFile(status) {
  return {
    version: 1,
    components: [{
      kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H },
      target: 'src/ui/picker.tsx', status, builtHash: status === 'built' ? H : null,
      props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: ['C-Picker-01'],
    }],
  };
}

test('pictureFacts: components-first facts read from real files, with a profile', () => {
  const repo = makeTempDir();
  try {
    const paths = featurePaths(repo.dir, 'widgets');
    const profile = makeProfile({ components: { map: 'docs/delivery/components.json' } });

    // A page run whose one state shows Picker, which is not built yet.
    writeJson(join(repo.dir, 'docs/delivery/components.json'), componentsFile('new'));
    writeJson(join(repo.dir, 'docs/delivery/widgets/map.json'), {
      schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
      pageArea: { left: 240, designLeft: 240 },
      worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+widgets-design-admin@example.invalid' }] }],
      states: [{ id: 'W-01', screen: 'Main', name: 'Everything', reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] }, buttons: [] }],
    });
    mkdirSync(paths.designRenders, { recursive: true });
    writeFileSync(join(paths.designRenders, 'W-01.components.json'), JSON.stringify({ names: ['Picker'] }));
    assert.deepEqual(pictureFacts(paths, { profile }).pageBlockedComponents, ['Picker']);
    assert.deepEqual(pictureFacts(paths).pageBlockedComponents, [], 'no profile: no components facts computed');

    // A components run whose gallery is building Picker, still unbuilt.
    writeJson(join(repo.dir, 'docs/delivery/widgets/map.json'), {
      schemaVersion: 1, feature: 'widgets', title: 'Components', kind: 'components', route: '/admin/design/components',
      widths: ['desktop', 'phone'],
      worlds: [{ id: 'components', users: [{ role: 'admin', email: 'delivery+widgets-components-admin@example.invalid' }] }],
      states: [{ id: 'C-Picker-01', screen: 'Picker', name: 'Picker: defaults', design: 'C-Picker-01', reach: { world: 'components', role: 'admin', steps: [{ goto: '/admin/design/components' }] }, buttons: [] }],
    });
    writeJson(join(repo.dir, 'docs/delivery/widgets/gallery-states.json'), { states: [{ id: 'C-Picker-01', component: 'Picker', props: {} }] });
    assert.deepEqual(pictureFacts(paths, { profile }).componentsUnbuilt, ['Picker']);

    // Once built, and the run's journal already landed, a manifest missing Picker owes design-sync.
    writeJson(join(repo.dir, 'docs/delivery/components.json'), componentsFile('built'));
    writeJson(paths.state, { journal: [{ at: '2026-01-01T00:00:00.000Z', event: 'land --epic 42 | exit=0 | ok=1 | red=0 | sha=abcdef123456 | closed=1' }] });
    writeJson(join(repo.dir, 'docs/design/widgets/_ds/x/_ds_manifest.json'), { components: [{ name: 'Sheet' }] });
    const landed = pictureFacts(paths, { profile });
    assert.equal(landed.componentsUnbuilt.length, 0);
    assert.equal(landed.landedComponentsRun, true);
    assert.deepEqual(landed.designSyncMissing, ['Picker']);
    assert.equal(pictureNext(landed, { cli: 'node scripts/delivery.mjs' }).step, 'design-sync');
  } finally { repo.cleanup(); }
});
