// A builder's quick checks in one run (rule S5-39): one bundle, several short moving stretches of the film at a scale and
// several stills, then the bundle is deleted. For every join and acting change: render the stretch (about 2 s either
// side, S5-25), run the motion probe on it, and look at the stills at the action words.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/ranges.mjs <outDir> [--ranges 12.4-15.0,30-33]
//       [--frames 372-450] [--stills 13.1,31.2] [--scale 0.5] [--still-scale 1] [--debug board] [--concurrency 4] [--probe]
// --ranges are seconds and --frames frame numbers (from-to, both ends in); each stretch is 8 s or less (a longer one is a
// render, and render.mjs runs the gate first). Writes r<from>-<to>.mp4 (silent, frames named), s<seconds>.png, and with
// two or more stills sheet.jpg. --debug passes the film's debug words ('board' or '' draws everything, 'clean' leaves the
// overlays out). --probe runs <toon-video>/scripts/motion_probe.py on each stretch (it needs the plugin cache or
// TOON_PROBE=<path to motion_probe.py>) and writes r<from>-<to>.motion.txt. Take a render slot first where the project
// uses them; concurrency stays at 5 or below. Times itself into out/__SLUG__/tool-times.jsonl (tool ranges).
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { storyPublic, toolTime, pool } from './public.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const argv = process.argv.slice(2), outDir = argv[0];
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const usage = 'usage: node ranges.mjs <outDir> [--ranges a-b,...] [--frames f0-f1,...] [--stills t,...] [--scale 0.5] [--still-scale 1] [--debug board] [--concurrency 4] [--probe]';
if (!outDir || outDir.startsWith('--')) { console.error(usage); process.exit(1); }
const list = k => (opt(k, '') ?? '').split(',').map(x => x.trim()).filter(Boolean);
const scale = Number(opt('scale', 0.5)), stillScale = Number(opt('still-scale', 1)), conc = Math.min(5, Number(opt('concurrency', 4)));
const debug = opt('debug', 'board'), inputProps = { audio: '', debug }, chromiumOptions = { gl: 'angle' };
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: storyPublic(root), onProgress: () => {} });
toolTime(root, 'ranges', 'bundle', t0);
const t1 = Date.now();
let code = 0;
try {
  const composition = await selectComposition({ serveUrl, id: '__FILM__', inputProps, chromiumOptions });
  const fps = composition.fps, last = composition.durationInFrames - 1;
  const spans = [...list('ranges').map(r => r.split('-').map(s => Math.round(Number(s) * fps))), ...list('frames').map(r => r.split('-').map(Number))]
    .map(([a, b]) => [Math.max(0, a), Math.min(last, b ?? a)]);
  for (const [a, b] of spans) if (!(b >= a) || (b - a + 1) / fps > 8) { console.error(`ranges: ${a}-${b} is not a stretch of 8 s or less (a longer one is a render: render.mjs, after the gate)`); process.exit(1); }
  const probe = argv.includes('--probe') && (process.env.TOON_PROBE ?? (() => {
    const cache = path.join(process.env.HOME ?? '', '.claude/plugins/cache/vince-tools-marketplace/general-tools');
    const num = v => v.split('.').map(n => n.padStart(6, '0')).join('.');
    try { const v = fs.readdirSync(cache).filter(d => /^\d+\.\d+\.\d+$/.test(d)).sort((x, y) => num(x) < num(y) ? -1 : 1).pop(); const f = v && path.join(cache, v, 'skills/toon-video/scripts/motion_probe.py'); return f && fs.existsSync(f) ? f : null; } catch { return null; }
  })());
  if (argv.includes('--probe') && !probe) console.error('ranges: no motion_probe.py found (set TOON_PROBE); stretches render without the probe');
  const py = fs.existsSync(path.join(process.env.HOME ?? '', '.cache/toon-tools/venv/bin/python')) ? path.join(process.env.HOME ?? '', '.cache/toon-tools/venv/bin/python') : 'python3';
  for (const [a, b] of spans) {
    const s = Date.now(), file = path.join(outDir, `r${a}-${b}.mp4`);
    await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: file, inputProps, concurrency: conc, muted: true, crf: 18, scale, frameRange: [a, b], chromiumOptions, timeoutInMilliseconds: 300000 });
    console.log(`range ${a}-${b} (${(a / fps).toFixed(2)}-${((b + 1) / fps).toFixed(2)} s): ${path.relative(process.cwd(), file)}, ${((Date.now() - s) / 1000).toFixed(0)} s`);
    if (probe) {
      // in film time: --offset adds the stretch's start to every time the probe prints
      const r = spawnSync(py, [probe, file, '--offset', String(a / fps)], { encoding: 'utf8' });
      const txt = `${r.stdout}${r.stderr}`;
      fs.writeFileSync(file.replace(/\.mp4$/, '.motion.txt'), txt);
      if (r.status === 3) code = 3;
      console.log(txt.split('\n').filter(l => /^motion probe|SPIKE |CUT /.test(l)).map(l => '  ' + l).join('\n'));
    }
  }
  const stills = list('stills');
  if (stills.length) {
    const browser = await openBrowser('chrome', { chromiumOptions });
    const files = await pool(stills.map(s => async () => {
      const file = path.join(outDir, `s${s}.png`);
      await renderStill({ composition, serveUrl, output: file, frame: Math.min(last, Math.round(Number(s) * fps)), inputProps, puppeteerInstance: browser, scale: stillScale, chromiumOptions, timeoutInMilliseconds: 300000 });
      console.log('still', s);
      return file;
    }), conc);
    await browser.close({ silent: true });
    if (files.length > 1) {
      const sheet = `import sys\nfrom PIL import Image, ImageDraw\nout, fs = sys.argv[1], sys.argv[2:]\nw = 270; h = int(w * 16 / 9); cols = min(len(fs), 6); rows = (len(fs) + cols - 1) // cols\nS = Image.new('RGB', (w * cols, (h + 20) * rows), 'white'); D = ImageDraw.Draw(S)\nfor i, f in enumerate(fs):\n    im = Image.open(f).convert('RGB').resize((w, h)); x = (i % cols) * w; y = (i // cols) * (h + 20)\n    S.paste(im, (x, y + 20)); D.text((x + 4, y + 4), f.split('/')[-1][1:-4] + ' s', fill='black')\nS.save(out, quality=88)`;
      execFileSync('python3', ['-c', sheet, path.join(outDir, 'sheet.jpg'), ...files]);
    }
  }
} finally { fs.rmSync(serveUrl, { recursive: true, force: true }); }
toolTime(root, 'ranges', 'ranges', t1);
console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
process.exit(code);
