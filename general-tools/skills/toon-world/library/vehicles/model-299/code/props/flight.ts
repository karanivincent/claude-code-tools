// b17-checklist: where the planes are on the film's clock (film seconds). No three.js: the scene tools load it in node.
// The airfield (places/airfield.ts) poses the plane from here on every frame, so the plane carries on across a cut the
// way water and birds do. The flight follows the facts (facts.md): a tail-low takeoff, the nose rising far past normal,
// a stall at about 300 ft (90 m), a turn, a wing down, the fall. Vincent's taste (13 Nov): the crash lands well and is
// not too fast, so the fall takes 1.9 s (22.3 to 24.2 s) and the plane is held in frame by the shots, not cut away from.
export type V3 = [number, number, number];
export type PlanePose = {
  /** the centre of the fuselage at the wing root (m) */ at: V3;
  /** degrees: heading about y (0 = +x, 90 = -z), nose up, right wing down */ yaw: number; pitch: number; roll: number;
  /** propeller angle (radians) and how much the disc shows (0 still blades .. 1 a blurred disc) */ spin?: number; disc?: number;
  /** each engine running (outer left, inner left, inner right, outer right) */ running?: [boolean, boolean, boolean, boolean];
  gear?: boolean; lock?: boolean; /** elevator deflection, degrees (up +) */ elevator?: number;
};
/** the fuselage's centre line height when standing on its wheels, and its nose-up attitude on the ground */
export const ON_GROUND = { y: 2.55, pitch: 9 };
/** a point on the plane (its own frame: x forward, y up, z right... as plane.ts builds it) in the world, for a pose */
export const onPlane = (p: PlanePose, local: V3): V3 => {
  const r = (d: number) => (d * Math.PI) / 180;
  // rotation order YZX as plane.ts sets it: roll (x) first, then pitch (z), then yaw (y)
  let [x, y, z] = local;
  const cr = Math.cos(r(p.roll)), sr = Math.sin(r(p.roll)); [y, z] = [y * cr - z * sr, y * sr + z * cr];
  const cp = Math.cos(r(p.pitch)), sp = Math.sin(r(p.pitch)); [x, y] = [x * cp - y * sp, x * sp + y * cp];
  const cy = Math.cos(r(p.yaw)), sy = Math.sin(r(p.yaw)); [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [p.at[0] + x, p.at[1] + y, p.at[2] + z];
};

type Key = { t: number; at: V3; yaw: number; pitch: number; roll: number };
const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
const cr = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
/** a Catmull-Rom path through the keys for the position, eased angles between keys */
const along = (keys: Key[], t: number): Key => {
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  const i = keys.findIndex((k, j) => t >= k.t && t < keys[j + 1].t), a = keys[i], b = keys[i + 1];
  const p = keys[Math.max(0, i - 1)], n = keys[Math.min(keys.length - 1, i + 2)], u = (t - a.t) / (b.t - a.t), s = smooth(u);
  const at = [0, 1, 2].map((c) => cr(p.at[c], a.at[c], b.at[c], n.at[c], u)) as V3;
  return { t, at, yaw: a.yaw + (b.yaw - a.yaw) * s, pitch: a.pitch + (b.pitch - a.pitch) * s, roll: a.roll + (b.roll - a.roll) * s };
};
const G = ON_GROUND.y;

// ---------------- the Model 299, 30 October 1935 ----------------
/** where it stands before the test: on the apron in front of the officers' stand, nose east */
export const PARKED: V3 = [-95, G, -40];
/** each engine's start (film s): one after another through "four engines" (9.68-9.89 s) */
export const ENGINE_START = [7.8, 8.6, 9.3, 9.9];
const TAXI: Key[] = [
  { t: 10.3, at: PARKED, yaw: 0, pitch: ON_GROUND.pitch, roll: 0 },
  { t: 12.6, at: [-62, G, -40], yaw: 0, pitch: ON_GROUND.pitch, roll: 0 },
];
/** the takeoff, stall and fall (s04, 18.6 to 24.2 s); the cockpit (s03) shows the roll before it */
const TEST: Key[] = [
  { t: 18.6, at: [-62, G - 0.15, 0], yaw: 0, pitch: 3, roll: 0 },
  { t: 19.5, at: [-28, G + 0.25, 0], yaw: 0, pitch: 11, roll: 0 },
  { t: 20.2, at: [0, 12, 0], yaw: 0, pitch: 24, roll: 0 },
  { t: 21.0, at: [27, 35, 0.5], yaw: -2, pitch: 36, roll: 2 },
  { t: 21.7, at: [46, 62, 1.5], yaw: -3, pitch: 44, roll: 3 },
  { t: 22.1, at: [55, 73, 3], yaw: -4, pitch: 47, roll: 6 },
  { t: 22.5, at: [63, 76, 5], yaw: -10, pitch: 32, roll: 40 },
  { t: 23.0, at: [72, 58, 12], yaw: -22, pitch: 0, roll: 85 },
  { t: 23.6, at: [84, 30, 20], yaw: -40, pitch: -30, roll: 100 },
  { t: 24.2, at: [94, 3.2, 26], yaw: -55, pitch: -40, roll: 110 },
];
export const IMPACT = 24.2;
/** where the wreck lies (s05): the burning middle, and the tail torn off and thrown clear with the lock still on */
export const WRECK = { at: [96, 0, 27] as V3, yaw: -55, tail: [84, 0, 19] as V3, tailYaw: -20 };

const spinAt = (t: number, start: number) => {
  // the propeller angle: it turns over slowly, catches, and runs up to a blur in about 1.2 s
  const d = Math.max(0, t - start); return d < 1.2 ? 9 * d * d : 9 * 1.44 + 21.6 * (d - 1.2);
};
/** s04 (people-r0, r1): the plane's acting on top of the TEST keys (attitude only; the positions and key times stay as
 *  the shots stage locked them, so the camera that follows them is untouched). Each part is 0 at 18.6 s:
 *  - the roll: runway bumps (pitch and roll judder) fading out as the wheels leave at 19.5 s;
 *  - the hang (r1): the attitude runs on its own slowed clock (`turn299`): from 21.65 s to 22.6 s it moves at 0.42 of
 *    the keys' pace, so the plane hangs nose-high (pitch 44 to 47, wings level) for 0.95 s with a stall buffet (about 2
 *    degrees of pitch and 3 of roll, 6-9 Hz); then it catches up (1.42 times the pace) by 23.9 s, so the wing drops and
 *    the turn into the fall follow the keys' own order, a little later and in one eased run;
 *  - the wing drop: a small rock the other way just before it (-5 degrees of roll at 22.5 s) and an overshoot after it
 *    (+8 at 23.0 s);
 *  - the fall: a slow wallow of roll and yaw (about 6 and 4 degrees, 1.6 Hz), so it tumbles and is not lowered on a wire;
 *  - the impact (r1): the low wing tip catches the ground first, so in the last 0.18 s the plane cartwheels on it (roll
 *    +18, yaw -10, pitch +8 degrees);
 *  - the elevator: held fast by the gust lock (0) the whole way. The gear stays down. */
const bump = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));
/** the attitude's clock: the keys' time whose angles the plane shows at film time t. motion-r2: the hang is r1's (0.42
 *  of the keys' pace from 21.65 s); its end no longer jumps to 1.42 times the pace in one frame at 22.6 s (the roll
 *  into the turn read as a model swap): from 22.45 s the pace eases up over 0.9 s to a catch-up pace R, holds, and
 *  eases back to 1 over 23.6-24.1 s, R solved so the clock meets the keys at the impact (24.2 s; r1 met them at 23.9 s) */
