// __SLUG__ scene __SCENE__: the shots. The shots stage sets every scene's camera path, shot sizes and beats before any
// acting, checks them with tools/shots-check.mjs, and locks this file with the cast's sizes and the join cards
// (S5-73). The scene builders read it and do not change it; a change goes to the lead, who reopens the shots stage.
// When an earlier build of this beat exists (a spike, a practice clip, an earlier version), it is the reference: copy
// its shot sizes and its camera side here (S5-76). In the cliff film the jump scene was planned "side-on, tilt down",
// came out wide with faces at 1/20 of the frame, and lost to the 5 s spike that held Josh at a third of the frame.
// No three.js or Remotion imports here: the tools load this file in node.
import { sceneFrames } from '../../plan';
import { joinIn, joinOut, type Cam } from '../../joins';
import { keysAt, type CamKey } from '../../motion';
import { SHORE } from '../../places/marks';

export const SCENE = '__SCENE__';
export const FRAMES = sceneFrames(SCENE);
export const PLACE = 'shore' as const;
const IN = joinIn(SCENE), OUT = joinOut(SCENE);

// ---------------- beats (scene frames; from the voice's word times: a reaction lands 0-3 frames before its word) ----------------
export const BEATS = { laugh: 0, dare: Math.round(FRAMES * 0.4), crouch: Math.round(FRAMES * 0.6), talk: Math.round(FRAMES * 0.5), end: FRAMES - 1 };

// ---------------- the shot list (S5-88) ----------------
/** One shot: its frames, its size, who it is about. A "close" or "mid" shot holds `hero` at a third of the frame
 *  height or more (faces read on a phone); a "wide" only places the scene and lasts 45 frames (1.5 s) at most, unless
 *  `why` says otherwise. Every shot looks into the place's far picture (S5-72) unless `noFar` says why not.
 *  `ref` names the reference shot it copies (S5-76). */
export type Shot = { from: number; to: number; size: 'wide' | 'mid' | 'close'; hero?: string; why?: string; noFar?: string; ref?: string };
export const SHOTS: Shot[] = [
  { from: 0, to: FRAMES - 1, size: 'mid', hero: 'hero' },
];
/** planned cuts inside the scene (scene frames): a jump on purpose, not counted by tools/cam-speed.mjs */
export const CUTS: number[] = [];

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
/** blur at infinity (px): people against a busy world */
export const dofAt = (_f: number) => 0; // sharp backgrounds, as in the reference stills (S3-35)
