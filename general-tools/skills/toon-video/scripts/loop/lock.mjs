#!/usr/bin/env node
// lock.mjs: freeze what an earlier step made, so later steps build on one fixed world (rules S5-120, S5-121, S5-105).
// The cliff film (13 Nov 2026): three builders changed shared place files under each other, so an A/B round judged
// two worlds at once, and a person's size changed across a join made by two builders. step.mjs checks the locks
// before every round, render and keep.
//
// The order (toon-video SKILL.md, "Stages 3 to 6", 18 Nov 2026):
//   look    stage 3, after the owner's Look yes: src/look/ and the story's stage.tsx. Refused unless
//           src/stories/<slug>/approvals.json has an approved "look" row newer than the last reopen of look (S5-105).
//   shots   stage 4b, place by place (--add): that place's scenes' shots.ts. Refused before look is locked.
//   world   stage 4d, place by place (--add): places/<place>.ts and its pictures. Refused before look is locked, and
//           while shots is empty: a place is filled and lit for cameras that are already locked (S3-185, S3-197).
//   At the end of stage 4 a plain set of world and of shots replaces the place-by-place lists with the whole film.
//   Other stage names are free. --out-of-order "<why>" lets an older film (begun before this order) set world or
//   shots out of turn; the reason is logged. It never skips the look row.
//
//   node lock.mjs <out/slug> set <stage> <file|dir>... [--add] [--note "..."] [--out-of-order "why"]
//                       hash the files (dirs: every file in them) into out/<slug>/locks.json under <stage>;
//                       without --add the stage's list is replaced, with --add the files join it
//   node lock.mjs <out/slug> check                         exit 1 naming each locked file that changed
//   node lock.mjs <out/slug> list                          what is locked, by stage
//   node lock.mjs <out/slug> reopen <stage> [<file|dir>...] --why "..."
//                       the lead only: drop the whole stage, or just the named files, from the lock; logged in
//                       out/<slug>/locks-log.md. Change them through their own step, then set <stage> --add them again
// Paths are stored relative to the project root (the folder lock.mjs is run from).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP = new Set(['node_modules', '.git', '.DS_Store']);
const under = (rel, p) => rel === p || rel.startsWith(p.endsWith('/') ? p : p + '/');
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
    // a file added inside a locked folder changes that folder too, unless the lead reopened it there
    const open = s.open ?? [];
    for (const dir of s.dirs ?? []) for (const p of filesOf(path.join(root, dir))) {
      const rel = path.relative(root, p);
      if (!(rel in (s.files ?? {})) && !open.some((o) => under(rel, o))) out.push({ stage, file: rel, why: 'added' });
    }
  }
  return out;
}

