// toon-kit camera: generic camera building blocks for any toon video (Remotion + Three.js).
//
// It carries no look of its own: no places, people, colours or styles. Every video designs those itself.
// What it gives every video:
//   - a smooth key path (Hermite through keys, `stop` keys hold still);
//   - shots written by subject: name what must be in frame, how big, and from where, and the camera is worked out
//     (`frameOn`, `shot`, `follow`), so the thing a line names cannot fall out of the frame;
//   - a safe camera: never under the ground, never inside a solid, always a usable "up" (`safe`, `upFor`);
//   - shots that join: a shape held at one screen spot and size from any bearing through a dissolve (`matchCam`), and a
//     pan from a fixed spot that keeps a moving subject (`track`);
//   - checks: the camera's turn speed and safety over a range of frames (`audit`), whether each promised
//     subject is in frame and big enough on its word (`checkMustSee`), and clutter at the lens on every frame
//     (`checkLens`);
//   - a card's reach aimed on the screen, not along the world (`cardReach`).
//
// Conventions: metres, +y up, -z is north. A compass bearing is degrees clockwise from north (90 = east).
// Pure maths, no Three.js import, so it runs in Node tests and in the browser alike.
// Synced into projects by `toon-world/scripts/sync-kit.mjs`. Change it in the skill, never in a project copy.

export type V3 = [number, number, number];
export interface Cam { pos: V3; look: V3; fov: number; roll?: number; up?: V3 }
export interface Key { f: number; pos: V3; look: V3; fov: number; roll?: number; stop?: boolean }

