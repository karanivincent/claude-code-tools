// toon-kit camera: generic camera building blocks for any toon video (Remotion + Three.js).
//
// It carries no look of its own: no places, people, colours or styles. Every video designs those itself.
// What it gives every video:
//   - a smooth key path (Hermite through keys, `stop` keys hold still);
//   - shots written by subject: name what must be in frame, how big, and from where, and the camera is worked out
//     (`frameOn`, `shot`, `follow`), so the thing a line names cannot fall out of the frame;
//   - a safe camera: never under the ground, never inside a solid, always a usable "up" (`safe`, `upFor`);
//   - shots that join: a shape held at one screen spot and size from any bearing through a dissolve (`matchCam`, aimed
//     at where the shape is drawn with `screenFix`, its settings read off a camera already on screen with `matchOf`),
//     the camera turned 180° about an opening for a join through a door (`mirrorAbout`), and a pan that keeps a moving
//     subject, from a fixed spot or backing along a line (`track`);
//   - checks: the camera's turn speed, position jumps and safety over a range of frames (`audit`), whether each
//     promised subject is in frame, big enough, whole and clear of the captions and overlays on its word
//     (`checkMustSee`), clutter at the lens on every frame in groups with their own limits (`checkLens`), heads cut by
//     the frame's edges (`headCut`, `checkHeads`), a look into empty sky (`checkSky`), each layer of a dissolve with its
//     own camera (`layerRuns`), and how much the picture moves on screen each second against the video's dynamics
//     profile (`screenMotion`, `checkMotion`);
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
/** like `curve`, but it never runs past a knot and comes back: a knot between a rise and a fall (or a hold) gets a zero
 *  tangent, and the others a weighted harmonic mean of the slopes either side (monotone cubic). Used for the angle a
 *  view has turned, and for a look point: on a view, running past a key turns past its aim and swings back (Gibeon
 *  r4: a look point arriving on a torch that then held still ran on past it by a degree and came back) */
