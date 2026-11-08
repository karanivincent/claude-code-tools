// Railroads practice copy, round 2: the camera. Clip frames (30 fps, 470 frames); clip frame = reference frame - 1485.
// The shot list is out/practice/railroads/shotlist.md. Every move is a smooth key path (Hermite through the keys, each
// key's tangent taken from its neighbours, so speed carries through a key; `stop` keys ease to rest). The camera is
// never parked: where the reference nearly stops, the keys still drift a few centimetres.
//
//   deck    0-153    A1 dolly, A2 skim the rail, A3 lift and face the track, A4 push to the owner
//   canyon  144-306  B1 the engineer close (zooms in out of the dissolve), B2 sink to the rail, B3 swing and back off
//   gorge   292-409  C1 crane up beside the arch and over the deck, C2 high over the track, slow push
//   side    400-452  D far side view, push and tilt down after the falling engine; the fireball rises into it and fills it
//   end     449-469  E from the platform: telephoto on the fire, pull back and tilt as the two rise in from bottom-left
export type V3 = [number, number, number];
export interface Cam { pos: V3; look: V3; fov: number; roll?: number }
export type Place = 'deck' | 'canyon' | 'gorge' | 'side' | 'end';
export interface Layer { place: Place; cam: Cam; k: number }
export const FPS = 30, FRAMES = 470;

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const prog = (f: number, a: number, b: number) => clamp((f - a) / (b - a));
export const smooth = (k: number) => { const c = clamp(k); return c * c * (3 - 2 * c); };
export const smoother = (k: number) => { const c = clamp(k); return c * c * c * (c * (6 * c - 15) + 10); };
/** deterministic hash in [0, 1) */
export const hash = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

// ---- a smooth key path ------------------------------------------------------------------------------------------
export interface Key { f: number; pos: V3; look: V3; fov: number; roll?: number; stop?: boolean }
const K = (f: number, pos: V3, look: V3, fov: number, roll = 0, stop = false): Key => ({ f, pos, look, fov, roll, stop });
/** one channel through (t, v) knots: Hermite, tangents from the neighbours (Catmull-Rom in time), zero at the ends */
export function curve(ts: number[], vs: number[], t: number, stops?: boolean[]): number {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0; while (t > ts[i + 1]) i++;
  const m = (j: number) => (j <= 0 || j >= n - 1 || stops?.[j]) ? 0 : (vs[j + 1] - vs[j - 1]) / (ts[j + 1] - ts[j - 1]);
  const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m(i + 1);
}
export function path(keys: Key[], f: number): Cam {
  const ts = keys.map(k => k.f), st = keys.map(k => !!k.stop);
  const ch = (g: (k: Key) => number) => curve(ts, keys.map(g), f, st);
  return {
    pos: [ch(k => k.pos[0]), ch(k => k.pos[1]), ch(k => k.pos[2])],
    look: [ch(k => k.look[0]), ch(k => k.look[1]), ch(k => k.look[2])],
    fov: ch(k => k.fov), roll: ch(k => k.roll ?? 0),
  };
}

// ---- where things are (shared with the builders) ----------------------------------------------------------------
/** deck: the owner's deckchair (x, z); his card stands at the seat */
export const OWNER_AT: V3 = [3.3, 0, -34];
/** canyon: the engineer's marks */
export const ENG_AT: V3 = [1.75, 0, -6];
/** canyon B3: the walk, from beside the track into it and on toward the camera (+z) */
export function walkAt(f: number): { pos: V3; walking: boolean; phase: number } {
  if (f < 247) return { pos: ENG_AT, walking: false, phase: 0 };
  const a: V3 = [1.75, 0, -6.0], b: V3 = [0.25, 0, -5.8]; // from his mark, no jump
  if (f < 258) { const k = smooth(prog(f, 247, 258)); return { pos: [lerp(a[0], b[0], k), 0, lerp(a[2], b[2], k)], walking: true, phase: f * 0.42 }; }
  return { pos: [b[0], 0, b[2] + (f - 258) * WALK], walking: true, phase: f * 0.42 };
}
export const WALK = 0.034; // m a frame (about 1 m/s)
/** gorge: the fireball's heart on the canyon floor below the derail, and the viewing platform on the rim */
export const BLAST: V3 = [9, -66, -12];
export const PLATFORM: V3 = [38, 0, 88];

