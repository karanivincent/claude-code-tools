// Run: node --test general-tools/skills/toon-world/kit/camera.test.ts   (Node 22.6+ strips the types itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, path, curve, safe, upFor, frameOn, shot, follow, onScreen, project, audit, checkMustSee, checkLens, approach, matchCam, track, cardReach, turnDeg, norm, sub, dot, cross, len, type Subject, type V3, type Cam, type Blocker } from './camera.ts';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} is not within ${tol} of ${b}`);

test('the path passes through its keys and holds at stop keys', () => {
  const keys = [K(0, [0, 2, 10], [0, 1, 0], 45), K(30, [5, 2, 10], [0, 1, 0], 40, 0, true), K(60, [10, 4, 10], [0, 1, 0], 50)];
  assert.deepEqual(path(keys, 30).pos, [5, 2, 10]);
  near(path(keys, 30).fov, 40, 1e-9);
  // a stop key has zero speed: one frame either side barely moves
  near(path(keys, 31).pos[0] - path(keys, 30).pos[0], 0, 0.02, 'stop');
});

test('the safe camera stays above the ground', () => {
  const hill = (x: number) => 3 + x * 0.1;
  const r = safe({ pos: [10, 1, 0], look: [0, 0, 0], fov: 45 }, { ground: hill });
  near(r.pos[1], 4.3, 1e-9);
  assert.deepEqual(r.fixed, ['under ground']);
  assert.deepEqual(safe({ pos: [10, 9, 0], look: [0, 0, 0], fov: 45 }, { ground: hill }).fixed, []);
});

test('the safe camera is pushed out of a solid by the shortest way', () => {
  const tower = { min: [0, 0, 0] as V3, max: [4, 10, 4] as V3, name: 'gate tower' };
  const r = safe({ pos: [3.9, 5, 2], look: [0, 5, 2], fov: 45 }, { solids: [tower] });
  near(r.pos[0], 4.3, 1e-9);
  assert.deepEqual(r.fixed, ['inside gate tower']);
});

test('up never runs along the view line, even looking straight down', () => {
  for (const look of [[0, 0, 0], [0.001, 0, 0], [0, 0, 0.01]] as V3[]) {
    const up = upFor([0, 50, 0], look);
    const fwd = norm(sub(look, [0, 50, 0]));
    near(dot(up, fwd), 0, 1e-6, 'square to the view');
    assert.ok(Math.hypot(...cross(up, fwd)) > 0.99, 'not parallel');
  }
  // looking straight down, the top of the frame is north (-z) by default
  const c: Cam = { pos: [0, 50, 0], look: [0, 0, 0], fov: 45 };
  assert.ok(project(c, [0, 0, -5]).y > 0, 'north is up the frame');
});

const envoy: Subject = { name: 'envoy', at: [2, 1, -3], r: 0.9 };
const axe: Subject = { name: 'axe', at: [2.8, 0.8, -3.2], r: 0.25 };

test('frameOn puts the group where asked, at the size asked', () => {
  for (const [size, az, el, at] of [[0.3, 180, 10, [0, 0]], [0.6, 90, 25, [0, -0.3]], [0.15, 300, 60, [0.2, 0.2]]] as [number, number, number, [number, number]][]) {
    const c = frameOn({ subjects: [envoy, axe], size, az, el, at }, 0);
    const mid: V3 = [(2 + 2.8) / 2, (1 + 0.8) / 2, (-3 - 3.2) / 2];
    const p = project(c, mid);
    near(p.x, at[0], 0.02, `x at size ${size}`); near(p.y, at[1], 0.02, `y at size ${size}`);
    for (const s of [envoy, axe]) assert.ok(onScreen(c, s, 0).visible, `${s.name} in frame`);
  }
});

test('frameOn looking straight down keeps a level, unflipped frame', () => {
  const c = frameOn({ subjects: [envoy], size: 0.3, az: 180, el: 89.9 }, 0);
  assert.ok(onScreen(c, envoy, 0).visible);
  assert.ok(Number.isFinite(c.pos[0]) && Number.isFinite(c.look[2]));
});

