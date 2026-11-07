// unproject pixels of a realistic picture onto a plane: node measure.mjs wide floor u v | wide x=3.5 u v | wide z=-13.1 u v
import fs from 'fs';
const CAMS = JSON.parse(fs.readFileSync('../../views/depth-tool/real-cams.json', 'utf8'));
const W = 1520, H = 2688;
const [, , name, plane, ...rest] = process.argv;
const c = CAMS[name];
const f = c.look.map((v, i) => v - c.pos[i]), n = Math.hypot(...f), F = f.map(v => v / n);
const R = [-F[2], 0, F[0]].map(v => v / Math.hypot(F[2], F[0])), U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
const t = Math.tan((c.fov * Math.PI) / 360);
for (let i = 0; i < rest.length; i += 2) {
  const u = +rest[i], v = +rest[i + 1];
  const x = ((u / W) * 2 - 1) * t * (W / H), y = (1 - (v / H) * 2) * t, d = F.map((q, k) => q + x * R[k] + y * U[k]);
  let s;
  if (plane === 'floor') s = -c.pos[1] / d[1];
  else { const [ax, val] = plane.split('='); const k = 'xyz'.indexOf(ax); s = (+val - c.pos[k]) / d[k]; }
  console.log(u, v, '->', c.pos.map((p, k) => (p + s * d[k]).toFixed(2)).join(' '));
}