// ---- the camera, place by place ------------------------------------------------------------------------------------
/** a key aimed by yaw (degrees left of -z, + turns toward -x) and pitch (degrees down), for the rail skim */
const KA = (f: number, pos: V3, yaw: number, pitch: number, fov: number, roll = 0): Key => {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180, d = 3;
  return K(f, pos, [pos[0] - d * Math.sin(y), pos[1] - d * Math.tan(p), pos[2] - d * Math.cos(y)], fov, roll);
};
// One thing a second (round 2): 0 the track and the owner at its end; 0.5-1.5 the purple front running along the near
// rail; 1.5-2.5 the bands settling; 3-4 the spikes popping toward us; 4-5 the owner's shock and hat; 5-6 the grin and
// the chalked 39'; 6-7 his rail heating at his feet as we sink past his legs; 7-8 the glowing rail with the wall right;
// 8-9 him huge at the right edge, then walking; 10-11 the arch and the gorge's strata; 11-12 the engine coming at us;
// 12-13 the snap; 13-14 the engine's side; 14-15 the chain hanging; 15-15.7 the fireball, then the two and the hat.
const DECK: Key[] = [
  // round 4 (Vincent): one slow, even glide. Fewer keys, a little further off the rail and a longer lens, so the near
  // rail is one calm diagonal and the heat bands travelling along it are the motion the eye follows
  K(0, [0.05, 1.15, -6], [0.5, -1.8, -20], 50),                   // the track from the bottom corners, the owner under his parasol
  KA(18, [2.0, 1.25, -11.0], 40, 19, 46, -0.03),                  // glide out beside the near rail, the fence and sky at the top
  KA(36, [2.1, 1.25, -14.9], 43, 19, 46, -0.03),                   // the bands run along it; the joint at -17.35 and its sparks
  KA(48, [2.15, 1.27, -17.4], 43, 19, 46, -0.03),
  KA(62, [2.0, 1.45, -19.4], 26, 15, 50, -0.01),                   // lift and yaw back toward the track
  K(76, [1.4, 1.3, -19.6], [1.5, 0.4, -30], 50),                  // the hump rising in the rails ahead, the owner beyond
  K(90, [1.55, 0.46, -18.2], [1.1, 0.36, -27], 40),              // low beside the rail: the hump rising, spikes drawn up and popping
  K(104, [1.6, 0.47, -19.3], [1.2, 0.38, -28], 40),               // sleepers shoved; the owner small at the right, seeing none of it
  K(118, [2.2, 0.95, -24.0], [3.15, 0.95, -34], 44),              // push to him as a spike flies past
  K(128, [2.55, 1.28, -28.2], [3.2, 0.98, -34], 42),
  K(140, [2.75, 1.25, -29.6], [3.25, 1.02, -34], 41),
  K(154, [2.8, 1.24, -29.8], [3.25, 1.02, -34], 41, 0, true),
];
const CANYON: Key[] = [
  K(144, [0.95, 1.2, -5.0], [1.75, 1.25, -6.0], 40),             // out of the dissolve very close, pulling back
  K(154, [-0.9, 0.95, -3.9], [1.75, 0.5, -6.0], 42),             // knees up, the joint and the chalked 39' across the bottom
  K(168, [-0.94, 0.94, -3.86], [1.75, 0.48, -6.0], 42),
  K(182, [-0.98, 0.91, -3.82], [1.75, 0.44, -6.0], 42),
  K(195, [-0.82, 0.86, -3.78], [1.75, 0.48, -6.05], 42),
  // round 4: the hero beat. Down from his smug face to his gap, close: the coin in it, the ends sliding together as the
  // heat comes down the rail, the touch and its spark at 225, then the closed joint and the rail running on straight
  K(203, [-0.3, 1.05, -4.2], [0.7175, 0.4, -5.45], 40),          // down past his smile onto his gap
  K(211, [0.22, 0.95, -4.8], [0.7175, 0.4, -5.45], 30),          // the gap from above, looking down the line: the coin standing in it
  K(225, [0.26, 0.91, -4.86], [0.7175, 0.4, -5.45], 27),         // creeping in as it narrows; the touch and its spark
  K(233, [0.27, 0.9, -4.87], [0.7175, 0.4, -5.45], 27, 0, true), // hold on the closed, glowing joint
  K(240, [0.28, 0.9, -4.86], [0.7175, 0.4, -5.45], 27.5, 0, true),
  K(248, [0.46, 0.83, -3.3], [0.8, 0.5, -11], 48),               // ease back and along the line
  K(251, [0.5, 0.8, -2.8], [0.7, 0.6, -16], 54),                 // backing off the rail: he walks in huge at the right edge
  K(256, [0.36, 1.0, -1.6], [0.45, 0.8, -12], 52),
  K(262, [0.24, 1.5, 1.8], [0.3, 0.9, -8], 50),
  K(270, [0.2, 1.65, 3.2], [0.25, 0.92, -7], 48),
  K(292, [0.2, 1.65, 3.2 + 22 * WALK], [0.25, 0.92, -7 + 22 * WALK], 48),
  K(306, [0.2, 1.65, 3.2 + 36 * WALK], [0.25, 0.92, -7 + 36 * WALK], 48),
];
const GORGE: Key[] = [
  K(292, [30, -22, 62], [0, -14, -10], 50),
  K(306, [33, -9, 62], [0, -7, -14], 46),                        // beside the arch, the strata below
  K(325, [21, -1, 44], [0, -3, -24], 48),
  K(345, [1.8, 5.2, 10], [0, 0, -32], 48),                       // round 4: nearer the engine, the mesas behind it
  K(367, [0.4, 5.8, 3], [0, 0, -28], 46),
  K(400, [0.5, 5.6, 0], [1.0, 0, -22], 46),
  K(410, [0.5, 5.5, -0.6], [1.1, 0, -21], 46),
];
const SIDE: Key[] = [
  K(400, [204, 4, -12], [0, -8, -12], 21),                      // round 4: further off, the bridge smaller and higher
  K(412, [200, 2, -12], [0, -13, -12], 21),                     // the deck edge a third down, the wall filling the lower half
  K(426, [196, 0, -12], [0, -20, -12], 21),                     // tilting down after the engine
  K(441, [192, -3, -12], [0, -30, -12], 21),
  K(452, [189, -4, -12], [0, -36, -12], 22),                    // the fireball rises into this view and fills it
];
const END: Key[] = [
  K(449, [40.3, 4.4, 90.2], [9, -22, -12], 15),                 // from high on the platform, telephoto: the fire fills it
  K(452, [40.3, 4.1, 90.6], [9.5, -23, -12], 17),               // the two well below the frame
  K(455, [40.05, 2.7, 91.2], [9.5, -4, -12], 38),               // tilt and zoom out: his cap, then his face, at the bottom-left (acting.md)
  K(457, [39.8, 1.6, 91.35], [8.5, 4, -12], 44),                // the owner in at the left edge, the hat top-left
  K(461, [39.4, 1.25, 91.6], [13.5, 9.5, -12.2], 47),           // the stem by the two heads
  K(465, [40.2, 1.32, 92.5], [8.5, 11.5, -12], 49),             // round 4: pulling back, the owner in front at the left
  K(469, [41.0, 1.4, 93.3], [4.95, 13.7, -12], 50),             // still moving; heads shrinking, the cap over them
];

