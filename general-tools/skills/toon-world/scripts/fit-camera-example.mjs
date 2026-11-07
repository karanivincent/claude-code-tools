// fit each view's camera (pos, yaw, pitch, fov; level roll) to features whose world positions come from flat2d-a
const W = 1520, H = 2688, f0 = (H / 2) / Math.tan(25 * Math.PI / 180);
// flat2d-a: floor points back-projected (projector [-0.23, 2.6, 15.6], level, fov 50)
const floorPt = (u, v) => { u *= 2; v *= 2; const Z = 2.6 * f0 / (v - H / 2); return [(u - W / 2) / f0 * Z - 0.23, 0, 15.6 - Z]; };
const RFL = floorPt(322, 835), RFR = floorPt(462, 835);
console.log('step foot runner', RFL.map(x=>x.toFixed(2)), RFR.map(x=>x.toFixed(2)));
const WORLD = { rose: [0, 12.7, -13.1], peak: [0, 6.83, -11.25], candL: [-2.57, 1.75, -11.15], candR: [2.57, 1.75, -11.15], bowlL: [-3.18, 1.2, -8.7], bowlR: [3.18, 1.2, -8.7], lionL: [-0.87, 1.75, -11.15], lionR: [0.87, 1.75, -11.15], rfl: RFL, rfr: RFR, dl: [-1.08, 0.77, -10.5], dr: [1.08, 0.77, -10.5] };
const VIEWS = {
  'real-wide': { rose: [390, 165], peak: [390, 452], candL: [249, 732], candR: [529, 732], bowlL: [201, 762], bowlR: [578, 762], lionL: [343, 718], lionR: [435, 718], rfl: [330, 840], rfr: [452, 840], dl: [333, 783], dr: [446, 783] },
  'real-left': { rose: [365, 237], peak: [380, 490], candL: [262, 742], candR: [514, 742], bowlL: [233, 770], bowlR: [563, 770], lionL: [349, 735], lionR: [430, 735], rfl: [340, 837], rfr: [457, 837], dl: [340, 783], dr: [447, 783] },
  'real-right': { rose: [420, 218], peak: [405, 465], candL: [282, 716], candR: [520, 716], bowlL: [232, 748], bowlR: [540, 748], lionL: [360, 708], lionR: [440, 708], rfl: [335, 812], rfr: [440, 812], dl: [345, 760], dr: [440, 760] },
  'real-throne': { peak: [380, 300], candL: [88, 805], candR: [672, 805], bowlL: [38, 895], bowlR: [725, 895], lionL: [285, 790], lionR: [472, 790], dl: [255, 905], dr: [505, 905], rfl: [225, 1075], rfr: [540, 1075] },
};
function project(p, [x, y, z, yaw, pitch, fov]) {
  // camera looks along -z rotated by yaw (about y, positive turns left) then pitch (positive looks up)
  let dx = p[0] - x, dy = p[1] - y, dz = p[2] - z;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let X = cy * dx - sy * dz, Z = sy * dx + cy * dz;   // rotate world into camera yaw frame (camera forward = -Z)
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Y = cp * dy - sp * (-Z), F = sp * dy + cp * (-Z); // F forward distance
  const f = (H / 2) / Math.tan(fov * Math.PI / 360);
  return [W / 2 + f * X / F, H / 2 - f * Y / F];
}
function cost(view, q) { let e = 0, n = 0; for (const [k, [u, v]] of Object.entries(VIEWS[view])) { const [pu, pv] = project(WORLD[k], q); e += (pu - u * 2) ** 2 + (pv - v * 2) ** 2; n++; } return Math.sqrt(e / n); }
function nelder(fn, x0, step, iters = 6000) {
  let s = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[j] : 0)))].map(x => ({ x, f: fn(x) }));
  for (let it = 0; it < iters; it++) {
    s.sort((a, b) => a.f - b.f); const n = x0.length, c = x0.map((_, j) => s.slice(0, n).reduce((a, p) => a + p.x[j], 0) / n);
    const w = s[n], pt = k => c.map((v, j) => v + k * (w.x[j] - v)), r = { x: pt(-1) }; r.f = fn(r.x);
    if (r.f < s[0].f) { const e = { x: pt(-2) }; e.f = fn(e.x); s[n] = e.f < r.f ? e : r; }
    else if (r.f < s[n - 1].f) s[n] = r;
    else { const k = { x: pt(0.5) }; k.f = fn(k.x); if (k.f < w.f) s[n] = k; else s = s.map((p, i) => i === 0 ? p : ({ x: p.x.map((v, j) => s[0].x[j] + 0.5 * (v - s[0].x[j])), f: 0 })).map(p => p.f ? p : { ...p, f: fn(p.x) }); }
  }
  s.sort((a, b) => a.f - b.f); return s[0];
}
const out = {}; const FOVH = +(process.env.FOVH ?? 50);
for (const view of Object.keys(VIEWS)) {
  let best = null;
  for (const x0 of [[0, 1.6, 12, 0, 0, 55], [-3, 1.6, 8, -0.5, 0, 55], [3, 1.6, 8, 0.5, 0, 55], [0, 1.6, -3, 0, 0, 55], [0, 2.6, 15, 0, 0, 50], [-3, 3, 12, -0.2, 0, 45], [3, 3, 12, 0.2, 0, 45], [0, 9, 14, 0, -0.3, 55], [0, 2, -2, 0, 0.1, 45]]) {
    const r = nelder(q => cost(view, q) + (q[5] < 15 || q[5] > 100 ? 1e4 : 0) + 0, x0, [1, 1, 2, 0.1, 0.1, 5]);
    if (!best || r.f < best.f) best = r;
  }
  const [x, y, z, yaw, pitch, fov] = best.x;
  const look = [x - Math.sin(yaw) * Math.cos(pitch) * 20, y + Math.sin(pitch) * 20, z - Math.cos(yaw) * Math.cos(pitch) * 20];
  out[view] = { pos: [x, y, z].map(v => +v.toFixed(3)), look: look.map(v => +v.toFixed(3)), fov: +fov.toFixed(2), rmsPx: +best.f.toFixed(1) };
  console.log(view, JSON.stringify(out[view]), 'yaw', (yaw * 57.3).toFixed(1), 'pitch', (pitch * 57.3).toFixed(1), 'horizonErr%', (Math.tan(pitch) / Math.tan(fov * Math.PI / 360) * 50).toFixed(1), 'hfov', (2 * Math.atan(Math.tan(fov * Math.PI / 360) * W / H) * 57.3).toFixed(1));
}
