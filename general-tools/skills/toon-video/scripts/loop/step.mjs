#!/usr/bin/env node
// step.mjs: the file check between the steps of a scene's loop. It reads the scene's loop folder and prints the next
// step, and refuses (exit 1, naming the missing file) to start a step whose input is missing.
//
//   node step.mjs <scene-dir>                     where the scene stands and the next step (the command to run)
//   node step.mjs <scene-dir> init --code <dir> [--code <dir2>] [--passes people,motion] [--ref <clip.mp4>]
//                                                 write scene.json: the source folders keep snapshots and revert restores,
//                                                 the passes this loop runs, and the reference clip (S5-76, S5-77).
//                                                 A scene of the scene stage: --passes people,motion (the default). The
//                                                 world stage: a loop folder out/<slug>/world with --code <places dir>
//                                                 --passes world. The shots stage: out/<slug>/shots, --passes shots.
//   node step.mjs <scene-dir> check <step>        exit 1 if <step>'s input is missing: build | render | look | judge |
//                                                 keep | revert | round
//   node step.mjs <scene-dir> round <pass>        make the next round folder of <pass> (one of scene.json's passes)
//   node step.mjs <scene-dir> keep                the current round's code and clip become best/ (faults.md carried
//                                                 from best and the judge when the round had no reviewers: S5-90)
//   node step.mjs <scene-dir> revert              copy best/code back over every source folder; the judge's credit and
//                                                 blame go into best/faults.md and the round's faults.md (S5-90)
// Locks (S5-71, S5-73): when out/<slug>/locks.json exists, round, render and keep refuse while a locked file differs
// from its lock (lock.mjs). A builder who needs a place, camera or scale change asks the lead, who reopens that stage.
//   node step.mjs <scene-dir> log <phase> [note]  close the open phase in log.md (start time and minutes), open <phase>;
//                                                 `log end` closes it. One line per phase.
//
// The scene's loop folder, out/<slug>/scenes/<scene>/:
//   scene.json         {"code": ["<source folder>", ...], "passes": ["people", "motion"], "ref": "<clip>"}   (init)
//   meaning.md         what the scene must say: beats, words and times   (optional; passed to look.sh and abjudge.sh)
//   poses.jpg          the pose sheet: every pose and prop the words need (the rig check; no pose sheet, no build)
//   log.md             one line per phase: start, minutes, what
//   <pass>-r<n>/       one round. pass: world, shots, people, motion, sound; <first pass>-r0 is the first build
//     changes.md       the builder's changes, at most five
//     stills.jpg       the stills sheet of the changed seconds            (no stills sheet, no render)
//     clip.mp4         the render
//     jumps.md         jumps.sh: one-frame jumps                          audible.md: audible.py (sound pass)
//     looks/           look.sh: the three reviewers' replies             faults.md: their faults, ranked
//     verdict.json     abjudge.sh against best/clip.mp4                   (no verdict.json, no next round)
//     kept | reverted  written by keep and revert
//   best/              code/<n>/ (a snapshot of each source folder), clip.mp4, faults.md, verdict.json, from.txt
//                      (no best snapshot, no revert)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findLocks, lockFaults } from './lock.mjs';

const ALL = ['world', 'shots', 'people', 'motion', 'sound'];
const AREA = { world: ['world', 'light'], shots: ['story'], people: ['people'], motion: ['motion'], sound: ['sound'] };
// the scene stage's passes (S5-75): places, cameras and scale are locked by then, and the one mix is checked once at
// the join (S5-83). An older scene.json with no "passes" keeps this default too.
const DEFAULT_PASSES = ['people', 'motion'];
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

const scene = () => readJson(path.join(D, 'scene.json'));
const codes = () => { const c = scene()?.code; return c == null ? [] : Array.isArray(c) ? c : [c]; };
const PASSES = (() => { const p = scene()?.passes; return Array.isArray(p) && p.length ? p.filter((x) => ALL.includes(x)) : DEFAULT_PASSES; })();
const FIRST = PASSES[0];
const ref = () => { const r = scene()?.ref; return r && fs.existsSync(r) ? r : null; };
const needsPoses = () => PASSES.includes('people') || PASSES.includes('motion');

