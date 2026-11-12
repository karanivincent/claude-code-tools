// The look checks (toon-kit look.ts), before any real render. They catch what made Elijah and the widow read flat
// (Vincent, 11 November 2026): plain code colour near the lens, small textures, a detail layer of dots, flat surfaces.
//  1. The scene walk: renders the film tiny, every 3rd frame, no look stack, with debug 'look'. Stage.tsx logs every
//     mesh's material once per place and every detail thing (userData.detail) each frame. From them:
//       plainMeshes   no map and not emissive within 8 m of a shot camera (cards and userData.plainOk skipped)
//       smallTextures maps under 2048 px, without mipmaps or under 16x anisotropy within 8 m of a shot camera
//       checkDetail   detail things in frame per shot and how many move, against floors by shot size
//  2. The stills: one per segment at its middle, half size, three ways: with the look stack (out/__SLUG__/look/,
//     joined into look/stills.mp4 for measure_sharp.py and measure_look.py), and twice without it, with and without
//     the cards and the far band. Where those two differ is masked; the rest is the world, and its flat share (16 px
//     blocks with almost no change inside) must stay under look.ts FLAT.max.
// Every issue fails unless STORY.acknowledged names it with a reason. Writes out/__SLUG__/look.txt and look.json.
// Exit 0 clean, 1 an issue, 2 the check could not run.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/look.mjs [concurrency]
//   node src/stories/__SLUG__/tools/look.mjs --flat a.png b.png ...   (the flat share of any pictures, no render)
import path from 'node:path';
import { storyPublic, toolTime } from './public.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { plainMeshes, smallTextures, checkDetail, detailCount, flatShare, cardMask, FLAT, CAPTION_BAND, LOOK_CHECKS } from '../../../toon-kit/look.ts';
import { acknowledge, report } from '../../../toon-kit/acting.ts';

/** a picture as RGB bytes, through ffmpeg (any format ffmpeg reads: png, jpg, a video's first frame) */
export function readRgb(file) {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().split(',').map(Number);
  const data = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  return { width: w, height: h, data };
}
const band = img => (x, y) => y > CAPTION_BAND.top * img.height && y < CAPTION_BAND.bottom * img.height;

const args = process.argv.slice(2);
if (args[0] === '--flat') {
  // pictures with captions and cards in them (a finished render's frames): the caption band is skipped, the cards are
  // not (no second render to mask them), so this reads a little high on a film with big people
  let bad = 0;
  for (const f of args.slice(1)) {
    const img = readRgb(f), share = flatShare(img, { skip: band(img) });
    if (share > FLAT.max) bad++;
    console.log(`${share > FLAT.max ? 'FLAT' : 'ok  '} ${share.toFixed(3)}  ${f}`);
  }
  console.log(`${bad} of ${args.length - 1} over ${FLAT.max} (blocks of ${FLAT.block} px at 1080 wide with a luma deviation under ${FLAT.std})`);
  process.exit(bad ? 1 : 0);
}

const { bundle } = await import('@remotion/bundler');
const { openBrowser, renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
const root = path.resolve(import.meta.dirname, '../../../..');
const conc = Math.min(5, Number(args[0] ?? 4)), t0 = Date.now();
const outDir = path.join(root, 'out/__SLUG__'), lookDir = path.join(outDir, 'look');
fs.rmSync(lookDir, { recursive: true, force: true }); fs.mkdirSync(lookDir, { recursive: true });
let serveUrl;
try { serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: storyPublic(root), onProgress: () => {} }); }
catch (e) { console.error(`look: the bundle failed: ${e.message}`); process.exit(2); }
toolTime(root, 'look', 'bundle', t0);
const t1 = Date.now();
const chromiumOptions = { gl: 'angle' };

// ---- 1. the scene walk ------------------------------------------------------------------------------------------------
const meshes = new Map(), frames = []; let cfg = null, fps = 30;
{
  const inputProps = { audio: '', debug: 'look nopost' };
  const composition = await selectComposition({ serveUrl, id: '__FILM__', inputProps, chromiumOptions });
  fps = composition.fps;
  const gif = path.join(lookDir, 'walk.gif');
  await renderMedia({ composition, serveUrl, codec: 'gif', everyNthFrame: 3, scale: 0.2, outputLocation: gif, inputProps, concurrency: conc, chromiumOptions, timeoutInMilliseconds: 300000, logLevel: 'error',
    onBrowserLog: ({ text }) => {
      if (text.startsWith('LOOKMESH ')) { const m = JSON.parse(text.slice(9)); meshes.set(m.place, m.meshes); }
      else if (text.startsWith('LOOK ')) frames.push(JSON.parse(text.slice(5)));
      else if (text.startsWith('AUDITCFG ') && !cfg) cfg = JSON.parse(text.slice(9));
    } });
  fs.rmSync(gif, { force: true });
}
if (!cfg || !frames.length) { console.error('look: the film logged no look samples (is debug "look" wired through Film.tsx and Stage.tsx?)'); process.exit(2); }
const issues = [];
const asIssue = (x, t = 0) => ({ check: x.check, from: t, to: t, shot: x.shot ?? '', what: x.what });
for (const [place, ms] of meshes) {
  const cams = frames.filter(f => f.shot.startsWith(`${place}/`)).map(f => ({ pos: f.cam.pos }));
  // one line per kind of fault: thirty stones sharing one plain material are one fault
  const seen = new Map();
  for (const x of [...plainMeshes(ms, cams), ...smallTextures(ms, cams)]) {
    const k = x.check + x.what.replace(/[\d.]+ m from a camera/, '');
    if (seen.has(k)) { seen.get(k).n++; continue; }
    const i = { ...asIssue(x), shot: place, n: 1 }; seen.set(k, i); issues.push(i);
  }
  for (const i of seen.values()) { if (i.n > 1) i.what += ` (and ${i.n - 1} more like it)`; delete i.n; }
}
const firstT = shot => frames.find(f => f.shot === shot)?.t ?? 0;
for (const x of checkDetail(frames)) issues.push(asIssue(x, firstT(x.shot)));

