// Music, effects and the mix for __SLUG__. ElevenLabs requests are cached by their prompt: a rerun spends nothing unless
// a prompt or a section length changed (S3-165). The music is cut into sections at the story's turns (from the voice's
// word times), held down under every line by a gain track and side-chained to the voice (S3-155, S3-156). The effects
// sit on their words in their own layer, neither held nor side-chained, each levelled from its own measured loudness
// (S3-162, S3-163: in the held bed Elijah's effects were inaudible). A limiter and loudnorm bring the mix to -14 LUFS.
// Writes voice.wav and bed.wav beside the mix for levels.mjs (S3-154), and cues.json for the acting audit.
//   node --env-file=<your secrets.env> scripts/__SLUG__-sound.mjs
// Needs Node 22.6 or later (it imports the toon-kit's timing.ts) and ffmpeg.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { makeTimeline } from '../src/toon-kit/timing.ts';
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
const root = path.resolve(import.meta.dirname, '..');

// ==== the story's part: edit from here to the engine ================================================================
const SLUG = '__SLUG__';
const TL = makeTimeline(JSON.parse(fs.readFileSync(path.join(root, `src/stories/${SLUG}/full.json`), 'utf8')));
const TAIL = 0.5;   // the film runs this long past the last word (shots.ts END); levels.mjs fails a silent tail (S3-159)
// The narrator's folder comes from story.ts's `audio` (S3-160: a fixed laura/ wrote the mix where the film never
// read it); with none there, public/<slug>/full/. The voice script's voices.wav sits in the same folder.
const AUDIO = fs.readFileSync(path.join(root, `src/stories/${SLUG}/story.ts`), 'utf8').match(/^\s*audio:\s*'([^']+)'/m)?.[1] || `${SLUG}/full/mix.wav`;
const MIX = path.join(root, 'public', AUDIO);
const VOICES = path.join(path.dirname(MIX), 'voices.wav');
const OUT = path.join(root, `public/${SLUG}/sound`);
const D = +(TL.duration + TAIL).toFixed(3);
// Word times: L(id).start, W(id, word, nth) when the word is said. W throws when a word is said twice in its line
// and you did not say which (the same rule as shots.ts), so an effect cannot land on the wrong "the".
const L = TL.L, W = TL.W;

// Music: one section per turn of the story, cut a little before the line that turns it. Sections are 3 s or longer
// (S3-153). The last section ends on a resolving chord (the engine asks for it), which rings out under the tail.
const turns = [/* e.g. L('twist').start - 0.1 */];
const sections = [
  // [name, positive styles, negative styles]: one more than `turns`
  ['Opening', ['adventure film score', 'driving pulse'], ['silence']],
];
const globalStyles = { positive: ['orchestral', 'instrumental', 'full volume from the first second'], negative: ['vocals', 'lyrics', 'fade in'] };
// ElevenLabs music often fades up over its first 2 to 3 s. The engine asks for LEAD s more at the start and plays the
// file from LEAD, so the film opens with the music at level and the sections still land on their turns (Elijah: the
// music sat 40 dB down until 1.75 s). MUSIC_DB: the music's gain before the hold; raise it if levels.mjs says BURIED.
const LEAD = 3, MUSIC_DB = 0;

// The hold (toon-video "The bed hold, in numbers"): words joined into runs across gaps under 0.25 s. The bed sits at
// RUN through each whole line, from 0.15 s before it to 0.12 s after, its pauses included (Elijah: a bed that rose to
// 0.4 in a line's pauses swelled in every breath of "listened ... and the boy lived"); at RUN under a run outside a
// line; at PAUSE between runs closer than 0.9 s; full in a longer gap and after the last word (the closing chord).
// HOLD: a line's own gain, when levels.mjs says its bed is SHORT (lower it) or BURIED (raise it).
const RUN = 0.2, PAUSE = 0.4;
const HOLD = { /* hook: 0.35 */ };

// Effects: name -> [prompt, seconds]. Generated once each and cached.
const fx = {
  // rifle: ['A single loud bolt-action rifle shot outdoors, sharp crack and echo', 1.2],
};
// Where effects play: { n, at (film s), under, fin, fout, len, from (s into the file), cue, held }. `under`: the
// effect's loudest 400 ms sits this many dB under the quietest line it overlaps (or the whole voice in a gap), so a
// quiet take and a loud one land alike; 11 to 13 keeps levels.mjs's 10 dB floor. Put sharp ones in the breaths
// between words. `cue` ('shot:hook', 'hit:fall') makes it a cue the audit pairs with the picture event of the same
// kind within 0.1 s; take the times from the numbers the place exports (its action times, through filmTimeOf), never
// retyped. `held: true` puts it in the held bed instead (ambience made of voices, its speech band cut: S3-161).
// loop(n, a, b, fileLen, under) lays a looped ambience from a to b with crossfades.
const effects = [
  // { n: 'rifle', at: W('fight', 'fired') - 0.05, under: 11, fin: 0, fout: 0.3, len: 1.2, cue: 'shot:fight' },
  // ...loop('wind', 0, L('home').start, 12, 20),
];
function loop(n, a, b, fileLen, under, xf = 0.8) {
  const out = [];
  for (let t = a; t < b - 0.1; t += fileLen - xf) out.push({ n, at: +t.toFixed(3), under, fin: t === a ? 0.6 : xf, fout: xf, len: +Math.min(fileLen, b - t).toFixed(3), loopBed: true });
  return out;
}
// ==== the engine ====================================================================================================

fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(VOICES)) throw new Error(`no voice track at ${path.relative(root, VOICES)} (story.ts audio: ${AUDIO}); run the voice script first`);
const KEY = process.env.ELEVENLABS_API_KEY;
async function cached(name, url, body) {
  const hash = crypto.createHash('sha1').update(url + JSON.stringify(body)).digest('hex').slice(0, 12);
  const file = path.join(OUT, `${name}.mp3`), stamp = path.join(OUT, `${name}.hash`);
  if (fs.existsSync(file) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hash) return;
  if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');
  const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} on ${name}: ${(await r.text()).slice(0, 400)}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); fs.writeFileSync(stamp, hash);
  console.log(`made ${name}`);
}
if (sections.length !== turns.length + 1) throw new Error(`${sections.length} music sections need ${sections.length - 1} turns, not ${turns.length}`);
const cuts = [0, ...turns, D];
cuts.slice(1).forEach((c, i) => { if (!(c - cuts[i] >= 3)) throw new Error(`music section ${i} runs ${(c - cuts[i]).toFixed(2)} s (${cuts[i]} to ${c}); ElevenLabs needs 3 s or more: merge it into a neighbour`); });
const plan = {
  positive_global_styles: globalStyles.positive, negative_global_styles: globalStyles.negative,
  sections: sections.map(([name, pos, neg], i) => ({
    section_name: name, negative_local_styles: neg, lines: [],
    positive_local_styles: i === sections.length - 1 ? [...pos, 'ends on one resolving final chord that rings out'] : pos,
    duration_ms: Math.round((cuts[i + 1] - cuts[i] + (i === 0 ? LEAD : 0)) * 1000),
  })),
};
await cached('music', 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192', { model_id: 'music_v1', composition_plan: plan, respect_sections_durations: true });
for (const [name, [text, s]] of Object.entries(fx)) await cached(name, 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { text, duration_seconds: s, prompt_influence: 0.6 });
const file = n => { const f = path.join(OUT, `${n}.mp3`); if (!fs.existsSync(f)) throw new Error(`no sound "${n}": add it to fx`); return f; };

// the effect cues for the acting audit (toon-kit checkSync): kind and film time
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(effects.filter(c => c.cue).map(c => ({ name: c.cue, t: +c.at.toFixed(3) }))) + '\n');

