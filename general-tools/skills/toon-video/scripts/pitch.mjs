#!/usr/bin/env node
// The median pitch of each voice take, ordered low to high, for picking a narrator by numbers rather than by name.
// "Higher, excited, still a normal person" is a pitch band: on the Mona Lisa heist the owner liked takes at about 170 to
// 211 Hz, and 11 of 12 young excited men from the voice library sat at 103 to 140 Hz, so a description alone could not
// find one (9 November 2026). Voice the same opening lines with every candidate, then run this over the takes.
//
//   node pitch.mjs <take.mp3> [more takes...] [--band 170-211] [--json]
//
// Each take is levelled to -16 LUFS (so the quiet-frame gate means the same for every take), read as 16 kHz mono, and
// cut into 64 ms frames every 20 ms. Frames quieter than 0.03 RMS are skipped; each other frame's period is the
// autocorrelation peak between 70 and 400 Hz, kept when it is over 0.4 of the frame's energy. The take's pitch is the
// median of the kept frames. Ported from the voice-pick work's pitch.py; a few Hz either side is noise, tens are not.
// --band marks the takes inside a range. Exit 0, or 1 when a file cannot be read. Needs only node and ffmpeg.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
let band = null, json = false;
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--band') { const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(argv[++i] ?? ''); if (!m) { console.error('--band takes lo-hi in Hz, e.g. 170-211'); process.exit(1); } band = [Number(m[1]), Number(m[2])]; }
  else if (argv[i] === '--json') json = true;
  else files.push(argv[i]);
}
if (!files.length) { console.error('usage: node pitch.mjs <take> [more...] [--band lo-hi] [--json]'); process.exit(1); }

const SR = 16000, FR = 1024, HOP = 320, LO = Math.floor(SR / 400), HI = Math.floor(SR / 70);
function medianPitch(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) { console.error(`ffmpeg could not read ${file}: ${r.stderr.toString().trim().split('\n').pop()}`); process.exit(1); }
  const buf = r.stdout, x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const s = new Float64Array(FR), out = [];
  for (let i = 0; i + FR < x.length; i += HOP) {
    let mean = 0, sq = 0;
    for (let j = 0; j < FR; j++) { mean += x[i + j]; sq += x[i + j] * x[i + j]; }
    if (Math.sqrt(sq / FR) < 0.03) continue;
    mean /= FR;
    for (let j = 0; j < FR; j++) s[j] = x[i + j] - mean;
    let ac0 = 0;
    for (let j = 0; j < FR; j++) ac0 += s[j] * s[j];
    let best = -Infinity, k = LO;
    for (let lag = LO; lag < HI; lag++) {
      let a = 0;
      for (let j = 0; j + lag < FR; j++) a += s[j] * s[j + lag];
      if (a > best) { best = a; k = lag; }
    }
    if (best > 0.4 * ac0) out.push(SR / k);
  }
  if (!out.length) return NaN;
  out.sort((a, b) => a - b);
  const m = out.length >> 1;
  return out.length % 2 ? out[m] : (out[m - 1] + out[m]) / 2;
}

const rows = files.map(f => ({ file: f, hz: medianPitch(f) })).sort((a, b) => (a.hz || 0) - (b.hz || 0));
if (json) { console.log(JSON.stringify(rows.map(r => ({ ...r, inBand: band ? r.hz >= band[0] && r.hz <= band[1] : undefined })), null, 1)); process.exit(0); }
for (const r of rows) {
  const mark = band && r.hz >= band[0] && r.hz <= band[1] ? '  <- in band' : '';
  console.log(`${Number.isFinite(r.hz) ? r.hz.toFixed(0).padStart(5) : '    ?'} Hz  ${path.basename(r.file)}${mark}`);
}
if (band) console.log(`${rows.filter(r => r.hz >= band[0] && r.hz <= band[1]).length} of ${rows.length} takes inside ${band[0]} to ${band[1]} Hz`);
