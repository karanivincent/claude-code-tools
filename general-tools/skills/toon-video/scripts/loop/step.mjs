#!/usr/bin/env node
// step.mjs: the file check between the steps of a scene's loop. It reads the scene's loop folder and prints the next
// step, and refuses (exit 1, naming the missing file) to start a step whose input is missing.
//
//   node step.mjs <scene-dir>                     where the scene stands and the next step (the command to run)
//   node step.mjs <scene-dir> init --code <dir>   write scene.json: the scene's source folder (snapshotted by keep)
//   node step.mjs <scene-dir> check <step>        exit 1 if <step>'s input is missing: build | render | look | judge |
//                                                 keep | revert | round
//   node step.mjs <scene-dir> round <pass>        make the next round folder of <pass> (world|people|motion|sound)
//   node step.mjs <scene-dir> keep                the current round's code and clip become best/
//   node step.mjs <scene-dir> revert              copy best/code back over the scene's source folder
//   node step.mjs <scene-dir> log <phase> [note]  close the open phase in log.md (start time and minutes), open <phase>;
//                                                 `log end` closes it. One line per phase.
//
// The scene's loop folder, out/<slug>/scenes/<scene>/:
//   scene.json         {"code": "<the scene's source folder>"}            (init)
//   meaning.md         what the scene must say: beats, words and times   (optional; passed to look.sh and abjudge.sh)
//   poses.jpg          the pose sheet: every pose and prop the words need (the rig check; no pose sheet, no build)
//   log.md             one line per phase: start, minutes, what
//   <pass>-r<n>/       one round. pass: world, people, motion, sound; world-r0 is the scene's first build
//     changes.md       the builder's changes, at most five
//     stills.jpg       the stills sheet of the changed seconds            (no stills sheet, no render)
//     clip.mp4         the render
//     jumps.md         jumps.sh: one-frame jumps                          audible.md: audible.py (sound pass)
//     looks/           look.sh: the three reviewers' replies             faults.md: their faults, ranked
//     verdict.json     abjudge.sh against best/clip.mp4                   (no verdict.json, no next round)
//     kept | reverted  written by keep and revert
//   best/              code/ (a snapshot of the source folder), clip.mp4, faults.md, verdict.json, from.txt
//                      (no best snapshot, no revert)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PASSES = ['world', 'people', 'motion', 'sound'];
const AREA = { world: ['world', 'light'], people: ['people'], motion: ['motion'], sound: ['sound'] };
const MAX_ROUNDS = 6, TARGET = 4;

const [dirArg, cmd = 'next', ...rest] = process.argv.slice(2);
if (!dirArg) { console.error('usage: node step.mjs <scene-dir> [next|init|check|round|keep|revert|log] ...'); process.exit(2); }
const D = path.resolve(dirArg);
const here = path.dirname(new URL(import.meta.url).pathname);
const rel = (p) => { const r = path.relative(process.cwd(), p) || '.'; return r.startsWith('..') ? p : r; };
const has = (...p) => fs.existsSync(path.join(...p));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const refuse = (msg) => { console.error(`refused: ${msg}`); process.exit(1); };
const need = (file, why) => { if (!fs.existsSync(file)) refuse(`${rel(file)} is missing (${why})`); };

function rounds() {
  if (!fs.existsSync(D)) return [];
  return fs.readdirSync(D).map((d) => d.match(/^(world|people|motion|sound)-r(\d+)$/)).filter(Boolean)
    .map((m) => ({ name: m[0], pass: m[1], n: +m[2], dir: path.join(D, m[0]) }))
    .sort((a, b) => PASSES.indexOf(a.pass) - PASSES.indexOf(b.pass) || a.n - b.n);
}
const current = () => rounds().at(-1);
const isBaseline = (r) => r.pass === 'world' && r.n === 0;
const verdict = (r) => readJson(path.join(r.dir, 'verdict.json'));
const done = (r) => has(r.dir, 'kept') || has(r.dir, 'reverted');

