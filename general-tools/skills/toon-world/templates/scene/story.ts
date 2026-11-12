// __SLUG__ scene __SCENE__: timing, beats, camera keys and the people, frame by frame (scene frames: 0 is this scene's
// first frame; the film frame is plan.ts sceneFrom(SCENE) + f). The stand-in below: two people on the shore; the hero
// laughs with his arms up, turns to a dare (eyes down at the water) and crouches; the friend points and laughs, then
// a hand goes to her mouth while she talks. Replace it with the scene's beats.
// The four passes build this file in order, each judged blind against the best so far:
//   1. world and light (places/<place>.ts and the place light: not this file)  2. people and acting (people, POSES)
//   3. motion and staging (CAM_KEYS, positions, paths)  4. sound (the film's mix; the cues land on BEATS)
// The scene starts on its join card in and ends on its join card out (stories/__SLUG__/joins.json): the first and
// last camera keys and each person's first and last place come from those cards; Scene.tsx refuses a drift.
// No three.js or Remotion imports here: tools/cam-speed.mjs and tools/path-check.mjs load this file in node.
import { sceneFrames } from '../../plan';
import { joinIn, joinOut, personOn, onCards, type Cam, type V3 } from '../../joins';
import { glide, smooth, keysAt, mix3, type CamKey } from '../../motion';
import { SHORE } from '../../places/marks';
import type { PersonAt } from '../../cast';
import type { PoseEntry } from '../../poses';
import type { FrontOpts } from '../../../../look/toon';

export const SCENE = '__SCENE__';
export const FRAMES = sceneFrames(SCENE);
export const PLACE = 'shore' as const;
const IN = joinIn(SCENE), OUT = joinOut(SCENE);

// ---------------- beats (scene frames; from the voice's word times: a reaction lands 0-3 frames before its word) ----------------
export const BEATS = { laugh: 0, dare: Math.round(FRAMES * 0.4), crouch: Math.round(FRAMES * 0.6), talk: Math.round(FRAMES * 0.5), end: FRAMES - 1 };

// ---------------- camera: keys eased in and out (motion.ts keysAt), first and last from the join cards ----------------
const OWN_START: Cam = { pos: [2.6, SHORE.top + 0.1, 4.6], look: [-0.6, SHORE.top + 0.9, -0.2], fov: 42, roll: 0 };
const OWN_END: Cam = { pos: [1.9, SHORE.top + 0.5, 3.4], look: [-0.7, SHORE.top + 0.85, -0.3], fov: 40, roll: 0 };
const start = IN && !IN.cut ? IN.camera : OWN_START, end = OUT && !OUT.cut ? OUT.camera : OWN_END;
export const CAM_KEYS: CamKey[] = [
  { f: 0, ...start },
  { f: BEATS.dare, pos: [2.2, SHORE.top + 0.25, 4.0], look: [-0.6, SHORE.top + 0.85, -0.25], fov: 41, roll: 0, ease: 'through' },
  { f: FRAMES - 1, ...end },
];
export const camAt = (f: number): Cam => keysAt(CAM_KEYS, f);
/** focus on the hero's face */
export const focusAt = (f: number): V3 => { const h = heroAt(f); return [h[0], h[1] + 1.4, h[2]]; };
/** blur at infinity (px): people against a busy world */
export const dofAt = (_f: number) => 14;
/** the light cools after the action (0 = the place light as set) */
export const coldAt = (_f: number) => 0;
/** splashes: [{ at: [x, 0, z], frame }] (places/parts/splash.ts: see-through, narrow, over in under a second) */
export const SPLASHES: { at: V3; frame: number; scale?: number }[] = [];

// ---------------- people ----------------
const q = (v: number) => Math.round(v);
const placeOf = (who: string, home: V3) => ({ a: personOn(IN, who)?.at ?? home, b: personOn(OUT, who)?.at ?? personOn(IN, who)?.at ?? home });
const heroPath = placeOf('hero', SHORE.hero), friendPath = placeOf('friend', SHORE.friend);
/** where the hero's soles are: a short step from the join in to the join out */
export const heroAt = (f: number): V3 => mix3(heroPath.a, heroPath.b, glide(f / (FRAMES - 1)));
const friendAt = (f: number): V3 => mix3(friendPath.a, friendPath.b, glide(f / (FRAMES - 1)));
// free poses (look/toon.ts FrontOpts): hips by `drop`, knees and feet by `legsAt`, elbows and hands by `armsAt`
type P2 = [number, number]; type Arm = [P2, P2];
const mir = (p: P2): P2 => [600 - p[0], p[1]];
const mixA = (a: Arm, b: Arm, k: number): Arm => [[a[0][0] + (b[0][0] - a[0][0]) * k, a[0][1] + (b[0][1] - a[0][1]) * k], [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k]];
const arms = (L: Arm, R: Arm = [mir(L[0]), mir(L[1])], frontL = false, frontR = false): FrontOpts['armsAt'] => [[L[0], L[1], frontL], [R[0], R[1], frontR]];
const HIP = 637, SOLE = 966;
const legs = (d: number, spread = 0): FrontOpts['legsAt'] => { const k: P2 = [258 - spread - 0.3 * Math.max(0, d), (HIP + d + SOLE) / 2], ft: P2 = [248 - spread, SOLE]; return [[k, ft], [mir(k), mir(ft)]]; };
const A_SIDES: Arm = [[202, 560], [195, 680]], A_WIDE: Arm = [[160, 380], [95, 250]], A_BACK: Arm = [[178, 565], [122, 548]];

