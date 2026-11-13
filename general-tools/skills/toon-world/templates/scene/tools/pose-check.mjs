#!/usr/bin/env node
// __SLUG__: the pose check, frame by frame through a scene's people (S5-78). It flags:
//   - a face swapped in one frame: the expression changes between two frames with no in-between (exprTo, exprK) on
//     either; ease it over 3 frames or more (joins.ts blendPose does it for you between two poses);
//   - a hand or a foot that jumps in one frame: a step over --max design units (60) and over three times the steps
//     around it (an arm swap; a fast but even throw of the arms is not a jump);
//   - a mode switch (stand to sit, crouch to fall) in one frame.
// The cliff film: judges at 6 fps blamed one-tile face and arm swaps in two scenes, and nothing in code saw them.
// Planned cuts inside the scene (shots.ts CUTS) are skipped.
//   node src/stories/__SLUG__/tools/pose-check.mjs [<scene>] [--max 60]
// No scene: every scene. Exit 1 on a fault.
import { args, loadFilm, loadScene } from './lib.mjs';

const { pos, o } = args();
const MAX = Number(o.max ?? 60);
const film = await loadFilm();
const ids = pos[0] ? [pos[0]] : film.SCENES.map((s) => s.id);
const d2 = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0);
/** the hand and foot points of a pose, by name */
const points = (q) => {
  const p = {};
  if (q.armsAt) { p.handL = q.armsAt[0][1]; p.handR = q.armsAt[1][1]; }
  if (q.hand) p.handR = q.hand; if (q.handL) p.handL = q.handL;
  if (q.legsAt) { p.footL = q.legsAt[0][1]; p.footR = q.legsAt[1][1]; }
  return p;
};
/** the face a frame shows, and whether it is an in-between */
const shown = (x) => (x.exprTo !== undefined && (x.exprK ?? 0) >= 0.5 ? x.exprTo : x.expr ?? 'neutral');
const between = (x) => x.exprTo !== undefined && (x.exprK ?? 0) > 0 && (x.exprK ?? 0) < 1;
let total = 0;
for (const id of ids) {
  const S = await loadScene(id), cuts = new Set(S.CUTS ?? []), faults = [];
  const frames = []; for (let f = 0; f < S.FRAMES; f++) frames.push(new Map(S.people(f).filter((p) => !p.hidden).map((p) => [p.who, p.opts])));
  // each person's step per point per frame (null across a planned cut or where they are not on screen)
  const step = (who, k, f) => { if (f < 1 || f >= frames.length || cuts.has(f)) return null; const a = frames[f - 1].get(who), b = frames[f].get(who); return a && b ? d2(points(a)[k], points(b)[k]) : null; };
  for (let f = 1; f < frames.length; f++) {
    if (cuts.has(f)) continue;
    for (const [who, q] of frames[f]) {
      const a = frames[f - 1].get(who); if (!a) continue;
      if (shown(a) !== shown(q) && !between(a) && !between(q)) faults.push(`f${f}: ${who}'s face swaps in one frame, ${shown(a)} -> ${shown(q)} (ease it over 3+ frames: exprTo, exprK)`);
      if ((a.mode ?? 'march') !== (q.mode ?? 'march')) faults.push(`f${f}: ${who} switches ${a.mode ?? 'march'} -> ${q.mode ?? 'march'} in one frame`);
      for (const k of Object.keys(points(q))) {
        const m = step(who, k, f); if (m === null || m <= MAX) continue;
        const near = [f - 2, f - 1, f + 1, f + 2].map((g) => step(who, k, g)).filter((x) => x !== null);
        const avg = near.length ? near.reduce((x, y) => x + y, 0) / near.length : 0;
        if (m > 3 * avg + 10) faults.push(`f${f}: ${who}'s ${k} jumps ${Math.round(m)} units in one frame (the frames around it move ${Math.round(avg)})`);
      }
    }
  }
  console.log(`${id}: ${faults.length ? faults.length + ' fault(s)' : 'no swaps or jumps'}`);
  for (const l of faults.slice(0, 30)) console.log('  ' + l);
  if (faults.length > 30) console.log(`  ... and ${faults.length - 30} more`);
  total += faults.length;
}
if (total) process.exitCode = 1;
