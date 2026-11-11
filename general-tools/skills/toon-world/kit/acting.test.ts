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

test('the opening needs all three: a big subject, motion from frame 1 and the card at 0.0 s', () => {
  const cam = (z: number) => ({ pos: [0, 1.6, z] as [number, number, number], look: [0, 1.2, 0] as [number, number, number], fov: 40 });
  const card = [{ text: 'NO RAIN', at: 0 }];
  // Elijah's opening: a held insert, a small calm figure, the card popping in at 0.35 s
  const weak = [0, 0.1, 0.2].map(t => ({ t, shot: 'hook', cam: cam(5), people: [{ key: 'widow', sig: 'x', height: 0.15, named: true }] }));
  assert.deepEqual(checkOpening(weak, [{ text: 'NO RAIN', at: 0.35 }]).map(i => i.check), ['opening-small', 'opening-still', 'opening-card']);
  // a card alone no longer passes (it used to: big OR card)
  assert.deepEqual(checkOpening(weak, card).map(i => i.check), ['opening-small', 'opening-still']);
  // big, the camera pushing in from frame 0, the card up: passes
  const good = [0, 0.1, 0.2].map(t => ({ t, shot: 'hook', cam: cam(5 - t), people: [{ key: 'widow', sig: 'x', height: 0.45, named: true }] }));
  assert.equal(checkOpening(good, card).length, 0);
  // a held camera passes when the person acts from frame 1
  const acts = [0, 0.1].map((t, i) => ({ t, shot: 'hook', cam: cam(5), people: [{ key: 'widow', sig: `p${i}`, height: 0.45, named: true }] }));
  assert.equal(checkOpening(acts, card).length, 0);
});

test('checkCues leaves the opening card alone (it is up before any word)', () => {
  assert.equal(checkCues([{ text: 'one handful', at: 0 }], [{ w: 'one', s: 0.65 }]).length, 0);
  assert.equal(checkCues([{ text: 'one handful', at: 2 }], [{ w: 'one', s: 0.65 }]).length, 1);
});

test('checkCaptions: a film without captions fails; every word must be on screen as it is said', () => {
  const words = [{ w: 'In', s: 0.35, e: 0.41 }, { w: '1974,', s: 0.41, e: 1.52 }, { w: 'a', s: 1.52, e: 1.55 }];
  assert.equal(checkCaptions([], words)[0].check, 'no-captions');
  assert.equal(checkCaptions([{ text: 'In', s: 0.31, e: 0.37 }, { text: '1974', s: 0.37, e: 1.48 }, { text: 'a', s: 1.48, e: 1.75 }], words).length, 0);
  assert.equal(checkCaptions([{ text: 'In', s: 0.31, e: 0.37 }], words).length, 2);
});

test('acknowledge lets through only issues the story names with a reason', async () => {
  const { acknowledge } = await import('./acting.ts');
  const issues = [{ check: 'head-cut', from: 3, to: 3.4, shot: 'gate', who: 'widow', what: 'head cut by the top edge' }, { check: 'opening-still', from: 0, to: 0.1, shot: 'hook', what: '' }];
  const r = acknowledge(issues, [{ check: 'head-cut', at: 3.2, reason: 'she rises out of frame on purpose (the owner saw it)' }]);
  assert.deepEqual(r.open.map(i => i.check), ['opening-still']);
  assert.equal(r.passed.length, 1);
  const bad = acknowledge(issues, [{ check: 'head-cut', reason: ' ' }, { check: 'acting-still', reason: 'old' }]);
  assert.deepEqual(bad.open.map(i => i.check).sort(), ['ack-no-reason', 'ack-unused', 'head-cut', 'opening-still']);
});

test('fromFrames merges a camera finding over neighbouring frames into one run in seconds', async () => {
  const { fromFrames } = await import('./acting.ts');
  const f = [0, 3, 6, 30].map(k => ({ f: 60 + k, kind: 'empty sky', detail: '52% of the frame is empty sky' }));
  const r = fromFrames(f, 30, () => 'gate/wide');
  assert.equal(r.length, 2); assert.equal(r[0].check, 'cam-empty-sky'); assert.equal(r[0].from, 2); assert.equal(r[0].to, 2.2);
});
