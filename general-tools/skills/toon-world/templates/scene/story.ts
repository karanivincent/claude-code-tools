// __SLUG__ scene __SCENE__: the people, frame by frame, and what the stage needs from them (scene frames: 0 is this scene's
// first frame; the film frame is plan.ts sceneFrom(SCENE) + f). The stand-in below: two people on the shore; the hero
// laughs with his arms up, turns to a dare (eyes down at the water) and crouches; the friend points and laughs, then
// a hand goes to her mouth while she talks. Replace it with the scene's beats.
// The places (world stage), the camera, beats and shot sizes (./shots.ts, shots stage) and each person's size
// (sizes.ts) are locked before this file is built. The scene builder works here in two passes, each round judged
// blind against the best so far: people and acting (people, POSES), then motion and staging (positions, paths,
// secondary motion). The scene starts on its join card in and ends on its join card out (stories/__SLUG__/joins.json):
// each person's first and last place, pose and face come from those cards (keep every pose inside onCards, or every
// person inside holdCards when sx, sy or lean change); Scene.tsx refuses a drift.
// No three.js or Remotion imports here: the tools (cam-speed, path-check, pose-check, shots-check) load it in node.
import { joinIn, joinOut, personOn, onCards, type V3 } from '../../joins';
import { glide, smooth, mix3 } from '../../motion';
import { SHORE } from '../../places/marks';
import { SCENE, FRAMES, BEATS } from './shots';
import type { PersonAt } from '../../cast';
import type { PoseEntry } from '../../poses';
import type { FrontOpts } from '../../../../look/toon';

export { SCENE, FRAMES, PLACE, BEATS, SHOTS, CUTS, CAM_KEYS, camAt, dofAt } from './shots';
const IN = joinIn(SCENE), OUT = joinOut(SCENE);

/** focus on the hero's face */
export const focusAt = (f: number): V3 => { const h = heroAt(f); return [h[0], h[1] + 1.4, h[2]]; };
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
const k20 = (v: number) => Math.round(v * 20) / 20;
/** a face eased from one expression to the next over `over` frames from frame 0 of the change (S5-78) */
const easeFace = (from: FrontOpts['expr'], to: FrontOpts['expr'], since: number, over = 4): Pick<FrontOpts, 'expr' | 'exprTo' | 'exprK'> =>
  since >= over ? { expr: to } : since < 0 ? { expr: from } : { expr: from, exprTo: to, exprK: k20(glide(since / over)) };
const A_SIDES: Arm = [[202, 560], [195, 680]], A_WIDE: Arm = [[160, 380], [95, 250]], A_BACK: Arm = [[178, 565], [122, 548]];

const ownHeroPose = (f: number): FrontOpts => {
  if (f < BEATS.dare) { // the laugh: arms fly up, a "ha" every 6 frames (shoulders bounce, the head rocks back)
    const up = glide(f / 10), b = Math.sin((2 * Math.PI * f) / 6) * smooth((f - 6) / 4), d = 5 + 5 * b;
    const a = mixA(A_SIDES, A_WIDE, up);
    // each "ha" eases the laugh toward a grin and back (an in-between, never a one-frame face swap: S5-78)
    return { mode: 'stand', expr: 'laugh', exprTo: 'grin', exprK: k20(0.5 - 0.5 * b), drop: q(d), legsAt: legs(d), armsAt: arms([[a[0][0], a[0][1] - 14 * b + d], [a[1][0], a[1][1] - 14 * b + d]]), headTilt: q(-8 - 4 * b), hairSwing: 0 };
  }
  // the dare (half-lidded, eyes down at the water: under a cap brim the eyes carry it), then the crouch
  const k = glide((f - BEATS.crouch) / 10), d = 8 + 150 * k, a = mixA(mixA(A_WIDE, A_SIDES, glide((f - BEATS.dare) / 6)), A_BACK, k);
  const face = easeFace('laugh', 'dare', f - BEATS.dare);
  return { mode: 'stand', ...face, drop: q(d), legsAt: legs(d, 6 * k), armsAt: arms(a), headTilt: q(6 * k), lookY: 5 };
};
const ownFriendPose = (f: number): FrontOpts => {
  if (f < BEATS.talk) { // laughs at him, pointing (acts toward the hero, never mirrors him)
    const b = Math.sin((2 * Math.PI * f) / 7);
    return { mode: 'stand', expr: 'laugh', exprTo: 'grin', exprK: k20(0.5 - 0.5 * b), armsAt: arms([[185, 560], [262, 600]], [[430, 470], [560, 430 + 8 * b]], true, false), headTilt: q(6 - 4 * b), hairSwing: q(4 * b) };
  }
  // she talks with a worried face (the face stays while the lips move), then a hand comes to her mouth (drawn after
  // the face) and she falls quiet
  const k = glide((f - BEATS.talk - 30) / 10), talk = f < BEATS.talk + 30 ? 0.5 + 0.5 * Math.sin(f * 1.3) : 0;
  return { mode: 'stand', ...easeFace('laugh', 'nervous', f - BEATS.talk), talk,
    // the pointing arm comes down over 8 frames (a one-frame arm swap reads as a snap: S5-78)
    armsAt: arms(mixA([[185, 560], [262, 600]], [[205, 410], [282, 362]], k), mixA([[430, 470], [560, 430]], [[402, 560], [395, 680]], glide((f - BEATS.talk) / 8)), k > 0.4, false), headTilt: 6, lookY: 3, hairSwing: q(-6 * Math.exp(-(f - BEATS.talk) / 8)) };
};
/** the poses held to the join cards: each starts on the card in and ends on the card out (joins.ts onCards) */
export const heroPose = (f: number) => onCards(SCENE, FRAMES, 'hero', f, ownHeroPose(f));
export const friendPose = (f: number) => onCards(SCENE, FRAMES, 'friend', f, ownFriendPose(f));
export const people = (f: number): PersonAt[] => [
  { who: 'hero', at: heroAt(f), opts: heroPose(f) },
  { who: 'friend', at: friendAt(f), opts: friendPose(f) },
];

// ---------------- the pose sheet: every pose the words need, and each repeated action drawn differently ----------------
// A walk is drawn at mid-step (phase 0.25 or 0.75), never at contact, where the feet are down and the step hides (S5-85).
export const POSE_FRAMES = [2, 5, BEATS.dare + 3, BEATS.crouch + 10, BEATS.talk - 2, BEATS.talk + 12, BEATS.talk + 14, FRAMES - 1];
export const POSES: PoseEntry[] = POSE_FRAMES.flatMap((f) => people(f).map((p): PoseEntry => [`${p.who} f${f} ${p.opts.expr}`, p.who, p.opts]));

// ---------------- the action's path, for tools/path-check.mjs (does it clear every other figure and blocker on screen?) ----------------
// Its last frame is inside the scene (S5-87): an entry that lands after the scene's last frame is never seen.
export const ACTION = { who: 'hero', frames: [BEATS.crouch, FRAMES - 1] as [number, number] };
