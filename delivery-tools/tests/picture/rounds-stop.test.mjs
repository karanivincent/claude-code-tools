// W4 (D7), W5a (D8) and W5b (D9): the picture loop has no fixed round count (it stops when the
// count stops falling), a changed item the last round passed is sampled rather than reviewed one by
// one, and a fix round shoots only what can have changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openByRound, renderStuck, roundDecision, runDecision, stuckItems, STALL_ROUNDS, ROUND_CEILING } from '../../lib/picture/stop.mjs';
import { heldToReview, noteOwners, planReview, summarise } from '../../lib/picture/review.mjs';
import { pictureFacts, pictureNext } from '../../lib/picture/next.mjs';
import { pictureReadiness } from '../../lib/run/ready-compute.mjs';
import { itemRoute, sourcesFor, unchangedItems } from '../../lib/picture/changed.mjs';
import { validateMap } from '../../lib/picture/map.mjs';
import { writeShootJson } from '../../lib/picture/shoot.mjs';
import { mapItems } from '../../lib/picture/widths.mjs';
import { sampleMap } from './map.test.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import reviewCommand from '../../lib/commands/review.mjs';

const decide = (counts, o) => roundDecision(counts, o).decision;

// ---- W4: roundDecision ----

test('the stop rule: the tunables are two flat rounds and a ceiling of eight', () => {
  assert.equal(STALL_ROUNDS, 2);
  assert.equal(ROUND_CEILING, 8);
});

test('roundDecision: 12,5,5 fixes; 12,5,5,5 stops after the second 5; a fall resets the flat run', () => {
  assert.equal(decide([12]), 'fix');
  assert.equal(decide([12, 5]), 'fix');
  assert.equal(decide([12, 5, 5]), 'fix');
  const stop = roundDecision([12, 5, 5, 5]);
  assert.equal(stop.decision, 'stop');
  assert.equal(stop.flat, 2);
  assert.match(stop.why, /5 still open and the count has not fallen for 2 round\(s\) \(12 > 5 > 5 > 5\)/);
  // 5,5 then a fall to 4 is progress again.
  assert.equal(decide([12, 5, 5, 4]), 'fix');
  assert.equal(decide([12, 5, 5, 4, 4]), 'fix');
  assert.equal(decide([12, 5, 5, 4, 4, 4]), 'stop');
  // A count that rises counts as no fall.
  assert.equal(decide([3, 4, 5]), 'stop');
});

test('roundDecision: zero ships, at any round, however flat it was before', () => {
  assert.equal(decide([12, 5, 0]), 'ship');
  assert.equal(decide([5, 5, 5, 0]), 'ship');
  assert.equal(decide([0]), 'ship');
});

test('roundDecision: the ceiling of eight rounds holds even while the count keeps falling', () => {
  const falling = [20, 18, 16, 14, 12, 10, 8];
  assert.equal(decide(falling), 'fix');
  const atCeiling = roundDecision([...falling, 6]);
  assert.equal(atCeiling.decision, 'stop');
  assert.match(atCeiling.why, /the ceiling of 8 rounds is reached with 6 still open/);
  assert.equal(decide([20, 18, 16, 14], { ceiling: 4 }), 'stop');
  assert.equal(decide([9, 9], { stall: 1 }), 'stop');
  // Zero at the ceiling still ships.
  assert.equal(decide([...falling, 0]), 'ship');
});

test('roundDecision: no compiled round yet says fix', () => {
  const d = roundDecision([]);
  assert.equal(d.decision, 'fix');
  assert.equal(d.flat, 0);
});

// ---- A run's rounds on disk ----

