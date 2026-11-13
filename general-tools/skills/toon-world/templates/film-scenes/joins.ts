// The join cards: the state at each cut between two scenes (stories/__SLUG__/joins.json). The scene before ends on its
// join card and the scene after starts on it, so a cut never jumps a person, a pose or the camera by accident. Both
// scenes read their end and start state from here; `assertJoins` (run by each Scene.tsx) refuses a scene that drifts
// off its cards by more than 2 cm or 0.5 degrees of field of view.
//
// joins.json: { "joins": [ { "after": "s01", "before": "s02", "camera": { "pos": [x,y,z], "look": [x,y,z], "fov": 40,
//   "roll": 0 }, "people": { "<who>": { "at": [x,y,z], "pose": { ...FrontOpts }, "expr": "neutral" } } } ] }
// A hard cut (a new place, a new angle on purpose) sets "cut": true: the camera is then free on both sides, and only
// the people are held. "dip": <frames> is a jump in time through black (Film.tsx fades each side over that many frames)
// and holds nobody (join-card.mjs --jump). The join's film frame is where the scene after starts (plan.ts sceneFrom).
// A person's card scale (sx, sy) and lean are on the card too: `holdCards` eases them like the pose, and `assertJoins`
// refuses a size that jumps (the cliff film: Josh's height changed across a join two builders made). The size itself
// is set once per person in cast.ts SCALE (the shots stage); a scene's sx/sy is squash and stretch on top of it.
// Write a card from the scene before's last frame with tools/join-card.mjs <scene>; a scene meets its cards through
// `onCards` (poses) and its first and last camera keys.
import data from '../../../stories/__SLUG__/joins.json';
import type { Expr, FrontOpts } from '../../look/toon';
import type { PersonAt } from './cast';
import { sceneFrom } from './plan';

export type V3 = [number, number, number];
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
export type JoinPerson = { at: V3; pose?: FrontOpts; expr?: Expr; lean?: number; sx?: number; sy?: number };
export type Join = { after: string; before: string; cut?: boolean; dip?: number; why?: string; camera: Cam; people: Record<string, JoinPerson> };
const JOINS = ((data as unknown as { joins?: Join[] }).joins ?? []) as Join[];

/** the card this scene starts on (null for the film's first scene) */
export const joinIn = (scene: string): Join | null => JOINS.find((j) => j.before === scene) ?? null;
/** the card this scene ends on (null for the last scene) */
export const joinOut = (scene: string): Join | null => JOINS.find((j) => j.after === scene) ?? null;
/** the film frame of a join (the scene after's first frame) */
export const joinFrame = (j: Join) => sceneFrom(j.before);
/** a person's state on a card, merged into a pose: what a scene blends from (start) or toward (end) */
export const personOn = (j: Join | null, who: string): JoinPerson | null => j?.people[who] ?? null;
/** the pose on a card as FrontOpts (expr folded in) */
export const poseOn = (j: Join | null, who: string, fallback: FrontOpts = {}): FrontOpts => {
  const p = personOn(j, who); return p ? { ...fallback, ...(p.pose ?? {}), ...(p.expr ? { expr: p.expr } : {}) } : fallback;
};

// ---------------- poses across a cut ----------------
type P2 = [number, number];
const L = (a: number, b: number, k: number) => a + (b - a) * k;
const LP = (a: P2, b: P2, k: number): P2 => [L(a[0], b[0], k), L(a[1], b[1], k)];
/** the numbers of a pose that can move smoothly (the rest, like the expression or the mode, switch at the middle) */
const NUM = ['drop', 'lookY', 'tilt', 'headTilt', 'hairSwing', 'capLift', 'look', 'talk'] as const;
/** a pose part of the way from a to b: free-pose points and numbers move, the rest switches at k = 0.5. Two poses
 *  blend only point for point: both need legsAt (or both not), both armsAt (or both not). Two faces blend through
 *  look/toon.ts's in-between (exprTo, exprK), never a one-frame swap (S5-78). */
export const blendPose = (a: FrontOpts, b: FrontOpts, k: number): FrontOpts => {
  const o: FrontOpts = { ...(k < 0.5 ? a : b) };
  // the face: a's own face (with its own in-between) for the first quarter, b's for the last, and between them an
  // in-between from the face a shows to the face b shows
  const face = (x: FrontOpts): Expr => (x.exprTo !== undefined && (x.exprK ?? 0) >= 0.5 ? x.exprTo : x.expr ?? 'neutral');
  const own = (x: FrontOpts) => { o.expr = x.expr; if (x.exprTo !== undefined) { o.exprTo = x.exprTo; o.exprK = x.exprK; } else { delete o.exprTo; delete o.exprK; } };
  if (face(a) === face(b) || k <= 0.25) own(k < 0.5 ? a : b);
  else if (k >= 0.75) own(b);
  else { o.expr = face(a); o.exprTo = face(b); o.exprK = Math.round(((k - 0.25) / 0.5) * 20) / 20; }
  for (const n of NUM) if (a[n] !== undefined || b[n] !== undefined) (o as Record<string, unknown>)[n] = L(a[n] ?? 0, b[n] ?? 0, k);
  if (a.legsAt && b.legsAt) o.legsAt = [[LP(a.legsAt[0][0], b.legsAt[0][0], k), LP(a.legsAt[0][1], b.legsAt[0][1], k)], [LP(a.legsAt[1][0], b.legsAt[1][0], k), LP(a.legsAt[1][1], b.legsAt[1][1], k)]];
  if (a.armsAt && b.armsAt) o.armsAt = [[LP(a.armsAt[0][0], b.armsAt[0][0], k), LP(a.armsAt[0][1], b.armsAt[0][1], k), k < 0.5 ? a.armsAt[0][2] : b.armsAt[0][2]], [LP(a.armsAt[1][0], b.armsAt[1][0], k), LP(a.armsAt[1][1], b.armsAt[1][1], k), k < 0.5 ? a.armsAt[1][2] : b.armsAt[1][2]]];
  if (a.hand && b.hand) o.hand = LP(a.hand, b.hand, k);
  if (a.handL && b.handL) o.handL = LP(a.handL, b.handL, k);
  return o;
};
const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
/** A person's pose at scene frame f, held to the join cards: it starts on the card in (and eases into the scene's own
 *  pose over `over` frames) and ends on the card out (easing onto it over the last `over` frames). A card's pose and
 *  expression win at the very first and last frame, so a cut never pops a pose or swaps a face. */
