#!/usr/bin/env node
// step.mjs: the file check between the steps of a scene's loop. It reads the scene's loop folder and prints the next
// step, and refuses (exit 1, naming the missing file) to start a step whose input is missing.
//
//   node step.mjs <scene-dir>                     where the scene stands and the next step (the command to run)
//   node step.mjs <scene-dir> init --code <dir> [--code <dir2>] [--passes people,motion] [--ref <clip.mp4>]
//                 [--ref-frame <image>] [--night] [--no-colour] [--needs story,direction,look] [--approvals <approvals.json>]
//                                                 write scene.json: the source folders keep snapshots and revert restores,
//                                                 the passes this loop runs, the reference clip (S5-76, S5-112), the
//                                                 reference frame (S2-37; default <scene-dir>/ref-frame.jpg), whether
//                                                 the scene is night (bar-check --night), and the owner's approvals a
//                                                 round needs (default story, direction, look). A scene of the scene
//                                                 stage: --passes people,motion (the default). The world stage: a loop
//                                                 folder out/<slug>/world with --code <places dir> --passes world. The
//                                                 first scene (S5-108), before the owner's Look yes: --needs story,direction.
//                                                 The shots stage: out/<slug>/shots, --passes shots.
//   node step.mjs <scene-dir> check <step>        exit 1 if <step>'s input is missing: build | render | look | judge |
//                                                 keep | revert | round
//   node step.mjs <scene-dir> round <pass> [--override-approval "<why>"]
//                                                 make the next round folder of <pass> (one of scene.json's passes).
//                                                 Refused while an approval the round needs is missing from the film's
//                                                 approvals.json (S2-23, S0-14); the override is written to log.md and to
//                                                 the round's approval-override.md
//   node step.mjs <scene-dir> bar [--dry-run]     run python3 -I <toon-video>/scripts/bar-check.py <clip> --gate
//                                                 [--night] on the round's clip; writes bar.json and bar.txt. Exit 1 of
//                                                 bar-check is a failed round (S3-173, S3-205, S3-220). On a people or
//                                                 motion round it also runs the story's tools/acting-audit.mjs <scene>
//                                                 --gate when the story has it (S3-134; acting.txt): its fault lines go
//                                                 into bar.json as "acting: ..." and fail the round the same way; a story
//                                                 without the tool is gated by bar-check alone (one line on stderr)
//   node step.mjs <scene-dir> keep                the current round's code and clip become best/ (faults.md carried
//                                                 from best and the judge when the round had no reviewers: S5-90).
//                                                 Refused without a review by someone who did not build it (X-31) and
//                                                 on a round that failed the bar gate
//   node step.mjs <scene-dir> revert              copy best/code back over every source folder; the judge's credit and
//                                                 blame go into best/faults.md and the round's faults.md (S5-90)
// keep and revert add one line per round to log.md: the verdict, the reviewers' and judges' calls, tokens and seconds
// (from looks/usage.jsonl and judges-usage.jsonl), the bar gate, and any approval override.
// Locks (S5-120, S5-121): when out/<slug>/locks.json exists, round, render and keep refuse while a locked file differs
// from its lock (lock.mjs). A builder who needs a place, camera or scale change asks the lead, who reopens that stage.
//   node step.mjs <scene-dir> log <phase> [note]  close the open phase in log.md (start time and minutes), open <phase>;
//                                                 `log end` closes it. One line per phase.
//
// The scene's loop folder, out/<slug>/scenes/<scene>/:
//   scene.json         {"code": [...], "passes": [...], "ref": "<clip>", "refFrame": "<image>", "night": false,
//                       "needs": ["story", "direction", "look"]}                                         (init)
//   ref-frame.jpg      the scene's reference frame (S2-37), found here when scene.json names none
//   meaning.md         what the scene must say: beats, words and times   (optional; passed to look.sh and abjudge.sh)
//   protect.md         one or two beats that must not get worse (X-20): "- 2.4-3.1 | what must read"
//   hits.json          hits, landings and strikes in clip seconds ([1.2] or cues.json's shape): every-frame strips
//   poses.jpg          the pose sheet: every pose and prop the words need (the rig check; no pose sheet, no build)
//   log.md             one line per phase and one per closed round
//   <pass>-r<n>/       one round. pass: world, shots, people, motion, sound; <first pass>-r0 is the first build
//     changes.md       the builder's changes, at most five; each fix it claims is checked by the reviewers (X-31)
//     stills.jpg       the stills sheet of the changed seconds            (no stills sheet, no render)
//     clip.mp4         the render
//     jumps.md         jumps.sh: one-frame jumps                          audible.md: audible.py (sound pass)
//     bar.json         step.mjs bar: the bar gate                         (no bar.json, no look)
//     acting.txt       step.mjs bar: the acting audit's printout (people and motion rounds of a story that has it)
//     looks/           look.sh: the three reviewers' replies and usage   faults.md: their faults, ranked
//     verdict.json     abjudge.sh against best/clip.mp4                   (no verdict.json, no next round)
//     kept | reverted  written by keep and revert
//   best/              code/<n>/ (a snapshot of each source folder), clip.mp4, faults.md, verdict.json, from.txt
//                      (no best snapshot, no revert)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { findLocks, lockFaults } from './lock.mjs';