/** A run dir with rounds/<n>/shoot.json and review.json; a state is a verdict, or { verdict, must, small }. */
function tmpRun() {
  const root = mkdtempSync(join(tmpdir(), 'delivery-stop-'));
  const runDir = join(root, '.delivery', 'f');
  const paths = { runDir, deliveryDir: join(root, 'docs', 'delivery', 'f'), designRenders: join(runDir, 'design'), seedplan: join(runDir, 'seedplan.json') };
  mkdirSync(paths.deliveryDir, { recursive: true });
  const round = (n, states, { shoot = true, review = true, plan = true } = {}) => {
    const dir = join(runDir, 'rounds', String(n));
    mkdirSync(dir, { recursive: true });
    if (shoot) writeFileSync(join(dir, 'shoot.json'), JSON.stringify({ states: {} }));
    if (plan) writeFileSync(join(dir, 'review-plan.json'), JSON.stringify({ batches: 0, carried: {}, auto: {} }));
    if (review) {
      const doc = { states: Object.fromEntries(Object.entries(states).map(([k, v]) => [k, typeof v === 'string' ? { verdict: v, must: [], small: [] } : v])) };
      writeFileSync(join(dir, 'review.json'), JSON.stringify(doc));
    }
  };
  return { root, paths, round, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('openByRound: each item keeps its newest verdict, so a partial re-shoot counts; not-shot never overwrites', () => {
  const r = tmpRun();
  try {
    r.round(1, { A: 'must', B: 'must', C: 'not-reached', D: 'match' });
    r.round(2, { A: 'match', B: 'not-shot' }); // re-shot A only; B was not shot
    r.round(3, { C: 'must' });
    assert.deepEqual(openByRound(r.paths), [
      { round: 1, open: 3, items: ['A', 'B', 'C'] },
      { round: 2, open: 2, items: ['B', 'C'] },
      { round: 3, open: 2, items: ['B', 'C'] },
    ]);
  } finally { r.cleanup(); }
});

test('openByRound: a round with no shoot.json or no compiled review.json is not counted; data verdicts are not real bugs', () => {
  const r = tmpRun();
  try {
    r.round(1, { A: 'must', B: 'data-fault', C: 'data-gap', D: 'back-to-design' });
    r.round(2, { A: 'must' }, { review: false });
    r.round(3, { A: 'must' }, { shoot: false });
    assert.deepEqual(openByRound(r.paths), [{ round: 1, open: 1, items: ['A'] }]);
    assert.deepEqual(openByRound({ runDir: join(r.root, 'nowhere') }), []);
  } finally { r.cleanup(); }
});

test('runDecision: reads the rounds\' counts and carries the per-round list', () => {
  const r = tmpRun();
  try {
    r.round(1, { A: 'must', B: 'must', C: 'must' });
    r.round(2, { A: 'match', B: 'must', C: 'match' });
    r.round(3, { B: 'must' });
    const fix = runDecision(r.paths);
    assert.equal(fix.decision, 'fix');
    assert.deepEqual(fix.byRound.map((x) => x.open), [3, 1, 1]);
    r.round(4, { B: 'must' });
    assert.equal(runDecision(r.paths).decision, 'stop');
    r.round(5, { B: 'match' });
    assert.equal(runDecision(r.paths).decision, 'ship');
    assert.equal(runDecision({ runDir: join(r.root, 'nowhere') }).decision, 'fix');
  } finally { r.cleanup(); }
});

/** Three rounds: A stuck with the same note, D stuck with a different note each round, B fixed, C new in round 3. */
function stuckRun() {
  const r = tmpRun();
  const s = (verdict, must = []) => ({ verdict, must, small: [] });
  r.round(1, { A: s('must', ['tabs wrap']), B: s('must', ['no border']), D: s('must', ['wrong colour']) });
  r.round(2, { A: s('must', ['tabs wrap']), B: s('match'), D: s('must', ['wrong size']) });
  r.round(3, { A: s('must', ['tabs wrap']), B: s('match'), C: s('must', ['missing icon']), D: s('not-reached') });
  return r;
}

test('stuckItems: only the items open in every one of the last stall+1 rounds, with their notes oldest first', () => {
  const r = stuckRun();
  try {
    const stuck = stuckItems(r.paths);
    assert.deepEqual(stuck.map((x) => x.key), ['A', 'D']);
    assert.deepEqual(stuck[0].rounds, [
      { round: 1, verdict: 'must', notes: ['tabs wrap'] },
      { round: 2, verdict: 'must', notes: ['tabs wrap'] },
      { round: 3, verdict: 'must', notes: ['tabs wrap'] },
    ]);
    assert.equal(stuck[1].rounds[2].verdict, 'not-reached');
    // A wider window: with stall 1, only the last two rounds count, so C is still new and B was never open there.
    assert.deepEqual(stuckItems(r.paths, 1).map((x) => x.key), ['A', 'D']);
  } finally { r.cleanup(); }
});

test('renderStuck: one section per item, the notes per round, and why it did not move', () => {
  const r = stuckRun();
  try {
    const md = renderStuck(stuckItems(r.paths), { why: '2 still open and the count has not fallen for 2 round(s)' });
    assert.match(md, /^# Stuck items\n\nThe picture loop stopped: 2 still open and the count has not fallen for 2 round\(s\)\. These items did not move\./);
    assert.match(md, /## A\n\n- round 1: must\n {2}- tabs wrap\n- round 2: must\n {2}- tabs wrap\n- round 3: must\n {2}- tabs wrap\n\nWhy it did not move: the reviewers wrote the same problem every round/);
    assert.match(md, /## D\n\n- round 1: must\n {2}- wrong colour\n- round 2: must\n {2}- wrong size\n- round 3: not-reached\n\nWhy it did not move: the notes changed from round to round/);
    assert.doesNotMatch(md, /## B|## C/);
  } finally { r.cleanup(); }
});

// ---- NEXT and ready agree ----

/** What pictureNext needs to get past the map, the worlds and the pictures, with the run's own round facts. */
async function nextFacts(paths) {
  const f = await pictureFacts(paths);
  return { ...f, designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rulesOwed: false, owedDesignRules: [], phoneRenderOwed: false, contractMissing: false, contractTodo: 0, undecided: 0, guardsToApprove: [], pageBlockedComponents: [], needs: 0, rulesProblem: null };
}

test('NEXT says fix exactly when ready is red for open items; once the loop stops both let the open items go to the founder', async () => {
  const series = [
    [{ A: 'must', B: 'must' }],
    [{ A: 'must', B: 'must' }, { A: 'must', B: 'match' }],
    [{ A: 'must', B: 'must' }, { A: 'must', B: 'match' }, { A: 'must' }],
    [{ A: 'must', B: 'must' }, { A: 'must', B: 'match' }, { A: 'must' }, { A: 'must' }],
    [{ A: 'must', B: 'must' }, { A: 'must', B: 'match' }, { A: 'match' }],
  ];
  const seen = [];
  for (const rounds of series) {
    const r = tmpRun();
    try {
      rounds.forEach((states, i) => r.round(i + 1, states));
      const f = await nextFacts(r.paths);
      const next = pictureNext(f, { cli: 'delivery' });
      const ready = await pictureReadiness(r.paths);
      const opened = runDecision(r.paths);
      seen.push(next.step);
      assert.equal(next.step === 'fix', !ready.ok && /still to fix/.test(ready.detail), `${opened.why}: next ${next.step}, ready ${ready.detail}`);
      if (opened.decision === 'stop') {
        assert.equal(next.step, 'ship');
        assert.equal(ready.ok, true);
        assert.match(next.text, /the loop stopped/);
        assert.match(ready.detail, /the loop stopped .* 1 stuck item\(s\) go to the founder with rounds\/4\/stuck\.md/);
      }
      if (opened.decision === 'ship') { assert.equal(next.step, 'ship'); assert.equal(ready.ok, true); }
    } finally { r.cleanup(); }
  }
  assert.deepEqual(seen, ['fix', 'fix', 'fix', 'ship', 'ship']);
});

test('NEXT falls back to a one-count decision when the facts carry none', () => {
  const f = { designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [{ round: 6, shot: true, reviews: 1, compiled: true, counts: { must: 2, notReached: 0 } }] };
  assert.equal(pictureNext(f, { cli: 'delivery' }).step, 'fix', 'no fixed round cap any more');
});

// ---- review compile writes stuck.md ----

const twoScreens = () => {
  const base = sampleMap();
  const st = (id, screen) => ({ id, screen, name: id, reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge' }] }, buttons: [] });
  return { ...base, feature: 'widgets', widths: ['desktop'], states: [st('A-1', 'A'), st('A-2', 'A'), st('A-3', 'A'), st('B-1', 'B'), st('B-2', 'B'), st('B-3', 'B')] };
};
const KEYS = ['A-1', 'A-2', 'A-3', 'B-1', 'B-2', 'B-3'];
const rec = (over = {}) => ({ reached: true, problems: [], buttons: [], factsAgree: false, pixelDiff: 0.02, liveHash: 'L', designHash: 'D', ...over });
const shootOf = (keys, over = {}) => ({ states: Object.fromEntries(keys.map((k) => [k, rec(typeof over === 'function' ? over(k) : over)])) });
const labelled = (keys, verdict = 'match') => ({ states: Object.fromEntries(keys.map((k) => [k, { verdict, must: verdict === 'must' ? ['x'] : [], small: verdict === 'small' ? ['tiny'] : [], design: [] }])) });

test('review compile writes rounds/<n>/stuck.md only when the stop rule has stopped the loop', async () => {
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': twoScreens(),
    '.delivery/widgets/rounds/1/shoot.json': shootOf(KEYS),
    '.delivery/widgets/rounds/1/review.json': { schemaVersion: 1, round: 1, states: labelled(KEYS, 'must').states },
    '.delivery/widgets/rounds/2/shoot.json': shootOf(KEYS),
  } });
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
    const dir = (n) => join(repo.dir, '.delivery/widgets/rounds', String(n));
    // Round 2 is identical to round 1: every item carries its must. Counts 6, 6: one flat round, so fix.
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    assert.equal(await reviewCommand.run(ctx, ['--round', '2']), 1);
    assert.equal(existsSync(join(dir(2), 'stuck.md')), false);
    assert.match(stdout.text(), /stop rule: another fix round/);
    // Round 3 again identical: 6, 6, 6 is two flat rounds, so stop.
    repo.write({ '.delivery/widgets/rounds/3/shoot.json': shootOf(KEYS) });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '3']), 0);
    assert.equal(await reviewCommand.run(ctx, ['--round', '3']), 1);
    const md = readFileSync(join(dir(3), 'stuck.md'), 'utf8');
    assert.match(md, /^# Stuck items/);
    for (const k of KEYS) assert.match(md, new RegExp(`## ${k}\\n`));
    assert.match(md, /- round 1: must\n {2}- x/);
    assert.match(stdout.text(), /the loop stops: 6 still open .*; 6 stuck item\(s\) for the founder in .*rounds\/3\/stuck\.md/);
  } finally { repo.cleanup(); }
});

// ---- W5a: sampling ----

const THRESHOLD = 0.1;
/** Screen A: A-2 differs most, the rest little. Screen B: B-3 and B-2 are above the auto-match line. */
const DIFFS = { 'A-1': 0.02, 'A-2': 0.05, 'A-3': 0.03, 'B-1': 0.01, 'B-2': 0.15, 'B-3': 0.2 };
const prevOf = (verdicts = {}) => ({
  round: 1,
  shoot: shootOf(KEYS),
  review: { states: Object.fromEntries(KEYS.map((k) => [k, { verdict: verdicts[k] ?? 'match', must: [], small: verdicts[k] === 'small' ? ['tiny'] : [], design: [] }])) },
});
const changed = (over = {}) => shootOf(KEYS, (k) => ({ liveHash: 'new', pixelDiff: DIFFS[k], ...(over[k] ?? {}) }));

test('planReview samples per screen: the highest pixelDiff plus any above the line go to reviewers, the rest are held', () => {
  const plan = planReview({ map: twoScreens(), shoot: changed(), prev: prevOf(), threshold: THRESHOLD });
  assert.deepEqual(Object.keys(plan.sampled).sort(), ['A-2', 'B-2', 'B-3']);
  assert.deepEqual(plan.sampled['A-2'], { screen: 'A' });
  assert.deepEqual(Object.keys(plan.held).sort(), ['A-1', 'A-3', 'B-1']);
  assert.equal(plan.held['A-1'].from, 1);
  assert.equal(plan.held['A-1'].screen, 'A');
  assert.equal(plan.held['A-1'].state.verdict, 'match');
  assert.deepEqual(plan.batches.flatMap((b) => b.items).sort(), ['A-2', 'B-2', 'B-3'], 'held items are not sent');
  assert.deepEqual(Object.keys(plan.carried), []);
  // A small label is also a pass.
  const small = planReview({ map: twoScreens(), shoot: changed(), prev: prevOf({ 'A-1': 'small' }), threshold: THRESHOLD });
  assert.equal(small.held['A-1'].state.verdict, 'small');
});

test('planReview: sample 0 turns sampling off; a previous must, a new item or an unmeasured picture is never held', () => {
  const off = planReview({ map: twoScreens(), shoot: changed(), prev: prevOf(), threshold: THRESHOLD, sample: 0 });
  assert.deepEqual(off.held, {});
  assert.deepEqual(off.sampled, {});
  assert.deepEqual(off.batches.flatMap((b) => b.items).sort(), KEYS);
  const noPrev = planReview({ map: twoScreens(), shoot: changed(), prev: null, threshold: THRESHOLD });
  assert.deepEqual(noPrev.held, {});
  const must = planReview({ map: twoScreens(), shoot: changed(), prev: prevOf({ 'A-1': 'must', 'A-3': 'not-reached' }), threshold: THRESHOLD });
  assert.ok(!('A-1' in must.held) && !('A-3' in must.held), 'items that were open are reviewed again');
  assert.ok(must.batches.flatMap((b) => b.items).includes('A-1'));
  assert.ok(must.batches.flatMap((b) => b.items).includes('A-3'));
  // No pixelDiff measured counts as the biggest difference, so it is sampled first.
  const blind = planReview({ map: twoScreens(), shoot: changed({ 'A-1': { pixelDiff: undefined } }), prev: prevOf(), threshold: THRESHOLD });
  assert.ok('A-1' in blind.sampled);
  // An item that was itself held last round is not held again from a held label.
  const heldBefore = prevOf();
  heldBefore.review.states['A-1'].held = { from: 1 };
  assert.ok(!('A-1' in planReview({ map: twoScreens(), shoot: changed(), prev: heldBefore, threshold: THRESHOLD }).held));
});

test('planReview: carried and auto-matched items are never held', () => {
  const shoot = changed({ 'A-1': { liveHash: 'L' }, 'A-3': { factsAgree: true, pixelDiff: 0.0001 } });
  const plan = planReview({ map: twoScreens(), shoot, prev: prevOf(), threshold: THRESHOLD });
  assert.deepEqual(Object.keys(plan.carried), ['A-1'], 'unchanged pictures carry');
  assert.deepEqual(Object.keys(plan.auto), ['A-3'], 'exact facts under the line match on their own');
  assert.ok(!('A-1' in plan.held) && !('A-3' in plan.held));
  assert.ok(!('A-1' in plan.sampled) && !('A-3' in plan.sampled));
  // Screen A's own sample is now A-2 (the highest left); A has nothing held.
  assert.deepEqual(Object.keys(plan.sampled).filter((k) => k.startsWith('A')), ['A-2']);
});

test('summarise: a held item keeps its prior label and notes, marked held with the round it came from, and counts in the verdicts', () => {
  const m = twoScreens();
  const prev = prevOf({ 'A-1': 'small' });
  const shoot = changed();
  const plan = planReview({ map: m, shoot, prev, threshold: THRESHOLD });
  const notes = { 'A-2': { must: ['wrong colour'], small: [], design: [] } };
  const s = summarise({ map: m, shoot, notes, pre: plan });
  assert.equal(s.states['A-1'].verdict, 'small');
  assert.deepEqual(s.states['A-1'].small, ['tiny']);
  assert.deepEqual(s.states['A-1'].held, { from: 1 });
  assert.equal(s.states['A-1'].carried, undefined);
  assert.equal(s.states['A-3'].verdict, 'match');
  assert.deepEqual(s.states['A-3'].held, { from: 1 });
  assert.equal(s.states['A-2'].verdict, 'must');
  assert.equal(s.states['A-2'].held, undefined);
  assert.deepEqual(s.counts, { match: 4, small: 1, must: 1, notReached: 0, testOnly: 0, backToDesign: 0 });
  // A carried item stays carried, not held.
  const car = planReview({ map: m, shoot: changed({ 'B-1': { liveHash: 'L' } }), prev: prevOf(), threshold: THRESHOLD });
  const sc = summarise({ map: m, shoot: changed({ 'B-1': { liveHash: 'L' } }), notes: {}, pre: car });
  assert.deepEqual(sc.states['B-1'].carried, { from: 1 });
  assert.equal(sc.states['B-1'].held, undefined);
});

test('heldToReview: the held items of a screen whose sample failed; every held item when no sample failed', () => {
  const plan = planReview({ map: twoScreens(), shoot: changed(), prev: prevOf(), threshold: THRESHOLD });
  const review = (states) => ({ states: Object.fromEntries(Object.entries(states).map(([k, verdict]) => [k, { verdict }])) });
  const clean = heldToReview(plan, review({ 'A-2': 'match', 'B-2': 'small', 'B-3': 'match' }));
  assert.deepEqual(clean.failedScreens, []);
  assert.deepEqual(clean.keys.sort(), ['A-1', 'A-3', 'B-1'], 'all held items are owed before shipping');
  const failedA = heldToReview(plan, review({ 'A-2': 'must', 'B-2': 'match', 'B-3': 'match' }));
  assert.deepEqual(failedA.failedScreens, ['A']);
  assert.deepEqual(failedA.keys.sort(), ['A-1', 'A-3']);
  const failedB = heldToReview(plan, review({ 'A-2': 'match', 'B-3': 'not-reached' }));
  assert.deepEqual(failedB.failedScreens, ['B']);
  assert.deepEqual(failedB.keys, ['B-1']);
  // A sampled failure on a screen with nothing held is not a failed screen.
  const onlyB = { held: { 'B-1': { screen: 'B' } }, sampled: { 'A-2': { screen: 'A' }, 'B-3': { screen: 'B' } } };
  assert.deepEqual(heldToReview(onlyB, review({ 'A-2': 'must', 'B-3': 'match' })), { failedScreens: [], keys: ['B-1'] });
  assert.deepEqual(heldToReview(null, null), { failedScreens: [], keys: [] });
  assert.deepEqual(heldToReview({ held: {}, sampled: {} }, review({})), { failedScreens: [], keys: [] });
});

test('noteOwners: carried, auto and held items own no reviewer note', () => {
  const owners = noteOwners({ batches: [{ write: 'review-batch-1.md', items: ['A-2', 'A-1'] }] }, { carried: { C: {} }, auto: { D: {} }, held: { 'A-1': {} } });
  assert.equal(owners.get('A-2'), 'review-batch-1.md');
  assert.equal(owners.get('A-1'), null, 'a held item\'s stale note is ignored');
  assert.equal(owners.get('C'), null);
  assert.equal(owners.get('D'), null);
});

test('NEXT and ready: a held item asks for a review before shipping, a failed sample before the fix; ready is red while a held verdict is the latest', async () => {
  const facts = (last) => ({ designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [{ round: 2, shot: true, reviews: 1, compiled: true, counts: { must: 0, notReached: 0 }, ...last }] });
  const held = pictureNext(facts({ held: 3 }), { cli: 'delivery' });
  assert.equal(held.step, 'review');
  assert.match(held.text, /review --plan --round 2 --held: 3 item\(s\) whose pictures changed were held back/);
  const failed = pictureNext(facts({ held: 3, heldFailed: 1, counts: { must: 1, notReached: 0 } }), { cli: 'delivery' });
  assert.equal(failed.step, 'review');
  assert.match(failed.text, /--held: the sample found a problem in 1 screen\(s\)/);
  assert.equal(pictureNext(facts({ held: 0 }), { cli: 'delivery' }).step, 'ship');
  const r = tmpRun();
  try {
    r.round(1, { A: 'match', B: 'match' });
    r.round(2, { A: { verdict: 'match', must: [], small: [], held: { from: 1 } }, B: 'match' });
    const red = await pictureReadiness(r.paths);
    assert.equal(red.ok, false);
    assert.match(red.detail, /1 state\(s\) were held back from review .* delivery review --plan --round 2 --held/);
    r.round(3, { A: 'match' });
    assert.equal((await pictureReadiness(r.paths)).ok, true);
  } finally { r.cleanup(); }
});

// ---- W5a end to end: review --plan --held ----

async function heldRepo() {
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': twoScreens(),
    '.delivery/widgets/rounds/1/shoot.json': shootOf(KEYS),
    '.delivery/widgets/rounds/1/review.json': { schemaVersion: 1, round: 1, states: prevOf().review.states },
    '.delivery/widgets/rounds/2/shoot.json': changed(),
  } });
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
  return { repo, ...t, dir: join(repo.dir, '.delivery/widgets/rounds/2') };
}
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('review --plan samples, then --plan --held plans only the held items and drops them from review-plan.json', async () => {
  const { repo, ctx, stdout, dir } = await heldRepo();
  try {
    // Default thresholds: every item here differs by more than the auto-match line except none, so pin the diffs low.
    const shoot = readJson(join(dir, 'shoot.json'));
    for (const k of KEYS) shoot.states[k].pixelDiff = { 'A-1': 0.0004, 'A-2': 0.0009, 'A-3': 0.0006, 'B-1': 0.0002, 'B-2': 0.0008, 'B-3': 0.0007 }[k];
    repo.write({ '.delivery/widgets/rounds/2/shoot.json': shoot });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    const plan = readJson(join(dir, 'review-plan.json'));
    assert.deepEqual(Object.keys(plan.sampled).sort(), ['A-2', 'B-2'], 'the top item of each screen');
    assert.deepEqual(Object.keys(plan.held).sort(), ['A-1', 'A-3', 'B-1', 'B-3']);
    assert.match(stdout.text(), /4 item\(s\) that passed last round changed picture and are held; 2 sampled per screen/);
    const b1 = readJson(join(dir, 'batches.json'));
    assert.deepEqual(b1.batches.flatMap((b) => b.items).sort(), ['A-2', 'B-2']);

    // The sample failed on screen A: only A's held items are planned.
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ states: { 'A-2': { verdict: 'must' }, 'B-2': { verdict: 'match' } } }));
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--held', '--round', '2']), 0);
    const b2 = readJson(join(dir, 'batches.json'));
    assert.deepEqual(b2.reshot.sort(), ['A-1', 'A-3']);
    assert.deepEqual(b2.batches.slice(b1.batches.length).flatMap((b) => b.items).sort(), ['A-1', 'A-3']);
    const after = readJson(join(dir, 'review-plan.json'));
    assert.deepEqual(Object.keys(after.held).sort(), ['B-1', 'B-3'], 'A\'s items left the held list');
    assert.match(stdout.text(), /2 held item\(s\) to review \(A-[13], A-[13]\)/);

    // No sample failed now: the rest are owed before shipping.
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ states: { 'A-2': { verdict: 'match' }, 'B-2': { verdict: 'match' } } }));
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--held', '--round', '2']), 0);
    const after2 = readJson(join(dir, 'review-plan.json'));
    assert.equal(after2.held, undefined);
    assert.deepEqual(readJson(join(dir, 'batches.json')).reshot.sort(), ['B-1', 'B-3']);
    // Nothing held is left.
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--held', '--round', '2']), 0);
    assert.match(stdout.text(), /round 2: no held item to review/);
  } finally { repo.cleanup(); }
});