// ---- 2. the stills ------------------------------------------------------------------------------------------------------
const browser = await openBrowser('chrome', { chromiumOptions });
const still = async (frame, debug, file, scale = 0.5) => {
  const inputProps = { audio: '', debug };
  const composition = await selectComposition({ serveUrl, id: '__FILM__', inputProps, puppeteerInstance: browser, chromiumOptions });
  await renderStill({ composition, serveUrl, output: file, frame, inputProps, puppeteerInstance: browser, scale, chromiumOptions, timeoutInMilliseconds: 240000 });
};
const flats = [];
const plan = cfg.plan ?? [];
for (let i = 0; i < plan.length; i++) {
  // one still a shot: a segment that continues the one before (the same place and shot) is the same picture
  if (i && plan[i - 1].place === plan[i].place && plan[i - 1].shot === plan[i].shot) continue;
  const s = plan[i], t = (s.a + s.b) / 2, frame = Math.round(t * fps), n = String(flats.length).padStart(3, '0');
  const post = path.join(lookDir, `post-${n}.png`), world = path.join(lookDir, `world-${n}.png`), bare = path.join(lookDir, `bare-${n}.png`);
  // the look-stack still at full size: measure_sharp.py reads it, and a half-size still scaled back up measured about
  // a fifth of a real frame's sharpness (Elijah and the widow, 11 November 2026: 60 against 238 at full size)
  await still(frame, 'clean', post, 1);
  await still(frame, 'clean nopost', world);
  await still(frame, 'clean nopost nocards nofar', bare);
  const a = readRgb(world), b = readRgb(bare), mask = cardMask(a, b);
  const share = flatShare(a, { skip: mask });
  flats.push({ seg: i, shot: `${s.place}/${s.shot}`, t: +t.toFixed(2), flat: +share.toFixed(3) });
  if (share > FLAT.max) issues.push({ check: 'flat-share', from: t, to: t, shot: `${s.place}/${s.shot}`, what: `${(share * 100).toFixed(0)}% of the world in this still is flat colour (over ${(FLAT.max * 100).toFixed(0)}%): paint its surfaces (paint.ts), add texture near the lens` });
  fs.rmSync(bare, { force: true });
}
await browser.close({ silent: true });
fs.rmSync(serveUrl, { recursive: true, force: true });
// the stills with the look stack as one short video, two a second, for measure_sharp.py and measure_look.py
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '2', '-i', path.join(lookDir, 'post-%03d.png'), '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', path.join(lookDir, 'stills.mp4')]);

const { open, passed } = acknowledge(issues, (cfg.story?.acknowledged ?? []).filter(a => LOOK_CHECKS.has(a.check)));   // the audit judges the rest
const detail = detailCount(frames).map(d => `detail        ${d.shot.padEnd(28)} ${d.size.padEnd(6)} ${d.present} in frame, ${d.moving} moving  ${d.kinds.join(', ')}`);
const flatLines = flats.map(f => `flat          ${f.shot.padEnd(28)} ${f.t.toFixed(2).padStart(6)} s  ${f.flat.toFixed(3)}`);
const lines = [...report(open), ...passed.map(p => `passed        ${p.issue.check} ${p.issue.shot}: ${p.reason}`), ...detail, ...flatLines];
const text = `look: ${frames.length} samples, ${[...meshes.values()].reduce((n, m) => n + m.length, 0)} meshes, ${flats.length} stills, ${open.length} open issue(s), ${((Date.now() - t0) / 1000).toFixed(0)} s\n` + lines.join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'look.txt'), text);
fs.writeFileSync(path.join(outDir, 'look.json'), JSON.stringify({ at: new Date().toISOString(), open, passed, flats, detail: detailCount(frames), stills: path.relative(root, path.join(lookDir, 'stills.mp4')) }, null, 1));
console.log(text);
toolTime(root, 'look', 'look', t1);
process.exit(open.length ? 1 : 0);
