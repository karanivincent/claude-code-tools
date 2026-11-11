// The audit, before any real render: renders the film tiny, every 3rd frame, with no look stack, collects one sample
// per frame from the renderer's log, and runs
//   - the acting audit (toon-kit acting.ts): still acting, acting too small, framing, held props, cards on their words,
//     captions, picture events against the sound's cues, the opening (a big subject AND motion from frame 1 AND the
//     card at 0.0 s), the segment list, the planned pace and the joins;
//   - the camera checks (toon-kit camera.ts) on the logged cameras: turns and jumps (audit), the camera under the
//     ground, empty sky (checkSky's pitch test, and the sky share cast on the real geometry), the lens crowded
//     (checkLens on each place's blockers), named heads cut (headCut), every must-see promise (checkMustSee on
//     STORY.mustSee), and cards cut by their own canvas (edgeTouches, logged by the cast as it draws).
// Every issue fails, except those STORY.acknowledged names with a reason. Writes out/__SLUG__/audit.txt and audit.json.
// Exit 0 clean, 1 an unacknowledged issue, 2 the audit could not run.
//   TMPDIR=$HOME/remotion-tmp/__SLUG__ node src/stories/__SLUG__/tools/audit.mjs [concurrency]
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { actingStills, actingTooSmall, checkFraming, checkHeld, checkCues, checkSync, checkOpening, checkCaptions, acknowledge, fromFrames, report } from '../../../toon-kit/acting.ts';
import { audit as camAudit, checkSky, checkLens, checkMustSee, headCut } from '../../../toon-kit/camera.ts';
import { LOOK_CHECKS } from '../../../toon-kit/look.ts';

const root = path.resolve(import.meta.dirname, '../../../..');
const conc = Math.min(5, Number(process.argv[2] ?? 4)), t0 = Date.now();
const outDir = path.join(root, 'out/__SLUG__');
let serveUrl;
try {
  serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), onProgress: () => {} });
} catch (e) { console.error(`audit: the bundle failed: ${e.message}`); process.exit(2); }
const inputProps = { audio: '', debug: 'audit nopost' }, chromiumOptions = { gl: 'angle' };
const composition = await selectComposition({ serveUrl, id: '__FILM__', inputProps, chromiumOptions });
const fps = composition.fps;
const samples = new Map(), places = new Map(), edges = []; let cfg = null;
fs.mkdirSync(outDir, { recursive: true });
const gif = path.join(outDir, 'audit.gif');
await renderMedia({ composition, serveUrl, codec: 'gif', everyNthFrame: 3, scale: 0.2, outputLocation: gif, inputProps, concurrency: conc, chromiumOptions, timeoutInMilliseconds: 300000, logLevel: 'error',
  onBrowserLog: ({ text }) => {
    if (text.startsWith('AUDIT ')) { const s = JSON.parse(text.slice(6)); samples.set(s.t, s); }
    else if (text.startsWith('AUDITCFG ') && !cfg) cfg = JSON.parse(text.slice(9));
    else if (text.startsWith('AUDITPLACE ')) { const p = JSON.parse(text.slice(11)); places.set(p.place, p); }
    else if (text.startsWith('EDGE ')) edges.push(JSON.parse(text.slice(5)));
  } });
fs.rmSync(serveUrl, { recursive: true, force: true }); fs.rmSync(gif, { force: true });
if (!cfg || !samples.size) { console.error('audit: the film logged no samples (is debug "audit" wired through Film.tsx and Stage.tsx?)'); process.exit(2); }
const S = [...samples.values()].sort((a, b) => a.t - b.t);
const story = cfg.story ?? {};
const words = JSON.parse(fs.readFileSync(path.join(root, 'src/stories/__SLUG__/full.json'), 'utf8')).lines.flatMap(l => l.words);
const cuesFile = path.join(root, 'public/__SLUG__/sound/cues.json');
const sounds = fs.existsSync(cuesFile) ? JSON.parse(fs.readFileSync(cuesFile, 'utf8')) : null;
const issues = [...checkOpening(S, cfg.cues ?? []), ...actingStills(S), ...actingTooSmall(S), ...checkFraming(S), ...checkHeld(S), ...checkCues(cfg.cues ?? [], words),
  ...checkCaptions(cfg.captions ?? [], words), ...(sounds ? checkSync(cfg.events ?? [], sounds) : [])];
if (!sounds) issues.push({ check: 'no-cues-file', from: 0, to: 0, shot: '', what: 'no public/__SLUG__/sound/cues.json: run the sound script so picture and sound can be checked against each other' });
for (const x of cfg.segs ?? []) issues.push({ check: 'segments', from: 0, to: 0, shot: '', what: x });

// ---- the camera checks ----------------------------------------------------------------------------------------------
const F = s => Math.round(s.t * fps);
const plan = cfg.plan ?? [];
// runs: one per stretch the camera flies continuously (a cut or a change of place starts a new one), so a cut is
// never read as a one-frame jump, and every run is checked with its own place's blockers
const runs = [];
for (const s of S) {
  const last = runs[runs.length - 1], into = plan[s.seg]?.into;
  const cont = last && last.place === s.place && (last.seg === s.seg || into === 'swing');
  if (cont) { last.samples.push(s); last.seg = s.seg; } else runs.push({ place: s.place, seg: s.seg, samples: [s] });
}
const lerp = (a, b, k) => a + (b - a) * k;
const camOf = s => ({ pos: s.cam.pos, look: s.cam.look, fov: s.cam.fov });
const camAtIn = ss => f => {
  const i = ss.findIndex(s => F(s) >= f);
  if (i < 0) return camOf(ss[ss.length - 1]);
  if (i === 0 || F(ss[i]) === f) return camOf(ss[i]);
  const a = ss[i - 1], b = ss[i], k = (f - F(a)) / Math.max(1, F(b) - F(a));
  return { pos: a.cam.pos.map((x, j) => lerp(x, b.cam.pos[j], k)), look: a.cam.look.map((x, j) => lerp(x, b.cam.look[j], k)), fov: lerp(a.cam.fov, b.cam.fov, k) };
};
const layer = runs.map((r, k) => ({ id: `${r.place}#${k}`, from: F(r.samples[0]), to: F(r.samples[r.samples.length - 1]), camAt: camAtIn(r.samples),
  blockers: (places.get(r.place)?.blockers ?? []).map(b => ({ c: b.c, r: b.r, name: b.name })) }));
