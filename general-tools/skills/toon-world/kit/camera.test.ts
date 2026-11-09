// Run: node --test general-tools/skills/toon-world/kit/camera.test.ts   (Node 22.6+ strips the types itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, path, curve, slerp, clamp, add, scale, safe, upFor, frameOn, shot, follow, onScreen, project, audit, checkMustSee, checkLens, approach, matchCam, track, cardReach, turnDeg, screenFix, mirrorAbout, layerRuns, screenMotion, checkMotion, checkSky, matchOf, headCut, checkHeads, moveDeg, looksClose, norm, sub, dot, cross, len, type Subject, type V3, type Cam, type Blocker, type Key } from './camera.ts';

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

test('a still subject 1 m away stays on its spot while the camera moves round it (look points blend)', () => {
  // a loaf held 1 m from the lens, framed at the right of the frame, while the camera swings 200° round it with keys
  // spaced unevenly (Gibeon r4, frame 711: 1.55's direction blend let it drift off the frame at 23.7 s)
  const loaf: Subject = { name: 'loaf', at: [0, 1, 0], r: 0.12 };
  const keys = [0, 90, 200].map((az, j) => shot([0, 5, 30][j], { subjects: [loaf], size: 0.3, az, el: 15, fov: 45, at: [0.7, 0] }));
  near(len(sub(keys[0].pos, [0, 1, 0])), 1, 0.05, 'about a metre away');
  assert.ok(looksClose(keys[0], keys[1]) && looksClose(keys[1], keys[2]), 'neighbouring look points are close');
  // 1.55's path, for comparison: always the view direction and the look distance blended apart
  const ts = keys.map(k => k.f), dirsOnly = (f: number): Cam => {
    const ch = (vs: number[]) => curve(ts, vs, f);
    const pos: V3 = [ch(keys.map(k => k.pos[0])), ch(keys.map(k => k.pos[1])), ch(keys.map(k => k.pos[2]))];
    const dirs = keys.map(k => norm(sub(k.look, k.pos))), reach = Math.exp(ch(keys.map(k => Math.log(len(sub(k.look, k.pos))))));
    const A = [0]; for (let j = 1; j < keys.length; j++) A.push(A[j - 1] + Math.acos(clamp(dot(dirs[j - 1], dirs[j]), -1, 1)));
    let i = 0; while (i < keys.length - 2 && f > ts[i + 1]) i++;
    return { pos, look: add(pos, scale(slerp(dirs[i], dirs[i + 1], (ch(A) - A[i]) / (A[i + 1] - A[i])), reach)), fov: 45 };
  };
  let lostOld = false, worst = 0;
  for (let f = 0; f <= 30; f += 0.25) {
    if (!onScreen(dirsOnly(f), loaf, f).visible) lostOld = true;
    const o = onScreen(path(keys, f), loaf, f);
    assert.ok(o.visible, `frame ${f}`);
    worst = Math.max(worst, Math.hypot(o.x - 0.7, o.y));
  }
  assert.ok(lostOld, 'the direction blend loses the loaf');
  assert.ok(worst < 0.05, `the loaf strays ${worst} from its spot`);
});

test('a near key between far keys keeps both ways apart: close look points as points, far ones by direction', () => {
  // far, then two keys on one flame 15 m away (the camera creeping), then far again
  const keys = [K(0, [0, 2, 0], [0, 2, 600], 45), K(11, [-2, 2, 2], [-17, 2, 2], 45), K(20, [-2.5, 2, 1.5], [-17, 2.1, 2], 45), K(24, [-9, 2, -3], [-609, 2, -3], 45)];
  assert.ok(!looksClose(keys[0], keys[1]) && looksClose(keys[1], keys[2]) && !looksClose(keys[2], keys[3]));
  const flame: Subject = { name: 'flame', at: [-17, 2.05, 2], r: 0.3 };
  for (let f = 11; f <= 20; f += 0.5) near(onScreen(path(keys, f), flame, f).x, 0, 0.01, `flame centred at ${f}`);
  for (let f = 0; f < 24; f++) assert.ok(turnDeg(path(keys, f), path(keys, f + 1)) < 20, `frame ${f}`);
});

