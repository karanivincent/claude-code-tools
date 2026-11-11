#!/usr/bin/env node
// Is the narrator the loudest thing? Measures a film's voice stem against everything else (the bed: music, ambience
// and effects) with EBU R128 momentary loudness (400 ms windows, every 100 ms). For each spoken line of the timeline it
// takes the line's own loudness (the voice's windows inside it, averaged as power) and the bed's loudest window inside
// it, and reports how far under the line the bed stays.
//
// The rule (Vincent, 5 November 2026): under every spoken line the bed's loudest moment stays at least 10 dB below the
// line, the last 30 s included. Average loudness is not enough: the Mona Lisa heist's first line sat 10 dB over its bed
// by average and the crowd's murmur still drowned it, and a sharp hit between two words (the plumber's steps) came
// within 5.4 dB of the voice while every average looked fine. Ported from bible-shorts scripts/levels.mjs.
//
// Two more rules (11 November 2026, from Elijah and the widow 2D):
//  - a ceiling: the bed's average under a line stays within --ceiling dB of the line (default 24), so the music is
//    heard. Elijah's music sat 35 to 40 dB under the voice and passed the floor; nobody could hear it ("music
//    inaudible", Vincent). 24 dB leaves the floor's 10 dB plus room for a quiet bed; the toon-video mix aims the music
//    15 to 20 dB under the voice. A line over a planned pause (--pause) is not held to the ceiling.
//  - dead air: no stretch of silence (voice and bed together under -50 dBFS, below any intended bed and above digital
//    silence) longer than --dead seconds (default 0.6) between lines or at the end, outside a planned pause. Elijah's
//    film ran 1.4 s past its last word after the music ended: dead air on a looping Short. 0.6 s is the longest gap
//    the toon-video mix leaves between lines (its runs join words across gaps under 0.6 s).
//
//   node levels.mjs <voice.wav> <bed.wav> <timeline.json> [--min 10] [--ceiling 24] [--dead 0.6] [--pause a-b ...] [--last 30] [--all]
//
// voice.wav  the voice stem alone, on the film's clock (what the mix takes in, before the final loudness gain)
// bed.wav    everything else, exactly as it goes into the mix under the voice (after any ducking or hold), same clock
// timeline   JSON: { "duration": s, "lines": [{ "id": "hook", "start": s, "end": s }, ...] } (a bare array of lines
//            also works; extra fields such as words are ignored). Lines under 0.6 s are skipped: no full window fits.
// --min      the margin a line needs, in dB (default 10)
// --ceiling  the most the bed's average may sit under a line, in dB (default 24)
// --dead     the longest silence allowed outside a planned pause, in seconds (default 0.6)
// --pause    a planned silent pause, film seconds a-b (repeat it; the timeline's "pauses": [[a, b]] are read too)
// --last     also summarise the last N seconds (default 30), where a coda or a swell most often climbs
// --all      print every line, not only the ones that fall short
//
// Exit 0 every check passes, 3 a line or a silence fails, 1 the inputs could not be read. Needs only node and ffmpeg.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flags = new Set(['--min', '--last', '--ceiling', '--dead']);
const pos = [];
const opt = {}, pauses = [];
for (let i = 0; i < argv.length; i++) {
  if (flags.has(argv[i])) opt[argv[i]] = Number(argv[++i]);
  else if (argv[i] === '--pause') { const [a, b] = String(argv[++i]).split('-').map(Number); pauses.push([a, b]); }
  else if (argv[i] === '--all') opt.all = true;
  else pos.push(argv[i]);
}
const [voice, bed, timeline] = pos;
const MIN = opt['--min'] ?? 10, LAST = opt['--last'] ?? 30, CEIL = opt['--ceiling'] ?? 24, DEAD = opt['--dead'] ?? 0.6;
const fail = msg => { console.error(msg); process.exit(1); };
if (!voice || !bed || !timeline) fail('usage: node levels.mjs <voice.wav> <bed.wav> <timeline.json> [--min 10] [--ceiling 24] [--dead 0.6] [--pause a-b ...] [--last 30] [--all]');
for (const f of [voice, bed, timeline]) if (!fs.existsSync(f)) fail(`not found: ${f}`);
if (![MIN, LAST, CEIL, DEAD].every(Number.isFinite)) fail('--min, --last, --ceiling and --dead take numbers');
if (pauses.some(([a, b]) => !(b > a))) fail('--pause takes a-b in seconds, b after a');

// momentary loudness every 100 ms, read from ffmpeg's ebur128 metadata; a window ending at t covers t - 0.4 to t
function momentary(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) fail(`ffmpeg could not read ${file}: ${(r.stderr || '').trim().split('\n').pop()}`);
  return [...r.stdout.matchAll(/pts_time:([\d.]+)\s+lavfi\.r128\.M=(-?[\d.]+|-inf|nan)/g)].map(m => [Number(m[1]), /\d/.test(m[2]) ? Number(m[2]) : -120]);
}

