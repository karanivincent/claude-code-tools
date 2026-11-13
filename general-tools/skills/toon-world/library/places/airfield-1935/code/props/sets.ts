// b17-checklist: the airfield's built things in code with painted textures (the blend's middle band, S3-7): the
// curved-roof hangar, the officers' wooden stand with bunting, 1930s cars, the fire truck and the ambulance, fuel drums,
// a ladder, a wheel chock, the wreck. Big simple shapes (S3-13); repeated parts few and thick.
import * as THREE from 'three';
import { add, corrugatedTex, mat, metalTex, paint, rnd, woodTex, sheet } from './paint';
import { NOINK } from '../../../look/ink';
import type { Plane } from './plane';

export type V3 = [number, number, number];

/** a curved-roof (Quonset-like) hangar: half-cylinder roof, end walls, a big dark door opening on +z */
export const hangar = (at: V3, o: { w?: number; d?: number; yaw?: number; open?: boolean } = {}) => {
  const root = new THREE.Group(); root.position.set(...at); root.rotation.y = o.yaw ?? 0;
  const W = o.w ?? 40, D = o.d ?? 36, R = W / 2, H = 6;
  const steel = mat(corrugatedTex([8, 3]), '#c3c9cd', { side: THREE.DoubleSide }), endM = mat(corrugatedTex([6, 2], '#d4d8db'), '#d9dde0', { side: THREE.DoubleSide });
  const roof = new THREE.CylinderGeometry(R, R, D, 40, 1, true, -Math.PI / 2, Math.PI); roof.rotateX(-Math.PI / 2);
  const r = add(root, new THREE.Mesh(roof, steel)); r.rotation.z = 0; r.position.y = H; r.scale.set(1, 0.55, 1);
  for (const sx of [-1, 1]) { const sw = add(root, new THREE.Mesh(new THREE.PlaneGeometry(D, H), steel)); sw.rotation.y = Math.PI / 2; sw.position.set(sx * R, H / 2, 0); }
  // the front: an end wall with the door cut out, and the door's dark inside
  const front = new THREE.Shape(); front.moveTo(-R, 0); front.lineTo(R, 0); front.lineTo(R, H);
  for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI; front.lineTo(R * Math.cos(a), H + 0.55 * R * Math.sin(a)); }
  front.lineTo(-R, 0);
  const door = new THREE.Path(); const dw = W * 0.38, dh = H + 2.5; door.moveTo(-dw, 0); door.lineTo(-dw, dh); door.lineTo(dw, dh); door.lineTo(dw, 0); door.lineTo(-dw, 0);
  front.holes.push(door);
  const fm = add(root, new THREE.Mesh(new THREE.ShapeGeometry(front), endM)); fm.position.z = D / 2 + 0.05;
  const dark = add(root, new THREE.Mesh(new THREE.PlaneGeometry(dw * 2, dh), mat(null, '#2a2c38')), false); dark.position.set(0, dh / 2, D / 2 - 0.3);
  const backS = new THREE.Shape(); backS.moveTo(-R, 0); backS.lineTo(R, 0); backS.lineTo(R, H);
  for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI; backS.lineTo(R * Math.cos(a), H + 0.55 * R * Math.sin(a)); }
  const bm = add(root, new THREE.Mesh(new THREE.ShapeGeometry(backS), endM)); bm.position.z = -D / 2;
  const sign = sheet(2048, 256, (g) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 2048, 256); g.fillStyle = '#23356e'; g.font = '900 150px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WRIGHT FIELD', 1024, 135); });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(dw * 1.6, dw * 0.2), new THREE.MeshLambertMaterial({ map: sign })); sm.position.set(0, dh + 1.4, D / 2 + 0.12); sm.layers.set(NOINK); root.add(sm);
  return root;
};