test('a subject radius may follow the frame', () => {
  const cam: Cam = { pos: [0, 1.5, 0], look: [0, 1.5, -10], fov: 45 };
  const board: Subject = { name: 'board', at: [0, 1.5, -6], r: f => (f < 10 ? 0.1 : 0.6) };
  assert.ok(onScreen(cam, board, 0).size < 0.08 && onScreen(cam, board, 20).size > 0.2);
  assert.equal(checkMustSee(() => cam, { board }, [{ word: 'day', f: 0, subjects: ['board'], hold: 0 }]).length, 1);
  assert.equal(checkMustSee(() => cam, { board }, [{ word: 'day', f: 20, subjects: ['board'], hold: 0 }]).length, 0);
});

test('screenFix moves the aim onto where the shape is drawn, so matchCam lands it on the Match spot', () => {
  const typed: V3 = [4, 2, -3], drawnAt: V3 = [4.3, 2.1, -2.7];   // the card draws the flame off the typed point
  const m = { size: 0.16, el: 4, at: [0, 0.08] as [number, number], fov: 40 };
  const cam = path(matchCam({ name: 'typed', at: typed, r: 0.25 }, m, 45, 0), 0);
  const p = project(cam, drawnAt), measured: [number, number] = [(p.x + 1) / 2, (1 - p.y) / 2];   // read off the frame
  assert.ok(Math.hypot(p.x - 0, p.y - 0.08) > 0.2, 'the typed aim misses');
  const fixed: Subject = { name: 'drawn', at: add(typed, screenFix(cam, typed, measured)), r: 0.25 };
  const again = project(path(matchCam(fixed, m, 45, 0), 0), drawnAt);
  near(again.x, 0, 0.03, 'x'); near(again.y, 0.08, 0.03, 'y');
});

test('mirrorAbout turns the camera about a doorway so the opening keeps its place and size', () => {
  const axis: V3 = [1.5, 0, 0], corners: V3[] = [[1.0, 0, 0], [2.0, 0, 0], [1.0, 2.2, 0], [2.0, 2.2, 0]];
  const inside: Cam = { pos: [1.62, 1.45, -2.4], look: [1.55, 1.15, 2.3], fov: 58 };
  const outside = mirrorAbout(inside, axis);
  assert.ok(outside.pos[2] > 0 && inside.pos[2] < 0, 'the turned camera is on the other side');
  const shape = (c: Cam) => corners.map(q => project(c, q)).map(q => [+q.x.toFixed(6), +q.y.toFixed(6)].join()).sort();
  assert.deepEqual(shape(outside), shape(inside));
  const key: Key = K(10, inside.pos, inside.look, 58);
  assert.equal(mirrorAbout(key, axis).f, 10);
});

test('track backing along a line: a walker toward the lens grows; a camera keeping its distance is refused', () => {
  const walker: Subject = { name: 'him', at: f => [2, 0.9, 8 - f * 0.05], r: 0.9 };   // walking toward -z, 1.5 m a second
  // the camera backs 1 m while he walks 3 m: he grows and the place behind him falls back
  const keys = track([2, 1.4, 4], walker, 0, 60, { to: [2, 1.4, 3], up: 0.3, fov: 58, fov1: 56 });
  for (let f = 0; f <= 60; f++) assert.ok(onScreen(path(keys, f), walker, f).visible, `frame ${f}`);
  const s0 = onScreen(path(keys, 0), walker, 0), s1 = onScreen(path(keys, 60), walker, 60);
  assert.ok(s1.size > 1.5 * s0.size, `he grows from ${s0.size} to ${s1.size}`);
  assert.deepEqual(keys[keys.length - 1].pos, [2, 1.4, 3]);
  // backing at his own speed (3 m) keeps him 4 m away the whole walk: the frozen walker
  assert.throws(() => track([2, 1.4, 4], walker, 0, 60, { to: [2, 1.4, 1] }), /frozen/);
  // a fixed-spot track is unchanged
  assert.ok(track([0, 1.5, 0], walker, 0, 30).every(k => k.pos[2] === 0));
  // the camera moves at an even speed: equal steps on every frame (an eased track ran its middle at 1.5 to 1.9 times
  // its average and outran the walker, Mona Lisa r6)
  const even = track([2, 1.4, 4], walker, 0, 60, { to: [2, 1.4, 3], every: 1 });
  const steps = even.slice(1).map((k, i) => Math.abs(k.pos[2] - even[i].pos[2]));
  assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-9, `steps ${Math.min(...steps)} to ${Math.max(...steps)}`);
  // a walker who starts from a stand is slower than the camera for his first steps: he would shrink, so it is refused
  const starting: Subject = { name: 'him', at: f => [2, 0.9, 8 - 3 * (f / 60) ** 2], r: 0.9 };
  assert.throws(() => track([2, 1.4, 4], starting, 0, 60, { to: [2, 1.4, 3] }), /outruns him at frame/);
});

