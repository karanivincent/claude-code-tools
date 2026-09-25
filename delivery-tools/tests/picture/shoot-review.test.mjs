// delivery shoot's pure helpers, the review compiler, and picture-mode NEXT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureOrder, isLocal, resultLine, selectStates, signInUrl, testidSelector, userFor } from '../../lib/picture/shoot.mjs';
import { parseReview, renderCompare, summarise } from '../../lib/picture/review.mjs';
import { MAX_ROUNDS, pictureNext } from '../../lib/picture/next.mjs';
import { sampleMap } from './map.test.mjs';

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
  const order = captureOrder(selectStates(m).states, m);
  assert.deepEqual(order.map((g) => `${g.world}/${g.role}`), ['design/member', 'design/admin']);
  assert.deepEqual(order[1].states.map((s) => s.id), ['KC-05', 'KC-04', 'KC-08']);
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

test('summarise gives every state a verdict', () => {
  const m = sampleMap();
  const shoot = { states: { 'KC-05': { reached: true }, 'KC-04': { reached: true }, 'KC-08': { reached: false } } };
  const s = summarise({ map: m, shoot, notes: parseReview(REVIEW) });
  assert.equal(s.states['KC-05'].verdict, 'must');
  assert.equal(s.states['KC-08'].verdict, 'not-reached');
  assert.equal(s.states['KC-01'].verdict, 'test-only');
  assert.deepEqual(s.counts, { match: 0, small: 0, must: 2, notReached: 1, testOnly: 1 });
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
});