// the score of best in the pass's area: the last judged round's kept clip, else the reviewers' mean on best
function bestScore(pass) {
  if (pass === 'sound') return null;
  const areas = AREA[pass];
  for (const r of rounds().reverse()) {
    const v = verdict(r);
    if (v?.mean && done(r)) { const s = v.mean[has(r.dir, 'kept') ? 'new' : 'best']; return Math.min(...areas.map((a) => s[a] ?? 0)); }
  }
  const s = readJson(path.join(D, 'best', 'scores.json'));
  return s?.mean ? Math.min(...areas.map((a) => s.mean[a] ?? 0)) : null;
}
const audibleClean = (r) => { const t = fs.existsSync(path.join(r.dir, 'audible.md')) ? fs.readFileSync(path.join(r.dir, 'audible.md'), 'utf8') : null; return t !== null && !/\|\s*(masked|just)\s*\|/.test(t); };

// why a pass stops, or null
function passStop(pass) {
  const rs = rounds().filter((r) => r.pass === pass && r.n >= 1 && done(r));
  if (rs.length >= MAX_ROUNDS) return `${MAX_ROUNDS} rounds`;
  const last2 = rs.slice(-2);
  if (pass !== 'sound' && last2.length === 2 && last2.every((r) => verdict(r)?.winner !== 'win')) return 'two rounds in a row with no win';
  if (pass === 'sound') { const last = rs.at(-1); if (last && audibleClean(last)) return 'every effect heard'; return null; }
  const s = bestScore(pass);
  if (s !== null && s >= TARGET) return `${AREA[pass].join(' and ')} at ${s} (target ${TARGET})`;
  return null;
}

// the same top fault in the last two rounds of a pass: restage that beat
function restageHint(pass) {
  const rs = rounds().filter((r) => r.pass === pass && has(r.dir, 'faults.json')).slice(-2);
  if (rs.length < 2) return null;
  const [a, b] = rs.map((r) => readJson(path.join(r.dir, 'faults.json'))?.[0]);
  if (!a || !b || a.area !== b.area || a.t0 == null || b.t0 == null) return null;
  const mid = (f) => (f.t0 + f.t1) / 2;
  return Math.abs(mid(a) - mid(b)) <= 0.5 ? `the top fault (${a.area} at ${a.t0}-${a.t1} s) led two rounds running: restage that beat (a new pose drawing or a new shot), not a tweak` : null;
}

function changesCount(r) {
  const f = path.join(r.dir, 'changes.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^\s*(-|\*|\d+\.)\s/.test(l)).length : 0;
}

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  execFileSync('rsync', ['-a', '--delete', '--exclude', 'node_modules', `${src}/`, `${dst}/`]);
}
const scene = () => readJson(path.join(D, 'scene.json'));
const L = here;
const S = (p) => rel(path.join(L, p));