// ---- small maths ----------------------------------------------------------------------------------------------------
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const RAD = Math.PI / 180;
/** a unit direction from a compass bearing (degrees clockwise from north) and an elevation (degrees up) */
export const bearing = (az: number, el: number): V3 => {
  const a = az * RAD, e = el * RAD;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const Y: V3 = [0, 1, 0];

// ---- the key path ---------------------------------------------------------------------------------------------------
export const K = (f: number, pos: V3, look: V3, fov: number, roll = 0, stop = false): Key => ({ f, pos, look, fov, roll, stop });
/** one channel through (t, v) knots: Hermite, tangents from the neighbours, zero at the ends and at `stop` knots */
export function curve(ts: number[], vs: number[], t: number, stops?: boolean[]): number {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0; while (t > ts[i + 1]) i++;
  const m = (j: number) => (j <= 0 || j >= n - 1 || stops?.[j]) ? 0 : (vs[j + 1] - vs[j - 1]) / (ts[j + 1] - ts[j - 1]);
  const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m(i + 1);
}
/** like `curve`, for a channel that only rises (an angle turned so far): the tangents are limited so the curve never
 *  rises past a knot and comes back, which on a view would turn past a key's direction and swing back */
function riseCurve(ts: number[], vs: number[], t: number, stops?: boolean[]): number {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0; while (t > ts[i + 1]) i++;
  const d = (j: number) => (vs[j + 1] - vs[j]) / (ts[j + 1] - ts[j]);
  const m = (j: number) => {
    if (j <= 0 || j >= n - 1 || stops?.[j]) return 0;
    const a = d(j - 1), b = d(j);
    if (a <= 0 || b <= 0) return 0;
    const h0 = ts[j] - ts[j - 1], h1 = ts[j + 1] - ts[j], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m(i + 1);
}
/** turn direction u toward direction v by k of the angle between them, along the great circle (k may run a little
 *  past 0 or 1). Opposite directions turn over the top (world up), or about east when they point straight up/down. */
export function slerp(u: V3, v: V3, k: number): V3 {
  const th = Math.acos(clamp(dot(u, v), -1, 1));
  if (th < 1e-6) return v;
  let n = cross(u, v);
  if (len(n) < 1e-6) { n = cross(u, Y); if (len(n) < 1e-6) n = cross(u, [1, 0, 0]); }
  n = norm(n);
  // rotate u about n: u stays square to n, so (n x u) points along the arc toward v
  return norm(add(scale(u, Math.cos(k * th)), scale(cross(n, u), Math.sin(k * th))));
}
/** The camera at frame f along keys sorted by frame. Position, fov and roll run through the keys on smooth curves.
 *  The view is NOT blended through the look points: it blends the view direction (along the great circle, at a speed
 *  eased through the keys like the other channels) and, separately, the look distance. Look points at very different
 *  distances (a flame 2.6 m away next to keys looking 60 m out; Gibeon frame 1359) used to swing the blended look
 *  point through the camera and flip the picture 175° in one frame; blending direction and distance apart cannot. */
export function path(keys: Key[], f: number): Cam {
  const n = keys.length, ts = keys.map(k => k.f), st = keys.map(k => !!k.stop);
  const ch = (vs: number[]) => curve(ts, vs, f, st);
  const pos: V3 = [ch(keys.map(k => k.pos[0])), ch(keys.map(k => k.pos[1])), ch(keys.map(k => k.pos[2]))];
  const dirs = keys.map(k => norm(sub(k.look, k.pos)));
  // the look distance on a log scale, so it eases evenly between 15 m and 600 m and can never reach zero
  const reach = Math.exp(ch(keys.map(k => Math.log(Math.max(1e-3, len(sub(k.look, k.pos)))))));
  let dir: V3;
  if (f <= ts[0]) dir = dirs[0];
  else if (f >= ts[n - 1]) dir = dirs[n - 1];
  else {
    // the angle turned so far, as one channel through the keys: its curve gives the turn's speed, eased like the rest,
    // and never runs past a key (a fast turn into a key that then holds still must stop on the key, not swing past)
    const A = [0];
    for (let i = 1; i < n; i++) A.push(A[i - 1] + Math.acos(clamp(dot(dirs[i - 1], dirs[i]), -1, 1)));
    const a = riseCurve(ts, A, f, st);
    let i = 0; while (f > ts[i + 1]) i++;
    const span = A[i + 1] - A[i];
    dir = span < 1e-9 ? dirs[i] : slerp(dirs[i], dirs[i + 1], (a - A[i]) / span);
  }
  return { pos, look: add(pos, scale(dir, reach)), fov: ch(keys.map(k => k.fov)), roll: ch(keys.map(k => k.roll ?? 0)) };
}

// ---- "up" that never fails ------------------------------------------------------------------------------------------
/** World up, except when the camera looks within about 10° of straight up or down. There world up and the view line
 *  are nearly parallel and the picture can spin or flip (the Gibeon map turned upside down this way). Near vertical,
 *  up blends to `heading` (default north, -z), so the top of the frame is a fixed compass direction. */
export function upFor(pos: V3, look: V3, heading: V3 = [0, 0, -1]): V3 {
  const fwd = norm(sub(look, pos));
  const s = Math.abs(dot(fwd, Y));
  if (s < 0.985) return Y;
  const h = norm([heading[0], 0, heading[2]]);
  const k = clamp((s - 0.985) / 0.015);
  const raw = mix(Y, fwd[1] < 0 ? h : scale(h, -1), k);
  // remove the part along the view line, so up is square to it
  return norm(sub(raw, scale(fwd, dot(raw, fwd))));
}

// ---- the safe camera ------------------------------------------------------------------------------------------------
export interface Box { min: V3; max: V3; name?: string }
export interface Safety {
  /** terrain height at (x, z); the camera stays `clearance` above it */
  ground?: (x: number, z: number) => number;
  /** metres kept from the ground and from solids (default 0.3) */
  clearance?: number;
  /** boxes the camera may never be inside (walls, towers, roofs) */
  solids?: Box[];
  /** the compass direction at the top of the frame when looking straight down (default north) */
  heading?: V3;
}
export interface SafeCam extends Cam { up: V3; fixed: string[] }
/** The camera moved to the nearest safe spot (above the ground, outside every solid) with a usable up. `fixed` says
 *  what was corrected, so a check can report it: a correction means the shot was planned through something. */
export function safe(c: Cam, s: Safety = {}): SafeCam {
  const clear = s.clearance ?? 0.3, fixed: string[] = [];
  let p: V3 = [...c.pos];
  for (const b of s.solids ?? []) {
    const lo = sub(b.min, [clear, clear, clear]), hi = add(b.max, [clear, clear, clear]);
    if (p[0] > lo[0] && p[0] < hi[0] && p[1] > lo[1] && p[1] < hi[1] && p[2] > lo[2] && p[2] < hi[2]) {
      // out along the axis with the least way to go
      const ways: [number, number, number][] = [[0, lo[0], p[0] - lo[0]], [0, hi[0], hi[0] - p[0]], [1, lo[1], p[1] - lo[1]], [1, hi[1], hi[1] - p[1]], [2, lo[2], p[2] - lo[2]], [2, hi[2], hi[2] - p[2]]];
      ways.sort((a, b2) => a[2] - b2[2]);
      const [ax, to] = ways[0];
      p = [...p]; p[ax] = to;
      fixed.push(`inside ${b.name ?? 'solid'}`);
    }
  }
  if (s.ground) {
    const gy = s.ground(p[0], p[2]) + clear;
    if (p[1] < gy) { p = [p[0], gy, p[2]]; fixed.push('under ground'); }
  }
  return { ...c, pos: p, up: c.up ?? upFor(p, c.look, s.heading), fixed };
}

// ---- shots by subject -----------------------------------------------------------------------------------------------
/** Something that must be seen: a point (or a path in time) and a radius that wraps it (a person about 0.9, a hand
 *  prop about 0.2). Give it the same name the plan's "must see" list uses. */
export interface Subject { name: string; at: V3 | ((f: number) => V3); r: number }
export interface Framing {
  subjects: Subject[];
  /** how much of the frame's height the group fills: 0.15 a wide shot, 0.4 a medium, 0.8 a close-up */
  size: number;
  /** compass bearing from the group to the camera, degrees (180 = camera south of the group, looking north) */
  az: number;
  /** camera elevation above the group, degrees (0 eye level, 30 a high angle, 89 almost straight down) */
  el: number;
  /** vertical field of view, degrees (default 45) */
  fov?: number;
  /** frame width over height (default 9/16, a phone) */
  aspect?: number;
  /** where the group's centre sits in the frame, x and y from -1 to 1 (default the centre; [0, -0.3] is lower) */
  at?: [number, number];
}
export const posOf = (s: Subject, f: number): V3 => typeof s.at === 'function' ? s.at(f) : s.at;
/** the centre and radius of one sphere around every subject */
export function enclose(subjects: Subject[], f: number): { c: V3; r: number } {
  if (!subjects.length) throw new Error('frameOn needs at least one subject');
  const ps = subjects.map(s => posOf(s, f));
  const c = scale(ps.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 1 / ps.length);
  const r = Math.max(...subjects.map((s, i) => len(sub(ps[i], c)) + s.r));
  return { c, r };
}
/** The camera that shows the subjects at `size` of the frame height, seen from bearing `az` and elevation `el`.
 *  The group also always fits the frame's width. */
export function frameOn(fr: Framing, f: number): Cam & { up: V3 } {
  const fov = fr.fov ?? 45, aspect = fr.aspect ?? 9 / 16;
  const { c, r } = enclose(fr.subjects, f);
  const v = fov * RAD, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const want = clamp(fr.size, 0.02, 0.98) * v;
  const d = Math.max(r / Math.sin(want / 2), r / Math.sin(0.95 * h / 2));
  const pos = add(c, scale(bearing(fr.az, fr.el), d));
  const heading = scale(bearing(fr.az, 0), -1);   // looking down, the top of the frame is away from the camera
  const up = upFor(pos, c, heading);
  const fwd = norm(sub(c, pos)), right = norm(cross(fwd, up)), camUp = cross(right, fwd);
  const [ax, ay] = fr.at ?? [0, 0];
  let look = sub(c, add(scale(right, ax * Math.tan(h / 2) * d), scale(camUp, ay * Math.tan(v / 2) * d)));
  // turning the view changes the perspective, so the first aim is close but not exact: correct it a few times
  for (let i = 0; i < 6 && (ax || ay); i++) {
    const p = project({ pos, look, fov, up }, c, aspect);
    const f2 = norm(sub(look, pos)), r2 = norm(cross(f2, up)), u2 = cross(r2, f2);
    look = add(look, add(scale(r2, (p.x - ax) * Math.tan(h / 2) * d), scale(u2, (p.y - ay) * Math.tan(v / 2) * d)));
  }
  return { pos, look, fov, up };
}
/** a key on frame f (put f on a word of the voice) that frames the subjects */
export function shot(f: number, fr: Framing, stop = false): Key {
  const c = frameOn(fr, f);
  return K(f, c.pos, c.look, c.fov, 0, stop);
}
/** keys every `every` frames from a to b that keep framing moving subjects (a walk, a column on the march) */
export function follow(fr: Framing, a: number, b: number, every = 6): Key[] {
  const out: Key[] = [];
  for (let f = a; f < b; f += every) out.push(shot(f, fr));
  out.push(shot(b, fr));
  return out;
}

// ---- shots that join --------------------------------------------------------------------------------------------------
/** How a matched shape sits in the frame: the same on both sides of a shape-matched dissolve. */
export interface Match {
  /** share of the frame height the shape fills (its radius `r` sets the distance) */
  size: number;
  /** camera elevation above the shape, degrees (default 6) */
  el?: number;
  /** where the shape sits in the frame, x and y from -1 to 1 (default the centre) */
  at?: [number, number];
  /** vertical field of view, degrees (default 40) */
  fov?: number;
  /** frame width over height (default 9/16) */
  aspect?: number;
}
/** The camera that puts a shape (a flame, a wheel, a coin, a moon) at the same screen spot and the same size from any
 *  compass bearing: the distance, height, aim and lens are the same for every bearing, so only the world behind it
 *  changes. Give both sides of a shape-matched dissolve the same `Match` and each its own shape and bearing, and hold
 *  both from before the overlap starts until after it ends: a camera still travelling onto its shape during the
 *  overlap puts the two shapes in different places and the join reads as a plain dissolve (Gibeon r3, 45.0 s; held
 *  this way the two flames share one screen point, frames 1344 to 1366).
 *  `az` is one bearing, or [from, to] to drift slowly across the hold. A moving shape (a torch in a marching column) is
 *  followed: keys every `every` frames (default 1, so a moving shape stays on its spot between keys) from a to b.
 *  Returns the keys; a === b gives one key. */
export function matchCam(shape: Subject, m: Match, az: number | [number, number], a: number, b = a, every = 1): Key[] {
  const [az0, az1] = typeof az === 'number' ? [az, az] : az, out: Key[] = [];
  for (let f = a; ; f = Math.min(b, f + every)) {
    const k = b > a ? (f - a) / (b - a) : 0;
    const c = frameOn({ subjects: [shape], size: m.size, az: lerp(az0, az1, k), el: m.el ?? 6, fov: m.fov ?? 40, aspect: m.aspect, at: m.at }, f);
    out.push(K(f, c.pos, c.look, c.fov));
    if (f >= b) break;
  }
  return out;
}
/** A pan from a fixed spot whose view stays on a moving subject: the shot for a stairwell, a hall or a corridor, where
 *  `follow`'s fixed bearing would put the camera through a wall. Keys every `every` frames (default 4) from a to b.
 *  It refuses a subject whose path jumps inside [a, b] (more than `maxStep` metres in one frame, default 0.5; a run is
 *  about 0.25): a subject handed from one path to another (the landing's copy of a person to the hall's) swings a pan
 *  keyed across the hand-over through the gap in one frame (Mona Lisa r4: the hall pan started 0.04 s before he
 *  reached the hall and turned 33° in one frame). Start the track after the jump, or end it before. */
export function track(pos: V3, s: Subject, a: number, b: number, opts: { fov?: number; every?: number; maxStep?: number } = {}): Key[] {
  const every = opts.every ?? 4, maxStep = opts.maxStep ?? 0.5, fov = opts.fov ?? 45;
  for (let f = a; f < b; f++) {
    const step = len(sub(posOf(s, f + 1), posOf(s, f)));
    if (step > maxStep) throw new Error(`track: ${s.name} jumps ${step.toFixed(2)} m between frames ${f} and ${f + 1}; start the track after the jump or end it before`);
  }
  const out: Key[] = [];
  for (let f = a; ; f = Math.min(b, f + every)) {
    out.push(K(f, pos, posOf(s, f), fov));
    if (f >= b) break;
  }
  return out;
}

// ---- journeys that show where they go -------------------------------------------------------------------------------
const smoother = (k: number) => { const c = clamp(k); return c * c * c * (c * (6 * c - 15) + 10); };
/** A journey to a far place that keeps the destination in sight, so the viewer sees where it is and how far (Vincent,
 *  9 November 2026: "zoom out ... then zoom in directly, maybe at the horizon, and there we can find the next city").
 *  From the `start` camera the view turns onto the destination over `turn` frames (default 12), then the camera
 *  travels to the destination's framing at frame b, looking at it all the way. `lift` raises the middle of the flight
 *  (metres) to see over what lies between. Replaces the rise into the sky and the fall onto the next place.
 *  A big turn takes a frame for every 3°; `seenFrom` on the result says when the destination comes into view. */
export function approach(a: number, b: number, start: Cam, dest: Framing, opts: { turn?: number; every?: number; lift?: number } = {}): Key[] & { seenFrom: number } {
  const every = opts.every ?? 2, lift = opts.lift ?? 0;
  const end = frameOn(dest, b), out: Key[] = [];
  // the turn takes at least a frame for every 3° (the smooth ease peaks near 6° a frame), never more than half the flight
  const d0 = norm(sub(start.look, start.pos)), d1 = norm(sub(enclose(dest.subjects, a).c, start.pos));
  const angle = Math.acos(clamp(dot(d0, d1), -1, 1)) / RAD;
  const turn = Math.min(Math.max(opts.turn ?? 12, angle / 3), (b - a) / 2);
  const reach = clamp(len(sub(start.look, start.pos)), 5, 60);
  for (let f = a; ; f = Math.min(b, f + every)) {
    const k = (f - a) / (b - a), e = smoother(k);
    const c = enclose(dest.subjects, f).c;
    const pos = add(mix(start.pos, end.pos, e), [0, lift * Math.sin(Math.PI * k), 0]);
    // the look point stays a fixed distance ahead and only its direction changes
    const target = f - a < turn ? c : mix(c, end.look, smoother((f - a - turn) / Math.max(1, b - a - turn)));
    const dir = f - a < turn ? slerp(d0, norm(sub(c, pos)), smoother((f - a) / turn)) : norm(sub(target, pos));
    const look = add(pos, scale(dir, reach));
    out.push(K(f, pos, look, lerp(start.fov, end.fov, e), 0, f === a || f === b));
    if (f === b) break;
  }
  // seenFrom: the first frame the destination is in view; promise it in the must-see list from there to b
  return Object.assign(out, { seenFrom: a + Math.ceil(turn) });
}

// ---- what is on screen ----------------------------------------------------------------------------------------------
/** where a world point lands: x and y from -1 to 1 across the frame (y up), z its distance in front of the lens
 *  (negative is behind). Roll is ignored. */
export function project(c: Cam, p: V3, aspect = 9 / 16): { x: number; y: number; z: number } {
  const up0 = c.up ?? upFor(c.pos, c.look);
  const fwd = norm(sub(c.look, c.pos)), right = norm(cross(fwd, up0)), camUp = cross(right, fwd);
  const rel = sub(p, c.pos), z = dot(rel, fwd);
  const v = c.fov * RAD, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return { x: dot(rel, right) / (z * Math.tan(h / 2)), y: dot(rel, camUp) / (z * Math.tan(v / 2)), z };
}
/** whether a subject is in frame at frame f and how much of the frame's height it fills */
export function onScreen(c: Cam, s: Subject, f: number, aspect = 9 / 16): { visible: boolean; size: number; x: number; y: number } {
  const pr = project(c, posOf(s, f), aspect);
  if (pr.z <= s.r * 0.5) return { visible: false, size: 0, x: pr.x, y: pr.y };
  const size = 2 * Math.atan(s.r / pr.z) / (c.fov * RAD);
  return { visible: Math.abs(pr.x) <= 1 && Math.abs(pr.y) <= 1, size, x: pr.x, y: pr.y };
}

/** Where a card's hand should reach to point at, touch or hand something to a world target, as offsets in metres on
 *  the card's own plane: `side` to screen right and `up` to screen up, measured from `from` (the card's feet, or its
 *  shoulder) at the card's depth. The offsets are taken on the screen, not along the world's right: a card near the
 *  frame's edge sees a farther target on the other side of the screen from where the world's right puts it, and its
 *  arm points off the frame (Mona Lisa r4, 33.8 s: the painter at the left edge pointed away from the hooks). The
 *  story turns the metres into its drawing's units and clamps them to the arm's reach. */
export function cardReach(c: Cam, from: V3, target: V3, aspect = 9 / 16): { side: number; up: number; depth: number } {
  const p = project(c, from, aspect), t = project(c, target, aspect);
  const v = c.fov * RAD, h = 2 * Math.atan(Math.tan(v / 2) * aspect), depth = Math.max(0.05, p.z);
  // a target behind the lens has no screen place: point along the world instead (the sign flips behind the lens)
  if (t.z <= 0.05) {
    const up0 = c.up ?? upFor(c.pos, c.look), fwd = norm(sub(c.look, c.pos)), right = norm(cross(fwd, up0)), camUp = cross(right, fwd);
    const d = sub(target, from);
    return { side: dot(d, right), up: dot(d, camUp), depth };
  }
  return { side: (t.x - p.x) * Math.tan(h / 2) * depth, up: (t.y - p.y) * Math.tan(v / 2) * depth, depth };
}

// ---- checks ---------------------------------------------------------------------------------------------------------
export interface Issue { f: number; kind: 'under ground' | 'inside solid' | 'turn' | 'missing' | 'too small' | 'blocked' | 'in the way' | 'near the lens' | 'state'; detail: string }
/** degrees the view line turns between two cameras */
export function turnDeg(a: Cam, b: Cam): number {
  const x = norm(sub(a.look, a.pos)), y = norm(sub(b.look, b.pos));
  return Math.acos(clamp(dot(x, y), -1, 1)) / RAD;
}
/** Every frame from a to b: where the planned camera had to be corrected (under ground, inside a solid) and where it
 *  turns faster than `maxTurn` degrees a frame (default 4, about 120° a second at 30 fps) outside a planned whip. */
export function audit(camAt: (f: number) => Cam, a: number, b: number, s: Safety & { maxTurn?: number; whips?: [number, number][] } = {}): Issue[] {
  const out: Issue[] = [], max = s.maxTurn ?? 4;
  let prev: Cam | null = null;
  for (let f = a; f <= b; f++) {
    const c = camAt(f), r = safe(c, s);
    for (const why of r.fixed) out.push({ f, kind: why === 'under ground' ? 'under ground' : 'inside solid', detail: why });
    if (prev) {
      const t = turnDeg(prev, c);
      const whip = (s.whips ?? []).some(([w0, w1]) => f >= w0 && f <= w1);
      if (t > max && !whip) out.push({ f, kind: 'turn', detail: `${t.toFixed(1)}° in one frame` });
    }
    prev = c;
  }
  return out;
}
/** One promise per line from the plan: on frame f (the word's first frame, never later: an entry keyed after its word
 *  lets a late move pass while the word shows something else), these subjects are in frame, each at least `size` of
 *  the frame's height. The default is 0.08, about what reads on a phone; with `words: true` (a clock, a calendar, a
 *  sign, a label: the viewer must read it) it is 0.10, because a clock at 6% and a calendar at 5% passed and nobody
 *  could read them (Mona Lisa r3, 24.8 s and 41.0 s; at 12% they read). */
export interface MustSee { word: string; f: number; subjects: string[]; size?: number; hold?: number; words?: boolean }
export const MUST_SEE_SIZE = 0.08, WORDS_SIZE = 0.10;
/** Something solid that can stand in the way: a sphere around a rock, a bush, a pillar, or a person who is not the
 *  subject (people move, so `c` may be a function of the frame, like a subject's `at`). Give the same positions the
 *  scene draws from, so the check and the picture cannot disagree. */
export interface Blocker { c: V3 | ((f: number) => V3); r: number; name?: string }
export const blockerAt = (b: Blocker, f: number): V3 => typeof b.c === 'function' ? b.c(f) : b.c;
export interface MustSeeOptions {
  aspect?: number;
  /** solids that may hide a subject or crowd the lens */
  blockers?: Blocker[];
  /** a blocker nearer than every subject that fills more than this share of the frame height is in the way
   *  (default 0.25: a rock taking a quarter of the frame in front of the column) */
  clutter?: number;
}
/** whether the straight line from the lens to a subject passes through a blocker (one that holds the lens or the
 *  subject itself does not count) */
function hides(c: Cam, s: Subject, f: number, b: Blocker): boolean {
  const target = posOf(s, f), d = sub(target, c.pos), L = len(d), bc = blockerAt(b, f);
  if (len(sub(c.pos, bc)) <= b.r || len(sub(target, bc)) <= b.r + s.r) return false;
  const dir = scale(d, 1 / L), t = clamp(dot(sub(bc, c.pos), dir), 0, Math.max(0, L - s.r));
  return len(sub(bc, add(c.pos, scale(dir, t)))) < b.r;
}
/** Checks each promise from its word for `hold` frames (default 6, a fifth of a second): every subject in frame, big
 *  enough, not hidden behind a blocker, and no blocker crowding the lens in front of them. */
export function checkMustSee(camAt: (f: number) => Cam, subjects: Record<string, Subject>, must: MustSee[], opts: MustSeeOptions = {}): Issue[] {
  const out: Issue[] = [], aspect = opts.aspect ?? 9 / 16, blockers = opts.blockers ?? [], clutter = opts.clutter ?? 0.25;
  for (const p of must) {
    for (let f = p.f; f <= p.f + (p.hold ?? 6); f++) {
      const c = camAt(f);
      let nearest = Infinity;
      for (const name of p.subjects) {
        const s = subjects[name];
        if (!s) { out.push({ f, kind: 'missing', detail: `"${p.word}": no subject named ${name}` }); continue; }
        const o = onScreen(c, s, f, aspect);
        nearest = Math.min(nearest, project(c, posOf(s, f), aspect).z - s.r);
        if (!o.visible) { out.push({ f, kind: 'missing', detail: `"${p.word}": ${name} is out of frame` }); continue; }
        if (o.size < (p.size ?? (p.words ? WORDS_SIZE : MUST_SEE_SIZE))) out.push({ f, kind: 'too small', detail: `"${p.word}": ${name} fills ${(o.size * 100).toFixed(0)}% of the height` });
        const b = blockers.find(bl => hides(c, s, f, bl));
        if (b) out.push({ f, kind: 'blocked', detail: `"${p.word}": ${name} is behind ${b.name ?? 'a blocker'}` });
      }
      for (const b of blockers) {
        const bc = blockerAt(b, f);
        const o = onScreen(c, { name: b.name ?? 'blocker', at: bc, r: b.r }, f, aspect);
        const z = project(c, bc, aspect).z;
        if (o.visible && z < nearest && o.size > clutter) {
          out.push({ f, kind: 'in the way', detail: `"${p.word}": ${b.name ?? 'a blocker'} fills ${(o.size * 100).toFixed(0)}% of the frame in front of the subject` });
          break;
        }
      }
    }
  }
  return out;
}
/** Clutter at the lens on EVERY frame from a to b, not only on must-see words: anything (a rock, a bush, a torch pole,
 *  a person) within `near` metres of the lens (default 6) that fills more than `size` of the frame height (default
 *  0.15). `checkMustSee` looks only on each word and its hold, so a rock that crosses the lens between two words
 *  passes it (Gibeon r3: a rock across the lens at 45.4 to 46.2 s; run on every frame, this found a bush 5.4 m away
 *  filling 17% at 45.8 s). Pass the camera of each layer that is on screen, dissolves included. One issue a frame. */
export function checkLens(camAt: (f: number) => Cam, a: number, b: number, blockers: Blocker[], opts: { near?: number; size?: number; aspect?: number } = {}): Issue[] {
  const out: Issue[] = [], near = opts.near ?? 6, size = opts.size ?? 0.15, aspect = opts.aspect ?? 9 / 16;
  for (let f = a; f <= b; f++) {
    const c = camAt(f);
    for (const bl of blockers) {
      const bc = blockerAt(bl, f), d = len(sub(bc, c.pos));
      if (d > near) continue;
      const o = onScreen(c, { name: bl.name ?? 'blocker', at: bc, r: bl.r }, f, aspect);
      if (o.visible && o.size > size) {
        out.push({ f, kind: 'near the lens', detail: `${bl.name ?? 'a blocker'} ${d.toFixed(1)} m from the lens fills ${(o.size * 100).toFixed(0)}% of the height` });
        break;
      }
    }
  }
  return out;
}
