// Render the film (composition __FILM__), silent; the mix is muxed after. Take a render slot first if the project
// shares the machine with other renders (the project's CLAUDE.md says how); keep concurrency at 5 or below.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/render.mjs out.mp4 [concurrency] [scale] [from-to frames]
//   stills: node render.mjs --stills out/dir t1,t2,...  [scale]   (one png per time in seconds)
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { gate } from './gate.mjs';
const root = path.resolve(import.meta.dirname, '../../../..');
const args = process.argv.slice(2);
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), onProgress: () => {} });
// FILM_DEBUG=clean renders without cards, papers and bubbles (thumbnail frames)
const inputProps = { audio: '', debug: process.env.FILM_DEBUG ?? '' };
const chromiumOptions = { gl: 'angle' };
const composition = await selectComposition({ serveUrl, id: '__FILM__', inputProps, chromiumOptions });
if (args[0] === '--stills') {
  const [, dir, times, scale] = args; fs.mkdirSync(dir, { recursive: true });
  for (const s of times.split(',')) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
    await renderStill({ composition, serveUrl, output: path.join(dir, `${s.padStart(5, '0')}.png`), frame, inputProps, chromiumOptions, scale: Number(scale ?? 0.4), timeoutInMilliseconds: 300000 });
    console.log('still', s);
  }
} else {
  const [out, conc, scale, range] = args;
  if (!out) { console.error('usage: node render.mjs out.mp4 [concurrency] [scale] [from-to]'); process.exit(1); }
  const [f0, f1] = range ? range.split('-').map(Number) : [0, composition.durationInFrames - 1];
  // the gate (toon-video "The order"): a render over 8 s waits until every check passes and the owner has approved the
  // story and the direction on the review page; a fix check of 8 s or less renders at once
  if ((f1 - f0 + 1) / composition.fps > 8 && !gate(path.resolve(import.meta.dirname, '..'), 'render').ok) { fs.rmSync(serveUrl, { recursive: true, force: true }); process.exit(2); }
  let last = 0;
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: out, inputProps, concurrency: Math.min(5, Number(conc ?? 4)), muted: true, crf: 18,
    scale: Number(scale ?? 1), frameRange: range ? range.split('-').map(Number) : undefined, chromiumOptions, timeoutInMilliseconds: 300000,
    onProgress: ({ renderedFrames }) => { if (renderedFrames - last >= 100) { last = renderedFrames; console.log(renderedFrames, ((Date.now() - t0) / 1000).toFixed(0) + 's'); } } });
}
fs.rmSync(serveUrl, { recursive: true, force: true });
console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