const runAt = f => layer.find(r => f >= r.from && f <= r.to) ?? layer.reduce((a, b) => (Math.abs(b.from - f) < Math.abs(a.from - f) ? b : a));
const camAt = f => runAt(f).camAt(f);
const sampleAt = f => S.reduce((a, b) => (Math.abs(F(b) - f) < Math.abs(F(a) - f) ? b : a));
const shotAt = f => { const s = sampleAt(f); return `${s.place}/${s.shot}`; };
// people as subjects: the sampled card's centre (feet plus half its height), radius half its height; someone not in
// the frame's sample is put far behind the lens, so a promise about them fails as "out of frame"
const keys = [...new Set(S.flatMap(s => s.people.map(p => p.key)))];
const personAt = (key, f) => sampleAt(f).people.find(p => p.key === key);
const behind = f => { const c = camAt(f); return c.pos.map((x, j) => x - (c.look[j] - x) * 100); };
const subjects = Object.fromEntries(keys.map(k => [k, { name: k,
  at: f => { const p = personAt(k, f); return p ? [p.w[0], p.w[1] + p.h / 2, p.w[2]] : behind(f); },
  r: f => (personAt(k, f)?.h ?? 1.85) / 2 }]));
for (const [name, x] of Object.entries(story.subjects ?? {})) subjects[name] = { name, at: f => (sampleAt(f).place === x.place ? x.at : behind(f)), r: x.r };
const cam = [];
cam.push(...camAudit(layer));
const planned = (story.skyPlanned ?? []).map(([a, b]) => [Math.round(a * fps), Math.round(b * fps)]);
cam.push(...checkSky(layer, Object.values(subjects), { planned }));
// the sky share on the real geometry (Stage.tsx casts 24 rays down the centre column): over 0.45 of the column empty
// fails whatever stands in the frame (toon-kit checkSky's maxSky, from Gibeon r5's 54 to 58% at 58.4 to 60.4 s)
for (const s of S) if (s.sky > 0.45 && !planned.some(([a, b]) => F(s) >= a && F(s) <= b))
  cam.push({ f: F(s), kind: 'empty sky', detail: `${(s.sky * 100).toFixed(0)}% of the frame's centre column is empty sky (over 45%)` });
// under the ground: nothing solid below the camera (a ray straight down meets no surface)
for (const s of S) if (s.above === null) cam.push({ f: F(s), kind: 'under ground', detail: 'nothing solid under the camera: it is under the ground or outside the place' });
const lens = checkLens(layer, { framed: (story.framed ?? []).map(x => ({ from: Math.round(x.from * fps), to: Math.round(x.to * fps), why: x.why })) });
cam.push(...lens);
for (const s of S) for (const p of s.people) if (p.named) {
  const edge = headCut(camOf(s), p.w, p.h, { near: Infinity });
  if (edge) cam.push({ f: F(s), kind: 'head cut', detail: `${p.key}'s head is cut by the frame's ${edge} edge: reframe` });
}
const must = (story.mustSee ?? []).map(m => ({ ...m, f: Math.round(m.at * fps) }));
if (!must.length) issues.push({ check: 'no-must-see', from: 0, to: 0, shot: '', what: 'STORY.mustSee is empty: every verb of the meaning sheet promises a subject in frame on its word' });
cam.push(...checkMustSee(camAt, subjects, must, { blockers: [...places.values()].flatMap(p => p.blockers ?? []), captions: { top: 0.635, bottom: 0.765 } }));
issues.push(...fromFrames(cam, fps, shotAt));
for (const e of edges) issues.push({ check: 'card-cut', from: e.t, to: e.t, shot: '', who: e.key, what: `${e.who}'s card drawing touches its canvas at the ${e.sides.join(', ')}: a straight cut in the film (keep hands inside: toon-kit clampHand)` });

// ---- the verdict ----------------------------------------------------------------------------------------------------
const { open, passed } = acknowledge(issues, (story.acknowledged ?? []).filter(a => !LOOK_CHECKS.has(a.check)));   // look.mjs judges its own
const lines = [...report(open), ...passed.map(p => `passed        ${p.issue.check} ${p.issue.from.toFixed(2)}-${p.issue.to.toFixed(2)} ${p.issue.shot}: ${p.reason}`), ...(lens.framed ?? []).map(x => `framed        ${x}`)];
const text = `audit: ${S.length} samples, ${open.length} open issue(s), ${passed.length} acknowledged, ${((Date.now() - t0) / 1000).toFixed(0)} s\n` + lines.join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'audit.txt'), text);
fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify({ at: new Date().toISOString(), open, passed, story, plan, duration: cfg.duration, fps }, null, 1));
console.log(text);
process.exit(open.length ? 1 : 0);