/** the stages that are locked */
export const lockedStages = (locksFile) => (locksFile && fs.existsSync(locksFile) ? Object.keys(JSON.parse(fs.readFileSync(locksFile, 'utf8')).stages ?? {}) : []);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [outArg, cmd, ...rest] = process.argv.slice(2);
  const usage = () => { console.error('usage: node lock.mjs <out/slug> set <stage> <file|dir>... [--add] [--note t] [--out-of-order why] | check | list | reopen <stage> [<file|dir>...] --why "..."'); process.exit(2); };
  if (!outArg || !cmd) usage();
  const out = path.resolve(outArg), file = path.join(out, 'locks.json');
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const VALUED = ['--note', '--why', '--out-of-order'];
  const positional = rest.filter((a, i, all) => !a.startsWith('--') && !VALUED.includes(all[i - 1]));
  const L = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { root: process.cwd(), stages: {} };
  const save = () => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(file, JSON.stringify(L, null, 1) + '\n'); };
  const logLine = (t) => { const lf = path.join(out, 'locks-log.md'); if (!fs.existsSync(lf)) fs.writeFileSync(lf, '# Locks\n\nEvery lock set or reopened, newest last.\n\n'); fs.appendFileSync(lf, `- ${new Date().toISOString().slice(0, 16)} ${t}\n`); };
  if (cmd === 'set') {
    const [stage, ...paths] = positional, add = rest.includes('--add'), late = opt('--out-of-order');
    if (!stage || !paths.length) usage();
    if (L.root && path.resolve(L.root) !== process.cwd()) { console.error(`refused: locks.json was made from ${L.root}; run lock.mjs from there`); process.exit(1); }
    const refuse = (t) => { console.error(`refused: ${t}`); process.exit(1); };
    const has = (s) => Object.keys(L.stages?.[s]?.files ?? {}).length > 0;
    // the order of stages 3 and 4 (toon-video SKILL.md, "Locks")
    if (stage === 'look') {
      const slug = path.basename(out), af = path.join('src', 'stories', slug, 'approvals.json');
      const A = fs.existsSync(af) ? JSON.parse(fs.readFileSync(af, 'utf8')) : {};
      const row = A.look, since = L.reopened?.look ? Date.parse(L.reopened.look) : 0;
      if (!row || row.approved !== true) refuse(`no approved "look" row in ${af}: the owner's Look yes on the review page comes first (S5-105). Pull the approvals; never write the row (S0-14).`);
      if (!(Number(row.at) > since)) refuse(`the "look" row in ${af} is older than the last reopen of look (${L.reopened.look}): the owner says yes to the changed look again (S5-105).`);
    }
    if ((stage === 'shots' || stage === 'world') && !late) {
      if (!has('look')) refuse(`${stage} before look: build the first scene and lock look after the owner's Look yes (S5-108, S5-105), or give --out-of-order "<why>" for a film begun before this order.`);
      if (stage === 'world' && !has('shots')) refuse('world while shots is empty: lock the place\'s cameras first, then fill and light for what they show (S3-185, S3-197).');
    }
    const files = add ? { ...(L.stages?.[stage]?.files ?? {}) } : {}, dirs = add ? [...(L.stages?.[stage]?.dirs ?? [])] : [];
    let n = 0;
    for (const p of paths) {
      if (!fs.existsSync(p)) refuse(`${p} does not exist`);
      const rel = path.relative(process.cwd(), path.resolve(p));
      if (fs.statSync(p).isDirectory() && !dirs.includes(rel)) dirs.push(rel);
      for (const f of filesOf(path.resolve(p))) { files[path.relative(process.cwd(), f)] = sha(f); n++; }
    }
    const open = add ? (L.stages?.[stage]?.open ?? []).filter((o) => !paths.some((p) => under(o, path.relative(process.cwd(), path.resolve(p))))) : [];
    L.root = process.cwd(); L.stages ??= {};
    L.stages[stage] = { at: new Date().toISOString(), note: opt('--note') ?? '', files, dirs, ...(open.length ? { open } : {}) };
    save(); logLine(`set ${stage}${add ? ' --add' : ''}: ${n} files (${paths.join(', ')})${opt('--note') ? ` - ${opt('--note')}` : ''}${late ? ` - out of order: ${late}` : ''}`);
    console.log(`locked ${stage}${add ? ` (+${n})` : ''}: ${Object.keys(files).length} files -> ${path.relative(process.cwd(), file)}`);
  } else if (cmd === 'check') {
    const f = lockFaults(file);
    if (!f.length) { console.log(`locks ok: ${lockedStages(file).join(', ') || 'nothing locked'}`); process.exit(0); }
    for (const x of f) console.log(`LOCKED ${x.stage}: ${x.file} ${x.why}`);
    console.log('Put the file back (git checkout <file>), or ask the lead to reopen that stage (lock.mjs reopen).');
    process.exit(1);
  } else if (cmd === 'list') {
    for (const [s, v] of Object.entries(L.stages ?? {})) console.log(`${s}: ${Object.keys(v.files).length} files, ${v.at}${v.note ? ` (${v.note})` : ''}`);
  } else if (cmd === 'reopen') {
    const [stage, ...paths] = positional, why = opt('--why');
    if (!stage || !why) { console.error('refused: reopen needs a stage and --why "<what change and who asked>"'); process.exit(1); }
    if (!L.stages?.[stage]) { console.error(`refused: ${stage} is not locked`); process.exit(1); }
    if (stage === 'look') { L.reopened ??= {}; L.reopened.look = new Date().toISOString(); }
    if (!paths.length) {
      delete L.stages[stage]; save(); logLine(`reopened ${stage}: ${why}`);
      console.log(`${stage} reopened. Change it, run its loop, then lock it again: node lock.mjs ${outArg} set ${stage} ...`);
    } else {
      const S = L.stages[stage], rels = paths.map((p) => path.relative(L.root ?? process.cwd(), path.resolve(p)));
      const drop = Object.keys(S.files).filter((f) => rels.some((r) => under(f, r)));
      if (!drop.length) { console.error(`refused: none of ${rels.join(', ')} is locked in ${stage}`); process.exit(1); }
      for (const f of drop) delete S.files[f];
      S.open = [...new Set([...(S.open ?? []), ...rels])];
      save(); logLine(`reopened ${stage} (${rels.join(', ')}; ${drop.length} files): ${why}`);
      console.log(`${drop.length} files reopened in ${stage}. Change them through their own step, then: node lock.mjs ${outArg} set ${stage} --add ${paths.join(' ')}`);
    }
  } else usage();
}