const ownHeroPose = (f: number): FrontOpts => {
  if (f < BEATS.dare) { // the laugh: arms fly up, a "ha" every 6 frames (shoulders bounce, the head rocks back)
    const up = glide(f / 10), b = Math.sin((2 * Math.PI * f) / 6) * smooth((f - 6) / 4), d = 5 + 5 * b;
    const a = mixA(A_SIDES, A_WIDE, up);
    return { mode: 'stand', expr: b > -0.35 ? 'laugh' : 'grin', drop: q(d), legsAt: legs(d), armsAt: arms([[a[0][0], a[0][1] - 14 * b + d], [a[1][0], a[1][1] - 14 * b + d]]), headTilt: q(-8 - 4 * b), hairSwing: 0 };
  }
  // the dare (half-lidded, eyes down at the water: under a cap brim the eyes carry it), then the crouch
  const k = glide((f - BEATS.crouch) / 10), d = 8 + 150 * k, a = mixA(mixA(A_WIDE, A_SIDES, glide((f - BEATS.dare) / 6)), A_BACK, k);
  return { mode: 'stand', expr: 'dare', drop: q(d), legsAt: legs(d, 6 * k), armsAt: arms(a), headTilt: q(6 * k), lookY: 5 };
};
const ownFriendPose = (f: number): FrontOpts => {
  if (f < BEATS.talk) { // laughs at him, pointing (acts toward the hero, never mirrors him)
    const b = Math.sin((2 * Math.PI * f) / 7);
    return { mode: 'stand', expr: b > -0.3 ? 'laugh' : 'grin', armsAt: arms([[185, 560], [262, 600]], [[430, 470], [560, 430 + 8 * b]], true, false), headTilt: q(6 - 4 * b), hairSwing: q(4 * b) };
  }
  // she talks with a worried face (the face stays while the lips move), then a hand comes to her mouth (drawn after
  // the face) and she falls quiet
  const k = glide((f - BEATS.talk - 30) / 10), talk = f < BEATS.talk + 30 ? 0.5 + 0.5 * Math.sin(f * 1.3) : 0;
  return { mode: 'stand', expr: 'nervous', talk,
    armsAt: arms(mixA([[185, 560], [262, 600]], [[205, 410], [282, 362]], k), [[402, 560], [395, 680]], k > 0.4, false), headTilt: 6, lookY: 3, hairSwing: q(-6 * Math.exp(-(f - BEATS.talk) / 8)) };
};
/** the poses held to the join cards: each starts on the card in and ends on the card out (joins.ts onCards) */
export const heroPose = (f: number) => onCards(SCENE, FRAMES, 'hero', f, ownHeroPose(f));
export const friendPose = (f: number) => onCards(SCENE, FRAMES, 'friend', f, ownFriendPose(f));
export const people = (f: number): PersonAt[] => [
  { who: 'hero', at: heroAt(f), opts: heroPose(f) },
  { who: 'friend', at: friendAt(f), opts: friendPose(f) },
];

// ---------------- the pose sheet: every pose the words need, and each repeated action drawn differently ----------------
export const POSE_FRAMES = [2, 5, BEATS.dare + 3, BEATS.crouch + 10, BEATS.talk - 2, BEATS.talk + 12, BEATS.talk + 14, FRAMES - 1];
export const POSES: PoseEntry[] = POSE_FRAMES.flatMap((f) => people(f).map((p): PoseEntry => [`${p.who} f${f} ${p.opts.expr}`, p.who, p.opts]));

// ---------------- the action's path, for tools/path-check.mjs (does it clear every other figure on screen?) ----------------
export const ACTION = { who: 'hero', frames: [BEATS.crouch, FRAMES - 1] as [number, number] };