let tl;
try { tl = JSON.parse(fs.readFileSync(timeline, 'utf8')); } catch (e) { fail(`timeline is not JSON: ${e.message}`); }
const lines = (Array.isArray(tl) ? tl : tl.lines ?? []).filter(l => Number.isFinite(l.start) && Number.isFinite(l.end));
if (!lines.length) fail('the timeline has no lines with start and end');
const end = Number.isFinite(tl.duration) ? tl.duration : Math.max(...lines.map(l => l.end));
for (const p of tl.pauses ?? []) pauses.push(Array.isArray(p) ? p : [p.start, p.end]);
const inPause = (a, b) => pauses.some(([p0, p1]) => a >= p0 - 0.05 && b <= p1 + 0.05);

const v = momentary(voice), b = momentary(bed);
// windows wholly inside the line: from 0.4 s after its first word to its last
const inside = (list, l) => list.filter(([t]) => t >= l.start + 0.4 && t <= l.end).map(([, m]) => m);
const power = ms => 10 * Math.log10(ms.reduce((s, m) => s + 10 ** (m / 10), 0) / ms.length);
const rows = lines.filter(l => l.end - l.start >= 0.6).map((l, i) => {
  const vs = inside(v, l), bs = inside(b, l);
  if (!vs.length || !bs.length) return null;
  const vo = power(vs), bedMax = Math.max(...bs), bedAvg = power(bs);
  return { id: l.id ?? `line ${i + 1}`, t: l.start, end: l.end, voice: vo, bedMax, gap: vo - bedMax, under: vo - bedAvg };
}).filter(Boolean);
if (!rows.length) fail('no line long enough to measure, or the stems are shorter than the timeline');

// a line the voice stem is silent under means the stem and the timeline are not on the same clock
const silent = rows.filter(r => r.voice < -50);
if (silent.length) console.log(`WARN the voice stem is near silent under ${silent.map(r => r.id).join(', ')}: is it on the timeline's clock?`);

const sum = (label, list) => {
  if (!list.length) return;
  const g = list.map(r => r.gap).sort((x, y) => x - y);
  console.log(`${label}: ${list.length} lines; the bed's loudest moment under a line is below it by min ${g[0].toFixed(1)} dB, median ${g[Math.floor(g.length / 2)].toFixed(1)} dB`);
};
sum('whole', rows);
sum(`last ${LAST} s`, rows.filter(r => r.t >= end - LAST));
const short = rows.filter(r => r.gap < MIN);
const buried = rows.filter(r => r.under > CEIL && !pauses.some(([p0, p1]) => p0 < r.end && p1 > r.t));
for (const r of opt.all ? rows : [...new Set([...short, ...buried])]) {
  const tagOf = r.gap < MIN ? 'SHORT' : r.under > CEIL ? 'BURIED' : 'ok   ';
  console.log(`  ${tagOf.padEnd(6)} ${r.id} at ${r.t.toFixed(1)} s: voice ${r.voice.toFixed(1)}, bed up to ${r.bedMax.toFixed(1)} (${r.gap.toFixed(1)} dB), bed on average ${r.under.toFixed(1)} dB under`);
}

// dead air: silence of voice and bed together, from ffmpeg's silencedetect on their sum
const dur = f => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());
const sd = spawnSync('ffmpeg', ['-v', 'info', '-i', voice, '-i', bed, '-filter_complex', `[0:a][1:a]amix=inputs=2:normalize=0,silencedetect=noise=-50dB:d=${DEAD}`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (sd.status !== 0) fail(`ffmpeg could not mix the stems: ${(sd.stderr || '').trim().split('\n').pop()}`);
const fileEnd = Math.max(dur(voice), dur(bed));
const silences = [];
for (const m of sd.stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
  if (m[1] === 'start') silences.push([Number(m[2]), fileEnd]); else if (silences.length) silences[silences.length - 1][1] = Number(m[2]);
}
const dead = silences.filter(([a, b]) => b - a > DEAD && !inPause(a, b));
for (const [a, b] of dead) console.log(`  DEAD   ${(b - a).toFixed(2)} s of silence at ${a.toFixed(2)} to ${b.toFixed(2)} s${b >= fileEnd - 0.05 ? ' (the end: end 0.5 s after the last word, on the music)' : ''}`);

if (short.length) console.log(`${short.length} line(s) under ${MIN} dB: hold the bed down for the length of each line (toon-video "Music and mix")`);
if (buried.length) console.log(`${buried.length} line(s) with the bed over ${CEIL} dB under on average: the music is not heard; bring it up to 15 to 20 dB under the voice`);
if (dead.length) console.log(`${dead.length} silence(s) over ${DEAD} s outside a planned pause: hold the bed through pauses and end on the music`);
if (short.length || buried.length || dead.length) process.exit(3);
console.log(`ok: under every line the bed stays ${MIN} to ${CEIL} dB below the voice, and no silence over ${DEAD} s`);