const ALL = ['world', 'shots', 'people', 'motion', 'sound'];
const AREA = { world: ['world', 'light'], shots: ['story'], people: ['people'], motion: ['motion'], sound: ['sound'] };
// the scene stage's passes (S5-75): places, cameras and scale are locked by then, and the one mix is checked once at
// the join (S5-83). An older scene.json with no "passes" keeps this default too.
const DEFAULT_PASSES = ['people', 'motion'];
// the one stop rule (loop README, "When a pass stops"): 4 on the 1 to 5 scale and likeness 7 against the reference
// frame, or two rounds in a row with no win, or six rounds (S5-110, S5-108)
const MAX_ROUNDS = 6, TARGET = 4, LIKENESS = 7;
// the owner's approvals a round needs (S2-23, S5-105): the first scene's loop drops "look" with --needs
const DEFAULT_NEEDS = ['story', 'direction', 'look'];

const argv = process.argv.slice(2);
const [dirArg, cmd = 'next', ...rest] = argv;
if (!dirArg) { console.error('usage: node step.mjs <scene-dir> [next|init|check|round|bar|keep|revert|log] ...'); process.exit(2); }
const D = path.resolve(dirArg);
const here = path.dirname(new URL(import.meta.url).pathname);
const rel = (p) => { const r = path.relative(process.cwd(), p) || '.'; return r.startsWith('..') ? p : r; };
const has = (...p) => fs.existsSync(path.join(...p));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const readLines = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()) : []);
const refuse = (msg) => { console.error(`refused: ${msg}`); process.exit(1); };
const need = (file, why) => { if (!fs.existsSync(file)) refuse(`${rel(file)} is missing (${why})`); };
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const scene = () => readJson(path.join(D, 'scene.json'));
const codes = () => { const c = scene()?.code; return c == null ? [] : Array.isArray(c) ? c : [c]; };
const PASSES = (() => { const p = scene()?.passes; return Array.isArray(p) && p.length ? p.filter((x) => ALL.includes(x)) : DEFAULT_PASSES; })();
const FIRST = PASSES[0];
const ref = () => { const r = scene()?.ref; return r && fs.existsSync(r) ? r : null; };
const refFrame = () => {
  const r = scene()?.refFrame;
  if (r && fs.existsSync(r)) return r;
  return ['jpg', 'jpeg', 'png'].map((e) => path.join(D, `ref-frame.${e}`)).find((p) => fs.existsSync(p)) ?? null;
};
const needs = () => (Array.isArray(scene()?.needs) ? scene().needs : DEFAULT_NEEDS);
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
const reviewed = (r) => has(r.dir, 'looks', 'scores.json');   // look.sh ran on this round's clip
const bar = (r) => readJson(path.join(r.dir, 'bar.json'));

// ---- approvals (S2-23, S0-14): the film's approvals.json, a copy of the review page's store -------------------------
// The loop folder is out/<slug>/...; the file is <project>/src/stories/<slug>/approvals.json unless scene.json names one.
function approvalsFile() {
  if (scene()?.approvals) return path.resolve(scene().approvals);
  let d = D;
  for (let i = 0; i < 6; i++) {
    const up = path.dirname(d);
    if (path.basename(up) === 'out') return path.join(path.dirname(up), 'src', 'stories', path.basename(d), 'approvals.json');
    if (up === d) break;
    d = up;
  }
  return null;
}
// the same reading as toon-world's gate.mjs approvalOf: an array, {entries: [...]}, or an object keyed by stage; a row
// counts when the review page wrote it: approved true, source "page", at and by set
function approvalOf(file, stage) {
  if (!file || !fs.existsSync(file)) return { ok: false, why: `no approvals file${file ? ` (${rel(file)})` : ' (the loop folder is not under out/<slug>/; pass init --approvals)'}` };
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { ok: false, why: `${rel(file)} is not JSON: ${e.message}` }; }
  const list = Array.isArray(j) ? j : Array.isArray(j?.entries) ? j.entries : Object.values(j ?? {});
  const e = list.filter((x) => x && x.stage === stage).pop();
  if (!e) return { ok: false, why: `no "${stage}" row` };
  const miss = [e.approved !== true && 'approved: true', e.source !== 'page' && 'source: "page"', !e.at && 'at', !e.by && 'by'].filter(Boolean);
  return miss.length ? { ok: false, why: `the "${stage}" row lacks ${miss.join(', ')}` } : { ok: true };
}
function missingApprovals() {
  const f = approvalsFile();
  return needs().map((s) => ({ stage: s, ...approvalOf(f, s) })).filter((a) => !a.ok);
}

