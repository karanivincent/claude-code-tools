// Run: node --test general-tools/skills/toon-world/kit/timing.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTimeline, resolveClocks, shotClock, frameAt, viewAt, pushed, filmTimeOf, checkSegs, intoOf, checkJoins, type Data, type Seg, type View, planPace, checkPace } from './timing.ts';

const words = (text: string, t0: number) => text.split(' ').map((w, i) => ({ w, s: +(t0 + i * 0.3).toFixed(2), e: +(t0 + i * 0.3 + 0.25).toFixed(2) }));
const data: Data = { fps: 30, duration: 12, lines: [
  { id: 'alone', start: 1, end: 4, words: words('One by one his men were gone. By 1972, he was alone.', 1) },
  { id: 'list', start: 5, end: 9, words: words('He wrote three things: find Onoda, a panda, a yeti.', 5) },
] };
const T = makeTimeline(data);

test('a word said twice in its line needs its occurrence: the 1972 card on the wrong "by"', () => {
  assert.throws(() => T.W('alone', 'by'), /said 2 times/);
  assert.equal(T.W('alone', 'by', 1), T.all('alone', 'by')[1].s);
  assert.ok(T.W('alone', 'by', 1) > T.W('alone', 'gone'));
});

test('a word said once needs no occurrence; a missing word or occurrence throws', () => {
  assert.equal(T.W('alone', 'men'), 2.2);
  assert.equal(T.W('alone', '1972'), T.all('alone', '1972,')[0].s);   // punctuation and digits compare as said
  assert.throws(() => T.W('alone', 'yeti'), /no word/);
  assert.throws(() => T.W('alone', 'by', 2), /no occurrence 2/);
  assert.throws(() => T.L('nope'), /no line/);
});

test('picture beats lead their words', () => {
  assert.ok(Math.abs(T.onWord('alone', 'men') - (2.2 - 0.06)) < 1e-9);
  assert.ok(Math.abs(T.onLine('list') - 4.95) < 1e-9);
});

const V0: View = { pos: [0, 1.6, 8], look: [0, 1.2, 0], fov: 40 };
const views: Record<string, View> = { list: V0, wide: { pos: [3, 2, 9], look: [0, 1, 0], fov: 45 }, other: V0 };
const base = (s: string) => views[s];

test('consecutive segments of one shot share its clock: the list\'s tick does not restart at each camera move', () => {
  const segs: Seg[] = [
    { place: 'camp', shot: 'list', a: 5, b: 6, to: { push: 0.18 } },
    { place: 'camp', shot: 'list', a: 6, b: 7.5, from: { push: 0.18 }, to: { push: 0.34 } },
    { place: 'camp', shot: 'list', a: 7.5, b: 9, from: { push: 0.34 }, to: { push: -0.5 } },
  ];
  const R = resolveClocks(segs);
  assert.deepEqual(R.map(s => s.clock), [5, 5, 5]);
  // the clock runs on without a jump across both splits
  for (const at of [6, 7.5]) {
    const before = frameAt(R, at - 1e-3, base, () => 0).clock, after = frameAt(R, at, base, () => 0).clock;
    assert.ok(Math.abs(after - before) < 0.01, `clock jumps at ${at}: ${before} -> ${after}`);
  }
  assert.ok(Math.abs(frameAt(R, 8.5, base, () => 0).clock - 3.5) < 1e-9);
});

test('a different shot in between, or clock: "own", starts a new clock; a number shares one across shots', () => {
  const R = resolveClocks([
    { place: 'camp', shot: 'list', a: 0, b: 1 },
    { place: 'camp', shot: 'other', a: 1, b: 2 },
    { place: 'camp', shot: 'list', a: 2, b: 3 },
    { place: 'camp', shot: 'list', a: 3, b: 4, clock: 'own' },
    { place: 'camp', shot: 'wide', a: 4, b: 5, clock: 3 },
    { place: 'beach', shot: 'list', a: 5, b: 6 },
  ]);
  assert.deepEqual(R.map(s => s.clock), [0, 1, 2, 3, 3, 5]);
});

test('lead starts the shot\'s clock early and carries into continued segments', () => {
  const R = resolveClocks([{ place: 'p', shot: 's', a: 2, b: 3, lead: 1.6 }, { place: 'p', shot: 's', a: 3, b: 4 }]);
  assert.equal(R[1].lead, 1.6);
  assert.ok(Math.abs(shotClock(R[0], 2, 0) - -1.6) < 1e-9);
  assert.ok(Math.abs(filmTimeOf(R, 's', 0.5) - (2 + 1.6 + 0.5)) < 1e-9);
});

