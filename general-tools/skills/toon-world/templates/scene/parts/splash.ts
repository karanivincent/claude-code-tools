// A see-through water splash (cliff spikes 4-7). A water effect is judged as water only when it is see-through,
// narrower than the frame and over in under a second: a white crown that filled the frame read as "a paper cup" to
// every looker, and a card crown as "a paper crown". This one is a narrow lathed column with a white core, a low crown,
// separate drops thrown on contact and falling under gravity, a foam disc and rings that spread after it.
// Timing, in frames after the body meets the water (s): the column rises from s = -2 and is gone by s = 19 (0.7 s at
// 30 fps); drops land by about s = 25; the foam and rings go on spreading quietly (the "never came up" beat).
// Put the camera side-on to see it against open water, and let it hide the body at once (showing the body going in
// feet first was blamed: "he came up").
import * as THREE from 'three';
import { NOINK } from '../../../../look/ink';
import { canvasTex, fbm, glowTex, rnd, type V3, type Part } from './blend';

export type SplashOpts = { scale?: number; drops?: number; rings?: number; seed?: number };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

/** The splash at `at` (on the water surface). Its update takes the frame since contact (negative before it). */
export const splash = (at: V3, o: SplashOpts = {}): Part => {
  const root = new THREE.Group(), S = o.scale ?? 1, seed = o.seed ?? 500, N = o.drops ?? 90;
  const add = <T extends THREE.Object3D>(m: T) => { m.layers.set(NOINK); root.add(m); return m; };
  const basic = (p: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, ...p });
  // rings and foam on the surface
  const ringMats: THREE.MeshBasicMaterial[] = [], rings: THREE.Mesh[] = [];
  for (let i = 0; i < (o.rings ?? 5); i++) {
    const m = basic({ color: '#eaf7ff', opacity: 0 }), r = add(new THREE.Mesh(new THREE.RingGeometry(0.88, 1.0, 96), m));
    r.rotation.x = -Math.PI / 2; r.position.set(at[0], at[1] + 0.02 + i * 0.002, at[2]); rings.push(r); ringMats.push(m);
  }
  const foamM = basic({ opacity: 0, map: canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) { const a = rnd(i) * 6.283, rr = 120 + 120 * Math.pow(rnd(i + 3), 0.6); g.fillStyle = `rgba(240,250,255,${0.4 + 0.5 * rnd(i + 7)})`; g.beginPath(); g.arc(256 + rr * Math.cos(a), 256 + rr * Math.sin(a), 6 + 18 * rnd(i + 9), 0, 7); g.fill(); }
    for (let i = 0; i < 80; i++) { const a = rnd(i + 200) * 6.283, rr = 80 * rnd(i + 210); g.fillStyle = 'rgba(230,245,255,0.35)'; g.beginPath(); g.arc(256 + rr * Math.cos(a), 256 + rr * Math.sin(a), 10 + 20 * rnd(i), 0, 7); g.fill(); }
  }) });
  const foam = add(new THREE.Mesh(new THREE.PlaneGeometry(S, S), foamM)); foam.rotation.x = -Math.PI / 2; foam.position.set(at[0], at[1] + 0.03, at[2]);
  // drops: two sizes, thrown on contact over ~4 frames, gone when they land
  const dotT = glowTex('rgba(240,250,255,1)', 'rgba(220,240,255,0)');
  const dGeo = [0, 1].map(() => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.ceil(N / 2) * 3), 3)));
  const dropSets = dGeo.map((g, k) => { const p = add(new THREE.Points(g, new THREE.PointsMaterial({ map: dotT, size: (k ? 0.2 : 0.11) * S, transparent: true, depthWrite: false, fog: false, color: '#eef9ff' }))); p.frustumCulled = false; return p; });
  const dv = Array.from({ length: N }, (_, i) => ({ a: rnd(seed + i) * 6.283, sp: (0.6 + 2.4 * rnd(seed + i + 10)) * S, up: (2 + 5.5 * Math.pow(rnd(seed + i + 20), 1.3)) * Math.sqrt(S), r0: (0.1 + 0.35 * rnd(seed + i + 30)) * S, t0: 4 * rnd(seed + i + 50) }));
  // the column (see-through streaked water, a white core) and a low crown
  const streak = canvasTex(256, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#9fd6f0'); gr.addColorStop(0.5, '#f2fbff'); gr.addColorStop(1, '#9fd6f0'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * rnd(i + 800)})`; g.fillRect(rnd(i + 810) * 256, 0, 2 + 6 * rnd(i + 820), 256); }
    g.globalCompositeOperation = 'destination-out'; const fo = g.createLinearGradient(0, 0, 0, 110); fo.addColorStop(0, 'rgba(0,0,0,0.85)'); fo.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fo; g.fillRect(0, 0, 256, 110);
  }, [3, 1]);
  const prof = [[0.5, 0], [0.38, 0.25], [0.3, 0.6], [0.24, 0.85], [0.14, 1.0], [0.0, 1.06]].map(([r, y]) => new THREE.Vector2(r, y));
  const colG = new THREE.LatheGeometry(prof, 32);
  { const p = colG.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.35 * (fbm(a * 2 + 5, y * 4, 3) - 0.5); p.setXYZ(i, x * k, y, z * k); } colG.computeVertexNormals(); }
  const column = add(new THREE.Mesh(colG, new THREE.MeshBasicMaterial({ map: streak, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: true, fog: false })));
  const core = add(new THREE.Mesh(colG, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, fog: false })));
  const crG = new THREE.CylinderGeometry(1, 0.5, 1, 48, 3, true);
  { const p = crG.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.45) { const a = Math.atan2(p.getZ(i), p.getX(i)), sp = Math.pow(Math.abs(Math.sin(a * 6 + 0.6 * Math.sin(a * 3))), 1.6); p.setY(i, y + 0.45 * sp + 0.08 * rnd(i)); } } crG.translate(0, 0.5, 0); crG.computeVertexNormals(); }
  const crownM = new THREE.MeshBasicMaterial({ map: streak, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const crown = add(new THREE.Mesh(crG, crownM));
  for (const m of [column, core, crown]) m.position.set(...at);
  const update = (s: number) => {
    rings.forEach((r, i) => { const k = (s - 3 - i * 7) / 52, on = k > 0 && k < 1; r.visible = on; if (on) { const sc = (0.3 + 3.6 * Math.sqrt(k)) * S; r.scale.set(sc, sc * (1 + 0.04 * Math.sin(i + s * 0.2)), 1); ringMats[i].opacity = 0.8 * (1 - k) * (i === 0 ? 1 : 0.7); } });
    foam.visible = s > 0 && s < 110; foam.scale.setScalar(0.6 + 2.6 * Math.sqrt(clamp01(s / 30))); foamM.opacity = s > 0 ? 0.85 * (1 - smooth((s - 20) / 90)) : 0; foam.rotation.z = 0.01 * s;
    dGeo.forEach((g, k) => { const a = g.attributes.position as THREE.BufferAttribute; for (let j = 0; j < a.count; j++) { const d = dv[Math.min(N - 1, j * 2 + k)], tt = (s - d.t0) / 30; let y = -99, rr = 0; if (tt > 0) { y = d.up * tt - 4.9 * tt * tt; rr = d.r0 + d.sp * tt; if (y < -0.02) y = -99; } a.setXYZ(j, at[0] + rr * Math.cos(d.a), at[1] + y + 0.05, at[2] + rr * Math.sin(d.a)); } a.needsUpdate = true; });
    dropSets.forEach((p) => (p.visible = s > 0 && s < 60));
    const st = (s + 2) / 21, up = st > 0 && st < 1 ? Math.sin(Math.min(1, st * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, (st - 0.45) / 0.55) ** 1.5) : 0;
    column.visible = core.visible = up > 0.02; crown.visible = st > 0 && st < 1.25;
    if (column.visible) { column.scale.set((0.75 + 0.45 * st) * S, 2.0 * up * S, (0.75 + 0.45 * st) * S); core.scale.set((0.4 + 0.25 * st) * S, 1.75 * up * S, (0.4 + 0.25 * st) * S); column.rotation.y = core.rotation.y = 0.3 * st; }
    if (crown.visible) { const cu = Math.sin(Math.min(1, st * 2.2) * Math.PI * 0.5) * (1 - smooth((st - 0.35) / 0.9)); crown.scale.set((0.45 + 1.0 * st) * S, (1.0 * cu + 0.01) * S, (0.45 + 1.0 * st) * S); crownM.opacity = 0.6 * (1 - smooth((st - 0.45) / 0.6)); }
  };
  update(-99);
  return { root, update };
};