export const camAt = (place: Place, f: number): Cam => path({ deck: DECK, canyon: CANYON, gorge: GORGE, side: SIDE, end: END }[place], f);

/** the joins: dissolves (9-14 frames, both cameras moving) and the flash */
export const JOINS = { deckOut: [144, 153], canyonOut: [292, 306], gorgeOut: [400, 409], sideOut: [450, 454], flash: 442 } as const;
export function layersAt(f: number): Layer[] {
  const L = (place: Place, k = 1): Layer => ({ place, cam: camAt(place, f), k });
  const d = (a: number, b: number) => smooth(prog(f, a, b));
  const J = JOINS;
  if (f < J.deckOut[0]) return [L('deck')];
  if (f < J.deckOut[1]) return [L('deck'), L('canyon', d(J.deckOut[0], J.deckOut[1]))];
  if (f < J.canyonOut[0]) return [L('canyon')];
  if (f < J.canyonOut[1]) return [L('canyon'), L('gorge', d(J.canyonOut[0], J.canyonOut[1]))];
  if (f < J.gorgeOut[0]) return [L('gorge')];
  if (f < J.gorgeOut[1]) return [L('gorge'), L('side', d(J.gorgeOut[0], J.gorgeOut[1]))];
  if (f < J.sideOut[0]) return [L('side')];
  if (f < J.sideOut[1]) return [L('side'), L('end', d(J.sideOut[0], J.sideOut[1]))]; // inside the full-frame fire
  return [L('end')];
}
/** the white flash over the frame: the cloud erupts at 438, near white by 445, the fireball shows through by 452 */
export function flashAt(f: number) {
  if (f < 438) return 0;
  if (f < 442) return 0.35 * smooth(prog(f, 438, 442));
  if (f < 445) return lerp(0.35, 1, smooth(prog(f, 442, 445)));
  return 1 - smooth(prog(f, 445, 451));
}
/** which frames move fast enough to want camera motion blur */
export const FAST: [number, number][] = [[241, 257]];
