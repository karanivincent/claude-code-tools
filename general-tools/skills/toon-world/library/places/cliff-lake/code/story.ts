// Spike 4 practice clip: Josh at the cliff (from Mark Manson's account of his friend: a party at a lake north of Dallas,
// a jump from a cliff into the lake, he drowned). Our own narration and pictures. Never posted.
// Narration (George, sped 1.15x, starts 0.1 s): Josh 0.10 laughed 0.42 at 0.75 the 0.81 edge 0.93 | He 1.61 jumped 2.31 |
// and 3.70 never 3.75 came 3.98 up 4.30. Every visual reaction lands 0-3 frames before its word.
export const FPS = 30, TOTAL = 150;
export type V3 = [number, number, number];
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
const F = (t: number) => Math.round(t * FPS);
export const WORD = { josh: F(0.1), laughed: F(0.42), edge: F(0.93), he: F(1.61), jumped: F(2.31), never: F(3.75), up: F(4.3) };

// ---------------- the place ----------------
/** the cliff top (metres above the lake); the edge runs along z at x = 0, the lake is at +x */
export const TOP = 5.0;
export const JOSH0: V3 = [-0.38, TOP, 0.0];
export const FRIEND1: V3 = [-1.45, TOP, 0.05];
export const FRIEND2: V3 = [-0.85, TOP, -3.0];

// ---------------- Josh ----------------
export const CROUCH = [WORD.he - 4, WORD.jumped - 6] as const; // 44-63: winds up
export const LEAP = WORD.jumped - 6;                            // 63: leaves the edge
const VX = 3.0, VY = 2.8, G = 7.0; // spike 7 r3: a forward arc, out from the wall                             // a cheat: g = 14 m/s^2 so the fall reads in a second
/** the moment his feet reach the water (s after the leap) */
const TC = (VY + Math.sqrt(VY * VY + 4 * G * TOP)) / (2 * G);
/** Josh's feet (world) at frame f, and whether he is above the water. Spike 7: below the surface the water slows him
 *  (he sinks 2.6 m at most), so the entry is seen: the body goes in over about 7 frames before the splash rises */