test('layer runs: each layer of a dissolve is checked with its own camera, and a canvas that comes back is a new run', () => {
  const hall: Cam = { pos: [0, 1.6, 0], look: [0, 1.6, -10], fov: 45 }, yard: Cam = { pos: [50, 1.6, 0], look: [50, 1.6, -10], fov: 45 };
  const layersAt = (f: number) => [
    ...(f < 20 || f >= 40 ? [{ id: 'hall', cam: hall }] : []),
    ...(f >= 14 && f < 46 ? [{ id: 'yard', cam: yard }] : []),
  ];
  const runs = layerRuns(layersAt, 0, 59);
  assert.deepEqual(runs.map(r => [r.id, r.from, r.to]), [['hall', 0, 19], ['yard', 14, 45], ['hall', 40, 59]]);
  // a bush at the yard camera's lens, on screen only in the yard layer: found through the dissolve's frames too
  const bush: Blocker = { c: [50.2, 1.3, -3], r: 0.9, name: 'a bush' };
  const lens = checkLens(runs, { blockers: [bush] });
  assert.ok(lens.length === 32 && lens.every(i => i.layer === 'yard'), JSON.stringify(lens.slice(0, 2)));
  assert.ok(lens.some(i => i.f === 14) && lens.some(i => i.f === 45));
  // the cut from hall to yard is not a turn: audit by runs measures turns inside a run only
  const spin = (f: number): Cam => ({ ...hall, look: f < 20 ? hall.look : [10, 1.6, 0] });
  assert.ok(audit(spin, 0, 30).some(i => i.kind === 'turn'));
  assert.equal(audit(runs).length, 0);
});

test('screen motion follows what is on screen: a camera running with its subject is still, a push is not', () => {
  // a rout running east at 2 m a frame, a camera running beside it at the same speed: the picture holds still, though
  // the camera covers 60 m a second (the 1.56 path measure called this one of the liveliest seconds)
  const rout: Subject = { name: 'rout', at: f => [2 * f, 1, -20], r: 6 };
  const hill: Blocker = { c: [400, 30, -900], r: 80, name: 'far hill' };
  const run = (f: number): Cam => ({ pos: [2 * f, 3, 0], look: [2 * f, 1, -20], fov: 45 });
  const still = screenMotion([{ id: 'valley', from: 0, to: 60, camAt: run, blockers: [hill] }], 0, 60, [rout]);
  assert.ok(still.every(v => v < 1), `running with the rout: ${still}`);
  // a slow push on a near face: the face grows on screen, so the picture moves
  const face: Subject = { name: 'face', at: [0, 1.6, -3], r: 0.15 };
  const push = (f: number): Cam => ({ pos: [0, 1.6, 0.5 - f * 0.04], look: [0, 1.6, -3], fov: 45 });
  const pushing = screenMotion(push, 0, 60, [face]);
  assert.ok(pushing.every(v => v > 4), `the push: ${pushing}`);
  // a camera standing still over a moving subject: the subject's own movement counts
  const passing = screenMotion(() => ({ pos: [0, 1.6, 6], look: [0, 1.2, 0], fov: 45 }), 0, 30, [{ name: 'walker', at: f => [-1 + f * 0.05, 1, 0], r: 0.9 }]);
  assert.ok(passing[0] > 10, `a walker crossing: ${passing}`);
  // a dissolve between two still canvases is not a move
  const runs = layerRuns(f => [...(f < 40 ? [{ id: 'a', cam: run(0) }] : []), ...(f >= 30 ? [{ id: 'b', cam: { pos: [90, 2, 0] as V3, look: [0, 0, 0] as V3, fov: 30 } }] : [])], 0, 89);
  assert.ok(screenMotion(runs, 0, 89, [{ name: 'a post', at: [0, 1, -5], r: 1 }]).every(v => v < 1e-9));
});