// loudness: EBU R128 momentary (400 ms windows every 100 ms) of a file or a piece of it, and the whole file's
const momentary = (f, from = 0, len = 9999) => {
  const r = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(len), '-i', f, '-af', 'apad=pad_dur=0.5,ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return [...r.matchAll(/pts_time:([\d.]+)\s+lavfi\.r128\.M=(-?[\d.]+|-inf|nan)/g)].map(m => [+m[1] + +from, /\d/.test(m[2]) ? +m[2] : -120]);
};
const power = ms => 10 * Math.log10(ms.reduce((a, m) => a + 10 ** (m / 10), 0) / Math.max(1, ms.length));
const integrated = f => +[...spawnSync('ffmpeg', ['-v', 'info', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()[1];

// the music must be at level on frame 0: its first second against the whole file
{
  const mI = integrated(file('music')), first = Math.max(...momentary(file('music'), LEAD, 1.2).filter(([t]) => t <= LEAD + 1).map(([, m]) => m));
  if (first < mI - 10) console.log(`WARN the music's first second (from ${LEAD} s into the file) peaks at ${first.toFixed(1)} LUFS against ${mI} for the whole: it still fades in. Raise LEAD.`);
}

// each effect's gain from its loudest 400 ms in the part that plays (a looped ambience: its average), set `under` dB
// under the quietest line it overlaps, or the whole voice in a gap
const VOICE = integrated(VOICES), vm = momentary(VOICES);
const lineLoud = TL.lines.map(l => ({ l, v: power(vm.filter(([t]) => t >= l.start + 0.4 && t <= l.end).map(([, m]) => m)) })).filter(x => Number.isFinite(x.v));
const refOver = (a, b) => { const o = lineLoud.filter(({ l }) => l.start < b && l.end + 0.4 > a); return o.length ? Math.min(...o.map(x => x.v)) : VOICE; };
for (const c of effects) {
  const ms = momentary(file(c.n), c.from ?? 0, c.len).map(([, m]) => m);
  c.gain = +(refOver(c.at, c.at + c.len) - c.under - (c.loopBed ? power(ms.filter(m => m > -70)) : Math.max(...ms))).toFixed(1);
}
if (effects.length) console.log(`voice ${VOICE} LUFS; effects:`, effects.map(c => `${c.cue ?? c.n}@${c.at.toFixed(2)} ${c.gain > 0 ? '+' : ''}${c.gain} dB`).join(', '));

// the gain track: 1 kHz raw floats, smoothed over 0.16 s, multiplied into the held bed
const words = TL.words().filter(w => w.s != null).sort((x, y) => x.s - y.s);
const runs = [];
for (const w of words) { const r = runs[runs.length - 1]; if (r && w.s - r[1] < 0.25) r[1] = Math.max(r[1], w.e); else runs.push([w.s, w.e]); }
const LAST = Math.max(...words.map(w => w.e));
const gainAt = t => {
  if (t > LAST + 0.12) return 1;   // the closing chord, at full
  const inRun = runs.some(([s, e]) => t >= s - 0.15 && t <= e + 0.12);
  // held through a whole line, its pauses too, so the music never swells inside one (Elijah: "listened ... and the boy lived")
  const l = TL.lines.find(x => t >= x.start - 0.15 && t <= x.end + 0.12);
  if (l) return HOLD[l.id] ?? RUN;
  if (inRun) return RUN;
  const prev = runs.filter(r => r[1] + 0.12 < t).pop(), next = runs.find(r => r[0] - 0.15 > t);
  return prev && next && next[0] - prev[1] < 0.9 ? PAUSE : 1;
};
const N = Math.ceil(D * 1000), raw = new Float32Array(N), smooth = new Float32Array(N), SM = 160;
for (let i = 0; i < N; i++) raw[i] = gainAt(i / 1000);
for (let i = 0; i < N; i++) { let a = 0, n = 0; for (let j = Math.max(0, i - SM / 2); j < Math.min(N, i + SM / 2); j++) { a += raw[j]; n++; } smooth[i] = a / n; }
const GAIN = path.join(OUT, 'gain.f32'); fs.writeFileSync(GAIN, Buffer.from(smooth.buffer));

// the voice is padded to the film's length: the side-chain stops when its key ends, which cut the music, the effects
// and the closing chord at the last word (jungle holdout cut 6: 1.5 s of silence at the end)
const pad = `apad=whole_dur=${D},atrim=0:${D}`;
const inputs = ['-f', 'f32le', '-ar', '1000', '-ac', '1', '-i', GAIN];
const filters = [`[0:a]aformat=sample_rates=48000:channel_layouts=stereo,${pad},asplit=3[vo][key][vostem]`];
let k = 2;
const layer = (list, tag) => list.map(({ n, at, gain, fin, fout, len, from }) => {
  const src = from ?? 0, i = k++; inputs.push('-i', file(n));
  const fades = `${fin ? `afade=t=in:d=${fin},` : ''}${fout ? `afade=t=out:st=${Math.max(0, len - fout).toFixed(3)}:d=${fout},` : ''}`;
  filters.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=${src}:${(src + len).toFixed(3)},asetpts=PTS-STARTPTS,${fades}volume=${gain}dB,adelay=${Math.max(0, Math.round(at * 1000))}:all=1[${tag}${i}]`);
  return `[${tag}${i}]`;
});
const music = { n: 'music', at: 0, gain: MUSIC_DB, fin: 0, fout: 0.25, len: D, from: LEAD };
const heldIn = layer([music, ...effects.filter(c => c.held)], 'h'), fxIn = layer(effects.filter(c => !c.held), 'e');
filters.push(`${heldIn.join('')}amix=inputs=${heldIn.length}:normalize=0:duration=longest,${pad}[heldpre]`);
filters.push(`[1:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${D}[g]`);
filters.push('[heldpre][g]amultiply[held]');
filters.push('[held][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=150:makeup=1[bedheld]');
if (fxIn.length) filters.push(`${fxIn.join('')}amix=inputs=${fxIn.length}:normalize=0:duration=longest,${pad}[fx]`, `[bedheld][fx]amix=inputs=2:normalize=0:duration=longest,${pad}[bedall]`);
else filters.push(`[bedheld]${pad}[bedall]`);
// the bed stem levels.mjs reads is everything under the voice: the held music and the effects
filters.push('[bedall]asplit=2[bed][bedstem]');
filters.push(`[vo][bed]amix=inputs=2:normalize=0:duration=longest,${pad},alimiter=limit=0.5:attack=1:release=60:level=false,loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
fs.mkdirSync(path.dirname(MIX), { recursive: true });
const stem = n => path.join(path.dirname(MIX), n);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VOICES, ...inputs, '-filter_complex', filters.join(';'),
  '-map', '[out]', '-ar', '48000', '-ac', '2', MIX,
  '-map', '[vostem]', '-ar', '48000', '-ac', '2', stem('voice.wav'),
  '-map', '[bedstem]', '-ar', '48000', '-ac', '2', stem('bed.wav')]);
console.log('mix ->', path.relative(root, MIX), D, 's; stems voice.wav and bed.wav beside it. Next: node src/stories/__SLUG__/tools/levels.mjs (the gate runs it).');
