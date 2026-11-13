#!/usr/bin/env node
// __SLUG__: the shots check, run by the shots stage on every scene before any acting (S5-72, S5-88). For each shot in a
// scene's shots.ts SHOTS, through the scene's own camera:
//   - size: on a "close" or "mid" shot the hero is a third of the frame height or more (faces read on a phone); a
//     "wide" lasts 45 frames (1.5 s) at most unless the shot says why;
//   - far picture: the camera looks into the place's far picture (places/marks.ts FAR), with the frame's own width
//     inside its arc, unless the shot says why not (noFar);
//   - every frame of the scene is in a shot.
// The cliff film's jump was wide with figures at about 1/20 of the frame, and looked away from the far picture into a
// flat sky; the spike it lost to held Josh at a third of the frame with the sunset hills behind him.
//   node src/stories/__SLUG__/tools/shots-check.mjs [<scene>] [--min 0.33] [--wide 45]
// No scene: every scene. Prints a line per shot; exit 1 on a fault.
import path from 'node:path';
import { args, loadFilm, loadScene, loadTs, STORY_DIR } from './lib.mjs';

const { pos, o } = args();
const MIN = Number(o.min ?? 0.33), WIDE = Number(o.wide ?? 45), W = 1080, H = 1920;
const film = await loadFilm();
const marks = await loadTs(path.join(STORY_DIR, 'places', 'marks.ts'));
const sizes = await loadTs(path.join(STORY_DIR, 'sizes.ts')).catch(() => ({ sizeOf: () => [1, 1] }));
const ids = pos[0] ? [pos[0]] : film.SCENES.map((s) => s.id);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** a world point to screen pixels through cam (pos, look, fov, roll); null when behind the lens */
const project = (cam, p) => {
  const fwd = norm(sub(cam.look, cam.pos)); let right = norm(cross(fwd, [0, 1, 0])); let up = cross(right, fwd);
  const r = ((cam.roll ?? 0) * Math.PI) / 180;
  if (r) { const c = Math.cos(r), s = Math.sin(r); [right, up] = [right.map((v, i) => v * c + up[i] * s), up.map((v, i) => v * c - right[i] * s)]; }
  const d = sub(p, cam.pos), z = dot(d, fwd);
  if (z <= 0.05) return null;
  const t = Math.tan(((cam.fov ?? 40) * Math.PI) / 360), aspect = W / H;
  return { x: (dot(d, right) / (z * t * aspect) + 1) * (W / 2), y: (1 - dot(d, up) / (z * t)) * (H / 2) };
};
const faults = [];
for (const id of ids) {
  const S = await loadScene(id);
  const shots = S.SHOTS ?? [];
  if (!shots.length) { faults.push(`${id}: no SHOTS in shots.ts`); console.log(`${id}: no shot list`); continue; }
  const covered = new Set();
  const far = marks.FAR?.[S.PLACE];
  console.log(`${id} (${S.PLACE}${far ? '' : ', no far picture listed'}):`);
  for (const sh of shots) {
    for (let f = sh.from; f <= sh.to; f++) covered.add(f);
    const mid = Math.round((sh.from + sh.to) / 2), len = sh.to - sh.from + 1, bad = [];
    // the hero's height on screen, at the shot's middle and its smallest over the shot
    const who = sh.hero ?? S.ACTION?.who ?? 'hero';
    let low = Infinity, atMid = null;
    for (let f = sh.from; f <= sh.to; f += Math.max(1, Math.floor(len / 8))) {
      const p = S.people(f).find((x) => x.who === who && !x.hidden);
      if (!p) continue;
      const c = S.camAt(f), [, sy] = sizes.sizeOf(who), h = 1.8 * (p.sy ?? 1) * sy;
      const a = project(c, p.at), b = project(c, [p.at[0], p.at[1] + h, p.at[2]]);
      const frac = a && b ? Math.abs(a.y - b.y) / H : 0;
      low = Math.min(low, frac); if (Math.abs(f - mid) <= len / 8) atMid = frac;
    }
    if (atMid === null && low !== Infinity) atMid = low;
    if (sh.size !== 'wide') {
      if (low === Infinity) bad.push(`${who} is not in the shot`);
      else if (low < MIN) bad.push(`${who} is ${(low * 100).toFixed(0)} % of the frame height at the smallest (a ${sh.size} shot wants ${Math.round(MIN * 100)} % or more)`);
    } else if (len > WIDE && !sh.why) bad.push(`a wide of ${(len / 30).toFixed(1)} s (wides place the scene: ${(WIDE / 30).toFixed(1)} s at most, or say why)`);
    // the far picture
    if (far && !sh.noFar) {
      for (const f of [sh.from, mid, sh.to]) {
        const c = S.camAt(f), d = norm([c.look[0] - c.pos[0], 0, c.look[2] - c.pos[2]]);
        const ang = Math.atan2(d[0], d[2]), mid0 = Math.atan2(far.toward[0], far.toward[1]);
        let off = Math.abs(ang - mid0); if (off > Math.PI) off = 2 * Math.PI - off;
        const half = Math.atan(Math.tan(((c.fov ?? 40) * Math.PI) / 360) * (W / H));
        if (off + half > far.arc / 2) { bad.push(`f${f} looks ${((off * 180) / Math.PI).toFixed(0)} degrees off the far picture's middle (it reaches ${((far.arc * 90) / Math.PI).toFixed(0)} degrees either side): the sky there is empty; turn the camera or say why (noFar)`); break; }
      }
    }
    const tag = `${sh.size} f${sh.from}-${sh.to}${sh.ref ? ` (ref ${sh.ref})` : ''}`;
    console.log(`  ${bad.length ? 'FAULT' : 'ok   '} ${tag}: ${who} ${atMid !== null ? `${(atMid * 100).toFixed(0)} %` : 'not seen'} of the frame height${bad.length ? ' - ' + bad.join('; ') : ''}`);
    for (const b of bad) faults.push(`${id} ${tag}: ${b}`);
  }
  const miss = []; for (let f = 0; f < S.FRAMES; f++) if (!covered.has(f)) miss.push(f);
  if (miss.length) { faults.push(`${id}: frames ${miss[0]}-${miss.at(-1)} are in no shot (${miss.length} frames)`); console.log(`  FAULT frames ${miss[0]}-${miss.at(-1)} in no shot`); }
}
console.log(faults.length ? `${faults.length} fault(s)` : 'shots ok');
if (faults.length) process.exitCode = 1;