/** the officers' wooden stand: three tiers of benches, a roof on posts, red-white-blue bunting along its front */
export const stand = (at: V3, o: { w?: number; yaw?: number } = {}) => {
  const root = new THREE.Group(); root.position.set(...at); root.rotation.y = o.yaw ?? 0;
  const W = o.w ?? 18, wood = mat(woodTex([4, 1]), '#ffffff'), white = mat(woodTex([4, 1], '#e9e3d4'));
  for (let i = 0; i < 3; i++) { const s = add(root, new THREE.Mesh(new THREE.BoxGeometry(W, 0.5 + i * 0.6, 1.2), wood)); s.position.set(0, (0.5 + i * 0.6) / 2, -i * 1.2); }
  for (const x of [-W / 2 + 0.3, 0, W / 2 - 0.3]) { const p = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 0.25), white)); p.position.set(x, 2.1, -3.0); }
  const rf = add(root, new THREE.Mesh(new THREE.BoxGeometry(W + 1, 0.2, 4.4), mat(corrugatedTex([4, 1], '#9a3a32'), '#b8483c'))); rf.position.set(0, 4.25, -1.6); rf.rotation.x = 0.08;
  const bunt = paint((g, w, h) => { const c = ['#c8262e', '#f4f1ea', '#23356e']; for (let i = 0; i < 3; i++) { g.fillStyle = c[i]; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); } }, [1, 1], 256, 128);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20, Math.PI, Math.PI), new THREE.MeshLambertMaterial({ map: bunt, side: THREE.DoubleSide }));
    b.position.set(-W / 2 + 2.3 + i * ((W - 4.6) / 3), 0.5 + 0.02, 0.62); b.layers.set(NOINK); root.add(b);
  }
  return root;
};

/** a 1930s car: rounded body, running boards, round headlamps, a spare wheel, in a strong colour */
export const car = (at: V3, yaw: number, color: string) => {
  const root = new THREE.Group(); root.position.set(...at); root.rotation.y = yaw;
  const paintM = mat(metalTex([1, 1]), color), dark = mat(null, '#24232a'), chrome = mat(null, '#d8dde2');
  const body = add(root, new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 1.7), paintM)); body.position.y = 0.85;
  const cab = add(root, new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), paintM)); cab.scale.set(1.25, 0.7, 0.85); cab.position.set(-0.4, 1.3, 0);
  const hood = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 14), paintM)); hood.rotation.z = Math.PI / 2; hood.position.set(1.4, 1.05, 0);
  for (const [x, z] of [[1.3, 0.85], [1.3, -0.85], [-1.3, 0.85], [-1.3, -0.85]]) { const w = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 16), dark)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); }
  for (const z of [0.45, -0.45]) { const l = add(root, new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), chrome)); l.position.set(2.2, 1.15, z); }
  return root;
};
/** the field's fire truck (red, a ladder and a hose reel) and the ambulance (white with a red cross) */
export const fireTruck = (at: V3, yaw: number) => {
  const root = car([0, 0, 0], 0, '#d42a26'); root.scale.set(1.35, 1.25, 1.25);
  const g = new THREE.Group(); g.add(root); g.position.set(...at); g.rotation.y = yaw;
  const lad = add(g, new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 0.7), mat(woodTex([2, 1], '#c9a46a')))); lad.position.set(-0.5, 2.2, 0);
  const reel = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 16), mat(null, '#f2c230'))); reel.rotation.x = Math.PI / 2; reel.position.set(-2.3, 1.6, 0);
  return g;
};
export const ambulance = (at: V3, yaw: number) => {
  const g = new THREE.Group(); g.position.set(...at); g.rotation.y = yaw;
  const c = car([0, 0, 0], 0, '#ece8de'); g.add(c);
  const box = add(g, new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.8), mat(metalTex([1, 1]), '#f1ede4'))); box.position.set(-0.9, 1.7, 0);
  const cross = sheet(256, 256, (x) => { x.clearRect(0, 0, 256, 256); x.fillStyle = '#d42a26'; x.fillRect(96, 32, 64, 192); x.fillRect(32, 96, 192, 64); });
  for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: cross, transparent: true })); m.position.set(-0.9, 1.8, s * 0.92); if (s < 0) m.rotation.y = Math.PI; m.layers.set(NOINK); g.add(m); }
  return g;
};
/** oil drums in a cluster, painted red and blue */
export const drums = (at: V3, n = 5) => {
  const root = new THREE.Group(); root.position.set(...at);
  for (let i = 0; i < n; i++) { const d = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), mat(metalTex([1, 1]), i % 2 ? '#3a5fa8' : '#c0392b'))); d.position.set((i % 3) * 0.65 + rnd(i) * 0.1, 0.45, Math.floor(i / 3) * 0.65); }
  return root;
};

/** the wreck from the plane's own parts: the middle crumpled and blackened, a wing torn, an engine thrown, and the
 *  tail section lying clear with the red lock still clamped on its elevator (s05's close shot) */