function rounds() {
  if (!fs.existsSync(D)) return [];
  return fs.readdirSync(D).map((d) => d.match(/^(world|shots|people|motion|sound)-r(\d+)$/)).filter(Boolean)
    .map((m) => ({ name: m[0], pass: m[1], n: +m[2], dir: path.join(D, m[0]) }))
    .sort((a, b) => (a.n === 0 ? -1 : 0) - (b.n === 0 ? -1 : 0) || ALL.indexOf(a.pass) - ALL.indexOf(b.pass) || a.n - b.n);
}
const current = () => rounds().at(-1);
const isBaseline = (r) => r.n === 0;
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
// how best stands against the reference in the last judging that saw it: beats, ties, below, or null (S5-77)
function refStatus() {
  for (const r of rounds().reverse()) {
    const v = verdict(r);
    if (v?.ref && done(r)) return v.ref[has(r.dir, 'kept') ? 'new' : 'best']?.status ?? null;
  }
  return null;
}
const audibleClean = (r) => { const t = fs.existsSync(path.join(r.dir, 'audible.md')) ? fs.readFileSync(path.join(r.dir, 'audible.md'), 'utf8') : null; return t !== null && !/\|\s*(masked|just)\s*\|/.test(t); };

// why a pass stops, or null. The rules of S5-43 hold whatever a brief says (S5-89); with a reference, the target stop
// also needs best to beat or tie the reference (S5-77).
function passStop(pass) {
  const rs = rounds().filter((r) => r.pass === pass && r.n >= 1 && done(r));
  if (rs.length >= MAX_ROUNDS) return `${MAX_ROUNDS} rounds`;
  const last2 = rs.slice(-2);
  if (pass !== 'sound' && last2.length === 2 && last2.every((r) => verdict(r)?.winner !== 'win')) return 'two rounds in a row with no win';
  if (pass === 'sound') { const last = rs.at(-1); if (last && audibleClean(last)) return 'every effect heard'; return null; }
  const s = bestScore(pass);
  if (s !== null && s >= TARGET) {
    if (ref() && refStatus() === 'below') return null;
    return `${AREA[pass].join(' and ')} at ${s} (target ${TARGET})${ref() ? `, ${refStatus() ?? 'not yet judged against'} the reference` : ''}`;
  }
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

// locks: a locked file that changed is refused before a round, a render or a keep (S5-71, S5-73)
function checkLocks() {
  const lf = findLocks(D);
  const bad = lockFaults(lf);
  if (bad.length) refuse(`locked files changed (${rel(lf)}):\n  ${bad.slice(0, 12).map((b) => `${b.stage}: ${b.file} ${b.why}`).join('\n  ')}\nPut them back (git checkout <file>) or ask the lead to reopen that stage (node ${rel(path.join(here, 'lock.mjs'))} ${rel(path.dirname(lf))} reopen <stage> --why "...")`);
}

// the judge's credit and blame of a round as markdown (S5-90)
function judgeNotes(r, kept) {
  const v = verdict(r);
  if (!v?.judges?.length) return '';
  const credit = v.judges.flatMap((j) => j.new?.credit ?? []), blame = v.judges.flatMap((j) => j.new?.blame ?? []);
  const other = v.judges.flatMap((j) => j.best?.credit ?? []);
  const L = [`## The judge on ${r.name} (${v.winner}, ${kept ? 'kept' : 'reverted'}; new ${v.mean.new.mean} vs best ${v.mean.best.mean})`, ''];
  if (credit.length) L.push(kept ? 'Credited in this round (keep it):' : 'Credited in the lost round (carry it over):', ...credit.map((c) => `- ${c}`), '');
  if (blame.length) L.push(kept ? 'Blamed in this round (fix next):' : 'Blamed in the lost round (do not repeat):', ...blame.map((c) => `- ${c}`), '');
  if (!kept && other.length) L.push('Credited in best over it (keep):', ...other.map((c) => `- ${c}`), '');
  if (v.ref) L.push(`Against the reference: best ${v.ref.best?.status ?? '?'} (${v.ref.best?.diff ?? '?'}), new ${v.ref.new?.status ?? '?'} (${v.ref.new?.diff ?? '?'}). What the reference does better: ${(v.ref.notes ?? []).join('; ') || 'see verdict.json'}`, '');
  return L.join('\n');
}

const L = here;
const S = (p) => rel(path.join(L, p));

function nextStep() {
  const lines = [];
  const say = (s) => lines.push(s);
  if (!scene()) return [`init: node ${S('step.mjs')} ${rel(D)} init --code <the source folder> [--passes people,motion] [--ref <reference clip>]`];
  if (needsPoses() && !has(D, 'poses.jpg')) return [`rig check: draw every pose and prop the scene's words need, one still at full size, saved as ${rel(path.join(D, 'poses.jpg'))}`];
  const r = current();
  if (!r) return [`start the first build: node ${S('step.mjs')} ${rel(D)} round ${FIRST}   (${FIRST}-r0, the first build)`];
  const R = rel(r.dir), meaning = has(D, 'meaning.md') ? ` --meaning ${rel(path.join(D, 'meaning.md'))}` : '';
  const words = has(D, 'words.json') ? ` --words ${rel(path.join(D, 'words.json'))}` : ` (no words.json: node ${S('words.mjs')} <full.json> --scene <id> --plan <plan.ts> --out ${rel(path.join(D, 'words.json'))})`;
  const refArg = ref() ? ` --ref ${rel(ref())}` : '';
  say(`round ${r.name}${ref() ? `   (reference: ${rel(ref())})` : ''}`);
  if (!has(r.dir, 'stills.jpg')) {
    const c = changesCount(r);
    if (c > 5) say(`warning: changes.md lists ${c} changes; a round makes at most five`);
    const from = has(D, 'best', 'faults.md') ? ` from ${rel(path.join(D, 'best', 'faults.md'))}` : '';
    say(`next: build at most five changes${from}; list them in ${R}/changes.md; then the stills sheet ${R}/stills.jpg (look at it before any render)`);
    return lines;
  }
  if (!has(r.dir, 'clip.mp4')) return [...lines, `next: render to ${R}/clip.mp4 (take a render slot)`];
  if (!has(r.dir, 'jumps.md')) return [...lines, `next: ${S('jumps.sh')} ${R}/clip.mp4 ${R}`];
  if (r.pass === 'sound' && !has(r.dir, 'audible.md')) return [...lines, `next: python3 ${S('audible.py')} <mix.wav> <cues.json> --voice <voice.wav> --out ${R}/audible.md`];
  const prev = rounds().filter((x) => x !== r && done(x)).at(-1);
  const skipLook = prev && (has(prev.dir, 'reverted') || verdict(prev)?.winner === 'tie');
  if (!has(r.dir, 'faults.md') && !skipLook && r.pass !== 'sound') {
    const prior = has(D, 'best', 'faults.md') ? ` --prior ${rel(path.join(D, 'best', 'faults.md'))}` : '';
    return [...lines, `next: ${S('look.sh')} ${R}/clip.mp4 ${R} --focus ${r.pass}${meaning}${prior}${words}`];
  }
  if (!isBaseline(r) && r.pass !== 'sound' && !has(r.dir, 'verdict.json')) {
    return [...lines, `next: ${S('abjudge.sh')} ${rel(path.join(D, 'best', 'clip.mp4'))} ${R}/clip.mp4 ${R}${meaning}${refArg}   (run with a 10-minute timeout)`];
  }
  if (isBaseline(r) && ref() && !has(r.dir, 'verdict.json') && !done(r)) {
    say(`the first build has a reference: judge it against the reference once, to start from its faults: ${S('abjudge.sh')} ${rel(ref())} ${R}/clip.mp4 ${R}${meaning} --any-length`);
  }
  if (!done(r)) {
    if (isBaseline(r)) return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep   (the first build is the first best)`];
    if (r.pass === 'sound') return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep   if ${R}/audible.md is no worse than best's, else revert`];
    const v = verdict(r);
    say(`verdict: ${v.winner} (new ${v.mean.new.mean} vs best ${v.mean.best.mean}), prefer ${v.prefer}${v.ref ? `; new ${v.ref.new?.status} the reference` : ''}`);
    if (v.keep === 'new') return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep`];
    return [...lines, `next: node ${S('step.mjs')} ${rel(D)} revert` + (v.winner === 'tie' ? '; the next round carries what the judge credited in new and drops what it blamed' : '')];
  }
  // the round is closed: same pass or the next one
  let pass = r.pass;
  for (;;) {
    const why = passStop(pass);
    if (!why) break;
    say(`pass ${pass} stops: ${why}`);
    if (ref() && refStatus() === 'below') say(`best is still below its reference: tell the lead (S5-77); the shots or the acting of the reference may need copying again`);
    const i = PASSES.indexOf(pass) + 1;
    if (i >= PASSES.length) { say(`done: best/clip.mp4 and best/code are the result`); return lines; }
    pass = PASSES[i];
  }
  const hint = restageHint(pass);
  if (hint) say(hint);
  if (has(r.dir, 'reverted') || verdict(r)?.winner === 'tie') say(`the last round lost or tied: skip the reviewers next round; build from best/faults.md (it now holds the judge's credit and blame)`);
  say(`next: node ${S('step.mjs')} ${rel(D)} round ${pass}`);
  return lines;
}

function check(step) {
  const r = current();
  switch (step) {
    case 'build': case 'round':
      need(path.join(D, 'scene.json'), `run init first`);
      if (needsPoses()) need(path.join(D, 'poses.jpg'), 'no pose sheet, no build');
      if (r && !done(r)) {
        if (!isBaseline(r) && r.pass !== 'sound') need(path.join(r.dir, 'verdict.json'), `no verdict.json, no next round`);
        if (r.pass === 'sound') need(path.join(r.dir, 'audible.md'), 'no audible.md, no next sound round');
        refuse(`${r.name} is not closed: run keep or revert first`);
      }
      checkLocks();
      return;
    case 'render': need(path.join(r?.dir ?? D, 'stills.jpg'), 'no stills sheet, no render'); checkLocks(); return;
    case 'look': need(path.join(r?.dir ?? D, 'clip.mp4'), 'no render, no look'); return;
    case 'judge':
      need(path.join(r?.dir ?? D, 'clip.mp4'), 'no render, no judge');
      need(path.join(D, 'best', 'clip.mp4'), 'no best clip to judge against');
      return;
    case 'keep':
      if (!r) refuse('no round to keep');
      need(path.join(r.dir, 'clip.mp4'), 'no render, no keep');
      need(path.join(D, 'scene.json'), 'scene.json names the code to snapshot');
      for (const c of codes()) if (!fs.existsSync(c)) refuse(`the source folder ${c} is missing`);
      if (!isBaseline(r) && r.pass !== 'sound') {
        need(path.join(r.dir, 'verdict.json'), 'no verdict.json, no keep');
        if (verdict(r).keep !== 'new') refuse(`the verdict keeps best (${verdict(r).winner}): revert instead`);
      }
      if (r.pass === 'sound') need(path.join(r.dir, 'audible.md'), 'no audible.md, no keep');
      checkLocks();
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

const all = (k) => rest.flatMap((a, i) => (rest[i - 1] === k ? [a] : []));
switch (cmd) {
  case 'next': case 'status': console.log(nextStep().join('\n')); break;
  case 'init': {
    const cs = all('--code');
    if (!cs.length) refuse('init needs --code <the source folder> (repeat --code for more folders)');
    const code = cs.map((c) => path.resolve(c));
    for (const c of code) if (!fs.existsSync(c)) refuse(`${c} does not exist`);
    const passes = (all('--passes')[0] ?? scene()?.passes?.join(',') ?? DEFAULT_PASSES.join(',')).split(',').map((x) => x.trim()).filter(Boolean);
    const bad = passes.filter((p) => !ALL.includes(p));
    if (bad.length) refuse(`unknown pass ${bad.join(', ')}: ${ALL.join(', ')}`);
    const r0 = all('--ref')[0], refPath = r0 ? path.resolve(r0) : scene()?.ref;
    if (r0 && !fs.existsSync(refPath)) refuse(`the reference ${r0} does not exist`);
    fs.mkdirSync(D, { recursive: true });
    const sc = { ...(scene() ?? {}), code: code.length === 1 ? code[0] : code, passes };
    if (refPath) sc.ref = refPath;
    fs.writeFileSync(path.join(D, 'scene.json'), JSON.stringify(sc, null, 1) + '\n');
    console.log(`scene.json: code ${code.join(', ')}; passes ${passes.join(', ')}${refPath ? `; reference ${refPath}` : ''}`); break;
  }
  case 'check': check(rest[0]); console.log(`ok: ${rest[0]}`); break;
  case 'round': {
    const pass = rest[0];
    if (!PASSES.includes(pass)) refuse(`round needs one of this loop's passes: ${PASSES.join(', ')} (scene.json "passes"; a locked stage's pass is not run here)`);
    check('round');
    const r = current();
    if (!r && pass !== FIRST) refuse(`the first round is ${FIRST}-r0`);
    if (r && PASSES.indexOf(pass) < PASSES.indexOf(r.pass) && r.n > 0) refuse(`pass ${r.pass} is past ${pass}`);
    if (r && !has(D, 'best', 'clip.mp4')) refuse(`${rel(path.join(D, 'best', 'clip.mp4'))} is missing (keep a round first)`);
    const n = r ? Math.max(0, ...rounds().filter((x) => x.pass === pass).map((x) => x.n)) + 1 : 0;
    const dir = path.join(D, `${pass}-r${n}`);
    fs.mkdirSync(dir, { recursive: true });
    console.log(rel(dir)); break;
  }
  case 'keep': {
    check('keep');
    const r = current(), B = path.join(D, 'best');
    const priorFaults = has(B, 'faults.md') ? fs.readFileSync(path.join(B, 'faults.md'), 'utf8') : '';
    fs.rmSync(path.join(B, 'code'), { recursive: true, force: true });
    codes().forEach((c, i) => copyDir(c, path.join(B, 'code', String(i))));
    fs.copyFileSync(path.join(r.dir, 'clip.mp4'), path.join(B, 'clip.mp4'));
    // S5-90: a round with no reviewers (after a lost or tied round) carries best's faults and adds the judge's notes
    if (!has(r.dir, 'faults.md') && r.pass !== 'sound') {
      const carried = [`# Faults carried into ${r.name}`, '', 'This round ran no reviewers (the round before it lost or tied), so these are best\'s faults before it plus the judge\'s notes on it.', '', judgeNotes(r, true), priorFaults.replace(/^# .*\n/, '## Before this round\n')].join('\n');
      fs.writeFileSync(path.join(r.dir, 'faults.md'), carried);
      const prevJson = has(B, 'faults.json') ? path.join(B, 'faults.json') : null;
      if (prevJson && !has(r.dir, 'faults.json')) fs.copyFileSync(prevJson, path.join(r.dir, 'faults.json'));
    } else if (has(r.dir, 'verdict.json') && has(r.dir, 'faults.md')) {
      fs.appendFileSync(path.join(r.dir, 'faults.md'), '\n' + judgeNotes(r, true));
    }
    for (const f of ['faults.md', 'faults.json', 'verdict.json', 'audible.md']) if (has(r.dir, f)) fs.copyFileSync(path.join(r.dir, f), path.join(B, f));
    if (has(r.dir, 'looks', 'scores.json')) fs.copyFileSync(path.join(r.dir, 'looks', 'scores.json'), path.join(B, 'scores.json'));
    fs.writeFileSync(path.join(B, 'from.txt'), `${r.name} ${new Date().toISOString()}\n`);
    fs.writeFileSync(path.join(r.dir, 'kept'), '');
    console.log(`best = ${r.name} (snapshot of ${codes().length} folder${codes().length > 1 ? 's' : ''} in ${rel(path.join(B, 'code'))})`); break;
  }
  case 'revert': {
    check('revert');
    const r = current(), B = path.join(D, 'best');
    codes().forEach((c, i) => {
      const snap = fs.existsSync(path.join(B, 'code', String(i))) ? path.join(B, 'code', String(i)) : i === 0 ? path.join(B, 'code') : null;
      if (!snap) refuse(`best has no snapshot of ${c}: keep a round after adding it with init`);
      copyDir(snap, c);
    });
    if (r && !done(r)) {
      // S5-90: the judge's notes on the lost round go to best/faults.md and to the round's own faults.md
      const notes = judgeNotes(r, false);
      if (notes) {
        if (!has(r.dir, 'faults.md')) fs.writeFileSync(path.join(r.dir, 'faults.md'), `# ${r.name}: lost or tied, reverted\n\n${notes}\n`);
        fs.appendFileSync(path.join(B, 'faults.md'), '\n' + notes);
      }
      fs.writeFileSync(path.join(r.dir, 'reverted'), '');
    }
    console.log(`reverted ${codes().join(', ')} to best (${fs.readFileSync(path.join(B, 'from.txt'), 'utf8').trim()})`); break;
  }
  case 'log': if (!rest[0]) refuse('log needs a phase'); log(rest[0], rest.slice(1).join(' ')); break;
  default: console.error(`unknown command ${cmd}`); process.exit(2);
}
