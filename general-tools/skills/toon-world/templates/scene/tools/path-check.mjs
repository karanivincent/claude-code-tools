#!/usr/bin/env node
// __SLUG__: project an action's path onto the screen through the scene's own camera, to check it clears every other
// figure before a render. Cliff spike 6: moving a friend on a hunch twice did not clear the jump; the projection fixed
// it at once. Each person is a box 0.7 m wide and 1.8 m tall standing on their soles (turned to the camera).
//   node src/stories/__SLUG__/tools/path-check.mjs <scene> [--who hero] [--from f] [--to f] [--every 2] [--svg]
// Defaults come from the scene's ACTION ({ who, frames }). Prints every frame where the mover's box overlaps another
// figure's on screen by more than 5 % of the smaller box, and where the mover leaves the frame. --svg writes
// out/__SLUG__/path-<scene>.svg: the path (the mover's middle on every frame, through the camera of the middle frame)
// over the boxes at that frame. Exit 1 on an overlap.
import fs from 'node:fs';
import { args, loadScene, importPkg, OUT } from './lib.mjs';

const { pos, o } = args();
const id = pos[0];
if (!id) { console.error('usage: path-check.mjs <scene> [--who hero] [--from f] [--to f] [--every 2] [--svg]'); process.exit(1); }
const THREE = await importPkg('three');
const S = await loadScene(id);
const who = o.who ?? S.ACTION?.who, [a0, b0] = S.ACTION?.frames ?? [0, S.FRAMES - 1];
const from = Number(o.from ?? a0), to = Number(o.to ?? b0), every = Math.max(1, Number(o.every ?? 2));
if (!who) { console.error('no mover: pass --who or export ACTION from story.ts'); process.exit(1); }
const W = 1080, H = 1920, cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 300);
const setCam = (f) => { const c = S.camAt(f); cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ((c.roll * Math.PI) / 180); cam.fov = c.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
const px = (v) => { const p = v.clone().project(cam); return { x: (p.x + 1) * W / 2, y: (1 - p.y) * H / 2, z: p.z }; };
const box = (at) => {
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize().multiplyScalar(0.35);
  const base = new THREE.Vector3(...at), up = new THREE.Vector3(0, 1.8, 0);
  const pts = [base.clone().add(right), base.clone().sub(right), base.clone().add(up).add(right), base.clone().add(up).sub(right)].map(px);
  if (pts.some((p) => p.z > 1)) return null; // behind the lens
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const inter = (a, b) => area({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) });
const faults = [];
for (let f = from; f <= to; f += every) {
  setCam(f);
  const ps = S.people(f).filter((p) => !p.hidden), me = ps.find((p) => p.who === who);
  if (!me) continue;
  const mb = box(me.at);
  if (!mb) { faults.push(`f${f}: ${who} is behind the camera`); continue; }
  if (mb.x1 < 0 || mb.x0 > W || mb.y1 < 0 || mb.y0 > H) faults.push(`f${f}: ${who} is out of frame`);
  for (const p of ps) {
    if (p.who === who) continue;
    const pb = box(p.at); if (!pb) continue;
    const k = inter(mb, pb) / Math.max(1, Math.min(area(mb), area(pb)));
    if (k > 0.05) faults.push(`f${f}: ${who} covers ${p.who} by ${(k * 100).toFixed(0)} % on screen (${who} at x ${Math.round((mb.x0 + mb.x1) / 2)}, ${p.who} at x ${Math.round((pb.x0 + pb.x1) / 2)})`);
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