test('review --plan --no-sample sends every changed item; --held without --plan is a usage error; compile marks held items', async () => {
  const { repo, ctx, dir } = await heldRepo();
  try {
    const shoot = readJson(join(dir, 'shoot.json'));
    for (const k of KEYS) shoot.states[k].pixelDiff = 0.0004;
    shoot.states['A-2'].pixelDiff = 0.0009;
    repo.write({ '.delivery/widgets/rounds/2/shoot.json': shoot });
    await assert.rejects(reviewCommand.run(ctx, ['--held', '--round', '2']), /--held goes with --plan/);
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--no-sample', '--round', '2']), 0);
    assert.equal(readJson(join(dir, 'review-plan.json')).held, undefined);
    assert.deepEqual(readJson(join(dir, 'batches.json')).batches.flatMap((b) => b.items).sort(), KEYS);
    // Sampled again: compile keeps the held items' labels and marks them.
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    const plan = readJson(join(dir, 'review-plan.json'));
    assert.deepEqual(Object.keys(plan.sampled).sort(), ['A-2', 'B-1'], 'one per screen; a tie goes to the first key');
    const file = readJson(join(dir, 'batches.json')).batches[0].write;
    writeFileSync(join(dir, file), `2 match.\n\nMatches: A-2, B-1\n`);
    assert.equal(await reviewCommand.run(ctx, ['--round', '2']), 0);
    const review = readJson(join(dir, 'review.json'));
    assert.deepEqual(review.states['A-1'].held, { from: 1 });
    assert.equal(review.states['A-1'].verdict, 'match');
    assert.equal(review.states['A-2'].held, undefined);
  } finally { repo.cleanup(); }
});

