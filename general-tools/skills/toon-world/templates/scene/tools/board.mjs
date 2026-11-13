#!/usr/bin/env node
// __SLUG__: the still board (stage 2) from the real parts: one still of the Film at each named film time, saved as
// <name>.jpg, plus board.json (the stills per voiced line) for toon-video's animatic.py. The scenes are split and
// roughly built in their places before the board (S2-31), so the board shows what will be built.
//   node src/stories/__SLUG__/tools/board.mjs stories/__SLUG__/board-stills.json out/__SLUG__/board [--scale 0.5]
// board-stills.json: [{ "line": "<voice line id>", "stills": [{ "name": "01-hook", "t": 0.4 }] }]  (t in film seconds)
import fs from 'node:fs';
import path from 'node:path';
import { args, FILM, need } from './lib.mjs';
import { bundled } from './bundle.mjs';

const { pos, o } = args();
const [listF, outDir] = pos;
if (!listF || !outDir) { console.error('usage: board.mjs <board-stills.json> <out dir> [--scale 0.5]'); process.exit(1); }
const list = JSON.parse(fs.readFileSync(listF, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const { serveUrl } = await bundled({ fresh: !!o.fresh, key: 'board' });
const { renderStill, selectComposition } = need('@remotion/renderer');
const chromiumOptions = { gl: 'angle' };
const composition = await selectComposition({ serveUrl, id: FILM, chromiumOptions });
const scale = Number(o.scale ?? 0.5), t0 = Date.now();
for (const l of list) for (const s of l.stills) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(s.t * composition.fps));
  await renderStill({ composition, serveUrl, frame, output: path.join(outDir, `${s.name}.jpg`), imageFormat: 'jpeg', jpegQuality: 90, scale, chromiumOptions, timeoutInMilliseconds: 180000 });
}
fs.writeFileSync(path.join(outDir, 'board.json'), JSON.stringify(list.map((l) => ({ line: l.line, stills: l.stills.map((s) => s.name) })), null, 1));
console.log(`${list.reduce((n, l) => n + l.stills.length, 0)} stills in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${outDir}`);
