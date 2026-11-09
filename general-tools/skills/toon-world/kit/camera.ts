// toon-kit camera: generic camera building blocks for any toon video (Remotion + Three.js).
//
// It carries no look of its own: no places, people, colours or styles. Every video designs those itself.
// What it gives every video:
//   - a smooth key path (Hermite through keys, `stop` keys hold still);
//   - shots written by subject: name what must be in frame, how big, and from where, and the camera is worked out
//     (`frameOn`, `shot`, `follow`), so the thing a line names cannot fall out of the frame;
//   - a safe camera: never under the ground, never inside a solid, always a usable "up" (`safe`, `upFor`);
//   - checks: the camera's turn speed and safety over a range of frames (`audit`), and whether each promised
//     subject is in frame and big enough on its word (`checkMustSee`).
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
/** the camera at frame f along keys sorted by frame */
export function path(keys: Key[], f: number): Cam {
  const ts = keys.map(k => k.f), st = keys.map(k => !!k.stop);
  const ch = (g: (k: Key) => number) => curve(ts, keys.map(g), f, st);
  return {
    pos: [ch(k => k.pos[0]), ch(k => k.pos[1]), ch(k => k.pos[2])],
    look: [ch(k => k.look[0]), ch(k => k.look[1]), ch(k => k.look[2])],
    fov: ch(k => k.fov), roll: ch(k => k.roll ?? 0),
  };
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

// ---- checks ---------------------------------------------------------------------------------------------------------
export interface Issue { f: number; kind: 'under ground' | 'inside solid' | 'turn' | 'missing' | 'too small'; detail: string }
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
/** One promise per line from the plan: on frame f (the word), these subjects are in frame, each at least `size` of
 *  the frame's height (default 0.08, about what reads on a phone). */
export interface MustSee { word: string; f: number; subjects: string[]; size?: number; hold?: number }
/** Checks each promise from its word for `hold` frames (default 6, a fifth of a second). */
export function checkMustSee(camAt: (f: number) => Cam, subjects: Record<string, Subject>, must: MustSee[], aspect = 9 / 16): Issue[] {
  const out: Issue[] = [];
  for (const p of must) {
    for (let f = p.f; f <= p.f + (p.hold ?? 6); f++) {
      const c = camAt(f);
      for (const name of p.subjects) {
        const s = subjects[name];
        if (!s) { out.push({ f, kind: 'missing', detail: `"${p.word}": no subject named ${name}` }); continue; }
        const o = onScreen(c, s, f, aspect);
        if (!o.visible) out.push({ f, kind: 'missing', detail: `"${p.word}": ${name} is out of frame` });
        else if (o.size < (p.size ?? 0.08)) out.push({ f, kind: 'too small', detail: `"${p.word}": ${name} fills ${(o.size * 100).toFixed(0)}% of the height` });
      }
    }
  }
  return out;
}
