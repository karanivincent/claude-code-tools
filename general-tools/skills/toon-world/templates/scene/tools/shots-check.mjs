#!/usr/bin/env node
// __SLUG__: the shots check, run by the shots stage on every scene before any acting (S5-72, S5-102). For each shot in a
// scene's shots.ts SHOTS, through the scene's own camera:
//   - size: on a "close" or "mid" shot the hero is a third of the frame height or more (faces read on a phone); a
//     "wide" with the hero smaller than a third lasts 45 frames (1.5 s) at most unless the shot says why; a wide with
//     the hero at a third or more may carry the scene (S5-102, owner, 18 November 2026);
//   - far picture: the camera looks into the place's far picture (places/marks.ts FAR), with the frame's own width
//     inside its arc, unless the shot says why not (noFar);
//   - every frame of the scene is in a shot.
// The cliff film's jump was wide with figures at about 1/20 of the frame, and looked away from the far picture into a
// flat sky; the spike it lost to held Josh at a third of the frame with the sunset hills behind him.
//   node src/stories/__SLUG__/tools/shots-check.mjs [<scene>] [--min 0.33] [--wide 45]
// No scene: every scene. Prints a line per shot; exit 1 on a fault.
import path from 'node:path';
import { args, loadFilm, loadScene, loadTs, STORY_DIR, SLUG } from './lib.mjs';

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
    } else if (len > WIDE && !sh.why && (low === Infinity || low < MIN)) bad.push(`a wide of ${(len / 30).toFixed(1)} s with ${who} at ${low === Infinity ? 'no' : (low * 100).toFixed(0) + ' %'} of the frame height (a wide under ${Math.round(MIN * 100)} % places the scene: ${(WIDE / 30).toFixed(1)} s at most; hold ${who} at a third or more, or say why)`);
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
// the cut budget (S3-235 to S3-238), over the whole film: every scene's planned cuts (shots.ts CUTS) and every join
// card that is a hard cut or a dip (joins.json), against toon-kit checkCuts. A stretch under 3 s is excused only when
// the shot it starts in names a cold open or a fact insert in its `why` (S3-236); each cut's reason is the `why` of the
// shot that starts on it (or the join card's own `why`), one of a reverse in a talk, a new activity, a jump in time or a
// fact (S3-238, toon-kit checkCutReasons). One scene alone is told its share, not failed.
// Run inside a project for the first time on 18 November 2026 (a film made by new-film.mjs in a temp folder): every
// `why` excused its stretch, so a film whose cuts all had their reason (S3-238) passed any number of short stretches;
// and S3-238 was not checked. Both fixed here; with an older kit (no excusesShortStretch) it keeps the old reading.
{
  const kit = await loadTs(path.resolve(STORY_DIR, '..', '..', 'toon-kit', 'timing.ts')).catch(() => ({}));
  const fps = film.FPS ?? 30, cuts = [], excused = [], reasons = [];
  const excuses = kit.excusesShortStretch ?? ((why) => !!why);
  let at = 0;
  const cards = await import('node:fs').then((fs) => JSON.parse(fs.readFileSync(path.resolve('stories', SLUG, 'joins.json'), 'utf8')).joins ?? []).catch(() => []);
  for (const sc of film.SCENES) {
    const S = await loadScene(sc.id).catch(() => null);
    const shots = S?.SHOTS ?? [], shotAt = (f) => shots.find((sh) => sh.from === f) ?? shots.find((sh) => f >= sh.from && f <= sh.to);
    const jin = cards.find((j) => j.before === sc.id);
    if (jin && (jin.cut || jin.dip)) { cuts.push(at / fps); reasons.push({ t: at / fps, why: jin.why ?? shotAt(0)?.why ?? (jin.dip ? 'a jump in time (dip)' : undefined), where: `join ${jin.after}|${sc.id}` }); }
    for (const c of S?.CUTS ?? []) { cuts.push((at + c) / fps); reasons.push({ t: (at + c) / fps, why: shotAt(c)?.why, where: `${sc.id} f${c}` }); }
    for (const sh of shots) if (excuses(sh.why)) excused.push((at + sh.from) / fps);
    at += sc.frames;
  }
  const dur = at / fps;
  if (!kit.checkCuts) console.log('cuts: toon-kit has no checkCuts; sync the kit (sync-kit.mjs) to check the cut budget');
  else if (pos[0]) {
    const S = await loadScene(pos[0]), n = (S.CUTS ?? []).length, max = Math.max(1, Math.round(dur / 7.5));
    console.log(`cuts: ${pos[0]} has ${n} planned cut(s); the film has ${cuts.length} of ${max} (run with no scene for the full check)`);
  } else {
    const bad = [...kit.checkCuts(cuts, dur, { excused }), ...(kit.checkCutReasons?.(reasons) ?? [])];
    console.log(bad.length ? bad.map((b) => `  FAULT ${b}`).join('\n') : `cuts ok: ${cuts.length} hard cut(s) in ${dur.toFixed(1)} s`);
    faults.push(...bad);
  }
}
console.log(faults.length ? `${faults.length} fault(s)` : 'shots ok');
if (faults.length) process.exitCode = 1;