const HANG_W = (t: number) => 21.65 + (t - 21.65) * 0.42;
const CU_T0 = 22.45, CU_T1 = 24.2, CU_DT = 1 / 600;
const cuPace = (t: number, R: number) => 0.42 + (R - 0.42) * smooth((t - CU_T0) / 0.9) + (1 - R) * smooth((t - 23.6) / 0.5);
const cuTable = (R: number) => { const w = [HANG_W(CU_T0)]; for (let t = CU_T0; t < CU_T1 - 1e-9; t += CU_DT) w.push(w[w.length - 1] + cuPace(t, R) * CU_DT); return w; };
const CU_W = (() => { let lo = 1, hi = 4; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (cuTable(m)[Math.round((CU_T1 - CU_T0) / CU_DT)] < CU_T1) lo = m; else hi = m; } return cuTable((lo + hi) / 2); })();
const turn299 = (t: number) => {
  if (t <= 21.65) return t;
  if (t <= CU_T0) return HANG_W(t);
  if (t >= CU_T1) return t;
  const i = (t - CU_T0) / CU_DT, j = Math.min(CU_W.length - 2, Math.floor(i)); return CU_W[j] + (CU_W[j + 1] - CU_W[j]) * (i - j);
};
/** motion-r2: from the hang on (keys' time 21.7 s), roll and yaw run through a Catmull-Rom curve over the TEST keys
 *  (as the positions do) instead of easing to a stop at each key, which made the wing drop (6 to 40 degrees, keys
 *  22.1-22.5 s) and the turn (40 to 85) each peak at 1.5 times their average speed: the roll now runs on without a
 *  stop-and-lunge, so the side view turns into the top view over about half a second */
const turnAngles = (w: number) => {
  const K = TEST, i = K.findIndex((k, j) => j < K.length - 1 && w >= k.t && w < K[j + 1].t);
  if (i < 0) return null;
  const a = K[i], b = K[i + 1], p = K[Math.max(0, i - 1)], n = K[Math.min(K.length - 1, i + 2)], u = (w - a.t) / (b.t - a.t);
  return { roll: cr(p.roll, a.roll, b.roll, n.roll, u), yaw: cr(p.yaw, a.yaw, b.yaw, n.yaw, u) };
};
/** motion-r2: the turn's roll and yaw (film 22.3-24.2 s) averaged over a 0.8 s window (weighted to its middle) of the eased clock, so the
 *  roll from 40 to 85 degrees (side view to top view) is spread over about 0.4 s instead of 0.27 s */