// ---- usage of the review calls (claude -p --output-format json, _usage.py) ------------------------------------------
function usageOf(r) {
  const sum = (file) => {
    const rows = readLines(file).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return { calls: rows.length, tokens: rows.reduce((a, x) => a + (x.tokens ?? 0), 0), seconds: Math.round(rows.reduce((a, x) => a + (x.seconds ?? 0), 0)), unknown: rows.filter((x) => x.tokens == null).length };
  };
  return { reviewers: sum(path.join(r.dir, 'looks', 'usage.jsonl')), judges: sum(path.join(r.dir, 'judges-usage.jsonl')) };
}
const kTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}K`);
const usageText = (u, who) => (u.calls ? `${who} ${u.calls} call${u.calls > 1 ? 's' : ''}, ${kTok(u.tokens)} tokens, ${u.seconds} s${u.unknown ? ` (${u.unknown} uncounted)` : ''}` : `${who} none`);

// one line per closed round in log.md
function roundLog(r, what) {
  const lf = path.join(D, 'log.md');
  if (!fs.existsSync(lf)) fs.writeFileSync(lf, `# ${path.basename(D)} log\n\nOne line per phase: start, minutes, what. One line per closed round.\n\n`);
  const u = usageOf(r), v = verdict(r), b = bar(r);
  const ov = has(r.dir, 'approval-override.md') ? ` | approval override: ${fs.readFileSync(path.join(r.dir, 'approval-override.md'), 'utf8').split('\n').find((l) => l.startsWith('why:'))?.slice(4).trim() ?? 'see approval-override.md'}` : '';
  const lk = v?.mean?.new?.likeness ?? readJson(path.join(r.dir, 'looks', 'scores.json'))?.likeness?.mean;
  const line = `- ${hm(new Date())} | round ${r.name} | ${what}${v ? ` (${v.winner}, new ${v.mean.new.mean} vs best ${v.mean.best.mean})` : ''}${lk != null ? ` | likeness new ${lk}` : ''} | ${usageText(u.reviewers, 'reviewers')} | ${usageText(u.judges, 'judges')} | bar ${b?.status ?? 'not run'}${ov}\n`;
  fs.appendFileSync(lf, line);
  console.log(line.trim());
}

// ---- scores and the stop rule ---------------------------------------------------------------------------------------
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
// best's likeness to the reference frame: the last judging that gave one, else the reviewers' mean on best
function bestLikeness() {
  for (const r of rounds().reverse()) {
    const v = verdict(r);
    if (!v?.mean || !done(r)) continue;
    const l = v.mean[has(r.dir, 'kept') ? 'new' : 'best']?.likeness;
    if (l != null) return l;
  }
  return readJson(path.join(D, 'best', 'scores.json'))?.likeness?.mean ?? null;
}
// how best stands against the reference clip in the last judging that saw it: beats, ties, below, or null (S5-112)
function refStatus() {
  for (const r of rounds().reverse()) {
    const v = verdict(r);
    if (v?.ref && done(r)) return v.ref[has(r.dir, 'kept') ? 'new' : 'best']?.status ?? null;
  }
  return null;
}
const audibleClean = (r) => { const t = fs.existsSync(path.join(r.dir, 'audible.md')) ? fs.readFileSync(path.join(r.dir, 'audible.md'), 'utf8') : null; return t !== null && !/\|\s*(masked|just)\s*\|/.test(t); };