export const wreck = (plane: Plane, mid: V3, midYaw: number, tail: V3, tailYaw: number, thrown?: V3) => {
  const root = new THREE.Group();
  const burnt = mat(metalTex([3, 1]), '#5a5450'), char = mat(null, '#2c2826');
  const m = new THREE.Group(); m.position.set(...mid); m.rotation.y = (midYaw * Math.PI) / 180; root.add(m);
  const f = add(m, new THREE.Mesh(plane.parts.lathe, burnt)); f.scale.set(0.55, 0.85, 1); f.rotation.set(0.25, 0, -0.18); f.position.set(-1, 1.0, 0);
  const w = add(m, new THREE.Mesh(plane.parts.wg, burnt)); w.rotation.set(0.15, 0.05, 0.08); w.position.set(0, 0.6, 0); w.scale.set(1, 1, 0.7);
  for (let i = 0; i < 9; i++) { const c = add(m, new THREE.Mesh(new THREE.BoxGeometry(1 + rnd(i) * 2, 0.3 + rnd(i + 2) * 0.6, 0.8 + rnd(i + 4)), i % 2 ? char : burnt)); c.position.set((rnd(i + 5) - 0.5) * 12, 0.3, (rnd(i + 7) - 0.5) * 10); c.rotation.set(rnd(i) * 2, rnd(i + 1) * 3, rnd(i + 2) * 2); }
  // the thrown engine with a torn piece of wing and its bent propeller: lies where `thrown` says (world), else beside
  const eg0 = new THREE.Group(); if (thrown) { eg0.position.set(...thrown); root.add(eg0); } else { eg0.position.set(4, 0, 7); m.add(eg0); }
  const eng = add(eg0, new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 2.6, 16), char)); eng.rotation.set(0.4, 0.8, 1.3); eng.position.set(0, 0.75, 0);
  const cowl = add(eg0, new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.16, 8, 20), burnt)); cowl.rotation.set(0.2, 1.1, 0.3); cowl.position.set(1.0, 0.8, 0.6);
  const slab = add(eg0, new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.22, 2.4), burnt)); slab.rotation.set(0.12, -0.6, 0.35); slab.position.set(-2.2, 0.7, -0.8);
  for (let i = 0; i < 2; i++) { const b = add(eg0, new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.08), char)); b.position.set(1.4, 0.9, 0.8); b.rotation.set(0.3, 0.9, i * 2.1 + 0.4); }
  // the tail: fin, stabiliser and elevator, the lock on, resting on its side in the grass
  const t = new THREE.Group(); t.position.set(...tail); t.rotation.y = (tailYaw * Math.PI) / 180; root.add(t);
  const tt = new THREE.Group(); tt.rotation.set(-0.32, 0, 0.06); tt.position.set(10.5, 0.5, 0); t.add(tt);
  const skin = mat(metalTex([3, 1]), '#b6bec6'); // the plain lit metal, not the flying plane's gold rim: on the tail's big flat faces in the lock close it read cream-pink
  add(tt, new THREE.Mesh(plane.parts.sg, skin));
  add(tt, new THREE.Mesh(plane.parts.fg, skin));
  const eg = add(tt, new THREE.Mesh(plane.parts.eg, skin)); eg.position.set(-11.1, 0.05, 0);
  const cone = add(tt, new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.15, 4, 18, 1, true), skin)); cone.rotation.z = Math.PI / 2; cone.position.set(-10.3, 0.1, 0);
  const red = mat(null, '#e0262b'), lock = new THREE.Group(); lock.position.set(-11.1, 0.14, 2.2); tt.add(lock);
  add(lock, new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.34), red));
  for (const x of [0.32, -0.32]) add(lock, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.42), red)).position.x = x;
  const flagM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.24, 8, 1), new THREE.MeshLambertMaterial({ color: '#e0262b', side: THREE.DoubleSide })); flagM.position.set(-0.8, -0.1, 0.25); lock.add(flagM);
  return { root, lockFlag: flagM, lockWorld: () => lock.getWorldPosition(new THREE.Vector3()) };
};

