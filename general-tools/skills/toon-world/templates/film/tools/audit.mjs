// The acting audit, before any real render (toon-kit acting.ts): renders the film tiny, every 3rd frame, with no look
// stack, collects one sample per frame from the renderer's log, and checks still acting, framing, held props, cards on
// their words, picture events against the sound's cues, and the segment list. Writes out/__SLUG__/audit.txt.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/audit.mjs [concurrency]
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { actingStills, checkFraming, checkHeld, checkCues, checkSync, report } from '../../../toon-kit/acting.ts';
const root = path.resolve(import.meta.dirname, '../../../..');
const conc = Math.min(5, Number(process.argv[2] ?? 4)), t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), onProgress: () => {} });
const inputProps = { audio: '', debug: 'audit nopost' }, chromiumOptions = { gl: 'angle' };
const composition = await selectComposition({ serveUrl, id: '__FILM__', inputProps, chromiumOptions });
const samples = new Map(); let cfg = null;
fs.mkdirSync(path.join(root, 'out/__SLUG__'), { recursive: true });
const out = path.join(root, 'out/__SLUG__/audit.gif');
await renderMedia({ composition, serveUrl, codec: 'gif', everyNthFrame: 3, scale: 0.2, outputLocation: out, inputProps, concurrency: conc, chromiumOptions, timeoutInMilliseconds: 300000,
  onBrowserLog: ({ text }) => {
    if (text.startsWith('AUDIT ')) { const s = JSON.parse(text.slice(6)); samples.set(s.t, s); }
    else if (text.startsWith('AUDITCFG ') && !cfg) cfg = JSON.parse(text.slice(9));
  } });
fs.rmSync(serveUrl, { recursive: true, force: true }); fs.rmSync(out, { force: true });
const S = [...samples.values()].sort((a, b) => a.t - b.t);
const words = JSON.parse(fs.readFileSync(path.join(root, 'src/stories/__SLUG__/full.json'), 'utf8')).lines.flatMap(l => l.words);
const cuesFile = path.join(root, 'public/__SLUG__/sound/cues.json');
const sounds = fs.existsSync(cuesFile) ? JSON.parse(fs.readFileSync(cuesFile, 'utf8')) : null;
const issues = [...actingStills(S), ...checkFraming(S), ...checkHeld(S), ...(cfg ? checkCues(cfg.cues, words) : []),
  ...(cfg && sounds ? checkSync(cfg.events, sounds) : [])];
const lines = [...(cfg?.segs ?? []).map(x => `segments      ${x}`), ...report(issues)];
if (!sounds) lines.push('note: no public/__SLUG__/sound/cues.json yet, so picture-sound sync was not checked (run the sound script)');
const text = `acting audit: ${S.length} samples, ${issues.length + (cfg?.segs?.length ?? 0)} issues, ${((Date.now() - t0) / 1000).toFixed(0)} s\n` + lines.join('\n') + '\n';
fs.writeFileSync(path.join(root, 'out/__SLUG__/audit.txt'), text);
console.log(text);
