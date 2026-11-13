#!/usr/bin/env node
// lock.mjs: freeze what an earlier stage made, so later stages build on one fixed world (rules S5-71, S5-73).
// The cliff film (13 Nov 2026): three builders changed shared place files under each other, so an A/B round judged
// two worlds at once, and a person's size changed across a join made by two builders. The world stage locks the
// places; the shots stage locks every camera, the cast's scale and the join cards. step.mjs checks the locks before
// every round, render and keep.
//
//   node lock.mjs <out/slug> set <stage> <file|dir>... [--note "..."]   hash the files (dirs: every file in them) into
//                                                                        out/<slug>/locks.json under <stage>
//   node lock.mjs <out/slug> check                                      exit 1 naming each locked file that changed
//   node lock.mjs <out/slug> list                                       what is locked, by stage
//   node lock.mjs <out/slug> reopen <stage> --why "..."                 the lead only: drop a stage's lock, logged in
//                                                                        out/<slug>/locks-log.md; lock it again after
// Paths are stored relative to the project root (the folder lock.mjs is run from).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP = new Set(['node_modules', '.git', '.DS_Store']);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
const filesOf = (p) => {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const q = path.join(p, e.name);
    if (e.isDirectory()) out.push(...filesOf(q)); else out.push(q);
  }
  return out.sort();
};

/** the locks.json that covers a loop folder: the folder itself or up to three folders above it, else null */
export function findLocks(dir) {
  let d = path.resolve(dir);
  for (let i = 0; i < 4; i++) {
    const f = path.join(d, 'locks.json');
    if (fs.existsSync(f)) return f;
    d = path.dirname(d);
  }
  return null;
}

/** every locked file that changed or is gone: [{ stage, file, why }] */
export function lockFaults(locksFile) {
  if (!locksFile || !fs.existsSync(locksFile)) return [];
  const L = JSON.parse(fs.readFileSync(locksFile, 'utf8')), root = L.root ?? process.cwd(), out = [];
  for (const [stage, s] of Object.entries(L.stages ?? {})) {
    for (const [rel, h] of Object.entries(s.files ?? {})) {
      const p = path.join(root, rel);
      if (!fs.existsSync(p)) out.push({ stage, file: rel, why: 'gone' });
      else if (sha(p) !== h) out.push({ stage, file: rel, why: 'changed' });
    }
    // a file added inside a locked folder changes that folder too
    for (const dir of s.dirs ?? []) for (const p of filesOf(path.join(root, dir))) {
      const rel = path.relative(root, p);
      if (!(rel in (s.files ?? {}))) out.push({ stage, file: rel, why: 'added' });
    }
  }
  return out;
}

/** the stages that are locked */
export const lockedStages = (locksFile) => (locksFile && fs.existsSync(locksFile) ? Object.keys(JSON.parse(fs.readFileSync(locksFile, 'utf8')).stages ?? {}) : []);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [outArg, cmd, ...rest] = process.argv.slice(2);
  const usage = () => { console.error('usage: node lock.mjs <out/slug> set <stage> <file|dir>... [--note t] | check | list | reopen <stage> --why "..."'); process.exit(2); };
  if (!outArg || !cmd) usage();
  const out = path.resolve(outArg), file = path.join(out, 'locks.json');
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const L = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { root: process.cwd(), stages: {} };
  const save = () => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(file, JSON.stringify(L, null, 1) + '\n'); };
  const logLine = (t) => { const lf = path.join(out, 'locks-log.md'); if (!fs.existsSync(lf)) fs.writeFileSync(lf, '# Locks\n\nEvery lock set or reopened, newest last.\n\n'); fs.appendFileSync(lf, `- ${new Date().toISOString().slice(0, 16)} ${t}\n`); };
  if (cmd === 'set') {
    const stage = rest[0];
    const paths = rest.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--note');
    if (!stage || !paths.length) usage();
    if (L.root && path.resolve(L.root) !== process.cwd()) { console.error(`refused: locks.json was made from ${L.root}; run lock.mjs from there`); process.exit(1); }
    const files = {}, dirs = [];
    for (const p of paths) {
      if (!fs.existsSync(p)) { console.error(`refused: ${p} does not exist`); process.exit(1); }
      if (fs.statSync(p).isDirectory()) dirs.push(path.relative(process.cwd(), path.resolve(p)));
      for (const f of filesOf(path.resolve(p))) files[path.relative(process.cwd(), f)] = sha(f);
    }
    L.root = process.cwd(); L.stages ??= {};
    L.stages[stage] = { at: new Date().toISOString(), note: opt('--note') ?? '', files, dirs };
    save(); logLine(`set ${stage}: ${Object.keys(files).length} files (${paths.join(', ')})${opt('--note') ? ` - ${opt('--note')}` : ''}`);
    console.log(`locked ${stage}: ${Object.keys(files).length} files -> ${path.relative(process.cwd(), file)}`);
  } else if (cmd === 'check') {
    const f = lockFaults(file);
    if (!f.length) { console.log(`locks ok: ${lockedStages(file).join(', ') || 'nothing locked'}`); process.exit(0); }
    for (const x of f) console.log(`LOCKED ${x.stage}: ${x.file} ${x.why}`);
    console.log('Put the file back (git checkout <file>), or ask the lead to reopen that stage (lock.mjs reopen).');
    process.exit(1);
  } else if (cmd === 'list') {
    for (const [s, v] of Object.entries(L.stages ?? {})) console.log(`${s}: ${Object.keys(v.files).length} files, ${v.at}${v.note ? ` (${v.note})` : ''}`);
  } else if (cmd === 'reopen') {
    const stage = rest[0], why = opt('--why');
    if (!stage || !why) { console.error('refused: reopen needs a stage and --why "<what change and who asked>"'); process.exit(1); }
    if (!L.stages?.[stage]) { console.error(`refused: ${stage} is not locked`); process.exit(1); }
    delete L.stages[stage]; save(); logLine(`reopened ${stage}: ${why}`);
    console.log(`${stage} reopened. Change it, run its loop, then lock it again: node lock.mjs ${outArg} set ${stage} ...`);
  } else usage();
}