test('checkMotion on the render\'s frame difference flags the critic\'s two still stretches and nothing else', () => {
  // Gibeon r5's render, mean frame difference a second (frame_motion.py; the critic's own numbers)
  const gibeon = [3.7, 9.4, 20.5, 27.5, 9.4, 10.9, 14.8, 11.4, 12.8, 19.9, 11.4, 14.4, 23.3, 14.6, 14.8, 15.0, 15.8, 19.3, 16.7, 20.3, 12.6, 15.6, 35.3, 27.0, 15.6, 22.6, 17.7, 44.0, 25.0, 22.3, 19.1, 17.5, 39.9, 24.3, 7.7, 20.1, 15.2, 23.1, 19.4, 14.1, 27.8, 12.3, 9.0, 17.0, 17.6, 17.7, 13.0, 16.0, 6.3, 14.6, 9.5, 6.4, 6.9, 8.8, 4.2, 19.0, 12.4, 18.4, 8.6, 1.8, 6.9];
  const still = checkMotion(gibeon);
  assert.deepEqual(still.map(i => i.f / 30), [51, 59], JSON.stringify(still));
  assert.ok(still.every(i => i.kind === 'still'));
  // a longer planned hold covers the card's stillness, as a profile that wanted it would say
  assert.deepEqual(checkMotion(gibeon, { holds: [[59, 61]] }).map(i => i.f / 30), [51]);
  assert.equal(checkMotion(gibeon, { longestHold: 2 }).length, 0);
});

test('a words subject under the caption band fails; above it passes', () => {
  const cam: Cam = { pos: [0, 1.5, 0], look: [0, 1.5, -10], fov: 45 };
  const captions = { top: 0.64, bottom: 0.76 };
  const low: Subject = { name: 'slate', at: [0, 0.6, -4], r: 0.35 }, high: Subject = { name: 'slate', at: [0, 2.3, -4], r: 0.35 };
  const entry = [{ word: 'Nobody', f: 0, subjects: ['slate'], hold: 0, words: true }];
  const p = project(cam, low.at as V3);
  assert.ok((1 - p.y) / 2 > 0.6 && (1 - p.y) / 2 < 0.85, `the low slate sits at ${(1 - p.y) / 2} of the height`);
  const under = checkMustSee(() => cam, { slate: low }, entry, { captions });
  assert.ok(under.some(i => i.kind === 'under the caption'), JSON.stringify(under));
  assert.equal(checkMustSee(() => cam, { slate: high }, entry, { captions }).length, 0);
  // without words: true, or without a band, the caption is not checked
  assert.equal(checkMustSee(() => cam, { slate: low }, [{ ...entry[0], words: false }], { captions }).filter(i => i.kind === 'under the caption').length, 0);
  assert.equal(checkMustSee(() => cam, { slate: low }, entry).filter(i => i.kind === 'under the caption').length, 0);
});

test('checkSky: a rise into empty sky fails, a close-up against the sky and a planned look at the sun do not', () => {
  const ground = () => 0;
  const man: Subject = { name: 'him', at: [0, 1, -6], r: 0.9 };
  const level: Cam = { pos: [0, 1.6, 0], look: [0, 1.2, -6], fov: 45 };
  assert.equal(checkSky(() => level, 0, 0, [man], { ground }).length, 0);
  // risen to make room for a card: he sinks to the bottom edge under blank sky
  const risen: Cam = { pos: [0, 1.6, 0], look: [0, 4.2, -6], fov: 45 };
  const issues = checkSky(() => risen, 0, 0, [man], { ground });
  assert.ok(issues.length === 1 && issues[0].kind === 'empty sky', JSON.stringify(issues));
  // a close-up of a held thing against the sky: the subject covers the sky
  const loaf: Subject = { name: 'loaf', at: [0, 2.2, -0.6], r: 0.35 };
  assert.equal(checkSky(() => ({ pos: [0, 1.6, 0], look: [0, 2.2, -0.6], fov: 45 }), 0, 0, [loaf], { ground }).length, 0);
  // without ground, the pitch test: looking 30° up with nothing whole in frame fails unless planned
  const sun: Cam = { pos: [0, 1.6, 0], look: [0, 1.6 + Math.tan(Math.PI / 6) * 10, -10], fov: 45 };
  assert.equal(checkSky(() => sun, 0, 4, [man]).length, 5);
  assert.equal(checkSky(() => sun, 0, 4, [man], { planned: [[0, 4]] }).length, 0);
  // by layer runs
  assert.equal(checkSky([{ id: 'end', from: 0, to: 2, camAt: () => risen }], [man], { ground }).every(i => i.layer === 'end'), true);
});

