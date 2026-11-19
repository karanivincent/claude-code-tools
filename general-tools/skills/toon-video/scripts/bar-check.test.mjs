// Run: node --test general-tools/skills/toon-video/scripts/bar-check.test.mjs   (needs ffmpeg and python3)
// bar-check.py's gate on made clips, called the way the scene loop calls it: `python3 -I bar-check.py <clip> --gate
// [--night]`. Each clip is two seconds of flat grey made by ffmpeg: a calm night (passes), a dark night, a picture that
// never settles, a still picture and a night with a white pool over a twelfth of the frame (each fails its measure).
// The calm night is a warm brown (saturation about 0.48), so it also passes the colour floor (S3-250); a lit grey day
// fails only that floor, and --no-colour leaves it out.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BAR = path.join(import.meta.dirname, 'bar-check.py');
let dir;
const clip = (name, filter) => {
  const out = path.join(dir, `${name}.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-pix_fmt', 'yuv420p', out]);
  return out;
};
const run = (...a) => spawnSync('python3', ['-I', BAR, ...a], { encoding: 'utf8' });
const C = {};
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-check-'));
  const grey = (hex, extra = '') => `color=c=0x${hex}:s=108x192:r=30:d=2,noise=alls=8:allf=t${extra}`;
  C.night = clip('night', 'color=c=0x704e3a:s=108x192:r=30:d=2,noise=c0s=8:c0f=t');
  C.greyday = clip('greyday', 'color=c=0x999999:s=108x192:r=30:d=2,noise=c0s=8:c0f=t');
  C.dark = clip('dark', grey('202020'));
  C.pool = clip('pool', grey('484848', ',drawbox=x=0:y=0:w=108:h=16:color=white:t=fill'));
  C.churn = clip('churn', 'color=c=0x777777:s=108x192:r=30:d=2,noise=alls=100:allf=t');
  C.still = clip('still', 'color=c=0x777777:s=108x192:r=30:d=2');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a calm night at mean 85 passes the night gate: exit 0, nothing on stdout', () => {
  const r = run(C.night, '--gate', '--night');
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '');
  assert.match(r.stderr, /gate: pass/);
});

test('each failed measure is one line on stdout and exit 1', () => {
  const dark = run(C.dark, '--gate', '--night');
  assert.equal(dark.status, 1); assert.deepEqual(dark.stdout.trim().split('\n').map((l) => l.split('FAIL ')[1].split(':')[0]), ['S3-205 night mean']);
  const pool = run(C.pool, '--gate', '--night');
  assert.equal(pool.status, 1); assert.match(pool.stdout, /S3-220 night brightest 5%/); assert.doesNotMatch(pool.stdout, /night mean/);
  const churn = run(C.churn, '--gate');
  assert.equal(churn.status, 1); assert.match(churn.stdout, /S3-173 calm: median change per frame [\d.]+ is over 8/);
  const still = run(C.still, '--gate');
  assert.equal(still.status, 1); assert.match(still.stdout, /bar-4 still: the picture is still for/);
});

test('without --night the night levels are not gated; without --gate it reports and exits 0 as before', () => {
  assert.equal(run(C.dark, '--gate').status, 0);
  const plain = run(C.churn);
  assert.equal(plain.status, 0); assert.match(plain.stdout, /median change per frame/); assert.match(plain.stdout, /check 4 \(never still 0.7 s\): pass/);
});

test('--json alone prints the numbers on stdout; --json <file> writes them', () => {
  const r = run(C.dark, '--gate', '--night', '--json');
  const j = JSON.parse(r.stdout);
  assert.equal(r.status, 1); assert.equal(j.gate.pass, false); assert.ok(j.mean_luma < 75);
  const f = path.join(dir, 'n.json');
  assert.equal(run(C.night, '--json', f).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).frames, 60);
});

test('a lit grey picture fails the colour floor and nothing else; --no-colour leaves it out; a dark clip is not judged on colour', () => {
  const r = run(C.greyday, '--gate');
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split('\n').map((l) => l.split('FAIL ')[1].split(':')[0]), ['S3-250 colour']);
  assert.equal(run(C.greyday, '--gate', '--no-colour').status, 0);
  assert.doesNotMatch(run(C.dark, '--gate', '--night').stdout, /S3-250/);
  const j = JSON.parse(run(C.night, '--json').stdout);
  assert.ok(j.sat_mean > 0.4 && j.sat_mean < 0.56, String(j.sat_mean));
});