test('follow keeps a moving subject in frame on every frame between its keys', () => {
  const walker: Subject = { name: 'column', at: f => [f * 0.2, 1, -f * 0.05], r: 1.5 };
  const keys = follow({ subjects: [walker], size: 0.35, az: 150, el: 12 }, 0, 120, 8);
  for (let f = 0; f <= 120; f++) {
    const o = onScreen(path(keys, f), walker, f);
    assert.ok(o.visible, `frame ${f}`);
    assert.ok(o.size > 0.25, `frame ${f} size ${o.size}`);
  }
});

test('audit finds a fast swing and a dive under the ground, and lets a planned whip through', () => {
  const keys = [shot(0, { subjects: [envoy], size: 0.3, az: 180, el: 10 }), K(8, [2, 1.6, 10], [2, 1, 30], 45), K(40, [2, -3, 30], [2, 0, 60], 45)];
  const camAt = (f: number) => path(keys, f);
  const issues = audit(camAt, 0, 40, { ground: () => 0 });
  assert.ok(issues.some(i => i.kind === 'turn' && i.f <= 8), 'the 180° swing in 8 frames');
  assert.ok(issues.some(i => i.kind === 'under ground'), 'the dive');
  assert.ok(!audit(camAt, 0, 40, { ground: () => -10, whips: [[0, 8]] }).some(i => i.kind === 'turn'), 'a planned whip passes');
  near(turnDeg(camAt(0), camAt(8)), 180, 15);
});

test('the must-see check names what is out of frame or too small on its word', () => {
  const keys = [shot(0, { subjects: [envoy], size: 0.4, az: 180, el: 10 }), shot(30, { subjects: [envoy], size: 0.4, az: 180, el: 10 })];
  const camAt = (f: number) => path(keys, f);
  const subjects = { envoy, axe, king: { name: 'king', at: [40, 1, 0] as V3, r: 0.9 } };
  const issues = checkMustSee(camAt, subjects, [
    { word: 'cutting', f: 10, subjects: ['envoy', 'axe'], size: 0.05 },
    { word: 'kings', f: 20, subjects: ['king'] },
    { word: 'wood', f: 25, subjects: ['axe'], size: 0.5 },
  ]);
  assert.ok(!issues.some(i => i.detail.startsWith('"cutting"')), 'envoy and axe are both in frame');
  assert.ok(issues.some(i => i.detail === '"kings": king is out of frame'));
  assert.ok(issues.some(i => i.kind === 'too small' && i.detail.startsWith('"wood"')));
});

test('the must-see check finds a subject hidden behind a rock, and a rock crowding the lens', () => {
  const keys = [shot(0, { subjects: [envoy], size: 0.3, az: 180, el: 5 })];
  const camAt = (f: number) => path(keys, f);
  const cam = camAt(0);
  const between: V3 = [(cam.pos[0] + 2) / 2, (cam.pos[1] + 1) / 2, (cam.pos[2] - 3) / 2];
  const rock: Blocker = { c: between, r: 0.6, name: 'a rock' };
  const hidden = checkMustSee(camAt, { envoy }, [{ word: 'envoy', f: 0, subjects: ['envoy'], hold: 0 }], { blockers: [rock] });
  assert.ok(hidden.some(i => i.kind === 'blocked' && i.detail === '"envoy": envoy is behind a rock'));
  // a big rock low in the foreground, off the line of sight, still crowds the frame
  const low: Blocker = { c: [cam.pos[0] + 0.35, cam.pos[1] - 0.9, cam.pos[2] - 2.2], r: 0.5, name: 'a boulder' };
  const crowd = checkMustSee(camAt, { envoy }, [{ word: 'envoy', f: 0, subjects: ['envoy'], hold: 0 }], { blockers: [low] });
  assert.ok(crowd.some(i => i.kind === 'in the way'), JSON.stringify(crowd));
  assert.ok(!crowd.some(i => i.kind === 'blocked'));
  // a rock behind the subject is no problem
  const behind: Blocker = { c: [2, 1, -12], r: 1, name: 'far rock' };
  assert.equal(checkMustSee(camAt, { envoy }, [{ word: 'envoy', f: 0, subjects: ['envoy'], hold: 0 }], { blockers: [behind] }).length, 0);
});

