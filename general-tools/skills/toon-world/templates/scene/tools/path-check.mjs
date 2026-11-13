#!/usr/bin/env node
// __SLUG__: project an action's path onto the screen through the scene's own camera, to check it clears every other
// figure before a render. Cliff spike 6: moving a friend on a hunch twice did not clear the jump; the projection fixed
// it at once. Each person is a box 0.7 m wide and 1.8 m tall (times their size in sizes.ts) standing on their soles
// (turned to the camera). The place's solid things (places/marks.ts BLOCKERS: walls, posts, trunks, rocks) are checked
// too: one nearer the camera that covers the mover is a fault (the cliff film: a post hid the hero and nothing saw it).
// The action's last frame has to fall inside the scene (S5-87): an entry after the last frame is never seen.
//   node src/stories/__SLUG__/tools/path-check.mjs <scene> [--who hero] [--from f] [--to f] [--every 2] [--svg]
// Defaults come from the scene's ACTION ({ who, frames }). Prints every frame where the mover's box overlaps another
// figure's on screen by more than 5 % of the smaller box, and where the mover leaves the frame. --svg writes
// out/__SLUG__/path-<scene>.svg: the path (the mover's middle on every frame, through the camera of the middle frame)
// over the boxes at that frame. Exit 1 on an overlap.
import fs from 'node:fs';
import path from 'node:path';
import { args, loadScene, loadTs, importPkg, OUT, STORY_DIR } from './lib.mjs';

const { pos, o } = args();
const id = pos[0];
if (!id) { console.error('usage: path-check.mjs <scene> [--who hero] [--from f] [--to f] [--every 2] [--svg]'); process.exit(1); }
const THREE = await importPkg('three');
const S = await loadScene(id);
const marks = await loadTs(path.join(STORY_DIR, 'places', 'marks.ts')).catch(() => ({}));
const sizes = await loadTs(path.join(STORY_DIR, 'sizes.ts')).catch(() => ({ sizeOf: () => [1, 1] }));
const BLOCK = marks.BLOCKERS?.[S.PLACE] ?? [];
const who = o.who ?? S.ACTION?.who, [a0, b0] = S.ACTION?.frames ?? [0, S.FRAMES - 1];
const pre = [];
if (S.ACTION?.frames && (b0 > S.FRAMES - 1 || a0 < 0)) pre.push(`the action runs f${a0}-${b0} but the scene has frames 0-${S.FRAMES - 1}: its end is never seen (move the scene's boundary or the action)`);
const from = Number(o.from ?? a0), to = Number(o.to ?? b0), every = Math.max(1, Number(o.every ?? 2));
if (!who) { console.error('no mover: pass --who or export ACTION from story.ts'); process.exit(1); }
const W = 1080, H = 1920, cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 300);
const setCam = (f) => { const c = S.camAt(f); cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ((c.roll * Math.PI) / 180); cam.fov = c.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
const px = (v) => { const p = v.clone().project(cam); return { x: (p.x + 1) * W / 2, y: (1 - p.y) * H / 2, z: p.z }; };
const box = (at, w = '') => {
  const [sx, sy] = w ? sizes.sizeOf(w) : [1, 1];
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize().multiplyScalar(0.35 * sx);
  const base = new THREE.Vector3(...at), up = new THREE.Vector3(0, 1.8 * sy, 0);
  const pts = [base.clone().add(right), base.clone().sub(right), base.clone().add(up).add(right), base.clone().add(up).sub(right)].map(px);
  if (pts.some((p) => p.z > 1)) return null; // behind the lens
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const inter = (a, b) => area({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) });
/** a world box on screen, and its distance from the camera (nearest corner), or null when any corner is behind */
const boxOf = (b) => {
  const cs = []; for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) cs.push(new THREE.Vector3(x, y, z));
  const ps = cs.map(px); if (ps.some((p) => p.z > 1)) return null;
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), near: Math.min(...cs.map((c) => c.distanceTo(cam.position))) };
};
const faults = [...pre];
for (let f = from; f <= Math.min(to, S.FRAMES - 1); f += every) {
  setCam(f);
  const ps = S.people(f).filter((p) => !p.hidden), me = ps.find((p) => p.who === who);
  if (!me) continue;
  const mb = box(me.at, who);
  if (!mb) { faults.push(`f${f}: ${who} is behind the camera`); continue; }
  if (mb.x1 < 0 || mb.x0 > W || mb.y1 < 0 || mb.y0 > H) faults.push(`f${f}: ${who} is out of frame`);
  for (const p of ps) {
    if (p.who === who) continue;
    const pb = box(p.at, p.who); if (!pb) continue;
    const k = inter(mb, pb) / Math.max(1, Math.min(area(mb), area(pb)));
    if (k > 0.05) faults.push(`f${f}: ${who} covers ${p.who} by ${(k * 100).toFixed(0)} % on screen (${who} at x ${Math.round((mb.x0 + mb.x1) / 2)}, ${p.who} at x ${Math.round((pb.x0 + pb.x1) / 2)})`);
  }
  const meDist = new THREE.Vector3(me.at[0], me.at[1] + 0.9, me.at[2]).distanceTo(cam.position);
  for (const b of BLOCK) {
    const bb = boxOf(b); if (!bb || bb.near >= meDist) continue;
    const k = inter(mb, bb) / Math.max(1, area(mb));
    if (k > 0.2) faults.push(`f${f}: the ${b.name} hides ${(k * 100).toFixed(0)} % of ${who} on screen`);
  }
}
console.log(`${id}: ${who} f${from}-${to}, every ${every}: ${faults.length ? faults.length + ' faults' : 'clear of every figure'}`);
for (const l of faults) console.log('  ' + l);
if (o.svg) {
  const mid = Math.round((from + to) / 2); setCam(mid);
  const line = []; for (let f = from; f <= to; f++) { const me = S.people(f).find((p) => p.who === who); if (me) { const q = px(new THREE.Vector3(me.at[0], me.at[1] + 0.9, me.at[2])); if (q.z < 1) line.push(`${q.x.toFixed(0)},${q.y.toFixed(0)}`); } }
  const rects = S.people(mid).filter((p) => !p.hidden).map((p) => { const b = box(p.at); return b ? `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="${p.who === who ? '#e33' : '#36c'}" stroke-width="6"/><text x="${b.x0}" y="${b.y0 - 10}" font-size="40" fill="#000">${p.who}</text>` : ''; }).join('');
  const file = `${OUT}/path-${id}.svg`; fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#eee"/>${rects}<polyline points="${line.join(' ')}" fill="none" stroke="#e33" stroke-width="5" stroke-dasharray="14 8"/></svg>`);
  console.log(`  -> ${file.replace(process.cwd() + '/', '')} (camera at f${mid})`);
}
if (faults.length) process.exitCode = 1;
