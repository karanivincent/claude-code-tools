// The beat board for a critic round (toon-video S5-7): full-size stills of every shot, by default two a shot at 35% and
// 80% of its first segment (where the Elijah board put its action words), drawn as the film shows them (debug 'board':
// cards, papers and captions in, as the critic must see them), from the plan the audit wrote (out/__SLUG__/audit.json).
// Rule S5-39: a still the look check already rendered at the same frame, debug words and scale (out/__SLUG__/look/,
// listed in look/stills.json) is copied, not rendered again; the rest render several at once on one bundle.
// The look check's stills are 'clean' (no captions) at each shot's middle, so the default board shares none of them;
// --debug clean --at 0.5 gives a board made only of the look check's stills.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/beat.mjs out/__SLUG__/beat-<cycle>-<round> [--at 0.35,0.8] [--debug board] [--concurrency 4]
// Writes <NN>-<place>-<shot>-<t>s.png and beat.json (each still's file, shot, time, and whether it was reused).
import path from 'node:path';
import fs from 'node:fs';
import { storyPublic, toolTime, pool } from './public.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const argv = process.argv.slice(2), outDir = argv[0] && path.resolve(argv[0]);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
if (!outDir || argv[0].startsWith('--')) { console.error('usage: node beat.mjs <outDir> [--at 0.35,0.8] [--debug board] [--concurrency 4]'); process.exit(1); }
const at = opt('at', '0.35,0.8').split(',').map(Number), debug = opt('debug', 'board'), conc = Math.min(5, Number(opt('concurrency', 4)));
const ID = '__FILM__', chromiumOptions = { gl: 'angle' }, t0 = Date.now();
let audit;
try { audit = JSON.parse(fs.readFileSync(path.join(root, 'out/__SLUG__/audit.json'), 'utf8')); } catch { console.error('beat: no out/__SLUG__/audit.json: run the audit (or the gate) first'); process.exit(2); }
const plan = audit.plan ?? [], fps = audit.fps ?? 30;
// the look check's stills, by frame, debug words and scale
const lookDir = path.join(root, 'out/__SLUG__/look');
let looked = [];
try { looked = JSON.parse(fs.readFileSync(path.join(lookDir, 'stills.json'), 'utf8')); } catch { /* no look run yet */ }
const lookAt = (frame, dbg, scale) => looked.find(x => x.frame === frame && x.debug === dbg && x.scale === scale && fs.existsSync(path.join(lookDir, x.file)));
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const jobs = [];
let n = 0;
for (let i = 0; i < plan.length; i++) {
  const s = plan[i];
  if (i && plan[i - 1].place === s.place && plan[i - 1].shot === s.shot) continue;
  n++;
  for (const k of at) {
    const t = s.a + k * (s.b - s.a), frame = Math.round(t * fps);
    jobs.push({ file: path.join(outDir, `${String(n).padStart(2, '0')}-${s.place}-${s.shot}-${t.toFixed(2)}s.png`), place: s.place, shot: s.shot, t: +t.toFixed(3), frame });
  }
}
for (const x of jobs) { const l = lookAt(x.frame, debug, 1); if (l) { fs.copyFileSync(path.join(lookDir, l.file), x.file); x.reused = `look/${l.file}`; } }
const missing = jobs.filter(x => !x.reused);
let tb = 0;
if (missing.length) {
  const { bundle } = await import('@remotion/bundler');
  const { openBrowser, renderStill, selectComposition } = await import('@remotion/renderer');
  const tb0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: storyPublic(root), onProgress: () => {} });
  toolTime(root, 'beat', 'bundle', tb0); tb = Date.now() - tb0;
  try {
    const browser = await openBrowser('chrome', { chromiumOptions }), inputProps = { audio: '', debug };
    const composition = await selectComposition({ serveUrl, id: ID, inputProps, puppeteerInstance: browser, chromiumOptions });
    await pool(missing.map(x => () => renderStill({ composition, serveUrl, output: x.file, frame: x.frame, inputProps, puppeteerInstance: browser, scale: 1, chromiumOptions, timeoutInMilliseconds: 240000 })), conc);
    await browser.close({ silent: true });
  } finally { fs.rmSync(serveUrl, { recursive: true, force: true }); }
}
fs.writeFileSync(path.join(outDir, 'beat.json'), JSON.stringify(jobs.map(({ file, place, shot, t, frame, reused }) => ({ file: path.basename(file), place, shot, t, frame, debug, reused: reused ?? false })), null, 1));
toolTime(root, 'beat', 'beat', t0 + tb);   // the run but the bundle
console.log(`beat board: ${n} shots, ${jobs.length} stills (${missing.length} rendered, ${jobs.length - missing.length} copied from the look check) in ${path.relative(process.cwd(), outDir)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
