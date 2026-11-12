// Shot-board stills (composition __BOARD__): bundles once, opens one browser, renders each job (a shot of a place),
// then tiles them into a labelled sheet (sheet.jpg) for the owner's yes before anything is animated.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/stills.mjs jobs.json outDir [scale] [cols]
// jobs.json: [{ "name": "hook", "props": { "place": "lookout", "shot": "hook-a" } }, ...]
// A job may name another composition ("id") and re-light a thumbnail still: { "name": "thumb", "id": "<Film>", "frame": 1398,
//   "props": { "debug": "clean", "audio": "", "relight": { "key": 2.6, "pictures": 3, "fog": "#a0a0c4", "sky": ["#9a90e0", "#ffd08a"], "skyMix": 0.75, "light": {...} } } }
import fs from 'node:fs';
import { storyPublic, toolTime } from './public.mjs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';

const root = path.resolve(import.meta.dirname, '../../../..');
const [, , jobsFile, outDir, scaleArg, colsArg] = process.argv;
if (!jobsFile || !outDir) { console.error('usage: node stills.mjs jobs.json outDir [scale] [cols]'); process.exit(1); }
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8')), scale = Number(scaleArg ?? 0.5), cols = Number(colsArg ?? 6);
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: storyPublic(root), onProgress: () => {} });
toolTime(root, 'stills', 'bundle', t0);
const t1 = Date.now();
const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } });
const files = [];
for (const j of jobs) {
  const inputProps = { ...(j.props ?? {}) };
  const comp = await selectComposition({ serveUrl, id: j.id ?? '__BOARD__', inputProps, puppeteerInstance: browser });
  const out = path.join(outDir, `${j.name}.png`);
  const s = Date.now();
  await renderStill({ composition: comp, serveUrl, output: out, frame: j.frame ?? 0, inputProps, puppeteerInstance: browser, scale, chromiumOptions: { gl: 'angle' }, timeoutInMilliseconds: 240000 });
  console.log(j.name, ((Date.now() - s) / 1000).toFixed(1) + 's');
  files.push(out);
}
await browser.close({ silent: true });
fs.rmSync(serveUrl, { recursive: true, force: true });
toolTime(root, 'stills', 'stills', t1);
if (files.length > 1) {
  const py = `import sys\nfrom PIL import Image, ImageDraw\nfs = sys.argv[3:]; c = int(sys.argv[2]); ims = [Image.open(f).convert('RGB') for f in fs]\nw, h = ims[0].size; r = (len(ims) + c - 1) // c\nS = Image.new('RGB', (w * c, h * r)); d = ImageDraw.Draw(S)\nfor i, (f, im) in enumerate(zip(fs, ims)):\n    x, y = (i % c) * w, (i // c) * h; S.paste(im.resize((w, h)), (x, y)); d.rectangle([x, y, x + 9 * len(f.split('/')[-1]) , y + 18], fill='black'); d.text((x + 3, y + 3), f.split('/')[-1][:-4], fill='yellow')\nS.save(sys.argv[1], quality=85)`;
  execFileSync('python3', ['-c', py, path.join(outDir, 'sheet.jpg'), String(cols), ...files]);
}
console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
