#!/usr/bin/env node
// __SLUG__: what the frame shows, from the film's own data, no render: every frame of a scene, each person through
// the scene's camera, against the edges and the caption on screen at that film time.
//   S3-95 / S3-175  a person's head cut by the frame's left, right or bottom edge (toon-kit camera.ts headCut);
//   S3-147          the caption word on screen covering more than a fifth of a face, or reaching below 82% of the
//                   frame's height (toon-kit frame.ts).
// Why (audit C, saving 12, 18 November 2026): a caption over a face and a head cut by the frame were the faults the
// reviewers flagged most; Wald's camera rounds took 35 to 40 minutes each to find them on frames, and S3-147's proof
// (`audit.mjs: captionOverlap`) was never built. A person is 1.8 m times their size (sizes.ts) and their `sy`, the head
// a 3.5th of that, as shots-check.mjs measures them; the caption words come from the story's captions.tsx (CAPS) when
// it loads in node, else from full.json the way captions.tsx times them.
//   node src/stories/__SLUG__/tools/frame-check.mjs [<scene>] [--cap-y 1480] [--max 0.2] [--low 0.82] [--no-captions]
// Prints one line per fault: the scene, its frames (and film seconds), who and what; exit 1 on a fault.
import fs from 'node:fs';
import path from 'node:path';
import { args, loadFilm, loadScene, loadTs, loadKit, projectPx, STORY_DIR } from './lib.mjs';

const { pos, o } = args();
const W = 1080, H = 1920, capY = Number(o['cap-y'] ?? 1480), max = Number(o.max ?? 0.2), low = Number(o.low ?? 0.82);
const [cam, frame] = [await loadKit('camera'), await loadKit('frame')];
if (!cam?.headCut || !frame) { console.error('frame-check: src/toon-kit/camera.ts or frame.ts is missing: sync the kit (toon-world/scripts/sync-kit.mjs)'); process.exit(2); }
const film = await loadFilm();
const fps = film.FPS ?? 30;
const sizes = await loadTs(path.join(STORY_DIR, 'sizes.ts')).catch(() => ({ sizeOf: () => [1, 1] }));
let caps = [];
if (!o['no-captions']) {
  caps = await loadTs(path.join(STORY_DIR, 'captions.tsx')).then((m) => m.CAPS ?? []).catch(() => null);
  if (!caps) {
    const full = path.join(STORY_DIR, 'full.json');
    caps = fs.existsSync(full) ? frame.captionsFromLines(JSON.parse(fs.readFileSync(full, 'utf8')).lines ?? []) : [];
  }
}
const ids = pos[0] ? [pos[0]] : film.SCENES.map((s) => s.id);
const lines = [];
for (const id of ids) {
  const S = await loadScene(id), from = film.sceneFrom(id), found = [];
  for (let f = 0; f < S.FRAMES; f++) {
    const c = S.camAt(f), faces = [];
    for (const p of S.people(f)) {
      if (p.hidden) continue;
      const h = 1.8 * (p.sy ?? 1) * sizes.sizeOf(p.who)[1], head = h / 3.5;
      const edge = cam.headCut({ pos: c.pos, look: c.look, fov: c.fov }, p.at, h, { near: Infinity });
      if (edge) found.push({ f, who: p.who, kind: `head cut (${edge})`, what: `${p.who}'s head is cut by the frame's ${edge} edge: reframe (S3-95, S3-175)` });
      const mid = projectPx(c, [p.at[0], p.at[1] + h - head / 2, p.at[2]], W, H), top = projectPx(c, [p.at[0], p.at[1] + h, p.at[2]], W, H);
      if (mid && top) faces.push({ who: p.who, box: frame.faceBox(mid.x, mid.y, 2 * Math.abs(mid.y - top.y)) });
    }
    const cap = frame.captionAt(caps, (from + f) / fps);
    for (const x of frame.checkCaptionFrame(f, cap, faces, { capY, width: W, height: H, max, low })) found.push({ ...x, what: `${x.what} (S3-147)` });
  }
  for (const r of frame.runsOf(found)) {
    const fr = r.from === r.to ? `f${r.from}` : `f${r.from}-${r.to}`, s = ((from + r.from) / fps).toFixed(2);
    lines.push(`FAULT ${id} ${fr} (film ${s} s)${r.who ? ` ${r.who}` : ''}: ${r.what}`);
  }
}
for (const l of lines) console.log(l);
console.log(lines.length ? `${lines.length} fault(s)` : `frames ok: ${ids.join(', ')}`);
if (lines.length) process.exitCode = 1;