/** a scorched patch on the grass (burnt earth round the wreck): a dark painted decal, ragged at the rim */
export const scorch = (at: V3, r: number, seed = 1) => {
  const tex = paint((g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const a = rnd(seed + i) * Math.PI * 2, d = w * 0.18 * rnd(seed + i * 3), x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d, rr = w * (0.16 + 0.14 * rnd(seed + i * 5));
      const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(28,22,20,0.85)'); gr.addColorStop(0.6, 'rgba(48,38,30,0.55)'); gr.addColorStop(1, 'rgba(70,58,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    }
  }, [1, 1], 512, 512);
  const m = mat(tex); m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2;
  const d = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), m); d.position.set(at[0], 0.06, at[2]); d.rotation.y = rnd(seed) * 3; d.receiveShadow = true;
  return d;
};
/** a soft contact shadow under a small thing on the grass (the helmets) */
export const blob = (at: V3, r: number) => {
  const tex = paint((g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(20,24,40,0.6)'); gr.addColorStop(1, 'rgba(20,24,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, [1, 1], 128, 128);
  const d = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  d.position.set(at[0], 0.07, at[2]); d.layers.set(NOINK); return d;
};

/** grass tufts: crossed painted blade cards, gold-green, stirring in the wind (the ground's detail layer near low
 *  cameras). Kept `clear` of listed points so they never hide a hero prop. */
export const tufts = (areas: { x: [number, number]; z: [number, number]; n: number }[], clear: { at: V3; r: number }[], seed = 9) => {
  const tex = paint((g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) { // thin tapered blades, the grass's own colours, so a tuft reads as grass, not a block
      const x = w * (0.2 + 0.6 * rnd(seed + i)), lean = (rnd(seed + i * 3) - 0.5) * w * 0.5, top = h * (0.08 + 0.5 * rnd(seed + i * 7)), bw = 5 + 4 * rnd(seed + i * 5);
      g.fillStyle = ['#8fae44', '#a9bf52', '#c7c062', '#9cb84a', '#b8a84c'][i % 5];
      g.beginPath(); g.moveTo(x - bw, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.quadraticCurveTo(x + lean * 0.3 + bw * 0.5, (h + top) / 2, x + bw, h); g.fill();
    }
  }, [1, 1], 256, 256);
  const m = mat(tex, '#ffffff', { side: THREE.DoubleSide }); m.alphaTest = 0.45;
  const a = new THREE.PlaneGeometry(0.6, 0.4); a.translate(0, 0.2, 0); const b = a.clone().rotateY(Math.PI / 2);
  const geo = new THREE.BufferGeometry(); const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  for (const q of [a, b]) { const nq = q.toNonIndexed(); pos.push(...(nq.attributes.position.array as Float32Array)); uv.push(...(nq.attributes.uv.array as Float32Array)); nor.push(...(nq.attributes.normal.array as Float32Array)); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // normals straight up, so the tufts light like the grass under them, not like walls
  for (let i = 0; i < nor.length; i += 3) { nor[i] = 0; nor[i + 1] = 1; nor[i + 2] = 0; }
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const spots: { x: number; z: number; s: number; yaw: number; ph: number }[] = [];
  let k = 0;
  for (const ar of areas) for (let i = 0; i < ar.n; i++, k++) {
    const x = ar.x[0] + (ar.x[1] - ar.x[0]) * rnd(seed + k * 1.31), z = ar.z[0] + (ar.z[1] - ar.z[0]) * rnd(seed + k * 2.17 + 4);
    if (Math.abs(z) < 16) continue; // not on the runway
    if (clear.some((c) => Math.hypot(x - c.at[0], z - c.at[2]) < c.r)) continue;
    spots.push({ x, z, s: 0.5 + 0.6 * rnd(seed + k * 3.3), yaw: rnd(seed + k * 5.1) * 3, ph: rnd(seed + k) * 6 });
  }
  const im = new THREE.InstancedMesh(geo, m, spots.length); im.layers.set(NOINK); im.receiveShadow = true; im.frustumCulled = false;
  const o = new THREE.Object3D();
  const update = (t: number) => {
    spots.forEach((p, i) => {
      o.position.set(p.x, 0, p.z); o.rotation.set(0.12 * Math.sin(t * 2.6 + p.ph + p.x * 0.2), p.yaw, 0.1 * Math.sin(t * 2.1 + p.ph)); o.scale.setScalar(p.s);
      o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { root: im, update };
};

/** a ground-crew man far off on the field: a bean of a body in coveralls, a round head and a cap with a peak (so a turn
 *  reads), arms that can point. Small and far: the detail layer, not the cast. */
export const crewman = (at: V3, o: { suit?: string; cap?: string; skin?: string } = {}) => {
  const root = new THREE.Group(); root.position.set(...at);
  const suit = mat(woodTex([1, 1], o.suit ?? '#4f6a8a'), o.suit ? '#ffffff' : '#ffffff'), skin = mat(null, o.skin ?? '#e8b48a'), cap = mat(null, o.cap ?? '#2f3a4c');
  const body = add(root, new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 6, 12), suit)); body.position.y = 0.66;
  const head = add(root, new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), skin)); head.position.y = 1.5;
  const c = add(root, new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap)); c.position.y = 1.55;
  const peak = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.3), cap)); peak.position.set(0.2, 1.56, 0);
  const arm = new THREE.Group(); arm.position.set(0, 1.12, 0.3); root.add(arm);
  const a = add(arm, new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 8), suit)); a.position.y = -0.3;
  return { root, arm };
};