const turnSoft = (t: number) => {
  let roll = 0, yaw = 0, n = 0;
  for (let i = -6; i <= 6; i++) { const tt = Math.min(24.19, t + (i * 0.4) / 6), c = turnAngles(turn299(tt)); if (!c) continue; const wgt = 1 - Math.abs(i) / 7; roll += c.roll * wgt; yaw += c.yaw * wgt; n += wgt; }
  const k = smooth((t - 22.3) / 0.2);
  const c0 = turnAngles(turn299(t))!;
  return { roll: c0.roll + (roll / n - c0.roll) * k, yaw: c0.yaw + (yaw / n - c0.yaw) * k };
};
const act299 = (t: number) => {
  const run = 1 - smooth((t - 19.2) / 0.4), buffet = smooth((t - 21.4) / 0.4) * (1 - smooth((t - 22.6) / 0.25)), fall = smooth((t - 23.15) / 0.3) * (1 - smooth((t - 23.9) / 0.2));
  const clip = smooth((t - 24.02) / 0.17);
  const pitch = run * (0.55 * Math.sin(t * 41) + 0.3 * Math.sin(t * 67)) + buffet * (2.0 * Math.sin(t * 2 * Math.PI * 6.2) + 0.8 * Math.sin(t * 2 * Math.PI * 9.1)) + 8 * clip;
  const roll = run * 0.5 * Math.sin(t * 53) + buffet * 3.0 * Math.sin(t * 2 * Math.PI * 7.4 + 1) - 5 * bump(t, 22.5, 0.1) + fall * 6 * Math.sin((t - 23.15) * 2 * Math.PI * 1.6) + 18 * clip;
  const yaw = buffet * 1.2 * Math.sin(t * 2 * Math.PI * 5.3) + fall * 4 * Math.sin((t - 23.15) * 2 * Math.PI * 1.6 + 1.2) - 10 * clip;
  return { pitch, roll, yaw, elevator: 0 };
};
export const model299 = (t: number): PlanePose | null => {
  if (t >= IMPACT) return null;
  const running = ENGINE_START.map((s) => t >= s) as [boolean, boolean, boolean, boolean];
  const disc = smooth((t - ENGINE_START[0] - 0.8) / 1.2);
  if (t < 18.6) {
    const k = t < 10.3 ? TAXI[0] : along(TAXI, t);
    return { at: k.at, yaw: k.yaw, pitch: k.pitch, roll: k.roll, spin: spinAt(t, ENGINE_START[0]), disc, running, gear: true, lock: true, elevator: 0 };
  }
  const k = along(TEST, t), w = turn299(t), r = along(TEST, w), a = act299(t), c = t >= 22.3 && t < 24.2 ? turnSoft(t) : null;
  return { at: k.at, yaw: (c ? c.yaw : r.yaw) + a.yaw, pitch: r.pitch + a.pitch, roll: (c ? c.roll : r.roll) + a.roll, spin: spinAt(t, 0), disc: 1, running: [true, true, true, true], gear: true, lock: true, elevator: a.elevator };
};

// ---------------- the Y1B-17s, 1937 on (s08, s10) ----------------
/** s08: a Y1B-17 on the runway; the pilot ticks the list; it takes off level and climbs away (45.6 to 49.4 s) */
const SAFE: Key[] = [
  { t: 45.6, at: [-70, G - 0.15, 0], yaw: 0, pitch: 3, roll: 0 },
  { t: 47.0, at: [-20, G + 0.3, 0], yaw: 0, pitch: 8, roll: 0 },
  { t: 48.2, at: [30, 9, 0], yaw: 0, pitch: 9, roll: 0 },
  { t: 49.6, at: [95, 22, 0], yaw: 0, pitch: 8, roll: 0 },
];
export const y1b17 = (t: number): PlanePose | null => {
  if (t < 42.3 || t >= 49.6) return null;
  if (t < 45.6) return { at: SAFE[0].at, yaw: 0, pitch: 3, roll: 0, spin: spinAt(t, 42.3), disc: 1, gear: true, lock: false };
  const k = along(SAFE, t);
  return { at: k.at, yaw: k.yaw, pitch: k.pitch, roll: k.roll, spin: spinAt(t, 42.3), disc: 1, gear: t < 48.4, lock: false };
};
/** s01 and s10: the plane parked on the apron, the bookend frame (the glass nose close) */
export const parkedAt = (t: number): PlanePose | null =>
  t < 5.0 || t >= 54.5 ? { at: PARKED, yaw: 0, pitch: ON_GROUND.pitch, roll: 0, spin: 0, disc: 0, running: [false, false, false, false], gear: true, lock: t < 5.0 } : null;