// ---- W5b: unchangedItems ----

const routeMap = (sources) => {
  const st = (id, route, extra = {}) => ({ id, screen: id, name: id, reach: { world: 'design', role: 'admin', steps: [{ goto: route }] }, buttons: [], ...extra });
  return { ...sampleMap({ route: '/a' }), ...(sources ? { sources } : {}), states: [st('A-1', '/a?x=1'), st('A-2', '/a/detail'), st('B-1', '/b'), st('B-2', '/b'), st('C-1', '/c')] };
};
const SOURCES = { '/a': ['src/routes/a/**'], '/b': ['src/routes/b/**'], '/c': ['src/routes/c/**'] };
const passed = (m, over = {}) => new Map(mapItems(m).map((i) => [i.key, { verdict: 'match', round: 1, ...(over[i.key] ?? {}) }]));
const prevShoot = (m) => ({ head: 'abc', states: Object.fromEntries(mapItems(m).map((i) => [i.key, { reached: true }])) });
const skipOf = (m, changedFiles, o = {}) => unchangedItems({ map: m, items: mapItems(m), verdicts: passed(m, o.verdicts), prevShoot: 'prev' in o ? o.prev : prevShoot(m), changed: changedFiles });

test('unchangedItems: a map with no sources, no earlier round or unreadable changes skips nothing, and says why', () => {
  const none = skipOf(routeMap(null), ['src/routes/a/page.svelte']);
  assert.deepEqual(none.skip, {});
  assert.match(none.why, /names no route sources/);
  assert.deepEqual(unchangedItems({ map: routeMap({}), items: mapItems(routeMap({})), verdicts: new Map(), prevShoot: null, changed: [] }).skip, {});
  assert.match(skipOf(routeMap(SOURCES), [], { prev: null }).why, /no earlier round/);
  const unread = skipOf(routeMap(SOURCES), null);
  assert.deepEqual(unread.skip, {});
  assert.match(unread.why, /could not be read/);
});