// why a pass stops, or null. The one stop rule (loop README) holds whatever a brief says (S5-111): the pass's area at 4
// and likeness 7 against the reference frame, two rounds in a row with no win, or six rounds. With a reference clip,
// the target stop also needs best to beat or tie it (S5-112).
function passStop(pass) {
  const rs = rounds().filter((r) => r.pass === pass && r.n >= 1 && done(r));
  if (rs.length >= MAX_ROUNDS) return `${MAX_ROUNDS} rounds`;
  const last2 = rs.slice(-2);
  if (pass !== 'sound' && last2.length === 2 && last2.every((r) => verdict(r)?.winner !== 'win')) return 'two rounds in a row with no win';
  if (pass === 'sound') { const last = rs.at(-1); if (last && audibleClean(last)) return 'every effect heard'; return null; }
  const s = bestScore(pass);
  if (s === null || s < TARGET) return null;
  if (ref() && refStatus() === 'below') return null;
  const lk = bestLikeness();
  if (refFrame()) {
    if (lk === null || lk < LIKENESS) return null;
  }
  return `${AREA[pass].join(' and ')} at ${s} (target ${TARGET})` +
    (refFrame() ? `, likeness ${lk} (target ${LIKENESS})` : ', NO reference frame: likeness not measured (S2-37)') +
    (ref() ? `, ${refStatus() ?? 'not yet judged against'} the reference clip` : '');
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

// locks: a locked file that changed is refused before a round, a render or a keep (S5-120, S5-121)
function checkLocks() {
  const lf = findLocks(D);
  const bad = lockFaults(lf);
  if (bad.length) refuse(`locked files changed (${rel(lf)}):\n  ${bad.slice(0, 12).map((b) => `${b.stage}: ${b.file} ${b.why}`).join('\n  ')}\nPut them back (git checkout <file>) or ask the lead to reopen that stage (node ${rel(path.join(here, 'lock.mjs'))} ${rel(path.dirname(lf))} reopen <stage> --why "...")`);
}

// the judge's credit and blame of a round as markdown (S5-90)
function judgeNotes(r, kept) {
  const v = verdict(r);
  const L = [];
  const b = bar(r);
  if (b?.status === 'fail') L.push(`## The bar gate failed on ${r.name} (bar-check.py --gate${b.acting?.status === 'fail' ? ' and the acting audit, S3-134' : ''})`, '', ...b.lines.map((l) => `- ${l}`), '');
  if (!v?.judges?.length) return L.join('\n');
  const credit = v.judges.flatMap((j) => j.new?.credit ?? []), blame = v.judges.flatMap((j) => j.new?.blame ?? []);
  const other = v.judges.flatMap((j) => j.best?.credit ?? []);
  L.push(`## The judge on ${r.name} (${v.winner}, ${kept ? 'kept' : 'reverted'}; new ${v.mean.new.mean} vs best ${v.mean.best.mean}${v.mean.new.likeness != null ? `; likeness new ${v.mean.new.likeness} vs best ${v.mean.best.likeness}` : ''})`, '');
  if (v.lost_on) L.push(`Lost on a protected beat: ${v.lost_on}`, '');
  if (credit.length) L.push(kept ? 'Credited in this round (keep it):' : 'Credited in the lost round (carry it over):', ...credit.map((c) => `- ${c}`), '');
  if (blame.length) L.push(kept ? 'Blamed in this round (fix next):' : 'Blamed in the lost round (do not repeat):', ...blame.map((c) => `- ${c}`), '');
  if (!kept && other.length) L.push('Credited in best over it (keep):', ...other.map((c) => `- ${c}`), '');
  const rowsNew = Object.keys(v.mean.new.rows_failed ?? {});
  if (rowsNew.length) L.push(`World rows the judge failed in new: ${rowsNew.join(', ')}`, '');
  const unnamed = v.judges.flatMap((j) => j.new?.unnamed ?? []);
  if (unnamed.length) L.push('The judge could not name (fix so a first-time viewer can):', ...unnamed.map((c) => `- ${c}`), '');
  if (v.ref) L.push(`Against the reference clip: best ${v.ref.best?.status ?? '?'} (${v.ref.best?.diff ?? '?'}), new ${v.ref.new?.status ?? '?'} (${v.ref.new?.diff ?? '?'}). What the reference does better: ${(v.ref.notes ?? []).join('; ') || 'see verdict.json'}`, '');
  return L.join('\n');
}

// ---- the bar gate (bar-check.py --gate; exit 0 pass, 1 fail with one line per failed measure on stdout) -------------
function barScript() { return process.env.TOON_BAR_CHECK || path.resolve(here, '..', 'bar-check.py'); }
function barPython() {
  const cands = [process.env.PYTHON, 'python3', 'python3.12', 'python3.11', '/opt/homebrew/bin/python3.12', '/usr/local/bin/python3'].filter(Boolean);
  for (const p of cands) { const t = spawnSync(p, ['-c', 'import numpy'], { stdio: 'ignore' }); if (t.status === 0) return p; }
  return 'python3';
}
function runBar(dry) {
  const r = current();
  if (!r) refuse('no round');
  need(path.join(r.dir, 'clip.mp4'), 'no render, no bar check');
  const script = barScript();
  if (!fs.existsSync(script)) refuse(`bar-check.py not found at ${script} (set TOON_BAR_CHECK)`);
  const night = scene()?.night === true;
  const gate = fs.readFileSync(script, 'utf8').includes('--gate');
  const py = barPython();
  const args = ['-I', script, path.join(r.dir, 'clip.mp4'), ...(gate ? ['--gate'] : []), ...(gate && night ? ['--night'] : []), ...(gate && scene()?.noColour === true ? ['--no-colour'] : [])];
  if (dry) { console.log(`dry-run: ${py} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}   -> ${rel(path.join(r.dir, 'bar.json'))}`); runActing(r, true); return; }
  const p = spawnSync(py, args, { encoding: 'utf8' });
  const out = (p.stdout ?? '') + (p.stderr ? `\n[stderr]\n${p.stderr}` : '');
  fs.writeFileSync(path.join(r.dir, 'bar.txt'), out);
  let status, lines = [];
  if (!gate) {
    status = 'unsupported';
    console.warn(`warning: ${rel(script)} has no --gate flag (an older bar-check); this round is not gated. Its printout is in ${rel(path.join(r.dir, 'bar.txt'))}`);
  } else if (p.status === 0) status = 'pass';
  else if (p.status === 1 && !/Traceback/.test(p.stderr ?? '')) { status = 'fail'; lines = (p.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean); }
  else if (p.status === 2 && /unrecognized arguments|--gate/.test(p.stderr ?? '')) {
    status = 'unsupported';
    console.warn(`warning: bar-check refused --gate (an older version); this round is not gated. See ${rel(path.join(r.dir, 'bar.txt'))}`);
  } else refuse(`bar-check did not run (exit ${p.status}${p.error ? `, ${p.error.message}` : ''}); see ${rel(path.join(r.dir, 'bar.txt'))}. It needs ffmpeg and a python with numpy (set PYTHON).`);
  // the acting audit (S3-134): fails the round the same way, its fault lines kept with bar-check's
  const acting = runActing(r);
  if (acting?.status === 'fail') { status = 'fail'; lines.push(...acting.lines.map((l) => `acting: ${l}`)); }
  fs.writeFileSync(path.join(r.dir, 'bar.json'), JSON.stringify({ status, night, exit: p.status, lines, cmd: [py, ...args].join(' '), at: new Date().toISOString(), acting }, null, 1) + '\n');
  console.log(`bar: ${status}${night ? ' (night)' : ''}${acting ? `; acting audit ${acting.status}` : ''}${lines.length ? `\n  ${lines.join('\n  ')}` : ''}`);
  if (status === 'fail') process.exitCode = 1;   // a failed round (exit 1), so `step.mjs bar && look.sh` stops
}

// ---- the acting audit (S3-134; exit 0 pass, 1 fail with one fault line per stretch on stdout, 2 unreadable) ----------
// The story's own src/stories/<slug>/tools/acting-audit.mjs <scene> --gate, run from the project root, for a people or
// motion round of a scene loop folder out/<slug>/scenes/<scene>/. A story made before the audit has no such file: the
// round is gated by bar-check alone, with one line on stderr.
function actingTarget() {
  const scenes = path.dirname(D), slugDir = path.dirname(scenes), out = path.dirname(slugDir);
  if (path.basename(scenes) !== 'scenes' || path.basename(out) !== 'out') return { why: `${rel(D)} is not a scene loop folder (out/<slug>/scenes/<scene>/)` };
  const root = path.dirname(out), slug = path.basename(slugDir), scene = path.basename(D);
  return { root, scene, tool: path.join(root, 'src', 'stories', slug, 'tools', 'acting-audit.mjs') };
}
function runActing(r, dry = false) {
  if (r.pass !== 'people' && r.pass !== 'motion') return null;
  const t = actingTarget();
  if (!t.tool || !fs.existsSync(t.tool)) { console.error(`acting audit: skipped, ${t.tool ? `no ${rel(t.tool)} in this story (made before the audit)` : t.why}`); return null; }
  const args = [t.tool, t.scene, '--gate'], cmd = `(cd ${t.root} && node ${path.relative(t.root, t.tool)} ${t.scene} --gate)`;
  if (dry) { console.log(`dry-run: ${cmd}   -> ${rel(path.join(r.dir, 'acting.txt'))}`); return null; }
  const p = spawnSync(process.execPath, args, { cwd: t.root, encoding: 'utf8', timeout: 300e3 });
  fs.writeFileSync(path.join(r.dir, 'acting.txt'), (p.stdout ?? '') + (p.stderr ? `\n[stderr]\n${p.stderr}` : ''));
  if (p.status !== 0 && p.status !== 1) refuse(`the acting audit did not run (exit ${p.status}${p.error ? `, ${p.error.message}` : ''}); see ${rel(path.join(r.dir, 'acting.txt'))}. Fix the story's files or sync its toon-kit, then run bar again.`);
  const lines = p.status === 1 ? (p.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean) : [];
  return { status: p.status === 0 ? 'pass' : 'fail', exit: p.status, lines, cmd };
}

const L = here;
const S = (p) => rel(path.join(L, p));

function nextStep() {
  const lines = [];
  const say = (s) => lines.push(s);
  if (!scene()) return [`init: node ${S('step.mjs')} ${rel(D)} init --code <the source folder> [--passes people,motion] [--ref <reference clip>] [--ref-frame <reference frame>] [--night]`];
  if (needsPoses() && !has(D, 'poses.jpg')) return [`rig check: draw every pose and prop the scene's words need, one still at full size, saved as ${rel(path.join(D, 'poses.jpg'))}`];
  if (!refFrame()) say(`WARNING: no reference frame (S2-37): put the scene's frame at ${rel(path.join(D, 'ref-frame.jpg'))} or init --ref-frame <image>; without it no likeness is measured and the pass can stop on area scores alone`);
  const r = current();
  if (!r) {
    const miss = missingApprovals();
    if (miss.length) say(`approvals missing (${miss.map((m) => `${m.stage}: ${m.why}`).join('; ')}): the round will be refused until the owner clicks Approve, or run it with --override-approval "<why>"`);
    return [...lines, `start the first build: node ${S('step.mjs')} ${rel(D)} round ${FIRST}   (${FIRST}-r0, the first build)`];
  }
  const R = rel(r.dir), meaning = has(D, 'meaning.md') ? ` --meaning ${rel(path.join(D, 'meaning.md'))}` : '';
  const words = has(D, 'words.json') ? ` --words ${rel(path.join(D, 'words.json'))}` : ` (no words.json: node ${S('words.mjs')} <full.json> --scene <id> --plan <plan.ts> --out ${rel(path.join(D, 'words.json'))})`;
  const refArg = ref() ? ` --ref ${rel(ref())}` : '';
  const frameArg = refFrame() ? ` --ref-frame ${rel(refFrame())}` : '';
  const protectArg = has(D, 'protect.md') ? ` --protect ${rel(path.join(D, 'protect.md'))}` : '';
  const hitsFile = ['hits.json', 'cues.json'].map((f) => path.join(D, f)).find((f) => fs.existsSync(f));
  const hitsArg = hitsFile ? ` --hits ${rel(hitsFile)}` : '';
  const claimsArg = has(r.dir, 'changes.md') && !isBaseline(r) ? ` --claims ${R}/changes.md` : '';
  say(`round ${r.name}${ref() ? `   (reference clip: ${rel(ref())})` : ''}${refFrame() ? `   (reference frame: ${rel(refFrame())})` : ''}`);
  if (!has(r.dir, 'stills.jpg')) {
    const c = changesCount(r);
    if (c > 5) say(`warning: changes.md lists ${c} changes; a round makes at most five`);
    const from = has(D, 'best', 'faults.md') ? ` from ${rel(path.join(D, 'best', 'faults.md'))}` : '';
    say(`next: the same builder, resumed with SendMessage (X-4; never a fresh agent for a fix), builds at most five changes${from}; lists them in ${R}/changes.md; then the stills sheet ${R}/stills.jpg (look at it before any render)`);
    return lines;
  }
  if (!has(r.dir, 'clip.mp4')) return [...lines, `next: render to ${R}/clip.mp4 (take a render slot)`];
  if (!has(r.dir, 'jumps.md')) return [...lines, `next: ${S('jumps.sh')} ${R}/clip.mp4 ${R}`];
  if (r.pass === 'sound' && !has(r.dir, 'audible.md')) return [...lines, `next: python3 ${S('audible.py')} <mix.wav> <cues.json> --voice <voice.wav> --out ${R}/audible.md`];
  if (r.pass !== 'sound' && !has(r.dir, 'bar.json')) return [...lines, `next: node ${S('step.mjs')} ${rel(D)} bar   (bar-check --gate${scene()?.night ? ' --night' : ''} on the clip)`];
  const b = bar(r);
  if (b?.status === 'fail' && !done(r)) {
    say(`bar gate FAILED on ${r.name}:\n  ${b.lines.join('\n  ')}`);
    if (!isBaseline(r)) return [...lines, `next: node ${S('step.mjs')} ${rel(D)} revert   (a round that fails the bar gate is a failed round; no reviewers or judge spent on it)`];
    say(`the first build fails the bar: it is still the first best; these lines go into its faults`);
  }
  const prev = rounds().filter((x) => x !== r && done(x)).at(-1);
  const skipLook = prev && (has(prev.dir, 'reverted') || verdict(prev)?.winner === 'tie');
  const lookCmd = `${S('look.sh')} ${R}/clip.mp4 ${R} --focus ${r.pass}${frameArg}${meaning}${has(D, 'best', 'faults.md') ? ` --prior ${rel(path.join(D, 'best', 'faults.md'))}` : ''}${claimsArg}${protectArg}${hitsArg}${words}`;
  if (!done(r) && !has(r.dir, 'faults.md') && !skipLook && r.pass !== 'sound') return [...lines, `next: ${lookCmd}`];
  if (!done(r) && !isBaseline(r) && r.pass !== 'sound' && !has(r.dir, 'verdict.json')) {
    if (skipLook && !reviewed(r)) say(`the last round lost or tied: the reviewers wait for the judge; they run only if this round is to be kept (X-31)`);
    return [...lines, `next: ${S('abjudge.sh')} ${rel(path.join(D, 'best', 'clip.mp4'))} ${R}/clip.mp4 ${R}${meaning}${frameArg}${refArg}${protectArg}${hitsArg}   (run with a 10-minute timeout)`];
  }
  if (isBaseline(r) && ref() && !has(r.dir, 'verdict.json') && !done(r)) {
    say(`the first build has a reference: judge it against the reference once, to start from its faults: ${S('abjudge.sh')} ${rel(ref())} ${R}/clip.mp4 ${R}${meaning}${frameArg} --any-length`);
  }
  if (!done(r)) {
    if (r.pass !== 'sound' && !reviewed(r) && (isBaseline(r) || verdict(r)?.keep === 'new')) {
      say(`X-31: ${r.name} has a build${has(r.dir, 'changes.md') ? ' (changes.md)' : ''} and no look: the builder's "done" is a claim until a reviewer who did not build it has seen it. A round is not kept without one.`);
      return [...lines, `next: ${lookCmd}`];
    }
    if (isBaseline(r)) return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep   (the first build is the first best)`];
    if (r.pass === 'sound') return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep   if ${R}/audible.md is no worse than best's, else revert`];
    const v = verdict(r);
    say(`verdict: ${v.winner} (new ${v.mean.new.mean} vs best ${v.mean.best.mean}), prefer ${v.prefer}${v.mean.new.likeness != null ? `; likeness new ${v.mean.new.likeness}, best ${v.mean.best.likeness}` : ''}${v.ref ? `; new ${v.ref.new?.status} the reference clip` : ''}${v.lost_on ? `; ${v.lost_on}` : ''}`);
    const pw = readJson(path.join(r.dir, 'looks', 'scores.json'))?.protect;
    const weak = pw ? Object.entries(pw).filter(([, x]) => x.weaker?.length).map(([k]) => k) : [];
    if (weak.length) say(`a reviewer saw protected beat ${weak.join(', ')} get weaker (X-20): check its strip before you keep`);
    if (v.keep === 'new') return [...lines, `next: node ${S('step.mjs')} ${rel(D)} keep`];
    return [...lines, `next: node ${S('step.mjs')} ${rel(D)} revert` + (v.winner === 'tie' ? '; the next round carries what the judge credited in new and drops what it blamed' : '')];
  }
  // the round is closed: same pass or the next one
  let pass = r.pass;
  for (;;) {
    const why = passStop(pass);
    if (!why) break;
    say(`pass ${pass} stops: ${why}`);
    if (ref() && refStatus() === 'below') say(`best is still below its reference clip: tell the lead (S5-112); the shots or the acting of the reference may need copying again`);
    if (refFrame() && (bestLikeness() ?? 0) < LIKENESS) say(`best is at likeness ${bestLikeness() ?? '-'}, under ${LIKENESS}: tell the lead (S5-108)`);
    const i = PASSES.indexOf(pass) + 1;
    if (i >= PASSES.length) { say(`done: best/clip.mp4 and best/code are the result`); return lines; }
    pass = PASSES[i];
  }
  const hint = restageHint(pass);
  if (hint) say(hint);
  if (has(r.dir, 'reverted') || verdict(r)?.winner === 'tie') say(`the last round lost or tied: the next round's reviewers wait for the judge; build from best/faults.md (it now holds the judge's credit and blame)`);
  say(`next: node ${S('step.mjs')} ${rel(D)} round ${pass}`);
  return lines;
}