export const joshAt = (f: number): { pos: V3; air: number; under: boolean } => {
  if (f < LEAP) return { pos: JOSH0, air: 0, under: false };
  const t = (f - LEAP) / FPS;
  if (t <= TC) { const y = TOP + VY * t - G * t * t; return { pos: [JOSH0[0] + VX * t, y, JOSH0[2] + 0.25 * t], air: t, under: false }; }
  const y = -2.6 * (1 - Math.exp(-(t - TC) * 4.7)), dx = 0.3 * (1 - Math.exp(-(t - TC) * 6)); // r3: he slows in the water, the entry holds ~10 f
  return { pos: [JOSH0[0] + VX * TC + dx, y, JOSH0[2] + 0.25 * TC], air: t, under: y < -1.75 };
};
/** the frame his feet hit the water, and where */
export const SPLASH_F = LEAP + Math.ceil(TC * FPS);
export const SPLASH_AT: V3 = [JOSH0[0] + VX * TC, 0, JOSH0[2] + 0.25 * TC];
/** spike 7: the splash column rises once the body is in (the entry is seen first) */
export const SPLASH_RISE = SPLASH_F + 4;
/** spike 7 r4: the frame his cap comes off (near the top of the arc) */
export const CAP_OFF = LEAP + 18; // r5: late in the fall, so he stays himself in the air

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const dolly = (c: Cam, k: number): Cam => ({ ...c, pos: c.pos.map((v, i) => c.look[i] + (v - c.look[i]) * (1 - k)) as V3 });
/** A: low on the lake side, looking up: Josh laughing on the lip against the dusk sky, the drop under him, friends behind */
export const CAM_A: Cam = { pos: [2.9, TOP - 0.2, 4.7], look: [-0.5, TOP + 0.35, -0.1], fov: 42, roll: 0 };
// Spike 7: one continuous camera, no cuts. A pushes in on the laugh; on the leap it swings out over the lake to a side
// view along the cliff (the wall recedes on the left, so the gap between him and the rock reads) and cranes down with him,
// a little behind; it holds on the entry, the splash and the rings; on "came up" it cranes back up the face to Marcus
// at the lip, low and looking up, as the clip opened.
const FOLLOW_Z = 7.2;
const follow = (f: number): Cam => {
  // r5: an eased crane (it no longer stops dead at the entry): smooth from the lip height to the water over the fall
  const g = Math.min(f, SPLASH_F), jn = joshAt(g).pos, e = smooth((f - (LEAP + 2)) / (SPLASH_F + 10 - LEAP - 2));
  const yc = TOP + 0.9 + (0.8 - TOP - 0.9) * e;
  return { pos: [3.1, yc + 0.45, FOLLOW_Z], look: [0.55 + 0.72 * (SPLASH_AT[0] - JOSH0[0]) * smooth((f - LEAP) / (SPLASH_F - LEAP)), yc - 0.05, 0.2], fov: 46, roll: 1.5 }; // r3: side-on, so the lake (not the rock) is behind him
};
/** the end: low at the lip on the lake side, looking up at Marcus leaning out over the drop */
export const CAM_END: Cam = { pos: [1.3, TOP + 0.65, 1.8], look: [-0.5, TOP + 0.95, -0.4], fov: 44, roll: -2 }; // r4: closer, his face fills more // r2: the lip, the party lights and trees behind him
export const RISE = [WORD.never - 10, WORD.up + 17] as const; // r6: a slower crane (46 f) // r3: tilt up first, then a slow crane // the crane back up the face
export const camAt = (f: number): Cam => {
  // a push in on his face through "laughed ... edge"; r2: it eases back out for the take-off and tilts up with his rise,
  // so the leap is seen against the sky with air under him
  const rise = Math.max(0, joshAt(Math.min(f, LEAP + 16)).pos[1] - TOP);
  let c = dolly(CAM_A, 0.36 * glide(f / 56) - 0.3 * smooth((f - 52) / 18));
  c = { ...c, look: [c.look[0] + 0.5 * glide((f - LEAP) / 12), c.look[1] + 0.9 * rise, c.look[2]] };
  c = mixCam(c, follow(f), smooth((f - (LEAP - 3)) / 28)); // r4-5: a gentler swing, overlapping the pull-back
  // after the entry: hold, drifting in a touch on the rings
  c = dolly(c, 0.12 * smooth((f - SPLASH_F) / 30));
  // the crane up the face to Marcus (it stays over the lake, x > 1.7, so it never passes through the rock)
  const kl = smooth((f - RISE[0]) / (RISE[1] - RISE[0] - 6)), kp = smooth((f - RISE[0] - 6) / (RISE[1] - RISE[0] - 6));
  if (kl > 0) { const e = dolly(CAM_END, 0.0025 * Math.max(0, f - RISE[1])); c = { pos: mixCam(c, e, kp).pos, look: mixCam(c, e, kl).look, fov: c.fov + (e.fov - c.fov) * kp, roll: c.roll + (e.roll - c.roll) * kp }; }
  return c;
};
/** lens: focus on Josh until he is in, then the splash, then Marcus as the crane arrives */
export const focusAt = (f: number): V3 => {
  const j = joshAt(Math.min(f, SPLASH_F)).pos, sp: V3 = f < SPLASH_F ? [j[0], j[1] + 1.0, j[2]] : [SPLASH_AT[0], 0.8, SPLASH_AT[2]];
  const m: V3 = [-0.45, TOP + 1.4, -0.35], k = glide((f - RISE[0] - 4) / (RISE[1] - RISE[0] - 4));
  return [sp[0] + (m[0] - sp[0]) * k, sp[1] + (m[1] - sp[1]) * k, sp[2] + (m[2] - sp[2]) * k];
};
export const dofAt = (f: number) => ({ cInf: lin([[0, 18], [LEAP, 18], [LEAP + 20, 6], [SPLASH_F + 10, 6], [150, 10]], f) });
