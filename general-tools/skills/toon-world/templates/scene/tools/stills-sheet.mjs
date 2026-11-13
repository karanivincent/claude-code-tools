#!/usr/bin/env node
// __SLUG__: a stills sheet of one scene (or the film, or a scene's pose sheet) in a few seconds. Run before every render:
// it caught a fault in five rounds of six in the cliff spikes (a camera behind the cliff, a friend out of frame, a head
// poking over the splash, a face that read as bored, a splash that hid the next word).
//   node src/stories/__SLUG__/tools/stills-sheet.mjs <scene> [--from 0] [--to <last>] [--n 8] [--frames 0,12,40] [--scale 0.5]
//   node src/stories/__SLUG__/tools/stills-sheet.mjs film --from 120 --to 180      (frames of the whole film)
//   node src/stories/__SLUG__/tools/stills-sheet.mjs poses <scene>                  (the pose sheet, one still)
// Writes out/__SLUG__/sheets/<scene>-<from>-<to>.jpg (labelled frames, five a row) and prints any card cut by its canvas.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { args, OUT, FILM, need, loadFilm } from './lib.mjs';
import { bundled } from './bundle.mjs';

const { pos, o } = args();
const what = pos[0];
if (!what) { console.error('usage: stills-sheet.mjs <scene|film|poses> [<scene>] [--from f] [--to f] [--n 8] [--frames a,b] [--scale 0.5]'); process.exit(1); }
const film = await loadFilm();
const poses = what === 'poses';
const scene = poses ? pos[1] : what;
if (scene !== 'film' && !film.SCENES.some((s) => s.id === scene)) { console.error(`no scene "${scene}" in plan.ts (${film.SCENES.map((s) => s.id).join(', ')})`); process.exit(1); }
const id = poses ? `${FILM}-${scene}-poses` : scene === 'film' ? FILM : `${FILM}-${scene}`;
const last = scene === 'film' ? film.TOTAL - 1 : film.sceneFrames(scene) - 1;
const from = Math.max(0, Number(o.from ?? 0)), to = Math.min(last, Number(o.to ?? last)), n = Math.max(1, Math.min(20, Number(o.n ?? 8)));
const frames = poses ? [0] : o.frames ? String(o.frames).split(',').map(Number) : [...new Set(Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / Math.max(1, n - 1))))];
const scale = Number(o.scale ?? (poses ? 1 : 0.5));

const t0 = Date.now();
const { serveUrl } = await bundled({ fresh: !!o.fresh, key: scene });
const { renderStill, selectComposition } = need('@remotion/renderer');
const chromiumOptions = { gl: 'angle' };
const composition = await selectComposition({ serveUrl, id, chromiumOptions });
const dir = path.join(OUT, 'sheets', 'x'); fs.mkdirSync(dir, { recursive: true });
const cuts = new Set();
const onBrowserLog = (l) => { if (/cut by its canvas/.test(l.text)) cuts.add(l.text); else if (l.type === 'error') console.log('[browser]', l.text.slice(0, 300)); };
const files = [];
for (const f of frames) {
  const out = path.join(dir, `${scene}_${f}.jpg`);
  await renderStill({ composition, serveUrl, frame: f, output: out, imageFormat: 'jpeg', jpegQuality: 88, scale, chromiumOptions, timeoutInMilliseconds: 180000, onBrowserLog });
  files.push([f, out]);
}
const name = poses ? `${scene}-poses.jpg` : `${scene}-${from}-${to}.jpg`, sheet = path.join(OUT, 'sheets', name);
if (poses) fs.copyFileSync(files[0][1], sheet);
else {
  const W = 270, H = Math.round((W * composition.height) / composition.width), cols = Math.min(5, files.length);
  const ins = files.flatMap(([, f]) => ['-i', f]);
  const lab = files.map(([fr], i) => `[${i}]scale=${W}:${H},drawtext=text='f${fr}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`).join(';');
  const layout = files.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|');
  const filter = files.length > 1 ? `${lab};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=black` : lab.replace('[v0]', '');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', filter, '-frames:v', '1', '-q:v', '3', sheet]);
}
for (const [, f] of files) fs.rmSync(f, { force: true });
console.log(`${name}: ${files.length} frame${files.length > 1 ? 's' : ''} at ${scale} in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${path.relative(process.cwd(), sheet)}`);
if (cuts.size) { console.log(`cards cut by their canvas (${cuts.size}):`); for (const c of cuts) console.log('  ' + c); process.exitCode = 1; }
