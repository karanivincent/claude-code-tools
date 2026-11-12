#!/usr/bin/env node
// __SLUG__: the camera-speed probe. Per frame: how far the camera moves (m) and how far its view turns (degrees, with
// the field of view's change and the roll). Cliff spike 7: one continuous move still read as "a whip", "a snap into the
// wide" or "a lurch" wherever it moved more than about 0.3 m or 1.5 degrees a frame, and a camera that stopped dead on
// a beat read as a jolt. Slow it down and ease every start and stop (motion.ts keysAt: "through" keys keep it moving).
//   node src/stories/__SLUG__/tools/cam-speed.mjs [<scene>] [--max-m 0.3] [--max-deg 1.5] [--table]
// No scene: every scene in film order, across the joins too (a join that is not a cut must carry the move on).
// Exit 1 when anything is flagged.
import fs from 'node:fs';
import path from 'node:path';
import { args, loadFilm, loadScene, SLUG } from './lib.mjs';

const { pos, o } = args();
const maxM = Number(o['max-m'] ?? 0.3), maxD = Number(o['max-deg'] ?? 1.5);
const film = await loadFilm();
const ids = pos[0] ? [pos[0]] : film.SCENES.map((s) => s.id);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(...a), norm = (a) => { const l = len(a) || 1; return a.map((v) => v / l); };
const ang = (a, b) => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
const joins = (() => { try { return JSON.parse(fs.readFileSync(path.resolve('stories', SLUG, 'joins.json'), 'utf8')).joins ?? []; } catch { return []; } })();
const isCut = (after, before) => joins.some((j) => j.after === after && j.before === before && j.cut);
const rows = []; // { id, f, film, m, deg, join }
let prev = null;
for (const id of ids) {
  const S = await loadScene(id), from = film.sceneFrom(id);
  for (let f = 0; f < S.FRAMES; f++) {
    const c = S.camAt(f);
    if (prev && !(prev.id !== id && isCut(prev.id, id))) { // a join marked "cut" is a deliberate jump: not a move
      const m = len(sub(c.pos, prev.c.pos)), dir0 = norm(sub(prev.c.look, prev.c.pos)), dir1 = norm(sub(c.look, c.pos));
      const deg = ang(dir0, dir1) + Math.abs(c.fov - prev.c.fov) * 0.5 + Math.abs(c.roll - prev.c.roll);
      rows.push({ id, f, film: from + f, m, deg, join: prev.id !== id });
    }
    prev = { c, id };
  }
}
const flagged = rows.filter((r) => r.m > maxM || r.deg > maxD);
// stops: speed falls to under a fifth within two frames from over half the limit
const stops = rows.filter((r, i) => i > 1 && rows[i - 2].m > maxM * 0.5 && r.m < rows[i - 2].m * 0.2 && !r.join);
if (o.table) for (const r of rows) console.log(`${r.id} f${String(r.f).padStart(3)} (film ${String(r.film).padStart(4)})  ${r.m.toFixed(3)} m  ${r.deg.toFixed(2)} deg${r.join ? '  <- join' : ''}`);
const peak = (k) => rows.reduce((a, r) => (r[k] > a[k] ? r : a), rows[0] ?? { m: 0, deg: 0 });
const pm = peak('m'), pd = peak('deg');
console.log(`${ids.join(', ')}: ${rows.length} steps; fastest move ${pm.m.toFixed(3)} m/frame (${pm.id} f${pm.f}), fastest turn ${pd.deg.toFixed(2)} deg/frame (${pd.id} f${pd.f}); limits ${maxM} m, ${maxD} deg`);
const runs = (list) => { const out = []; for (const r of list) { const l = out[out.length - 1]; if (l && l.id === r.id && r.f === l.to + 1) { l.to = r.f; l.m = Math.max(l.m, r.m); l.deg = Math.max(l.deg, r.deg); } else out.push({ id: r.id, from: r.f, to: r.f, m: r.m, deg: r.deg }); } return out; };
for (const r of runs(flagged)) console.log(`  TOO FAST ${r.id} f${r.from}-${r.to}: up to ${r.m.toFixed(3)} m and ${r.deg.toFixed(2)} deg a frame`);
for (const r of stops) console.log(`  STOPS DEAD ${r.id} f${r.f}: ${(rows[rows.indexOf(r) - 2].m).toFixed(3)} -> ${r.m.toFixed(3)} m a frame in two frames`);
if (flagged.length || stops.length) process.exitCode = 1; else console.log('  ok: no whips, no dead stops');