function monoCurve(ts: number[], vs: number[], t: number, stops?: boolean[]): number {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0; while (t > ts[i + 1]) i++;
  const d = (j: number) => (vs[j + 1] - vs[j]) / (ts[j + 1] - ts[j]);
  const m = (j: number) => {
    if (j <= 0 || j >= n - 1 || stops?.[j]) return 0;
    const a = d(j - 1), b = d(j);
    if (a * b <= 0) return 0;
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
/** Whether two neighbouring keys blend their look points (true) or their view directions (false). Look points closer
 *  together than half the nearer key's look distance are blended as points: a camera moving round a still, near
 *  subject keeps it on the same spot only that way (Gibeon r4, frame 711: blending directions let a loaf 1.3 m away
 *  drift 10° and leave the frame at 23.7 s). Look points far apart against their distances (a flame 15 m away next to
 *  keys looking 600 m out) blend direction and distance apart, which cannot swing the view through the camera. */
export const NEAR_LOOKS = 0.5;
export function looksClose(a: Key, b: Key): boolean {
  const ra = len(sub(a.look, a.pos)), rb = len(sub(b.look, b.pos));
  return len(sub(a.look, b.look)) <= NEAR_LOOKS * Math.min(ra, rb);
}
/** The camera at frame f along keys sorted by frame. Position, fov and roll run through the keys on smooth curves.
 *  The view between two keys is blended one of two ways (`looksClose`):
 *  - look points near each other: the look point itself runs on a smooth curve through the run of such keys, so a
 *    still subject the camera moves round or pushes in on stays where it is in the frame;
 *  - look points far apart against their distances: the view direction turns along the great circle (at a speed eased
 *    through the keys like the other channels) and the look distance blends apart from it. Look points at very
 *    different distances (a flame 2.6 m away next to keys looking 60 m out; Gibeon frame 1359) used to swing the
 *    blended look point through the camera and flip the picture 175° in one frame; this way cannot. */
export function path(keys: Key[], f: number): Cam {
  const n = keys.length, ts = keys.map(k => k.f), st = keys.map(k => !!k.stop);
  const ch = (vs: number[]) => curve(ts, vs, f, st);
  const pos: V3 = [ch(keys.map(k => k.pos[0])), ch(keys.map(k => k.pos[1])), ch(keys.map(k => k.pos[2]))];
  const fov = ch(keys.map(k => k.fov)), roll = ch(keys.map(k => k.roll ?? 0));
  if (n === 1 || f <= ts[0] || f >= ts[n - 1]) {
    const k = f >= ts[n - 1] ? keys[n - 1] : keys[0];
    return { pos, look: add(pos, sub(k.look, k.pos)), fov, roll };
  }
  let i = 0; while (f > ts[i + 1]) i++;
  if (looksClose(keys[i], keys[i + 1])) {
    // the run of keys joined by close look points around this span: the look point's curve uses only those keys, so a
    // far key next to the run cannot pull a tangent through it, and it never runs past a key's look point
    let s0 = i, s1 = i + 1;
    while (s0 > 0 && looksClose(keys[s0 - 1], keys[s0])) s0--;
    while (s1 < n - 1 && looksClose(keys[s1], keys[s1 + 1])) s1++;
    const run = keys.slice(s0, s1 + 1), rt = run.map(k => k.f), rs = run.map(k => !!k.stop);
    const lc = (j: number) => monoCurve(rt, run.map(k => k.look[j]), f, rs);
    return { pos, look: [lc(0), lc(1), lc(2)], fov, roll };
  }
  const dirs = keys.map(k => norm(sub(k.look, k.pos)));
  // the look distance on a log scale, so it eases evenly between 15 m and 600 m and can never reach zero
  const reach = Math.exp(ch(keys.map(k => Math.log(Math.max(1e-3, len(sub(k.look, k.pos)))))));
  // the angle turned so far, as one channel through the keys: its curve gives the turn's speed, eased like the rest,
  // and never runs past a key (a fast turn into a key that then holds still must stop on the key, not swing past)
  const A = [0];
  for (let j = 1; j < n; j++) A.push(A[j - 1] + Math.acos(clamp(dot(dirs[j - 1], dirs[j]), -1, 1)));
  const a = monoCurve(ts, A, f, st);
  const span = A[i + 1] - A[i];
  const dir = span < 1e-9 ? dirs[i] : slerp(dirs[i], dirs[i + 1], (a - A[i]) / span);
  return { pos, look: add(pos, scale(dir, reach)), fov, roll };
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
 *  prop about 0.2). Give it the same name the plan's "must see" list uses. The radius may follow the frame too, for a
 *  thing that grows or is scaled to keep its screen size (a board scaled during a crane; Gibeon r4 could not write a
 *  must-see entry for its DAY board while `r` had to be one number). */
export interface Subject { name: string; at: V3 | ((f: number) => V3); r: number | ((f: number) => number) }
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
export const radOf = (s: Subject, f: number): number => typeof s.r === 'function' ? s.r(f) : s.r;
/** the centre and radius of one sphere around every subject */
export function enclose(subjects: Subject[], f: number): { c: V3; r: number } {
  if (!subjects.length) throw new Error('frameOn needs at least one subject');
  const ps = subjects.map(s => posOf(s, f));
  const c = scale(ps.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 1 / ps.length);
  const r = Math.max(...subjects.map((s, i) => len(sub(ps[i], c)) + radOf(s, f)));
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
const smoother = (k: number) => { const c = clamp(k); return c * c * c * (c * (6 * c - 15) + 10); };
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
/** The world offset from a shape's typed point to where the shape is actually drawn, from one rendered frame: aim
 *  `matchCam` at `at + screenFix(...)` and the drawn shape lands on the `Match` spot. A shape a card holds (a torch's
 *  flame, a lamp) is drawn where the card's hand puts it, which moves with the camera's bearing, so a typed point
 *  misses: Gibeon r4's flame join missed by a quarter of the frame on its first try, with the cores at (0.27, 0.44)
 *  and (0.25, 0.52) of the frame; one correction a side put both at (0.49, 0.46). `cam` is the camera of the rendered
 *  frame, `at` the point it was aimed at, `drawn` where the shape's centre was measured on that frame, as shares of
 *  the width and height from the top-left corner (pixels over the frame's size). The offset lies square to the view at
 *  the point's distance. Measure one frame per side of the join, correct once, and look again. */
export function screenFix(cam: Cam, at: V3, drawn: [number, number], aspect = 9 / 16): V3 {
  const p = project(cam, at, aspect), z = Math.max(0.05, p.z);
  const up0 = cam.up ?? upFor(cam.pos, cam.look), fwd = norm(sub(cam.look, cam.pos)), right = norm(cross(fwd, up0)), camUp = cross(right, fwd);
  const v = cam.fov * RAD, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const dx = (2 * drawn[0] - 1) - p.x, dy = (1 - 2 * drawn[1]) - p.y;
  return add(scale(right, dx * Math.tan(h / 2) * z), scale(camUp, dy * Math.tan(v / 2) * z));
}
/** The camera (or key) turned 180° about the upright line through `axis` (an opening's centre: a door, a gate, an
 *  arch). An opening that is symmetric about that line lands at the same place and size in the frame from the other
 *  side, so a 6 to 8 frame dissolve from the camera on one side to its turned copy on the other is a shape-matched
 *  join through the door, with the person on the threshold in both layers. Riding through the opening instead needed
 *  a white wash or a dark frame to hide the change of sets (Mona Lisa r5: 0.4 s of milky cream, the palest moment in
 *  the film; turned, the doorway held its place across 22.77 to 23.33 s at brightness 145 to 151). */
export function mirrorAbout<T extends { pos: V3; look: V3 }>(c: T, axis: V3): T {
  const m = (p: V3): V3 => [2 * axis[0] - p[0], p[1], 2 * axis[2] - p[2]];
  return { ...c, pos: m(c.pos), look: m(c.look) };
}
/** A pan from a fixed spot whose view stays on a moving subject: the shot for a stairwell, a hall or a corridor, where
 *  `follow`'s fixed bearing would put the camera through a wall. Keys every `every` frames (default 4) from a to b.
 *  With `to`, the camera moves from `pos` to `to` at an even speed over the track instead of standing still (and the
 *  lens from `fov` to `fov1`), looking `up` metres above the subject's centre: the shot for a walk toward or away from
 *  the lens. Back the camera along the walk more slowly than the walker, so the walker grows (or shrinks) and the place
 *  falls behind. `follow` holds a walker at one size from one bearing, so a walk along the lens axis kept him the same
 *  size against a doorway that did not move and he read as frozen (Mona Lisa r5, "strolls", 23.2 to 24.0 s; with the
 *  camera backing slower he grows and the doorway falls behind at 23.3, 23.6 and 23.9 s). It refuses a walk within 30°
 *  of the lens axis whose distance to the camera changes by less than a tenth: that is the frozen walker again. And it
 *  refuses one whose distance turns back anywhere inside the track (he grows, then shrinks): slower than the walker on
 *  average is not enough, it must hold on every frame. Why the speed is even: an eased track runs its middle at 1.5 to
 *  1.9 times its average, so the camera outran him mid-walk and he shrank (Mona Lisa r6: his size 0.75, 0.86, 0.80,
 *  0.73 eased; 0.75, 0.83, 0.88, 0.92 even, 23.1 to 23.95 s).
 *  It refuses a subject whose path jumps inside [a, b] (more than `maxStep` metres in one frame, default 0.5; a run is
 *  about 0.25): a subject handed from one path to another (the landing's copy of a person to the hall's) swings a pan
 *  keyed across the hand-over through the gap in one frame (Mona Lisa r4: the hall pan started 0.04 s before he
 *  reached the hall and turned 33° in one frame). Start the track after the jump, or end it before. */
export function track(pos: V3, s: Subject, a: number, b: number, opts: { fov?: number; every?: number; maxStep?: number; to?: V3; fov1?: number; up?: number } = {}): Key[] {
  const every = opts.every ?? 4, maxStep = opts.maxStep ?? 0.5, fov = opts.fov ?? 45, fov1 = opts.fov1 ?? fov, up = opts.up ?? 0;
  for (let f = a; f < b; f++) {
    const step = len(sub(posOf(s, f + 1), posOf(s, f)));
    if (step > maxStep) throw new Error(`track: ${s.name} jumps ${step.toFixed(2)} m between frames ${f} and ${f + 1}; start the track after the jump or end it before`);
  }
  const camAt = (f: number): V3 => opts.to ? mix(pos, opts.to, b > a ? clamp((f - a) / (b - a)) : 1) : pos;
  if (opts.to && b > a) {
    const walk = sub(posOf(s, b), posOf(s, a)), axis = norm(sub(posOf(s, a), camAt(a)));
    const along = len(walk) > 1e-6 && Math.abs(dot(norm(walk), axis)) > Math.cos(30 * RAD);
    const dist = (f: number) => len(sub(posOf(s, f), camAt(f)));
    const d0 = dist(a), d1 = dist(b);
    if (along && Math.abs(d1 - d0) < 0.1 * d0) throw new Error(`track: ${s.name} walks along the lens axis but stays ${d0.toFixed(1)} to ${d1.toFixed(1)} m from the camera, so the walk reads as frozen; move the camera more slowly than the walk`);
    if (along) {
      // the distance must keep one direction on every frame: a reversal is the camera outrunning the walker
      const sign = Math.sign(d1 - d0);
      for (let f = a + 1; f <= b; f++) {
        const step = dist(f) - dist(f - 1);
        if (step * sign < -1e-4) throw new Error(`track: the camera outruns ${s.name} at frame ${f} (his distance turns back by ${(-step * sign * 100).toFixed(1)} cm a frame), so he shrinks mid-walk; keep the camera's speed under his on every frame (a shorter \`to\`, or start the track once he is walking)`);
      }
    }
  }
  const out: Key[] = [];
  for (let f = a; ; f = Math.min(b, f + every)) {
    const k = b > a ? (f - a) / (b - a) : 1;
    out.push(K(f, camAt(f), add(posOf(s, f), [0, up, 0]), lerp(fov, fov1, k)));
    if (f >= b) break;
  }
  return out;
}

/** The `Match` and bearing that reproduce a camera already on screen on a shape, so the other side of a shape-matched
 *  dissolve can copy it: `matchCam(shape, m.match, m.az, ...)` puts the camera back where it was and the shape on the
 *  same screen spot at the same size. Why: one side of a match often has to keep a framing that already works (a
 *  two-shot), and its bearing, elevation, spot and size were worked out by hand from a probe (Mona Lisa r6, joins 11 and
 *  12: the hand-worked guard side came within 10 cm of the old two-shot). The camera's roll is not kept. It refuses a
 *  camera so near that the shape is wider than 95% of the frame: `frameOn` would pull that one back. */
export function matchOf(c: Cam, shape: Subject, f = 0, aspect = 9 / 16): { match: Match; az: number } {
  const cen = posOf(shape, f), r = radOf(shape, f), off = sub(c.pos, cen), d = len(off), dir = norm(off);
  const v = c.fov * RAD, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  if (d <= r) throw new Error(`matchOf: the camera is inside ${shape.name}'s radius`);
  if (r / Math.sin(0.95 * h / 2) > d * (1 + 1e-9)) throw new Error(`matchOf: ${shape.name} is wider than 95% of the frame from this camera (${d.toFixed(2)} m away), so matchCam would pull back; match a smaller part of it`);
  const el = Math.asin(clamp(dir[1], -1, 1)) / RAD;
  const az = ((Math.atan2(dir[0], -dir[2]) / RAD) % 360 + 360) % 360;
  const size = 2 * Math.asin(r / d) / v, p = project(c, cen, aspect);
  return { match: { size, el, at: [p.x, p.y], fov: c.fov, aspect }, az };
}

// ---- journeys that show where they go -------------------------------------------------------------------------------
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
  const pr = project(c, posOf(s, f), aspect), r = radOf(s, f);
  if (pr.z <= r * 0.5) return { visible: false, size: 0, x: pr.x, y: pr.y };
  const size = 2 * Math.atan(r / pr.z) / (c.fov * RAD);
  return { visible: Math.abs(pr.x) <= 1 && Math.abs(pr.y) <= 1, size, x: pr.x, y: pr.y };
}

/** Where a card's hand should reach to point at, touch or hand something to a world target, as offsets in metres on
 *  the card's own plane: `side` to screen right and `up` to screen up, measured from `from` (the card's feet, or its
 *  shoulder) at the card's depth. The offsets are taken on the screen, not along the world's right: a card near the
 *  frame's edge sees a farther target on the other side of the screen from where the world's right puts it, and its
 *  arm points off the frame (Mona Lisa r4, 33.8 s: the painter at the left edge pointed away from the hooks). The
 *  story turns the metres into its drawing's units and clamps them to the arm's reach, and to the card: a hand target
 *  past the card's edge, less the mitten's radius, is drawn with the mitten and the arm's outline cut off, a thin
 *  coloured line with no hand (Mona Lisa r5, 33.95 s: a target at x 620 on a 600-unit card). */
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
export interface Issue { f: number; kind: 'under ground' | 'inside solid' | 'turn' | 'jump' | 'missing' | 'too small' | 'blocked' | 'in the way' | 'near the lens' | 'under the caption' | 'cut by the edge' | 'under the overlay' | 'head cut' | 'still' | 'empty sky' | 'state'; detail: string; layer?: string }
/** One canvas on screen over a run of frames: a dissolve shows two at once, each through its own camera, and a canvas
 *  that leaves and comes back later is two runs. `blockers` are the solids and people of that canvas's place. */
export interface LayerRun { id: string; from: number; to: number; camAt: (f: number) => Cam; blockers?: Blocker[] }
/** The runs of every canvas from a to b, from the function the film draws its layers with (each layer an id and its
 *  camera at frame f). Pass them to `audit`, `checkLens` and `motion`, so each layer of a dissolve is checked with its
 *  own camera and a canvas that comes back later is checked again. Gibeon r4 needed a wrapper for this. */
export function layerRuns(layersAt: (f: number) => { id: string; cam: Cam }[], a: number, b: number): LayerRun[] {
  const open = new Map<string, LayerRun>(), out: LayerRun[] = [];
  for (let f = a; f <= b; f++) {
    const here = new Set<string>();
    for (const l of layersAt(f)) {
      here.add(l.id);
      const r = open.get(l.id);
      if (r) r.to = f;
      else {
        const run: LayerRun = { id: l.id, from: f, to: f, camAt: (g: number) => { const t = Math.min(Math.max(g, run.from), run.to); return layersAt(t).find(x => x.id === l.id)!.cam; } };
        open.set(l.id, run); out.push(run);
      }
    }
    for (const id of [...open.keys()]) if (!here.has(id)) open.delete(id);
  }
  return out;
}
/** degrees the view line turns between two cameras */
export function turnDeg(a: Cam, b: Cam): number {
  const x = norm(sub(a.look, a.pos)), y = norm(sub(b.look, b.pos));
  return Math.acos(clamp(dot(x, y), -1, 1)) / RAD;
}
type AuditOptions = Safety & { maxTurn?: number; whips?: [number, number][]; maxMove?: number; jumpRatio?: number };
/** How far the camera moved between two frames, as the angle that move makes at the look distance (degrees): a move of
 *  a tenth of the look distance is about 6°. */
export const moveDeg = (a: Cam, b: Cam) => Math.atan(len(sub(b.pos, a.pos)) / Math.max(0.1, len(sub(a.look, a.pos)))) / RAD;
/** Every frame from a to b: where the planned camera had to be corrected (under ground, inside a solid), where it
 *  turns faster than `maxTurn` degrees a frame (default 4, about 120° a second at 30 fps) outside a planned whip, and
 *  where its position jumps: a move over `maxMove` (default 4, in `moveDeg` terms) that is more than `jumpRatio`
 *  (default 3) times the larger of the frame's neighbours' moves. A fast flight moves fast on every frame and passes;
 *  a one-frame jump inside a join or a hold is a hard cut whatever the dissolve around it does. Why: the turn limit
 *  alone passed a roof camera that jumped 2.0 m from a wide to a close-up in one frame while its neighbours moved 3 cm
 *  and 0, and the hard-cut detector fired on it in the render (Mona Lisa r7, 35.367 s: the turn was 2°, the move 21°).
 *  Given layer runs (`layerRuns`) instead of one camera, it audits every run with its own camera; a turn or a jump is
 *  measured only inside a run, never across a dissolve from one canvas to the other. */
export function audit(runs: LayerRun[], s?: AuditOptions): Issue[];
export function audit(camAt: (f: number) => Cam, a: number, b: number, s?: AuditOptions): Issue[];
export function audit(camAt: ((f: number) => Cam) | LayerRun[], a?: number | AuditOptions, b?: number, s: AuditOptions = {}): Issue[] {
  if (Array.isArray(camAt)) {
    const o = (a as AuditOptions | undefined) ?? {};
    return camAt.flatMap(r => audit(r.camAt, r.from, r.to, o).map(i => ({ ...i, layer: r.id, detail: `${r.id}: ${i.detail}` })));
  }
  a = a as number; b = b as number;
  const out: Issue[] = [], max = s.maxTurn ?? 4, maxMove = s.maxMove ?? 4, ratio = s.jumpRatio ?? 3;
  const whip = (f: number) => (s.whips ?? []).some(([w0, w1]) => f >= w0 && f <= w1);
  const cams: Cam[] = [];
  for (let f = a; f <= b; f++) cams.push(camAt(f));
  // the move into each frame (0 for the first), in metres and as an angle
  const step = cams.map((c, i) => i ? len(sub(c.pos, cams[i - 1].pos)) : 0);
  for (let i = 0; i < cams.length; i++) {
    const f = a + i, c = cams[i], r = safe(c, s);
    for (const why of r.fixed) out.push({ f, kind: why === 'under ground' ? 'under ground' : 'inside solid', detail: why });
    if (!i) continue;
    const t = turnDeg(cams[i - 1], c);
    if (t > max && !whip(f)) out.push({ f, kind: 'turn', detail: `${t.toFixed(1)}° in one frame` });
    const m = moveDeg(cams[i - 1], c), around = Math.max(i > 1 ? step[i - 1] : 0, i + 1 < cams.length ? step[i + 1] : 0);
    if (m > maxMove && step[i] > ratio * around && !whip(f)) out.push({ f, kind: 'jump', detail: `the camera jumps ${step[i].toFixed(2)} m in one frame (${m.toFixed(0)}° at its look distance; ${around.toFixed(2)} m next to it): a hard cut` });
  }
  return out;
}
/** Every frame from a to b (or every layer run): the camera looking up into empty sky. Two tests:
 *  - with `ground` (the terrain height at x, z, as `safe` takes it): more than `maxSky` (default 0.45) of the frame's
 *    centre column is empty sky, its ray meeting neither the ground within `far` metres (default 3000) nor any
 *    subject's sphere. It fails whatever else stands in the frame: a person under half a frame of blank sky is the
 *    fault, while a close-up against the sky (the subject covers it) is not;
 *  - always: the view points more than `maxPitch` degrees above level (default 12) while no subject is whole in the
 *    frame (its centre in frame, at least `size` of the height, default 0.08, its top and bottom inside). Pass every
 *    subject the film has.
 *  A planned look at the sky (the sun the line names, a whip) is declared in `planned`, frames [from, to]. Why: the
 *  joins stack forbids rising into empty sky, yet a fix round brought it back, the camera rising to make room for a
 *  card, 60 to 70% of the frame blank and the person cut at the chest (Gibeon r5, 58.1 to 60.4 s), and nothing measured
 *  it. Over every layer of Gibeon's film this finds 54 to 58% empty sky at 58.4 to 60.4 s, and otherwise only one
 *  outgoing layer of a dissolve for 0.2 s (5.7 s): the shot before
 *  that held him whole measures 33% (frame 1745), the opening's loaf held up against the sky 0%. A subject's sphere can
 *  sit whole in the frame while the card it stands for is cut, which is why the sky share fails on its own. Subject
 *  spheres are coarse: a huge one (a city wall) hides sky it does not cover. One issue a frame. */
export interface SkyOptions { maxPitch?: number; ground?: (x: number, z: number) => number; maxSky?: number; far?: number; size?: number; aspect?: number; planned?: [number, number][] }
export function checkSky(runs: LayerRun[], subjects: Subject[], opts?: SkyOptions): Issue[];
export function checkSky(camAt: (f: number) => Cam, a: number, b: number, subjects: Subject[], opts?: SkyOptions): Issue[];
export function checkSky(camAt: ((f: number) => Cam) | LayerRun[], a: number | Subject[], b?: number | SkyOptions, subjects: Subject[] = [], opts: SkyOptions = {}): Issue[] {
  if (Array.isArray(camAt)) {
    const subs = a as Subject[], o = (b as SkyOptions | undefined) ?? {};
    return camAt.flatMap(r => checkSky(r.camAt, r.from, r.to, subs, o).map(i => ({ ...i, layer: r.id, detail: `${r.id}: ${i.detail}` })));
  }
  const f0 = a as number, f1 = b as number, out: Issue[] = [];
  const maxPitch = opts.maxPitch ?? 12, maxSky = opts.maxSky ?? 0.45, far = opts.far ?? 3000, size = opts.size ?? 0.08, aspect = opts.aspect ?? 9 / 16;
  for (let f = f0; f <= f1; f++) {
    if ((opts.planned ?? []).some(([w0, w1]) => f >= w0 && f <= w1)) continue;
    const c = camAt(f), fwd = norm(sub(c.look, c.pos)), pitch = Math.asin(clamp(fwd[1], -1, 1)) / RAD;
    let sky = 0;
    if (opts.ground) {
      // the frame's centre column, 24 rows: a row is empty sky when its ray never drops below the ground within `far`
      // and passes through no subject's sphere
      const up0 = c.up ?? upFor(c.pos, c.look), right = norm(cross(fwd, up0)), camUp = cross(right, fwd), tv = Math.tan(c.fov * RAD / 2);
      const rows = 24;
      for (let r = 0; r < rows; r++) {
        const y = 1 - (2 * r + 1) / rows, d = norm(add(fwd, scale(camUp, y * tv)));
        const covered = subjects.some(s => { const q = sub(posOf(s, f), c.pos), t = dot(q, d); return t > 0 && len(sub(q, scale(d, t))) < radOf(s, f); });
        if (covered) continue;
        let hit = false;
        for (let t = 2; t <= far && !hit; t *= 1.15) { const p = add(c.pos, scale(d, t)); if (p[1] <= opts.ground(p[0], p[2])) hit = true; }
        if (!hit) sky++;
      }
      sky /= rows;
    }
    if (sky > maxSky) { out.push({ f, kind: 'empty sky', detail: `${(sky * 100).toFixed(0)}% of the frame is empty sky (over ${(maxSky * 100).toFixed(0)}%), looking ${pitch.toFixed(0)}° up` }); continue; }
    if (pitch <= maxPitch) continue;
    const whole = subjects.some(s => {
      const o = onScreen(c, s, f, aspect);
      if (!o.visible || o.size < size) return false;
      const mid = (1 - o.y) / 2;
      return mid - o.size / 2 >= 0 && mid + o.size / 2 <= 1;
    });
    if (!whole) out.push({ f, kind: 'empty sky', detail: `looking ${pitch.toFixed(0)}° up with no subject whole in the frame` });
  }
  return out;
}
/** One promise per line from the plan: on frame f (the word's first frame, never later: an entry keyed after its word
 *  lets a late move pass while the word shows something else), these subjects are in frame, each at least `size` of
 *  the frame's height. The default is 0.08, about what reads on a phone; with `words: true` (a clock, a calendar, a
 *  sign, a label: the viewer must read it) it is 0.10, because a clock at 6% and a calendar at 5% passed and nobody
 *  could read them (Mona Lisa r3, 24.8 s and 41.0 s; at 12% they read). */
export interface MustSee {
  word: string; f: number; subjects: string[]; size?: number; hold?: number; words?: boolean;
  /** the subject's whole sphere stays inside the frame on every frame of the hold, not only its centre: a person, a
   *  head and a raised arm, a thing that must not be cut. Why: the check passed Joshua with his head cut by the right
   *  edge (Gibeon r4, 40 frames at 47.97 to 49.27 s) and cut at the chest by the bottom edge under the follow card (68
   *  frames at 58.13 to 60.37 s), because it asks only for the centre; both were the faults the critic saw */
  whole?: boolean;
  /** the subject's top stays under an overlay drawn over the picture (a follow card, a title block): the overlay's
   *  bottom edge as a share of the frame height from the top, like `captions`. The card must land in sky already
   *  there, never over the person */
  under?: number;
}
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
  /** the caption band, as shares of the frame height from the top (where the project draws its captions, e.g.
   *  { top: 0.64, bottom: 0.76 }). A `words: true` subject whose top or bottom edge (its centre plus or minus its
   *  radius) falls inside the band, or that spans it, fails: the caption covers the words. Mona Lisa r4 hung a slate
   *  at 64 to 80% of the height, the size check passed it, and the caption covered its "28" (critique r5). */
  captions?: { top: number; bottom: number };
}
/** whether the straight line from the lens to a subject passes through a blocker (one that holds the lens or the
 *  subject itself does not count) */
function hides(c: Cam, s: Subject, f: number, b: Blocker): boolean {
  const target = posOf(s, f), d = sub(target, c.pos), L = len(d), bc = blockerAt(b, f);
  const sr = radOf(s, f);
  if (len(sub(c.pos, bc)) <= b.r || len(sub(target, bc)) <= b.r + sr) return false;
  const dir = scale(d, 1 / L), t = clamp(dot(sub(bc, c.pos), dir), 0, Math.max(0, L - sr));
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
        nearest = Math.min(nearest, project(c, posOf(s, f), aspect).z - radOf(s, f));
        if (!o.visible) { out.push({ f, kind: 'missing', detail: `"${p.word}": ${name} is out of frame` }); continue; }
        if (o.size < (p.size ?? (p.words ? WORDS_SIZE : MUST_SEE_SIZE))) out.push({ f, kind: 'too small', detail: `"${p.word}": ${name} fills ${(o.size * 100).toFixed(0)}% of the height` });
        const b = blockers.find(bl => hides(c, s, f, bl));
        if (b) out.push({ f, kind: 'blocked', detail: `"${p.word}": ${name} is behind ${b.name ?? 'a blocker'}` });
        if (p.whole || p.under !== undefined) {
          // the sphere's extent on screen: its angular radius against the half-angles of the frame
          const z = Math.max(1e-6, project(c, posOf(s, f), aspect).z), rr = radOf(s, f) / z, v = c.fov * RAD;
          const sy = rr / Math.tan(v / 2), sx = rr / (Math.tan(v / 2) * aspect), cut: string[] = [];
          if (p.whole) {
            if (o.y + sy > 1) cut.push('top'); if (o.y - sy < -1) cut.push('bottom');
            if (o.x + sx > 1) cut.push('right'); if (o.x - sx < -1) cut.push('left');
            if (cut.length) out.push({ f, kind: 'cut by the edge', detail: `"${p.word}": ${name} is cut by the frame's ${cut.join(' and ')} edge` });
          }
          const top = (1 - (o.y + sy)) / 2;
          if (p.under !== undefined && top < p.under) out.push({ f, kind: 'under the overlay', detail: `"${p.word}": ${name}'s top is at ${(top * 100).toFixed(0)}% of the height, above the overlay's bottom edge at ${(p.under * 100).toFixed(0)}%` });
        }
        if (p.words && opts.captions) {
          // edges as shares of the height from the top: y runs from 1 (top) to -1 (bottom) in project()
          const half = o.size * 0.5, top = (1 - o.y) / 2 - half, bottom = (1 - o.y) / 2 + half, band = opts.captions;
          if (bottom > band.top && top < band.bottom) out.push({ f, kind: 'under the caption', detail: `"${p.word}": ${name} spans ${(top * 100).toFixed(0)}% to ${(bottom * 100).toFixed(0)}% of the height, across the caption band (${(band.top * 100).toFixed(0)}% to ${(band.bottom * 100).toFixed(0)}%)` });
        }
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
 *  filling 17% at 45.8 s). One issue a frame for each group. Pass layer runs (`layerRuns`) to check every layer of a
 *  dissolve with its own camera and blockers: `checkLens(runs, { blockers })`.
 *
 *  Indoors, split the blockers into `groups`, each with its own `near` and `size`: one limit for every kind flags a room
 *  whose wall pictures and furniture are framed on purpose at 4 to 6 m. Why: the single 6 m and 15% limit flagged 208
 *  runs in the Mona Lisa's interiors; wall objects at 6 m and 30% and floor props at 3 m and 15% left the one real
 *  fault (a painting filling 87% behind the guard's face, 35.8 s), which was moved, and nothing else (r6).
 *  A moment where a blocker fills the lens by design (a push past a lamp for a glow-to-glow join, the clock a line is
 *  about) is declared in `framed` with its frames and its reason, optionally for one group or one layer; it is then not
 *  an issue, and the result's `framed` lines say what each span let through, so the report prints the reasons. A span
 *  with no reason is refused. Issues carry the group's name. */
export interface LensGroup { name: string; blockers: Blocker[]; near?: number; size?: number }
export interface Framed { from: number; to: number; why: string; group?: string; layer?: string }
type LensOptions = { near?: number; size?: number; aspect?: number; groups?: LensGroup[]; framed?: Framed[] };
export type LensResult = Issue[] & { framed: string[] };
export function checkLens(runs: LayerRun[], opts?: LensOptions & { blockers?: Blocker[] }): LensResult;
export function checkLens(camAt: (f: number) => Cam, a: number, b: number, blockers: Blocker[], opts?: LensOptions): LensResult;
export function checkLens(camAt: ((f: number) => Cam) | LayerRun[], a?: number | (LensOptions & { blockers?: Blocker[] }), b?: number, blockers: Blocker[] = [], opts: LensOptions = {}): LensResult {
  const runs: LayerRun[] = Array.isArray(camAt) ? camAt : [{ id: '', from: a as number, to: b as number, camAt, blockers }];
  const o: LensOptions & { blockers?: Blocker[] } = Array.isArray(camAt) ? ((a as (LensOptions & { blockers?: Blocker[] }) | undefined) ?? {}) : opts;
  const aspect = o.aspect ?? 9 / 16, spans = o.framed ?? [];
  for (const sp of spans) if (!sp.why || !sp.why.trim()) throw new Error(`checkLens: the framed span ${sp.from}-${sp.to} has no reason; say why the lens is filled on purpose`);
  const hits = spans.map(() => ({ frames: 0, worst: 0, what: '' }));
  const out: Issue[] = [];
  for (const r of runs) {
    const groups: LensGroup[] = [...(o.groups ?? [])];
    const own = r.blockers ?? (Array.isArray(camAt) ? o.blockers : undefined) ?? [];
    if (own.length) groups.unshift({ name: '', blockers: own, near: o.near, size: o.size });
    for (let f = r.from; f <= r.to; f++) {
      const c = r.camAt(f);
      for (const g of groups) {
        const near = g.near ?? o.near ?? 6, size = g.size ?? o.size ?? 0.15;
        for (const bl of g.blockers) {
          const bc = blockerAt(bl, f), d = len(sub(bc, c.pos));
          if (d > near) continue;
          const os = onScreen(c, { name: bl.name ?? 'blocker', at: bc, r: bl.r }, f, aspect);
          if (!os.visible || os.size <= size) continue;
          const what = `${bl.name ?? 'a blocker'} ${d.toFixed(1)} m from the lens fills ${(os.size * 100).toFixed(0)}% of the height`;
          const k = spans.findIndex(sp => f >= sp.from && f <= sp.to && (!sp.group || sp.group === g.name) && (!sp.layer || sp.layer === r.id));
          if (k >= 0) {
            const h = hits[k]; h.frames++;
            if (os.size > h.worst) { h.worst = os.size; h.what = bl.name ?? 'a blocker'; }
          } else {
            const tag = [r.id, g.name].filter(Boolean).join(', ');
            out.push({ f, kind: 'near the lens', detail: `${tag ? `${tag}: ` : ''}${what}`, ...(r.id ? { layer: r.id } : {}) });
          }
          break;
        }
      }
    }
  }
  const framed = spans.map((sp, k) => hits[k].frames ? `frames ${sp.from}-${sp.to}${sp.group ? ` (${sp.group})` : ''}: ${hits[k].what} up to ${(hits[k].worst * 100).toFixed(0)}% on ${hits[k].frames} frame(s), framed on purpose: ${sp.why}` : `frames ${sp.from}-${sp.to}: declared (${sp.why}) but nothing filled the lens; drop the span`);
  return Object.assign(out, { framed });
}

// ---- heads cut by the frame -----------------------------------------------------------------------------------------
/** Which edge of the frame cuts a standing person's head, or null. The head is the top `1 / heads` of `height` (default
 *  3.5 heads tall) and as wide as it is tall over 0.94; `feet` is the point on the ground under the person. Reported:
 *  - the bottom edge cutting the head (its top in the frame, its chin below the edge), at any distance;
 *  - a side edge cutting the head (its centre within half a head of the edge) of someone nearer than `near` metres
 *    (default 6). Farther people crossing a side edge whole is how people walk out of a frame, and is fine.
 *  A named person (the cast the lines are about) is reframed, never dropped; an extra may leave the picture for that
 *  frame (the story skips drawing him when this says so). Why: a crowd rule by distance alone ("within 7 m leaves")
 *  does not fit an interior, where the wanted front rows stand at 5 to 8 m, and it never covers the named cast: heads
 *  were halved at the side edges at 30 to 31.5 s, and Peruggia's shocked face sat half outside the left edge for the
 *  whole of "turns" (Mona Lisa r6 and r7, 44.0 to 44.8 s); Joshua's face slid out at the right edge on a tilt (Gibeon
 *  r6, 49.3 to 49.5 s). */
export function headCut(c: Cam, feet: V3, height: number, o: { heads?: number; near?: number; aspect?: number } = {}): 'bottom' | 'left' | 'right' | null {
  const aspect = o.aspect ?? 9 / 16, head = height / (o.heads ?? 3.5), near = o.near ?? 6;
  const top = project(c, add(feet, [0, height, 0]), aspect), chin = project(c, add(feet, [0, height - head, 0]), aspect);
  if (top.z > 0.05 && chin.z > 0.05 && Math.abs(top.x) <= 1 && top.y > -1 && chin.y < -1) return 'bottom';
  const hc = add(feet, [0, height - head / 2, 0]);
  if (len(sub(hc, c.pos)) > near) return null;
  const p = project(c, hc, aspect);
  if (p.z <= 0.05 || Math.abs(p.y) > 1) return null;
  // half the head's width on screen at its depth
  const halfW = (head / 0.94) / 2, rx = halfW / (p.z * Math.tan(c.fov * RAD / 2) * aspect);
  if (p.x < -1 + rx && p.x > -1 - rx) return 'left';
  if (p.x > 1 - rx && p.x < 1 + rx) return 'right';
  return null;
}
/** One person for `checkHeads`: the point on the ground under the feet (or a path in time), the height, and whether the
 *  person is named (a subject of the story, reframed when cut) or an extra (dropped for the frame by the story). */
export interface Head { name: string; feet: V3 | ((f: number) => V3); height: number; named?: boolean; heads?: number }
/** Every frame from a to b (or every layer run): each named person whose head an edge cuts (`headCut`). A named person
 *  is the subject, so a side edge counts at any distance (`near` applies to extras only): Joshua 7 m from the lens had
 *  his face cut by the right edge on the tilt to the wall (Gibeon r6, 49.3 to 49.5 s), the critic's one cut head that
 *  was a fault. Extras are left to the story's draw loop, which skips them on the frames `headCut` names; pass
 *  `extras: true` to list them too, to confirm the loop does. One issue a person a frame. */
export function checkHeads(runs: LayerRun[], people: Head[], opts?: { near?: number; aspect?: number; extras?: boolean }): Issue[];
export function checkHeads(camAt: (f: number) => Cam, a: number, b: number, people: Head[], opts?: { near?: number; aspect?: number; extras?: boolean }): Issue[];
export function checkHeads(camAt: ((f: number) => Cam) | LayerRun[], a: number | Head[], b?: number | { near?: number; aspect?: number; extras?: boolean }, people: Head[] = [], opts: { near?: number; aspect?: number; extras?: boolean } = {}): Issue[] {
  if (Array.isArray(camAt)) {
    const ps = a as Head[], o = (b as typeof opts | undefined) ?? {};
    return camAt.flatMap(r => checkHeads(r.camAt, r.from, r.to, ps, o).map(i => ({ ...i, layer: r.id, detail: `${r.id}: ${i.detail}` })));
  }
  const out: Issue[] = [];
  for (let f = a as number; f <= (b as number); f++) {
    const c = camAt(f);
    for (const h of people) {
      if (!h.named && !opts.extras) continue;
      const feet = typeof h.feet === 'function' ? h.feet(f) : h.feet;
      const edge = headCut(c, feet, h.height, { heads: h.heads, near: h.named ? Infinity : opts.near, aspect: opts.aspect });
      if (edge) out.push({ f, kind: 'head cut', detail: `${h.name}'s head is cut by the frame's ${edge} edge${h.named ? ': reframe' : ': an extra, leaves the picture'}` });
    }
  }
  return out;
}

// ---- how much the picture moves --------------------------------------------------------------------------------------
/** How much the camera makes the picture move in each second from a to b, without a render: every subject and landmark
 *  in frame (the film's subjects, and each layer run's `blockers`: its rocks, trees, pillars) is followed to the next
 *  frame, and the distance it travels on screen plus the change of its size, in shares of the frame height, is
 *  averaged with each thing weighted by its area on screen, summed over the second's frames and given in percent.
 *  Given layer runs, each frame counts its liveliest layer, and a dissolve from one canvas to another is never a move.
 *  Why it replaced the camera-path measure (`motion`, kit 1.56): that one measured how the camera moved through the
 *  world, so a camera running with a rout scored 71 and 53 at 51 and 52 s, among the film's liveliest seconds (median
 *  35), while the picture was nearly still (Gibeon r4 cameras; the render's frame difference 5.4 and 6.6). Following
 *  what is on screen, the same seconds measure 30 and 15 (median 36), and over the whole film this measure ranks the
 *  seconds closer to the render than the path did (rank correlation 0.56 and 0.59 on two cuts, against 0.47 and 0.49).
 *  Its limit, found on the same frames: it cannot see texture or animation. A flat-coloured plain flowing past moves
 *  here and looks still on screen, and a card that pops or a face that acts moves on screen with the camera still.
 *  So it points at camera-still stretches before a render; whether the picture is still is decided on the render, by
 *  `toon-world/scripts/frame_motion.py` (the mean frame difference a second, which reproduces the critic's numbers),
 *  and `checkMotion` takes either. Element k of the result is the second starting at frame a + k * fps. */
export function screenMotion(camAt: ((f: number) => Cam) | LayerRun[], a: number, b: number, things: Subject[], opts: { aspect?: number; fps?: number } = {}): number[] {
  const runs: LayerRun[] = Array.isArray(camAt) ? camAt : [{ id: 'camera', from: a, to: b, camAt }];
  const fps = opts.fps ?? 30, aspect = opts.aspect ?? 9 / 16;
  const frameMove = (r: LayerRun, f: number): number => {
    const c0 = r.camAt(f - 1), c1 = r.camAt(f);
    const all: Subject[] = [...things, ...(r.blockers ?? []).map((bl, i) => ({ name: bl.name ?? `landmark ${i}`, at: bl.c, r: bl.r }))];
    let wsum = 0, dsum = 0;
    for (const s of all) {
      const o0 = onScreen(c0, s, f - 1, aspect);
      if (!o0.visible) continue;
      const p1 = project(c1, posOf(s, f), aspect), o1 = onScreen(c1, s, f, aspect);
      const d = p1.z <= 0.05 ? 1 : Math.min(1, Math.hypot((p1.x - o0.x) * aspect, p1.y - o0.y) / 2 + Math.abs(o1.size - o0.size));
      const w = Math.min(1, o0.size) ** 2;
      wsum += w; dsum += w * d;
    }
    return wsum ? dsum / wsum : 0;
  };
  const out: number[] = [];
  for (let f = a + 1; f <= b; f++) {
    let m = 0;
    for (const r of runs) if (f - 1 >= r.from && f <= r.to) m = Math.max(m, frameMove(r, f));
    const k = Math.floor((f - a - 1) / fps);
    out[k] = (out[k] ?? 0) + 100 * m;
  }
  return out;
}
/** Seconds the picture barely moves, against the video's dynamics profile: a run of more seconds than the profile's
 *  longest hold (default 1) under `min` is flagged, except inside a planned hold (`holds`, seconds [from, to]: a stop
 *  the profile wants). `min` defaults to 8, for the render's frame difference (`frame_motion.py`): on Gibeon r5 it
 *  flags exactly the critic's two stillest findings, the valley at 51 to 52 s (6.4, 6.9) and the card hold at 59 to
 *  60 s (1.8, 6.9), and passes the single held seconds (frame 0, the map, the sun's stop at 54 s). For `screenMotion`, set
 *  `min` from the film's own planned holds. Run it where the profile asks for pace; a face-led profile with long holds
 *  sets a longer `longestHold` and lists its holds. `from` is the frame the measure started at, `fps` its rate. */
export function checkMotion(perSecond: number[], opts: { min?: number; longestHold?: number; holds?: [number, number][]; from?: number; fps?: number } = {}): Issue[] {
  const min = opts.min ?? 8, longest = opts.longestHold ?? 1, from = opts.from ?? 0, fps = opts.fps ?? 30, start = from / fps, out: Issue[] = [];
  const held = (t: number) => (opts.holds ?? []).some(([h0, h1]) => t >= h0 && t < h1);
  let run: number[] = [];
  const close = () => {
    if (run.length > longest) out.push({ f: from + run[0] * fps, kind: 'still', detail: `${run.length} seconds from ${start + run[0]} s under ${min} (${run.map(k => perSecond[k].toFixed(1)).join(', ')})` });
    run = [];
  };
  perSecond.forEach((v, k) => { if (v < min && !held(start + k)) run.push(k); else close(); });
  close();
  return out;
}