let override = null;
function check(step) {
  const r = current();
  switch (step) {
    case 'build': case 'round': {
      need(path.join(D, 'scene.json'), `run init first`);
      if (needsPoses()) need(path.join(D, 'poses.jpg'), 'no pose sheet, no build');
      if (r && !done(r)) {
        if (!isBaseline(r) && r.pass !== 'sound') need(path.join(r.dir, 'verdict.json'), `no verdict.json, no next round`);
        if (r.pass === 'sound') need(path.join(r.dir, 'audible.md'), 'no audible.md, no next sound round');
        refuse(`${r.name} is not closed: run keep or revert first`);
      }
      const miss = missingApprovals();
      if (miss.length && !override) {
        refuse(`the owner's approval is missing for ${miss.map((m) => m.stage).join(', ')} (S2-23, S0-14):\n  ${miss.map((m) => `${m.stage}: ${m.why}`).join('\n  ')}\n` +
          `The owner clicks Approve on the review page; the lead copies the store to ${rel(approvalsFile() ?? 'src/stories/<slug>/approvals.json')} unchanged.\n` +
          `To go on anyway, the lead writes why: round <pass> --override-approval "<why>" (logged in log.md and the round's approval-override.md).`);
      }
      checkLocks();
      return miss;
    }
    case 'render': need(path.join(r?.dir ?? D, 'stills.jpg'), 'no stills sheet, no render'); checkLocks(); return;
    case 'look': need(path.join(r?.dir ?? D, 'clip.mp4'), 'no render, no look'); return;
    case 'judge':
      need(path.join(r?.dir ?? D, 'clip.mp4'), 'no render, no judge');
      need(path.join(D, 'best', 'clip.mp4'), 'no best clip to judge against');
      return;
    case 'keep': {
      if (!r) refuse('no round to keep');
      need(path.join(r.dir, 'clip.mp4'), 'no render, no keep');
      need(path.join(D, 'scene.json'), 'scene.json names the code to snapshot');
      for (const c of codes()) if (!fs.existsSync(c)) refuse(`the source folder ${c} is missing`);
      if (!isBaseline(r) && r.pass !== 'sound') {
        need(path.join(r.dir, 'verdict.json'), 'no verdict.json, no keep');
        if (verdict(r).keep !== 'new') refuse(`the verdict keeps best (${verdict(r).winner}${verdict(r).lost_on ? `: ${verdict(r).lost_on}` : ''}): revert instead`);
        if (bar(r)?.status === 'fail') refuse(`${r.name} failed the bar gate (bar.json): revert instead`);
      }
      if (r.pass !== 'sound' && !reviewed(r)) refuse(`${r.name} has a build and no look (X-31): a fix is a claim until a reviewer who did not build it has seen it. Run look.sh on ${rel(path.join(r.dir, 'clip.mp4'))} first`);
      if (r.pass === 'sound') need(path.join(r.dir, 'audible.md'), 'no audible.md, no keep');
      checkLocks();
      return;
    }
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
  if (!fs.existsSync(lf)) fs.writeFileSync(lf, `# ${path.basename(D)} log\n\nOne line per phase: start, minutes, what. One line per closed round.\n\n`);
  const open = readJson(pf), now = new Date();
  if (open) {
    const s = new Date(open.start), min = Math.round((now - s) / 6000) / 10;
    fs.appendFileSync(lf, `- ${hm(s)} | ${open.phase} | ${min} min | ${open.note || ''}\n`.replace(/ \| \n$/, '\n'));
    console.log(`logged ${open.phase}: ${min} min`);
    fs.rmSync(pf);
  }
  if (phase !== 'end') { fs.writeFileSync(pf, JSON.stringify({ phase, start: now.toISOString(), note })); console.log(`open: ${phase} from ${hm(now)}`); }
}

const all = (k) => rest.flatMap((a, i) => (rest[i - 1] === k ? [a] : []));
const flag = (k) => rest.includes(k);
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
    const f0 = all('--ref-frame')[0], framePath = f0 ? path.resolve(f0) : scene()?.refFrame;
    if (f0 && !fs.existsSync(framePath)) refuse(`the reference frame ${f0} does not exist`);
    const a0 = all('--approvals')[0];
    const nd = all('--needs')[0];
    fs.mkdirSync(D, { recursive: true });
    const sc = { ...(scene() ?? {}), code: code.length === 1 ? code[0] : code, passes };
    if (refPath) sc.ref = refPath;
    if (framePath) sc.refFrame = framePath;
    if (flag('--night')) sc.night = true;
    if (flag('--no-colour')) sc.noColour = true; // a scene with no colour by design (S3-250): say why in log.md
    if (flag('--day')) sc.night = false;
    if (nd !== undefined) sc.needs = nd.split(',').map((x) => x.trim()).filter(Boolean);
    if (a0) sc.approvals = path.resolve(a0);
    fs.writeFileSync(path.join(D, 'scene.json'), JSON.stringify(sc, null, 1) + '\n');
    console.log(`scene.json: code ${code.join(', ')}; passes ${passes.join(', ')}${refPath ? `; reference clip ${refPath}` : ''}; reference frame ${refFrame() ?? 'NONE (S2-37: put one at ref-frame.jpg)'}${sc.night ? '; night' : ''}; needs ${needs().join(', ') || 'no approvals'} from ${approvalsFile() ?? '?'}`);
    break;
  }
  case 'check': { const ov = all('--override-approval')[0]; if (ov) override = ov; check(rest[0]); console.log(`ok: ${rest[0]}`); break; }
  case 'round': {
    const pass = rest[0];
    if (!PASSES.includes(pass)) refuse(`round needs one of this loop's passes: ${PASSES.join(', ')} (scene.json "passes"; a locked stage's pass is not run here)`);
    const ov = all('--override-approval')[0];
    if (rest.includes('--override-approval') && !ov?.trim()) refuse('--override-approval needs a reason: --override-approval "<why>"');
    override = ov ?? null;
    const miss = check('round') ?? [];
    const r = current();
    if (!r && pass !== FIRST) refuse(`the first round is ${FIRST}-r0`);
    if (r && PASSES.indexOf(pass) < PASSES.indexOf(r.pass) && r.n > 0) refuse(`pass ${r.pass} is past ${pass}`);
    if (r && !has(D, 'best', 'clip.mp4')) refuse(`${rel(path.join(D, 'best', 'clip.mp4'))} is missing (keep a round first)`);
    const n = r ? Math.max(0, ...rounds().filter((x) => x.pass === pass).map((x) => x.n)) + 1 : 0;
    const dir = path.join(D, `${pass}-r${n}`);
    fs.mkdirSync(dir, { recursive: true });
    if (miss.length && override) {
      const now = new Date();
      fs.writeFileSync(path.join(dir, 'approval-override.md'), `# Approval override\n\nmissing: ${miss.map((m) => `${m.stage} (${m.why})`).join('; ')}\nwhy: ${override}\nat: ${now.toISOString()}\n`);
      const lf = path.join(D, 'log.md');
      if (!fs.existsSync(lf)) fs.writeFileSync(lf, `# ${path.basename(D)} log\n\nOne line per phase: start, minutes, what. One line per closed round.\n\n`);
      fs.appendFileSync(lf, `- ${hm(now)} | approval override | ${pass}-r${n} | missing: ${miss.map((m) => m.stage).join(', ')} | why: ${override}\n`);
      console.error(`warning: approval override for ${pass}-r${n} (missing ${miss.map((m) => m.stage).join(', ')}), logged`);
    }
    console.log(rel(dir)); break;
  }
  case 'bar': runBar(flag('--dry-run')); break;
  case 'keep': {
    check('keep');
    const r = current(), B = path.join(D, 'best');
    const priorFaults = has(B, 'faults.md') ? fs.readFileSync(path.join(B, 'faults.md'), 'utf8') : '';
    fs.rmSync(path.join(B, 'code'), { recursive: true, force: true });
    codes().forEach((c, i) => copyDir(c, path.join(B, 'code', String(i))));
    fs.copyFileSync(path.join(r.dir, 'clip.mp4'), path.join(B, 'clip.mp4'));
    // S5-90: a round with no reviewers' faults.md carries best's faults and adds the judge's notes
    if (!has(r.dir, 'faults.md') && r.pass !== 'sound') {
      const carried = [`# Faults carried into ${r.name}`, '', 'This round has no faults.md of its own, so these are best\'s faults before it plus the judge\'s notes on it.', '', judgeNotes(r, true), priorFaults.replace(/^# .*\n/, '## Before this round\n')].join('\n');
      fs.writeFileSync(path.join(r.dir, 'faults.md'), carried);
      const prevJson = has(B, 'faults.json') ? path.join(B, 'faults.json') : null;
      if (prevJson && !has(r.dir, 'faults.json')) fs.copyFileSync(prevJson, path.join(r.dir, 'faults.json'));
    } else if ((has(r.dir, 'verdict.json') || bar(r)?.status === 'fail') && has(r.dir, 'faults.md')) {
      fs.appendFileSync(path.join(r.dir, 'faults.md'), '\n' + judgeNotes(r, true));
    }
    for (const f of ['faults.md', 'faults.json', 'verdict.json', 'audible.md']) if (has(r.dir, f)) fs.copyFileSync(path.join(r.dir, f), path.join(B, f));
    if (has(r.dir, 'looks', 'scores.json')) fs.copyFileSync(path.join(r.dir, 'looks', 'scores.json'), path.join(B, 'scores.json'));
    fs.writeFileSync(path.join(B, 'from.txt'), `${r.name} ${new Date().toISOString()}\n`);
    fs.writeFileSync(path.join(r.dir, 'kept'), '');
    console.log(`best = ${r.name} (snapshot of ${codes().length} folder${codes().length > 1 ? 's' : ''} in ${rel(path.join(B, 'code'))})`);
    roundLog(r, 'kept');
    break;
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
      // S5-90: the judge's notes (and a failed bar gate) on the lost round go to best/faults.md and the round's faults.md
      const notes = judgeNotes(r, false);
      if (notes) {
        if (!has(r.dir, 'faults.md')) fs.writeFileSync(path.join(r.dir, 'faults.md'), `# ${r.name}: lost, tied or failed the bar gate; reverted\n\n${notes}\n`);
        fs.appendFileSync(path.join(B, 'faults.md'), '\n' + notes);
      }
      fs.writeFileSync(path.join(r.dir, 'reverted'), '');
      roundLog(r, bar(r)?.status === 'fail' ? 'reverted (bar gate failed)' : 'reverted');
    }
    console.log(`reverted ${codes().join(', ')} to best (${fs.readFileSync(path.join(B, 'from.txt'), 'utf8').trim()})`); break;
  }
  case 'log': if (!rest[0]) refuse('log needs a phase'); log(rest[0], rest.slice(1).join(' ')); break;
  default: console.error(`unknown command ${cmd}`); process.exit(2);
}