test('approach keeps a far destination in frame after its turn and arrives at its framing', () => {
  const start: Cam = { pos: [0, 6, 0], look: [0, 2, -40], fov: 44 };          // looking north at an army
  const city: Subject = { name: 'city', at: [600, 10, 40], r: 70 };            // 600 m east
  const fr = { subjects: [city], size: 0.55, az: 217, el: 25 };
  const keys = approach(0, 90, start, fr, { turn: 15, lift: 30 });
  const camAt = (f: number) => path(keys, f);
  assert.ok(keys.seenFrom > 15 && keys.seenFrom < 45, `seen from ${keys.seenFrom}`);
  assert.equal(checkMustSee(camAt, { city }, [{ word: 'Jericho', f: keys.seenFrom, subjects: ['city'], size: 0.02, hold: 90 - keys.seenFrom }]).length, 0);
  const end = frameOn(fr, 90);
  near(len3(sub(camAt(90).pos, end.pos)), 0, 1e-6, 'arrives');
  assert.ok(!audit(camAt, 0, 90, { maxTurn: 6 }).some(i => i.kind === 'turn'), 'no whip-fast turn');
  assert.ok(camAt(45).pos[1] > Math.min(start.pos[1], end.pos[1]), 'the lift raises the middle');
});
const len3 = (v: V3) => Math.hypot(v[0], v[1], v[2]);

test('a 15 m key next to a 600 m key never flips the view (direction and distance blend apart)', () => {
  // looking south 600 m out, then west at a flame 15 m away, then west 600 m out: 90° in all
  const keys = [K(0, [0, 2, 0], [0, 2, 600], 45), K(11, [-2, 2, 2], [-17, 2, 2], 45), K(13, [-9, 2, -3], [-609, 2, -3], 45)];
  // blending the look points instead (the old path) swings the view past the whole 90° in one frame
  const ts = keys.map(k => k.f), old = (f: number): Cam => {
    const c = (g: 'pos' | 'look', i: number) => curve(ts, keys.map(k => k[g][i]), f);
    return { pos: [c('pos', 0), c('pos', 1), c('pos', 2)], look: [c('look', 0), c('look', 1), c('look', 2)], fov: 45 };
  };
  let worstOld = 0, worst = 0;
  const d0 = norm(sub(keys[0].look, keys[0].pos)), d2 = norm(sub(keys[2].look, keys[2].pos));
  for (let f = 0; f < 13; f++) {
    worstOld = Math.max(worstOld, turnDeg(old(f), old(f + 1)));
    worst = Math.max(worst, turnDeg(path(keys, f), path(keys, f + 1)));
    for (const g of [f, f + 0.5]) {
      const c = path(keys, g), dir = norm(sub(c.look, c.pos));
      // never turns outside the keys' arc: within 90° of both the first and the last direction
      assert.ok(dot(dir, d0) > -0.01 && dot(dir, d2) > -0.01, `frame ${g} outside the arc`);
      const reach = len(sub(c.look, c.pos));
      assert.ok(reach >= 14.9 && reach <= 600.1, `frame ${g} look distance ${reach}`);
    }
  }
  assert.ok(worstOld > 90, `the old blend turned ${worstOld}° in a frame`);
  assert.ok(worst < 15, `turned ${worst}° in one frame`);
  near(len(sub(path(keys, 11).look, path(keys, 11).pos)), 15, 1e-6, 'the near key keeps its distance');
});

test('matchCam puts two shapes at one screen spot and size from any bearing, held through the overlap', () => {
  const flameA: Subject = { name: 'his torch', at: [4, 2, -3], r: 0.15 };
  const flameB: Subject = { name: 'a torch in the column', at: f => [f * 0.05, 2.1, -40 - f * 0.03], r: 0.15 };
  const m = { size: 0.12, el: 6, at: [0.1, 0.15] as [number, number], fov: 40 };
  const A = matchCam(flameA, m, [160, 163], 100, 124), B = matchCam(flameB, m, 20, 100, 124);
  for (let f = 100; f <= 124; f++) {
    const a = onScreen(path(A, f), flameA, f), b = onScreen(path(B, f), flameB, f);
    assert.ok(a.visible && b.visible, `frame ${f}`);
    near(a.x, b.x, 0.01, `x at ${f}`); near(a.y, b.y, 0.01, `y at ${f}`); near(a.size, b.size, 0.005, `size at ${f}`);
    near(a.x, 0.1, 0.02); near(a.y, 0.15, 0.02);
  }
  assert.equal(matchCam(flameA, m, 90, 5).length, 1);
});