test('must-see whole: a subject cut by an edge fails though its centre is in frame; under: its top stays below an overlay', () => {
  const cam: Cam = { pos: [0, 1.5, 0], look: [0, 1.5, -10], fov: 45 };
  const centred: Subject = { name: 'him', at: [0, 1.5, -6], r: 0.9 };
  const atEdge: Subject = { name: 'him', at: [1.35, 1.5, -6], r: 0.9 };   // centre in frame, his side past the right edge
  const entry = [{ word: 'stand', f: 0, subjects: ['him'], hold: 0, whole: true }];
  assert.equal(checkMustSee(() => cam, { him: centred }, entry).length, 0);
  assert.ok(onScreen(cam, atEdge, 0).visible, 'the centre is in frame');
  const cut = checkMustSee(() => cam, { him: atEdge }, entry);
  assert.ok(cut.length === 1 && cut[0].kind === 'cut by the edge' && /right/.test(cut[0].detail), JSON.stringify(cut));
  // without whole, the centre alone passes
  assert.equal(checkMustSee(() => cam, { him: atEdge }, [{ ...entry[0], whole: false }]).length, 0);
  // a card over the top third: his top must sit below 0.35 of the height
  const tall: Subject = { name: 'him', at: [0, 2.0, -6], r: 0.9 }, low: Subject = { name: 'him', at: [0, 0.6, -6], r: 0.7 };
  const card = [{ word: 'follow', f: 0, subjects: ['him'], hold: 0, under: 0.35 }];
  assert.ok(checkMustSee(() => cam, { him: tall }, card).some(i => i.kind === 'under the overlay'));
  assert.equal(checkMustSee(() => cam, { him: low }, card).length, 0);
});

test('checkLens groups: each kind of blocker has its own limits, and a span framed on purpose prints its reason', () => {
  const cam = (f: number): Cam => ({ pos: [0, 1.6, 4 - f * 0.02], look: [0, 1.5, -6], fov: 45 });
  // a painting on the wall about 5 m away fills a fifth of the height: clutter by the one outdoor limit, the room indoors
  const painting: Blocker = { c: [0.4, 2.0, -1.2], r: 0.45, name: 'a painting' };
  const desk: Blocker = { c: [-0.3, 1.0, 1.5], r: 0.5, name: 'the desk' };
  const one = checkLens(cam, 0, 40, [painting, desk]);
  assert.ok(one.some(i => /painting/.test(i.detail)), 'one limit flags the painting');
  const groups = [{ name: 'wall', blockers: [painting], near: 6, size: 0.3 }, { name: 'floor', blockers: [desk], near: 3, size: 0.15 }];
  const split = checkLens(cam, 0, 40, [], { groups });
  assert.ok(split.length > 0 && split.every(i => /floor: the desk/.test(i.detail)), JSON.stringify(split.slice(0, 2)));
  // the push past the desk is the shot: declared with its reason, it is no longer an issue and the reason is printed
  const framed = [{ from: 0, to: 40, why: 'the push past the desk onto the lamp is the join', group: 'floor' }];
  const ok = checkLens(cam, 0, 40, [], { groups, framed });
  assert.equal(ok.length, 0);
  assert.ok(ok.framed.length === 1 && /the desk up to \d+% on \d+ frame\(s\), framed on purpose: the push past the desk/.test(ok.framed[0]), ok.framed[0]);
  assert.throws(() => checkLens(cam, 0, 40, [], { groups, framed: [{ from: 0, to: 40, why: ' ' }] }), /no reason/);
});