function nextStep() {
  const lines = [];
  const say = (s) => lines.push(s);
  if (!scene()) return [`init: node ${S('step.mjs')} ${rel(D)} init --code <the scene's source folder>`];
  if (!has(D, 'poses.jpg')) return [`rig check: draw every pose and prop the scene's words need, one still at full size, saved as ${rel(path.join(D, 'poses.jpg'))}`];
  const r = current();
  if (!r) return [`start the first build: node ${S('step.mjs')} ${rel(D)} round world   (world-r0, the scene's first build)`];
  const R = rel(r.dir), meaning = has(D, 'meaning.md') ? ` --meaning ${rel(path.join(D, 'meaning.md'))}` : '';
  say(`round ${r.name}`);
  if (!has(r.dir, 'stills.jpg')) {
    const c = changesCount(r);
    if (c > 5) say(`warning: changes.md lists ${c} changes; a round makes at most five`);
    const from = has(D, 'best', 'faults.md') ? ` from ${rel(path.join(D, 'best', 'faults.md'))}` : '';
    const prev = rounds().filter((x) => x !== r && verdict(x)).at(-1);
    const blame = prev ? ` and the judge's blame in ${rel(path.join(prev.dir, 'verdict.json'))}` : '';
    say(`next: build at most five changes${from}${blame}; list them in ${R}/changes.md; then the stills sheet ${R}/stills.jpg (look at it before any render)`);
    return lines;
  }
  if (!has(r.dir, 'clip.mp4')) return [...lines, `next: render the scene to ${R}/clip.mp4 (take a render slot)`];
  if (!has(r.dir, 'jumps.md')) return [...lines, `next: ${S('jumps.sh')} ${R}/clip.mp4 ${R}`];
  if (r.pass === 'sound' && !has(r.dir, 'audible.md')) return [...lines, `next: python3 ${S('audible.py')} <mix.wav> <cues.json> --voice <voice.wav> --out ${R}/audible.md`];
  const prev = rounds().filter((x) => x !== r && done(x)).at(-1);
  const skipLook = prev && (has(prev.dir, 'reverted') || verdict(prev)?.winner === 'tie');
  if (!has(r.dir, 'faults.md') && !skipLook && r.pass !== 'sound') {
    const prior = has(D, 'best', 'faults.md') ? ` --prior ${rel(path.join(D, 'best', 'faults.md'))}` : '';
    return [...lines, `next: ${S('look.sh')} ${R}/clip.mp4 ${R} --focus ${r.pass}${meaning}${prior}`];
  }
  if (!isBaseline(r) && r.pass !== 'sound' && !has(r.dir, 'verdict.json')) {
    return [...lines, `next: ${S('abjudge.sh')} ${rel(path.join(D, 'best', 'clip.mp4'))} ${R}/clip.mp4 ${R}${meaning}`];
  }
  if (!done(r)) {
    if (isBaseline(r)) return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep   (the first build is the first best)`];
    if (r.pass === 'sound') return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep   if ${R}/audible.md is no worse than best's, else revert`];
    const v = verdict(r);
    say(`verdict: ${v.winner} (new ${v.mean.new.mean} vs best ${v.mean.best.mean}), prefer ${v.prefer}`);
    if (v.keep === 'new') return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep`];
    return [...lines, `next: node ${S('step.mjs')} ${rel(D)} revert` + (v.winner === 'tie' ? '; the next round carries what the judge credited in new and drops what it blamed' : '')];
  }
  // the round is closed: same pass or the next one
  let pass = r.pass;
  for (;;) {
    const why = passStop(pass);
    if (!why) break;
    say(`pass ${pass} stops: ${why}`);
    const i = PASSES.indexOf(pass) + 1;
    if (i >= PASSES.length) { say(`scene done: best/clip.mp4 and best/code go into the film`); return lines; }
    pass = PASSES[i];
  }
  const hint = restageHint(pass);
  if (hint) say(hint);
  if (has(r.dir, 'reverted') || verdict(r)?.winner === 'tie') say(`the last round lost or tied: skip the reviewers next round; build from best/faults.md and the judge's credit and blame`);
  say(`next: node ${S('step.mjs')} ${rel(D)} round ${pass}`);
  return lines;
}

function check(step) {
  const r = current();
  const sc = scene();
  switch (step) {
    case 'build': case 'round':
      need(path.join(D, 'scene.json'), `run init first`);
      need(path.join(D, 'poses.jpg'), 'no pose sheet, no build');
      if (r && !done(r)) {
        if (!isBaseline(r) && r.pass !== 'sound') need(path.join(r.dir, 'verdict.json'), `no verdict.json, no next round`);
        if (r.pass === 'sound') need(path.join(r.dir, 'audible.md'), 'no audible.md, no next sound round');
        refuse(`${r.name} is not closed: run keep or revert first`);
      }
      return;
    case 'render': need(path.join(r?.dir ?? D, 'stills.jpg'), 'no stills sheet, no render'); return;
    case 'look': need(path.join(r?.dir ?? D, 'clip.mp4'), 'no render, no look'); return;
    case 'judge':
      need(path.join(r?.dir ?? D, 'clip.mp4'), 'no render, no judge');
      need(path.join(D, 'best', 'clip.mp4'), 'no best clip to judge against');
      return;
    case 'keep':
      if (!r) refuse('no round to keep');
      need(path.join(r.dir, 'clip.mp4'), 'no render, no keep');
      need(path.join(D, 'scene.json'), 'scene.json names the code to snapshot');
      if (!fs.existsSync(sc?.code ?? '')) refuse(`the scene's source folder ${sc?.code} is missing`);
      if (!isBaseline(r) && r.pass !== 'sound') {
        need(path.join(r.dir, 'verdict.json'), 'no verdict.json, no keep');
        if (verdict(r).keep !== 'new') refuse(`the verdict keeps best (${verdict(r).winner}): revert instead`);
      }
      if (r.pass === 'sound') need(path.join(r.dir, 'audible.md'), 'no audible.md, no keep');
      return;
    case 'revert':
      need(path.join(D, 'best', 'code'), 'no best snapshot, no revert');
      need(path.join(D, 'scene.json'), 'scene.json names the code to restore');
      return;
    default: console.error(`unknown step ${step}`); process.exit(2);
  }
}