test('long segments punch in at their middle by default; punch: false keeps the creep only', () => {
  const s: Seg = { place: 'p', shot: 'list', a: 0, b: 3 };
  const start = viewAt(s, V0, base, 0, 0), mid = viewAt(s, V0, base, 2.0, 0);
  assert.deepEqual(start.pos, V0.pos);
  assert.ok(mid.pos[2] < V0.pos[2] - 0.5, 'the punch moves the camera in');
  assert.deepEqual(viewAt({ ...s, punch: false }, V0, base, 2.0, 0).pos, V0.pos);
  assert.deepEqual(viewAt({ ...s, b: 1.5 }, V0, base, 1.2, 0).pos, V0.pos);   // short: no punch
});

test('pushed moves along the view; aim moves the look point with the camera', () => {
  const v = pushed(V0, { push: 0.5, aim: -0.2 });
  assert.deepEqual(v.look, [0, 1.0, 0]);
  assert.ok(Math.abs(v.pos[2] - 4) < 1e-9);
});

test('joins: swing inside a place, cut between places (no whip, no blur); checkJoins wants a reason for every cut', () => {
  const R = resolveClocks([
    { place: 'a', shot: 'list', a: 0, b: 2, punch: false },
    { place: 'a', shot: 'wide', a: 2, b: 4, punch: false },
    { place: 'b', shot: 'list', a: 4, b: 6, punch: false },
  ]);
  assert.equal(intoOf(R, 1), 'swing'); assert.equal(intoOf(R, 2), 'cut');
  const atJoin = frameAt(R, 2, base, () => 0).view;
  assert.deepEqual(atJoin.pos, V0.pos, 'a swing starts from the last framing');
  assert.equal(frameAt(R, 3.95, base, () => 0).whip, 0, 'no motion blur at a change of place');
  assert.equal(checkJoins(R).length, 1, 'the cut to place b has no reason');
  const why = R.map((s, i) => (i === 2 ? { ...s, why: 'to the gate: a change of place' } : s));
  assert.equal(checkJoins(why).length, 0);
  const whip = R.map((s, i) => (i === 2 ? { ...s, into: 'whip' as const, why: 'old default' } : s));
  assert.match(checkJoins(whip)[0], /whip/);
  const many = resolveClocks([0, 1, 2, 3, 4].map(k => ({ place: k % 2 ? 'a' : 'b', shot: 'list', a: k, b: k + 1, why: 'a change of place' })));
  assert.equal(checkJoins(many).length, 1, 'four cuts are over three');
});

test('a swing never rises above the higher of its two framings (no lift into empty sky)', () => {
  const R = resolveClocks([{ place: 'a', shot: 'list', a: 0, b: 2, punch: false }, { place: 'a', shot: 'wide', a: 2, b: 4, punch: false }]);
  const hi = Math.max(base('list').pos[1], base('wide').pos[1]), lookHi = Math.max(base('list').look[1], base('wide').look[1]);
  for (let t = 2; t < 2.5; t += 0.02) {
    const v = frameAt(R, t, base, () => 0).view;
    assert.ok(v.pos[1] <= hi + 1e-9 && v.look[1] <= lookHi + 1e-9, `t ${t.toFixed(2)}: the swing rose`);
  }
});

test('checkSegs names gaps, backwards segments and unknown shots', () => {
  const issues = checkSegs([
    { place: 'a', shot: 'list', a: 0, b: 2, to: 'nope' },
    { place: 'a', shot: 'list', a: 2.5, b: 2.4 },
  ], () => ['list']);
  assert.equal(issues.length, 3);
});

test('one segment per line plans a slow film; more framings per line raise the planned pace', () => {
  const oneEach = Array.from({ length: 27 }, (_, i) => ({ a: i * 2.5, b: (i + 1) * 2.5 }));
  const slow = planPace(oneEach, 67.5);
  assert.ok(slow.perMinute < 50 && checkPace(oneEach, 67.5, 60).length === 1);
  const three = Array.from({ length: 81 }, (_, i) => ({ a: i * 0.83, b: (i + 1) * 0.83 }));
  assert.ok(planPace(three, 67.5).perMinute >= 60);
});
