// Run: node --test general-tools/skills/toon-world/kit/camera.test.ts   (Node 22.6+ strips the types itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, path, safe, upFor, frameOn, shot, follow, onScreen, project, audit, checkMustSee, turnDeg, norm, sub, dot, cross, type Subject, type V3, type Cam } from './camera.ts';

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
