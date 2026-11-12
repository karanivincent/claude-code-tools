#!/usr/bin/env node
// __SLUG__: render one scene (about 15 s for 5-10 s at half scale) or the whole film, with the story's own public folder,
// a render slot when the project keeps them, and Remotion concurrency 3.
//   node src/stories/__SLUG__/tools/render.mjs <scene|film> [--scale 0.5] [--concurrency 3] [--name r1]
// Writes out/__SLUG__/<scene>[-<name>].mp4 (with the scene's slice of the mix when public/__SLUG__/mix.wav exists).
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { args, OUT, FILM, takeSlot, loadFilm } from './lib.mjs';
import { bundled } from './bundle.mjs';

const { pos, o } = args();
const what = pos[0];
if (!what) { console.error('usage: render.mjs <scene|film> [--scale 0.5] [--concurrency 3] [--name r1]'); process.exit(1); }
const film = await loadFilm();
if (what !== 'film' && !film.SCENES.some((s) => s.id === what)) { console.error(`no scene "${what}" in plan.ts`); process.exit(1); }
const id = what === 'film' ? FILM : `${FILM}-${what}`;
const conc = Math.min(3, Number(o.concurrency ?? 3)), scale = Number(o.scale ?? 1);
const out = path.join(OUT, `${what}${o.name ? '-' + o.name : ''}.mp4`);
const release = takeSlot(`${id} render`);
if (!release) { console.error('both render slots are taken: wait, or render later'); process.exit(1); }
const t0 = Date.now();
try {
  const { serveUrl } = await bundled({ fresh: !!o.fresh });
  execFileSync('npx', ['remotion', 'render', serveUrl, id, out, '--gl=angle', `--concurrency=${conc}`, `--scale=${scale}`, '--log=error'], { stdio: 'inherit' });
} finally { release(); }
console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${path.relative(process.cwd(), out)}`);
