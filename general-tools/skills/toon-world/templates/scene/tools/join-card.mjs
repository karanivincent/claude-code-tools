#!/usr/bin/env node
// __SLUG__: write the join card after a scene from that scene's own last frame: each person's place, expression and
// pose (the free-pose points and numbers), and the camera when the card has none (--camera takes the scene's own last
// camera even when it has one). The scene after then starts on it (joins.ts onCards and its first camera key), so the
// cut never pops a pose. Run it after any change to the end of a scene, then make a stills sheet across the cut.
// The card also keeps each person's card scale (sx, sy) and lean, so a size never jumps across a join.
//   node src/stories/__SLUG__/tools/join-card.mjs <scene> [--camera] [--cut] [--jump [--dip 8] [--why "..."]]
// --jump: a jump in time or place (the party to the night, a dream): a cut through black ("dip": frames each side)
// that holds nobody, since nobody stands where they stood (the cliff film cleared these cards by hand).
import fs from 'node:fs';
import path from 'node:path';
import { args, loadFilm, loadScene, SLUG } from './lib.mjs';

const { pos, o } = args();
const id = pos[0];
if (!id) { console.error('usage: join-card.mjs <scene> [--camera] [--cut]'); process.exit(1); }
const film = await loadFilm(), i = film.SCENES.findIndex((s) => s.id === id);
if (i < 0 || i === film.SCENES.length - 1) { console.error(`"${id}" is not a scene with one after it (plan.ts: ${film.SCENES.map((s) => s.id).join(', ')})`); process.exit(1); }
const next = film.SCENES[i + 1].id, file = path.resolve('stories', SLUG, 'joins.json');
const orig = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{"joins":[]}';
const J = JSON.parse(orig);
let card = J.joins.find((j) => j.after === id && j.before === next);
if (!card) { card = { after: id, before: next, people: {} }; J.joins.push(card); }
// the scene's own last frame: load it with this card's people taken off (so it is not read back from the card)
const own = { ...card, people: {} }; if (o.camera) delete own.camera;
let S;
try {
  fs.writeFileSync(file, JSON.stringify({ ...J, joins: J.joins.map((j) => (j === card ? own : j)) }, null, 2));
  S = await loadScene(id);
} finally { fs.writeFileSync(file, orig); }
const f = S.FRAMES - 1, r = (v) => Math.round(v * 1000) / 1000, rp = (p) => [Math.round(p[0]), Math.round(p[1])];
if (!card.camera || o.camera) { const c = S.camAt(f); card.camera = { pos: c.pos.map(r), look: c.look.map(r), fov: r(c.fov), roll: r(c.roll) }; }
if (o.cut || o.jump) card.cut = true;
if (o.why) card.why = String(o.why);
card.people = {};
if (o.jump) {
  card.dip = Number(o.dip ?? 8);
  J.joins.sort((a, b) => film.SCENES.findIndex((s) => s.id === a.before) - film.SCENES.findIndex((s) => s.id === b.before));
  fs.writeFileSync(file, JSON.stringify(J, null, 2) + '\n');
  console.log(`join ${id}|${next}: a jump (a cut through black over ${card.dip} frames each side), holding nobody -> ${path.relative(process.cwd(), file)}`);
  process.exit(0);
}
for (const p of S.people(f)) {
  if (p.hidden) continue;
  const q = p.opts, pose = {};
  for (const k of ['mode', 'drop', 'lookY', 'tilt', 'headTilt', 'hairSwing', 'capLift']) if (q[k] !== undefined) pose[k] = typeof q[k] === 'number' ? r(q[k]) : q[k];
  if (q.legsAt) pose.legsAt = q.legsAt.map((l) => l.map(rp));
  if (q.armsAt) pose.armsAt = q.armsAt.map((a) => [rp(a[0]), rp(a[1]), !!a[2]]);
  if (q.hand) pose.hand = rp(q.hand); if (q.handL) pose.handL = rp(q.handL);
  card.people[p.who] = { at: p.at.map(r), expr: q.expr, pose, ...(p.sx !== undefined && p.sx !== 1 ? { sx: r(p.sx) } : {}), ...(p.sy !== undefined && p.sy !== 1 ? { sy: r(p.sy) } : {}), ...(p.lean ? { lean: r(p.lean) } : {}) };
}
J.joins.sort((a, b) => film.SCENES.findIndex((s) => s.id === a.before) - film.SCENES.findIndex((s) => s.id === b.before));
fs.writeFileSync(file, JSON.stringify(J, null, 2) + '\n');
console.log(`join ${id}|${next}: camera ${card.cut ? '(a cut: free)' : `at [${card.camera.pos}]`}; ${Object.entries(card.people).map(([w, p]) => `${w} "${p.expr}" at [${p.at}]`).join(', ')} -> ${path.relative(process.cwd(), file)}`);
