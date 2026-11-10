// Run: node --test general-tools/skills/toon-world/kit/acting.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingStills, checkFraming, checkHeld, checkCues, checkSync, actingTooSmall, checkOpening, checkCaptions, type Sample } from './acting.ts';

const at = (t: number, sig: string, shot = 'a', extra: Partial<Sample> = {}): Sample => ({ t, shot, people: [{ key: 'onoda', sig, head: [0.5, 0.3], feet: [0.5, 0.8], height: 0.5, named: true }], ...extra });

test('a pose held 2 s is flagged; one that changes every half second is not', () => {
  const still = [0, 0.5, 1, 1.5, 2].map(t => at(t, 'stand'));
  assert.equal(actingStills(still).length, 1);
  const alive = [0, 0.5, 1, 1.5, 2].map((t, i) => at(t, i % 2 ? 'point' : 'stand'));
  assert.equal(actingStills(alive).length, 0);
});

test('a still run is cut at a change of shot', () => {
  const s = [0, 0.4, 0.8].map(t => at(t, 'stand', 'a')).concat([1.2, 1.6, 2.0].map(t => at(t, 'stand', 'b')));
  assert.equal(actingStills(s).length, 0);
});

test('a named head at the top edge is cut; a small far named person is flagged', () => {
  const s: Sample = { t: 1, shot: 'a', people: [{ key: 'walker', sig: 'x', head: [0.5, 0.01], named: true }, { key: 'far', sig: 'y', head: [0.4, 0.5], height: 0.04, named: true }] };
  const issues = checkFraming([s]);
  assert.deepEqual(issues.map(i => i.check).sort(), ['head-cut', 'too-small']);
});

test('a leaflet resting on the rifle end, away from the hand, is not held', () => {
  const s = at(17, 'hold', 'leaflet', { props: [{ name: 'leaflet', at: [0.7, 0.4], holder: 'onoda', hand: [0.45, 0.55] }] });
  assert.equal(checkHeld([s])[0].check, 'not-held');
  const ok = at(17, 'hold', 'leaflet', { props: [{ name: 'leaflet', at: [0.46, 0.53], holder: 'onoda', hand: [0.45, 0.55] }] });
  assert.equal(checkHeld([ok]).length, 0);
});

test('the 1972 card keyed to "one by one" is early; on "By 1972" it passes', () => {
  const words = [{ w: 'One', s: 35.62 }, { w: 'by', s: 35.79 }, { w: 'one', s: 35.96 }, { w: 'By', s: 37.37 }, { w: '1972,', s: 37.56 }];
  assert.equal(checkCues([{ text: '1972', at: 35.73 }], words).length, 1);
  assert.equal(checkCues([{ text: '1972', at: 37.31 }], words).length, 0);
});

test('a shot fired with no gunshot, and a gunshot with nothing fired, both fail', () => {
  const issues = checkSync([{ name: 'shot:hook', t: 1.0 }], [{ name: 'shot', t: 2.0 }]);
  assert.deepEqual(issues.map(i => i.check).sort(), ['no-picture', 'no-sound']);
  assert.equal(checkSync([{ name: 'shot:hook', t: 1.0 }], [{ name: 'shot', t: 1.05 }]).length, 0);
});

test('a person whose head and feet are both outside the frame is not a cut head', () => {
  const S: Sample[] = [0, 0.1, 0.2].map(t => ({ t, shot: 'x', people: [{ key: 'a', sig: '1', head: [1.4, -0.3], feet: [1.4, 0.2 + 1], height: -0.2, named: true }] }));
  assert.equal(checkFraming(S).length, 0);
  const cut: Sample[] = [{ t: 0, shot: 'x', people: [{ key: 'a', sig: '1', head: [0.5, -0.05], feet: [0.5, 0.6], height: 0.7, named: true }] }];
  assert.equal(checkFraming(cut).length, 1);
});

test('acting at 20% of the frame high is too small to read; at 40% it reads', () => {
  const small = [0, 0.1, 0.2].map((t, i) => ({ t, shot: 'beach', people: [{ key: 'onoda', sig: `pose${i}`, height: 0.2, named: true }] }));
  assert.equal(actingTooSmall(small).length, 1);
  const big = [0, 0.1, 0.2].map((t, i) => ({ t, shot: 'beach', people: [{ key: 'onoda', sig: `pose${i}`, height: 0.4, named: true }] }));
  assert.equal(actingTooSmall(big).length, 0);
});

test('an opening with only a small calm figure and no card is weak; a big face or a card at 0 s passes', () => {
  const small = [0, 0.1, 0.2].map(t => ({ t, shot: 'hook', people: [{ key: 'onoda', sig: 'x', height: 0.15, named: true }] }));
  assert.equal(checkOpening(small).length, 1);
  assert.equal(checkOpening(small, [{ text: '1974', at: 0 }]).length, 0);
  const big = [0, 0.1].map(t => ({ t, shot: 'hook', people: [{ key: 'onoda', sig: 'x', height: 0.45, named: true }] }));
  assert.equal(checkOpening(big).length, 0);
});

test('checkCaptions: a film without captions fails; every word must be on screen as it is said', () => {
  const words = [{ w: 'In', s: 0.35, e: 0.41 }, { w: '1974,', s: 0.41, e: 1.52 }, { w: 'a', s: 1.52, e: 1.55 }];
  assert.equal(checkCaptions([], words)[0].check, 'no-captions');
  assert.equal(checkCaptions([{ text: 'In', s: 0.31, e: 0.37 }, { text: '1974', s: 0.37, e: 1.48 }, { text: 'a', s: 1.48, e: 1.75 }], words).length, 0);
  assert.equal(checkCaptions([{ text: 'In', s: 0.31, e: 0.37 }], words).length, 2);
});
