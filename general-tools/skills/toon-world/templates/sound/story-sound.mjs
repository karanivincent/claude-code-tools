// Music, effects and the mix for __SLUG__. ElevenLabs requests are cached by their prompt: a rerun spends nothing unless
// a prompt or a section length changed. The music is cut into sections at the story's turns (from the voice's word
// times); effects sit on their words; the action layer (gunshots, screams, a crash) goes on top of the mix, not ducked,
// so it cuts through the narrator; a limiter and loudnorm bring it to -14 LUFS. Writes cues.json for the acting audit.
//   node --env-file=<your secrets.env> scripts/__SLUG__-sound.mjs
// Needs Node 22.6 or later (it imports the toon-kit's timing.ts) and ffmpeg.
import { execFileSync } from 'node:child_process';
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
const TAIL = 1.4;                                            // the film runs this long past the last word (shots.ts END)
const VOICES = path.join(root, `public/${SLUG}/full/voices.wav`);   // the voice track the story's voice script wrote
const MIX = path.join(root, `public/${SLUG}/laura/mix.wav`);        // public/<slug>/<narrator>/mix.wav
const OUT = path.join(root, `public/${SLUG}/sound`);
const D = +(TL.duration + TAIL).toFixed(3);
// Word times: L(id).start, W(id, word, nth) when the word is said. W throws when a word is said twice in its line
// and you did not say which (the same rule as shots.ts), so an effect cannot land on the wrong "the".
const L = TL.L, W = TL.W;

// Music: one section per turn of the story. Cut a little before the line that turns it.
const turns = [/* e.g. L('twist').start - 0.1 */];
const sections = [
  // [name, positive styles, negative styles]: one more than `turns`
  ['Opening', ['adventure film score', 'driving pulse', 'full volume from the first second'], ['silence']],
];
const globalStyles = { positive: ['orchestral', 'instrumental'], negative: ['vocals', 'lyrics', 'fade in'] };

// Effects: name -> [prompt, seconds]. Generated once each and cached.
const fx = {
  // rifle: ['A single loud bolt-action rifle shot outdoors, sharp crack and echo', 1.2],
};
// The bed: under the voice, ducked while she speaks. [effect or 'music', at (s), gain dB, fade in, fade out, length]
const bed = [
  ['music', 0, -9, 0, 0.6, D],
  // ['bell', L('shop').start, -12, 0, 0.3, 1.2],
];
// The action layer: on top, not ducked. [effect, at, gain dB, fade in, fade out, length, kind]. A kind ('shot', 'hit',
// 'fall') makes it a cue the audit pairs with the film's picture event of the same kind within 0.1 s; take the times
// from the same numbers the place exports (its action times, through filmTimeOf), never retyped.
const action = [
  // ['rifle', W('fight', 'fired') - 0.05, -4, 0, 0.3, 1.2, 'shot'],
];
// ==== the engine ====================================================================================================

fs.mkdirSync(OUT, { recursive: true });
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
cuts.slice(1).forEach((c, i) => { if (!(c > cuts[i])) throw new Error(`music section ${i} is empty or backwards (${cuts[i]} to ${c})`); });
const plan = {
  positive_global_styles: globalStyles.positive, negative_global_styles: globalStyles.negative,
  sections: sections.map(([name, pos, neg], i) => ({ section_name: name, positive_local_styles: pos, negative_local_styles: neg, duration_ms: Math.round((cuts[i + 1] - cuts[i]) * 1000), lines: [] })),
};
await cached('music', 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192', { model_id: 'music_v1', composition_plan: plan, respect_sections_durations: true });
for (const [name, [text, s]] of Object.entries(fx)) await cached(name, 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { text, duration_seconds: s, prompt_influence: 0.6 });
const file = n => { const f = path.join(OUT, `${n}.mp3`); if (!fs.existsSync(f)) throw new Error(`no sound "${n}": add it to fx`); return f; };

// the action cues for the acting audit (toon-kit checkSync): kind and film time
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(action.filter(c => c[6]).map(c => ({ name: c[6], t: +c[1].toFixed(3) }))) + '\n');

const inputs = [], filters = ['[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[vo][key]'];
const layer = (list, tag, offset) => list.map(([n, at, gain, fin, fout, len], i) => {
  const k = offset + i + 1; inputs.push('-i', file(n));
  const fades = `${fin ? `afade=t=in:d=${fin},` : ''}${fout ? `afade=t=out:st=${Math.max(0, len - fout).toFixed(2)}:d=${fout},` : ''}`;
  filters.push(`[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${len},asetpts=PTS-STARTPTS,${fades}volume=${gain}dB,adelay=${Math.max(0, Math.round(at * 1000))}:all=1[${tag}${k}]`);
  return `[${tag}${k}]`;
});
const bedIn = layer(bed, 'b', 0), actIn = layer(action, 'p', bed.length);
filters.push(`${bedIn.join('')}amix=inputs=${bedIn.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=0:${D}[bedpre]`);
filters.push('[bedpre][key]sidechaincompress=threshold=0.02:ratio=4:attack=15:release=250:makeup=1[bed]');   // the bed ducks under her voice
const top = ['[vo]', '[bed]'];
if (actIn.length) { filters.push(`${actIn.join('')}amix=inputs=${actIn.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=0:${D}[act]`); top.push('[act]'); }
filters.push(`${top.join('')}amix=inputs=${top.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=0:${D},alimiter=limit=0.5:attack=1:release=60:level=false,loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
fs.mkdirSync(path.dirname(MIX), { recursive: true });
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VOICES, ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', MIX]);
console.log('mix ->', path.relative(root, MIX), D, 's');