test('track pans from a fixed spot on a moving subject, and refuses a path that jumps', () => {
  const walker: Subject = { name: 'walker', at: f => [f * 0.05, 1, -6], r: 0.9 };
  const keys = track([0, 1.5, 0], walker, 0, 60, { fov: 50 });
  for (let f = 0; f <= 60; f++) assert.ok(onScreen(path(keys, f), walker, f).visible, `frame ${f}`);
  assert.ok(keys.every(k => k.pos[0] === 0 && k.pos[2] === 0), 'the camera stays put');
  // handed from the landing's path to the hall's at frame 30: a pan keyed across it would whip through the gap
  const handed: Subject = { name: 'him', at: f => (f < 30 ? [-3, 3, -5] : [2, 1, -4]) as V3, r: 0.9 };
  assert.throws(() => track([0, 1.5, 0], handed, 28, 50), /jumps .* between frames 29 and 30/);
  assert.doesNotThrow(() => track([0, 1.5, 0], handed, 30, 50));
});

test('cardReach aims the hand on the screen, not along the world', () => {
  // a person at the left edge of the frame and a target farther away: on screen it lies to his right
  const cam: Cam = { pos: [0, 1.6, 0], look: [0, 1.6, -10], fov: 50 };
  const feet: V3 = [-1.6, 0, -4], target: V3 = [-2.6, 1.4, -14];
  const r = cardReach(cam, feet, target);
  assert.ok(target[0] - feet[0] < 0, 'along the world the target is to his left');
  assert.ok(r.side > 0, `on the screen it is to his right (${r.side})`);
  near(r.depth, 4, 1e-9);
  // the hand reached by the offsets lands on the target's screen spot
  const right = norm(cross(norm(sub(cam.look, cam.pos)), [0, 1, 0]));
  const hand: V3 = [feet[0] + right[0] * r.side, feet[1] + r.up, feet[2] + right[2] * r.side];
  const ph = project(cam, hand), pt = project(cam, target);
  near(ph.x, pt.x, 1e-6, 'x'); near(ph.y, pt.y, 1e-6, 'y');
});

test('checkLens finds clutter at the lens between words, people included', () => {
  const keys = [K(0, [0, 1.6, 0], [0, 1.2, -20], 45), K(60, [0, 1.6, -12], [0, 1.2, -32], 45)];
  const camAt = (f: number) => path(keys, f);
  const bush: Blocker = { c: [0.3, 1.0, -9], r: 0.9, name: 'a bush' };
  const passer: Blocker = { c: f => [1.5 - f * 0.1, 1.2, -2.5], r: 0.5, name: 'a passer-by' };
  const far: Blocker = { c: [0, 1, -60], r: 3, name: 'a far rock' };
  const issues = checkLens(camAt, 0, 60, [bush, passer, far]);
  assert.ok(issues.some(i => i.detail.startsWith('a bush')), 'the bush as the camera passes it');
  assert.ok(issues.some(i => i.detail.startsWith('a passer-by')), 'a person crossing the lens');
  assert.ok(!issues.some(i => i.detail.startsWith('a far rock')));
  assert.ok(issues.every(i => i.kind === 'near the lens'));
  // the must-see check, run only on a word (at frame 60, after both have passed), misses both
  assert.equal(checkMustSee(camAt, { far: { name: 'far', at: [0, 1, -40], r: 2 } }, [{ word: 'road', f: 60, subjects: ['far'], size: 0.01, hold: 0 }], { blockers: [bush, passer] }).length, 0);
});

test('a must-see entry for words needs a tenth of the frame', () => {
  const cam: Cam = { pos: [0, 1.5, 0], look: [0, 1.5, -10], fov: 45 };
  const clock: Subject = { name: 'clock', at: [0, 1.5, -6], r: 0.2 };   // about 9% of the height
  const size = onScreen(cam, clock, 0).size;
  assert.ok(size > 0.08 && size < 0.1, `clock fills ${size}`);
  assert.equal(checkMustSee(() => cam, { clock }, [{ word: 'half past', f: 0, subjects: ['clock'], hold: 0 }]).length, 0);
  const words = checkMustSee(() => cam, { clock }, [{ word: 'half past', f: 0, subjects: ['clock'], hold: 0, words: true }]);
  assert.ok(words.some(i => i.kind === 'too small'));
});