export const onCards = (scene: string, frames: number, who: string, f: number, own: FrontOpts, over = 12): FrontOpts => {
  let o = own;
  const a = personOn(joinIn(scene), who), b = personOn(joinOut(scene), who);
  if (a && (a.pose || a.expr) && f < over) o = blendPose(poseOn(joinIn(scene), who, own), o, ease(f / over));
  if (b && (b.pose || b.expr) && f > frames - 1 - over) o = blendPose(o, poseOn(joinOut(scene), who, own), ease((f - (frames - 1 - over)) / over));
  return o;
};

/** A whole person held to the join cards: the pose as `onCards`, and the card scale (sx, sy) and lean eased the same
 *  way, so a size or a lean never pops across a join. Use it in place of onCards when a scene changes sx, sy or lean. */
export const holdCards = (scene: string, frames: number, p: PersonAt, f: number, over = 12): PersonAt => {
  const a = personOn(joinIn(scene), p.who), b = personOn(joinOut(scene), p.who);
  const o: PersonAt = { ...p, opts: onCards(scene, frames, p.who, f, p.opts, over) };
  const num = (k: 'sx' | 'sy' | 'lean', d: number) => {
    let v = p[k] ?? d;
    if (a && f < over) v = L(a[k] ?? d, v, ease(f / over));
    if (b && f > frames - 1 - over) v = L(v, b[k] ?? d, ease((f - (frames - 1 - over)) / over));
    if (v !== d || p[k] !== undefined) o[k] = v;
  };
  num('sx', 1); num('sy', 1); num('lean', 0);
  return o;
};

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Throw when a scene's first or last frame is off its join cards: camera (unless the join is a cut) and each person
 *  named on the card (position; and the expression, when the card names one). */
export const assertJoins = (scene: string, frames: number, camAt: (f: number) => Cam, people: (f: number) => { who: string; at: V3; opts: FrontOpts; sx?: number; sy?: number }[]) => {
  const faults: string[] = [];
  const check = (j: Join | null, f: number, side: string) => {
    if (!j) return;
    const c = camAt(f);
    if (!j.cut) {
      if (dist(c.pos, j.camera.pos) > 0.02) faults.push(`${side}: camera at [${c.pos.map((v) => v.toFixed(2))}], card [${j.camera.pos}]`);
      if (dist(c.look, j.camera.look) > 0.02) faults.push(`${side}: camera looks at [${c.look.map((v) => v.toFixed(2))}], card [${j.camera.look}]`);
      if (Math.abs(c.fov - j.camera.fov) > 0.5) faults.push(`${side}: fov ${c.fov.toFixed(1)}, card ${j.camera.fov}`);
    }
    const ps = people(f);
    for (const [who, card] of Object.entries(j.people)) {
      const p = ps.find((x) => x.who === who);
      if (!p) { faults.push(`${side}: ${who} is on the card but not in the scene`); continue; }
      if (dist(p.at, card.at) > 0.02) faults.push(`${side}: ${who} at [${p.at.map((v) => v.toFixed(2))}], card [${card.at}]`);
      if (card.expr && p.opts.expr !== card.expr) faults.push(`${side}: ${who} looks "${p.opts.expr}", card "${card.expr}"`);
      for (const k of ['sx', 'sy'] as const) if (Math.abs((p[k] ?? 1) - (card[k] ?? 1)) > 0.02) faults.push(`${side}: ${who} ${k} ${(p[k] ?? 1).toFixed(2)}, card ${card[k] ?? 1} (a size that jumps at the join: hold it with holdCards)`);
      const cp = card.pose ?? {}, pp = p.opts;
      for (const n of NUM) if (cp[n] !== undefined && Math.abs((pp[n] ?? 0) - cp[n]!) > 2) faults.push(`${side}: ${who} ${n} ${pp[n]}, card ${cp[n]}`);
      const far = (x: P2[] , y: P2[]) => x.some((q, i) => Math.hypot(q[0] - y[i][0], q[1] - y[i][1]) > 4);
      if (cp.legsAt && (!pp.legsAt || far(cp.legsAt.flat() as P2[], pp.legsAt.flat() as P2[]))) faults.push(`${side}: ${who}'s legs are off the card's`);
      if (cp.armsAt && (!pp.armsAt || far(cp.armsAt.map((x) => [x[0], x[1]]).flat() as P2[], pp.armsAt.map((x) => [x[0], x[1]]).flat() as P2[]))) faults.push(`${side}: ${who}'s arms are off the card's`);
    }
  };
  check(joinIn(scene), 0, `${scene} first frame vs join ${joinIn(scene)?.after}|${scene}`);
  check(joinOut(scene), frames - 1, `${scene} last frame vs join ${scene}|${joinOut(scene)?.before}`);
  if (faults.length) throw new Error(`join cards (stories/__SLUG__/joins.json):\n  ${faults.join('\n  ')}`);
};
