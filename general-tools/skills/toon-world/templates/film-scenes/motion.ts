// __SLUG__: timing and camera helpers every scene shares (no three.js, no Remotion: the scene tools load them in node).
import type { Cam, V3 } from './joins';

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** ease in and out (smoothstep) */
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
/** a softer ease in and out (smootherstep): the default between camera keys */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
/** piecewise linear through [x, y] points */
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
export const mix3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const mixCam = (a: Cam, b: Cam, k: number): Cam => ({ pos: mix3(a.pos, b.pos, k), look: mix3(a.look, b.look, k), fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k });
/** move the camera toward (k > 0) or away from its look point */
export const dolly = (c: Cam, k: number): Cam => ({ ...c, pos: c.pos.map((v, i) => c.look[i] + (v - c.look[i]) * (1 - k)) as V3 });

/** A camera key at a scene frame. `ease` on a key shapes the move through it: "glide" (default) stops softly on the
 *  key; "through" keeps the camera moving through it (a camera that stops dead on a beat reads as a jolt); "linear"
 *  for a constant drift into it. */
export type CamKey = Cam & { f: number; ease?: 'glide' | 'through' | 'linear' };
const easeIn = (u: number) => 1 - Math.cos((Math.PI * u) / 2);   // starts slow, arrives at speed
const easeOut = (u: number) => Math.sin((Math.PI * u) / 2);      // leaves at speed, stops softly
/** The camera at frame f from its keys. Check every move with tools/cam-speed.mjs: over about 0.3 m or 1.5 degrees a
 *  frame reads as a whip on a 6 fps contact sheet and to the judges (cliff spike 7). */
export const keysAt = (keys: CamKey[], f: number): Cam => {
  if (f <= keys[0].f) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (f > b.f) continue;
    const u = (f - a.f) / Math.max(1e-6, b.f - a.f);
    const fromSpeed = a.ease === 'through' && i > 1, toSpeed = b.ease === 'through' && i < keys.length - 1;
    const k = b.ease === 'linear' || (fromSpeed && toSpeed) ? u : toSpeed ? easeIn(u) : fromSpeed ? easeOut(u) : glide(u);
    return mixCam(a, b, k);
  }
  return keys[keys.length - 1];
};
/** frames from seconds */
export const F = (t: number, fps = 30) => Math.round(t * fps);
