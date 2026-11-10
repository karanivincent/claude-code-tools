// Run: node --test general-tools/skills/toon-world/kit/acting.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingStills, checkFraming, checkHeld, checkCues, checkSync, type Sample } from './acting.ts';

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