test('unchangedItems: a changed file outside every route\'s sources (a shared component) means shoot everything', () => {
  const r = skipOf(routeMap(SOURCES), ['src/routes/a/page.svelte', 'src/lib/components/Button.svelte']);
  assert.deepEqual(r.skip, {});
  assert.match(r.why, /1 changed file\(s\) lie outside every route's sources \(src\/lib\/components\/Button\.svelte\)/);
});

test('unchangedItems: a change under route A\'s sources skips the passed items of the other routes only', () => {
  const m = routeMap(SOURCES);
  const r = skipOf(m, ['src/routes/a/page.svelte']);
  assert.equal(r.why, null);
  assert.deepEqual(Object.keys(r.skip).sort(), ['B-1', 'B-2', 'C-1']);
  assert.deepEqual(r.skip['B-1'], { from: 1 });
  // Nothing changed at all: everything passed is skipped. Files under .delivery are ignored.
  assert.deepEqual(Object.keys(skipOf(m, ['.delivery/f/rounds/1/x.png']).skip).sort(), ['A-1', 'A-2', 'B-1', 'B-2', 'C-1']);
  // The item's route is its last goto without the query, and A-2 is under /a.
  assert.equal(itemRoute(m, mapItems(m)[0]), '/a');
  assert.equal(itemRoute(m, mapItems(m)[1]), '/a/detail');
  assert.deepEqual(Object.keys(skipOf(m, ['src/routes/b/page.svelte']).skip).sort(), ['A-1', 'A-2', 'C-1']);
});

test('unchangedItems: an item that was open, was not reached last time, or has no verdict is never skipped', () => {
  const m = routeMap(SOURCES);
  const verdicts = passed(m, { 'B-1': { verdict: 'must' }, 'C-1': { verdict: 'not-reached' } });
  verdicts.delete('B-2');
  const r = unchangedItems({ map: m, items: mapItems(m), verdicts, prevShoot: prevShoot(m), changed: ['src/routes/a/page.svelte'] });
  assert.deepEqual(Object.keys(r.skip), [], 'must, not-reached and unlabelled items are shot again');
  const small = skipOf(m, ['src/routes/a/page.svelte'], { verdicts: { 'C-1': { verdict: 'small' } } });
  assert.ok('C-1' in small.skip, 'a small difference passed');
  const unreached = prevShoot(m);
  unreached.states['C-1'].reached = false;
  assert.ok(!('C-1' in unchangedItems({ map: m, items: mapItems(m), verdicts: passed(m), prevShoot: unreached, changed: [] }).skip));
});

test('unchangedItems: a route with no sources of its own is never skipped', () => {
  const m = routeMap({ '/a': ['src/routes/a/**'], '/b': ['src/routes/b/**'] });
  const r = skipOf(m, ['src/routes/a/page.svelte']);
  assert.ok(!('C-1' in r.skip), '/c has no sources: not sure, so shot');
  assert.deepEqual(Object.keys(r.skip).sort(), ['B-1', 'B-2']);
});

test('sourcesFor: the longest route prefix wins, on whole path segments', () => {
  const map = { sources: { '/': ['src/app/**'], '/dash': ['src/dash/**'], '/dash/knowledge': ['src/knowledge/**'] } };
  assert.deepEqual(sourcesFor(map, '/dash/knowledge'), ['src/knowledge/**']);
  assert.deepEqual(sourcesFor(map, '/dash/knowledge/new'), ['src/knowledge/**']);
  assert.deepEqual(sourcesFor(map, '/dash/other'), ['src/dash/**']);
  assert.deepEqual(sourcesFor(map, '/dashboard'), ['src/app/**'], '/dash is not a prefix of /dashboard');
  assert.deepEqual(sourcesFor(map, '/elsewhere'), ['src/app/**']);
  assert.equal(sourcesFor({ sources: { '/a': ['x'] } }, '/b'), null);
  assert.equal(sourcesFor({}, '/a'), null);
  assert.equal(sourcesFor(null, '/a'), null);
});

test('validateMap: sources must be an object of route: [globs]', () => {
  const problems = (sources) => validateMap({ ...sampleMap(), sources }, { designed: new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']) });
  assert.deepEqual(problems({ '/dashboard/knowledge': ['src/routes/dashboard/knowledge/**'] }), []);
  assert.deepEqual(validateMap(sampleMap(), { designed: new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']) }), [], 'sources is optional');
  const has = (ps, text) => ps.some((p) => p.includes(text));
  assert.ok(has(problems(['src/**']), 'sources must be an object'));
  assert.ok(has(problems('src/**'), 'sources must be an object'));
  assert.ok(has(problems(null), 'sources must be an object'));
  assert.ok(has(problems({ 'dashboard': ['src/**'] }), 'sources key "dashboard" must be a route starting with /'));
  assert.ok(has(problems({ '/a': [] }), 'sources["/a"] must be a list of file globs'));
  assert.ok(has(problems({ '/a': 'src/**' }), 'sources["/a"] must be a list of file globs'));
  assert.ok(has(problems({ '/a': ['src/**', 3] }), 'sources["/a"] must be a list of file globs'));
  assert.ok(has(problems({ '/a': [''] }), 'sources["/a"] must be a list of file globs'));
});

// ---- W5b: shoot.json records the head it was shot at ----

test('writeShootJson records head; a reshoot keeps the round\'s first head', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delivery-head-'));
  try {
    const first = await writeShootJson(dir, { baseUrl: 'u', at: 't1', report: { A: { reached: true } }, head: 'abc123' });
    assert.equal(first.head, 'abc123');
    assert.equal(readJson(join(dir, 'shoot.json')).head, 'abc123');
    const re = await writeShootJson(dir, { baseUrl: 'u', at: 't2', report: { A: { reached: true } }, reshot: true, head: 'def456' });
    assert.equal(re.head, 'abc123', 'the pictures of the other items were shot at the first head');
    assert.equal(re.at, 't1');
    // Shot again in full: the new head.
    assert.equal((await writeShootJson(dir, { baseUrl: 'u', at: 't3', report: { A: { reached: true } }, head: 'fed789' })).head, 'fed789');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeShootJson: no head given writes none, and a reshoot into a round without one takes the given head', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delivery-head-'));
  try {
    const none = await writeShootJson(dir, { baseUrl: 'u', at: 't1', report: { A: { reached: true } } });
    assert.equal('head' in none, false);
    const re = await writeShootJson(dir, { baseUrl: 'u', at: 't2', report: { B: { reached: true } }, reshot: true, head: 'abc123' });
    assert.equal(re.head, 'abc123');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