function log(phase, note) {
  const lf = path.join(D, 'log.md'), pf = path.join(D, '.phase.json');
  fs.mkdirSync(D, { recursive: true });
  if (!fs.existsSync(lf)) fs.writeFileSync(lf, `# ${path.basename(D)} log\n\nOne line per phase: start, minutes, what.\n\n`);
  const open = readJson(pf), now = new Date();
  const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (open) {
    const s = new Date(open.start), min = Math.round((now - s) / 6000) / 10;
    fs.appendFileSync(lf, `- ${hm(s)} | ${open.phase} | ${min} min | ${open.note || ''}\n`.replace(/ \| \n$/, '\n'));
    console.log(`logged ${open.phase}: ${min} min`);
    fs.rmSync(pf);
  }
  if (phase !== 'end') { fs.writeFileSync(pf, JSON.stringify({ phase, start: now.toISOString(), note })); console.log(`open: ${phase} from ${hm(now)}`); }
}

switch (cmd) {
  case 'next': case 'status': console.log(nextStep().join('\n')); break;
  case 'init': {
    const i = rest.indexOf('--code');
    if (i < 0 || !rest[i + 1]) refuse('init needs --code <the scene\'s source folder>');
    const code = path.resolve(rest[i + 1]);
    if (!fs.existsSync(code)) refuse(`${code} does not exist`);
    fs.mkdirSync(D, { recursive: true });
    fs.writeFileSync(path.join(D, 'scene.json'), JSON.stringify({ ...(scene() ?? {}), code }, null, 1) + '\n');
    console.log(`scene.json: code ${code}`); break;
  }
  case 'check': check(rest[0]); console.log(`ok: ${rest[0]}`); break;
  case 'round': {
    const pass = rest[0];
    if (!PASSES.includes(pass)) refuse(`round needs a pass: ${PASSES.join(', ')}`);
    check('round');
    const r = current();
    if (!r && pass !== 'world') refuse('the first round is world-r0');
    if (r && PASSES.indexOf(pass) < PASSES.indexOf(r.pass)) refuse(`pass ${r.pass} is past ${pass}`);
    if (r && !has(D, 'best', 'clip.mp4')) refuse(`${rel(path.join(D, 'best', 'clip.mp4'))} is missing (keep a round first)`);
    const n = r ? Math.max(-1, ...rounds().filter((x) => x.pass === pass).map((x) => x.n)) + 1 : 0;
    const dir = path.join(D, `${pass}-r${pass === 'world' ? n : Math.max(1, n)}`);
    fs.mkdirSync(dir, { recursive: true });
    console.log(rel(dir)); break;
  }
  case 'keep': {
    check('keep');
    const r = current(), B = path.join(D, 'best');
    copyDir(scene().code, path.join(B, 'code'));
    fs.copyFileSync(path.join(r.dir, 'clip.mp4'), path.join(B, 'clip.mp4'));
    for (const f of ['faults.md', 'faults.json', 'verdict.json', 'audible.md']) if (has(r.dir, f)) fs.copyFileSync(path.join(r.dir, f), path.join(B, f));
    if (has(r.dir, 'looks', 'scores.json')) fs.copyFileSync(path.join(r.dir, 'looks', 'scores.json'), path.join(B, 'scores.json'));
    fs.writeFileSync(path.join(B, 'from.txt'), `${r.name} ${new Date().toISOString()}\n`);
    fs.writeFileSync(path.join(r.dir, 'kept'), '');
    console.log(`best = ${r.name} (code snapshot ${rel(path.join(B, 'code'))})`); break;
  }
  case 'revert': {
    check('revert');
    const r = current();
    copyDir(path.join(D, 'best', 'code'), scene().code);
    if (r && !done(r)) fs.writeFileSync(path.join(r.dir, 'reverted'), '');
    console.log(`reverted ${scene().code} to best (${fs.readFileSync(path.join(D, 'best', 'from.txt'), 'utf8').trim()})`); break;
  }
  case 'log': if (!rest[0]) refuse('log needs a phase'); log(rest[0], rest.slice(1).join(' ')); break;
  default: console.error(`unknown command ${cmd}`); process.exit(2);
}