test('headCut: the bottom edge through a head at any distance, a side edge only near; a named person at any distance', () => {
  const cam: Cam = { pos: [0, 1.6, 0], look: [0, 1.6, -10], fov: 45 };
  // a man 4 m away whose head the frame's bottom edge crosses (camera looking over him)
  const over: Cam = { pos: [0, 2.4, 0], look: [0, 4.2, -10], fov: 45 };
  assert.equal(headCut(over, [0, 0, -4], 1.78), 'bottom');
  // his head half out of the left edge at 4 m: cut; the same head whole inside: not
  const half = 4 * Math.tan(45 * Math.PI / 360) * 9 / 16;   // the frame's half-width at 4 m
  assert.equal(headCut(cam, [-half, 0, -4], 1.78), 'left');
  assert.equal(headCut(cam, [-half + 0.6, 0, -4], 1.78), null);
  // 12 m away and half out of the right edge: an extra may cross the edge whole, as people walk out of frames
  const far = 12 * Math.tan(45 * Math.PI / 360) * 9 / 16;
  assert.equal(headCut(cam, [far, 0, -12], 1.78), null);
  assert.equal(headCut(cam, [far, 0, -12], 1.78, { near: Infinity }), 'right');
  // checkHeads: the named person is reported at that distance, the extra is not (the story drops him)
  const people = [{ name: 'Joshua', feet: [far, 0, -12] as V3, height: 1.78, named: true }, { name: 'a soldier', feet: [far, 0, -12] as V3, height: 1.78 }];
  const issues = checkHeads(() => cam, 0, 2, people);
  assert.equal(issues.length, 3);
  assert.ok(issues.every(i => i.kind === 'head cut' && /Joshua/.test(i.detail) && /reframe/.test(i.detail)));
});

test('audit: a one-frame jump of the camera inside a run is a hard cut; a fast, steady flight is not', () => {
  // a roof camera easing in by 3 cm a frame, then jumping 2 m to a close-up in one frame (Mona Lisa r7, 35.367 s)
  const roof = (f: number): Cam => f < 30 ? { pos: [-4.6, 14, -10.3 - f * 0.001], look: [-2.5, 13.5, -14.9], fov: 46 } : { pos: [-3.77, 14.36, -12.18], look: [-2.51, 13.93, -14.89], fov: 44 };
  const j = audit(roof, 0, 45).filter(i => i.kind === 'jump');
  assert.ok(j.length === 1 && j[0].f === 30, JSON.stringify(j));
  assert.ok(turnDeg(roof(29), roof(30)) < 4, 'the turn limit alone does not see it');
  near(moveDeg(roof(29), roof(30)), 22, 2);
  // a far flight at 30 m a frame, steady: fast, but not a jump
  const flight = (f: number): Cam => ({ pos: [f * 30, 60, 0], look: [f * 30 + 50, 40, -20], fov: 50 });
  assert.equal(audit(flight, 0, 60).filter(i => i.kind === 'jump').length, 0);
});

test('matchOf reads a Match and a bearing off a camera already on screen; matchCam rebuilds the camera', () => {
  const face: Subject = { name: 'guard face', at: [0.4, 1.62, -12.4], r: 0.12 };
  const twoShot: Cam = { pos: [-2.35, 2.15, -8.55], look: [0.2, 1.62, -12.6], fov: 51 };
  const m = matchOf(twoShot, face);
  const k = matchCam(face, m.match, m.az, 0)[0];
  near(len(sub(k.pos, twoShot.pos)), 0, 1e-6, 'position');
  const a = project(twoShot, face.at as V3), b = project({ pos: k.pos, look: k.look, fov: k.fov }, face.at as V3);
  near(a.x, b.x, 0.01, 'x'); near(a.y, b.y, 0.01, 'y');
  near(m.match.size, onScreen(twoShot, face, 0).size, 0.01, 'size');
  // the other side copies it: another shape from another bearing lands on the same spot at the same size
  const head: Subject = { name: 'photographer head', at: [-2.5, 15.2, -14.9], r: 0.12 };
  const other = matchCam(head, m.match, 205, 0)[0], c = project({ pos: other.pos, look: other.look, fov: other.fov }, head.at as V3);
  near(c.x, a.x, 0.02, 'other x'); near(c.y, a.y, 0.02, 'other y');
  // too near: the shape wider than the frame cannot be matched
  assert.throws(() => matchOf({ pos: [0.4, 1.62, -12.1], look: [0.4, 1.62, -12.4], fov: 51 }, face), /wider than 95%/);
});
