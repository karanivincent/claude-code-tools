import * as THREE from 'three';
import { curve, hash, smooth, prog, type V3 } from './shots';
import { SNAP_F, S_Z, sBend, type Track } from './track';
import { DECK_W } from './places';

// Our own steam train: a dark green locomotive with brass bands, red wheels, a cowcatcher, a tall funnel and a bright
// headlamp, then a tender and two coaches. It rides one PATH, a polyline built from the track's centre curve: straight
// before the snap; after it, along the S to its steepest point, then straight on along that tangent (derailed) to the
// deck edge, then over the edge in a tight bend and straight down. The engine's front sits at path distance p(f), and
// every car hangs between two points of the same path (its front and back), so on the bridge the cars ride the bent
// rails and, after the edge, follow the engine over it one by one and hang down in a chain, each pivoting at its
// coupling. Round 2: a third coach, so at 441 cars still stand on the deck behind the hanging chain. The engine also skids a further 25 degrees once it leaves the rails, to show its side (about 70 degrees).

type Car = { group: THREE.Group; back: number; front: number; wheels: THREE.Object3D[]; r: number[]; spin?: (dist: number) => void };
// Round 2 (Vincent: "the gold and the detail"): glossy paint with a clear coat, polished brass that throws sharp
// highlights (metal 1, roughness about 0.2, smooth shading on every curved part), rivets, lining, rods and lettering in
// our own words ("THE SMOOTH LINE"). Flat shading stays on the boxy parts only.
const mat = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3, flatShading: true, ...o });
const paint = (c: string) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 });
const GREEN = paint('#174a32'), GREEN_FLAT = mat('#174a32', { metalness: 0.2, roughness: 0.38 }),
  BRASS = new THREE.MeshStandardMaterial({ color: '#e6b44a', metalness: 1, roughness: 0.2 }),
  BRASS_F = mat('#e6b44a', { metalness: 1, roughness: 0.22 }),
  RED = paint('#c0262c'), RED_F = mat('#b8242a', { roughness: 0.45 }),
  BLACK = mat('#1e1a20', { roughness: 0.5 }), GRAPH = new THREE.MeshStandardMaterial({ color: '#2e2a30', metalness: 0.6, roughness: 0.32 }),
  STEEL = new THREE.MeshStandardMaterial({ color: '#d8d4dc', metalness: 1, roughness: 0.18 }),
  CREAM = mat('#ecdfc0', { metalness: 0.1 }), GLASS = mat('#2a2436', { metalness: 0.6, roughness: 0.12 });
export const HEADLAMP = new THREE.Color(3.2, 2.8, 2.0);

const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cylZ = (r0: number, r1: number, l: number, m: THREE.Material, x: number, y: number, z: number, seg = 32) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, l, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return o; };
const ringZ = (r: number, t: number, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 40), m); o.position.set(x, y, z); return o; };
/** a bar of square section between two points */
function bar(a: V3, b: V3, t: number, m: THREE.Material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = new THREE.Mesh(new THREE.BoxGeometry(t, t, A.distanceTo(B)), m);
  o.position.copy(A).add(B).multiplyScalar(0.5); o.lookAt(B); return o;
}
/** rivets: small domed heads at the given points, one instanced mesh */
function rivets(pts: V3[], r = 0.03, m: THREE.Material = BRASS) {
  const geo = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); geo.rotateX(Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, m, pts.length), M4 = new THREE.Matrix4();
  pts.forEach((p, i) => { im.setMatrixAt(i, M4.makeTranslation(p[0], p[1], p[2])); });
  return im;
}
/** rivets round a ring in the x-y plane at z, facing +z (or all round a cylinder's face) */
const ringPts = (r: number, z: number, n: number, y0: number): V3[] => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, y0 + Math.sin((i / n) * Math.PI * 2) * r, z]);
/** rivets along a line */
const linePts = (a: V3, b: V3, n: number): V3[] => Array.from({ length: n }, (_, i) => { const k = i / (n - 1); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; });

// ---- painted panels (lettering, lining, windows), drawn once at high resolution ---------------------------------------
type G2 = CanvasRenderingContext2D;
function panelTex(w: number, h: number, draw: (g: G2, w: number, h: number) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t;
}
const SERIF = 'bold 1px "Georgia", "Times New Roman", serif';
function goldText(g: G2, text: string, x: number, y: number, size: number) {
  g.font = SERIF.replace('1px', `${size}px`); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = size * 0.12; g.strokeStyle = '#3a2410'; g.strokeText(text, x, y);
  const grd = g.createLinearGradient(0, y - size / 2, 0, y + size / 2); grd.addColorStop(0, '#fff2b0'); grd.addColorStop(0.5, '#e8b440'); grd.addColorStop(1, '#a87420');
  g.fillStyle = grd; g.fillText(text, x, y);
}
const lining = (g: G2, x: number, y: number, w: number, h: number, r: number, c = '#e8b440', lw = 6) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.lineWidth = lw; g.strokeStyle = c; g.stroke(); };
/** a coach side, 10.6 m by 2.2 m: green below, cream window band, eight framed windows, panel lines, gold lining,
 *  the line's name and the coach's number */
function coachSide(n: number) {
  return panelTex(4096, 850, (g, W, H) => {
    g.fillStyle = '#174a32'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ecdfc0'; g.fillRect(0, 70, W, 330);
    // panel lines (dark grooves with a light lip)
    for (let i = 0; i <= 16; i++) { const x = 20 + i * (W - 40) / 16; g.fillStyle = 'rgba(10,20,14,0.55)'; g.fillRect(x - 3, 400, 6, H - 470); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, 400, 2, H - 470); }
    g.fillStyle = 'rgba(10,20,14,0.6)'; g.fillRect(0, 398, W, 6); g.fillRect(0, H - 72, W, 6);
    // windows: dark glass with a cream sash, gold frames, a highlight streak
    for (let i = 0; i < 8; i++) {
      const x = 150 + i * 486, y = 110, w = 300, h = 250;
      g.fillStyle = '#2a2436'; g.beginPath(); g.roundRect(x, y, w, h, 26); g.fill();
      g.fillStyle = 'rgba(200,190,230,0.35)'; g.beginPath(); g.moveTo(x + 40, y + h); g.lineTo(x + 130, y); g.lineTo(x + 175, y); g.lineTo(x + 85, y + h); g.closePath(); g.fill();
      g.fillStyle = '#ecdfc0'; g.fillRect(x, y + h * 0.42, w, 14);
      lining(g, x - 8, y - 8, w + 16, h + 16, 32, '#e8b440', 12); lining(g, x - 20, y - 20, w + 40, h + 40, 40, '#5a3a18', 4);
    }
    // gold lining round the lower panels and the lettering
    lining(g, 24, 420, W - 48, H - 510, 18, '#e8b440', 7);
    goldText(g, 'THE  SMOOTH  LINE', W / 2, 560, 120);
    goldText(g, `No ${n}`, 330, 560, 92); goldText(g, `No ${n}`, W - 330, 560, 92);
    g.fillStyle = '#e8b440'; g.fillRect(0, 60, W, 10); g.fillRect(0, 400, W, 4);
  });
}
function tenderSide() {
  return panelTex(2048, 700, (g, W, H) => {
    g.fillStyle = '#174a32'; g.fillRect(0, 0, W, H);
    lining(g, 40, 60, W - 80, H - 120, 40, '#e8b440', 12); lining(g, 70, 90, W - 140, H - 180, 30, '#c8302c', 5);
    goldText(g, 'SMOOTH LINE', W / 2, H / 2 + 6, 150);
    for (let i = 0; i < 26; i++) { g.fillStyle = '#e8b440'; g.beginPath(); g.arc(30 + i * (W - 60) / 25, 24, 7, 0, Math.PI * 2); g.arc(30 + i * (W - 60) / 25, H - 24, 7, 0, Math.PI * 2); g.fill(); }
  });
}
function plateTex(text: string, sub: string) {
  return panelTex(1024, 360, (g, W, H) => {
    g.fillStyle = '#e6b44a'; g.beginPath(); g.roundRect(0, 0, W, H, 60); g.fill();
    g.fillStyle = '#7a1c22'; g.beginPath(); g.roundRect(24, 24, W - 48, H - 48, 44); g.fill();
    goldText(g, text, W / 2, H * 0.42, 110); goldText(g, sub, W / 2, H * 0.76, 62);
  });
}
const plane = (w: number, h: number, t: THREE.Texture, x: number, y: number, z: number, ry: number) => {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.15 }));
  o.position.set(x, y, z); o.rotation.y = ry; return o;
};

function wheel(r: number, x: number, z: number, spokes = 12) {
  const g = new THREE.Group(); g.position.set(x, r, z);
  const out = Math.sign(x);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.05, 32), mat('#7a141a')); disc.rotation.z = Math.PI / 2; g.add(disc);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, r * 0.08, 6, 36), STEEL); tyre.rotation.y = Math.PI / 2; tyre.position.x = out * 0.05; g.add(tyre);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, r * 0.055, 6, 36), RED); rim.rotation.y = Math.PI / 2; rim.position.x = out * 0.06; g.add(rim);
  for (let i = 0; i < spokes; i++) { const s = box(0.04, r * 1.56, 0.05, RED, out * 0.07, 0, 0); s.rotation.x = (i / spokes) * Math.PI; g.add(s); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.24, 0.18, 16), BRASS); hub.rotation.z = Math.PI / 2; hub.position.x = out * 0.06; g.add(hub);
  return g;
}
function shadows<T extends THREE.Object3D>(g: T): T { g.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); return g; }

function makeEngine(): Car {
  const g = new THREE.Group(), wheels: THREE.Object3D[] = [], r: number[] = [];
  g.add(box(2.1, 0.36, 9.4, BLACK, 0, 1.12, 0.1));
  // the boiler: glossy green, five brass bands with a rivet line either side, a brass handrail on posts
  g.add(cylZ(0.86, 0.86, 4.6, GREEN, 0, 2.08, 1.1));
  for (const z of [-1.1, 0.0, 1.1, 2.2, 3.3]) { g.add(cylZ(0.885, 0.885, 0.1, BRASS, 0, 2.08, z)); g.add(rivets(ringPts(0.87, z - 0.09, 28, 2.08).filter(p => p[1] > 1.5), 0.022)); }
  for (const x of [-0.95, 0.95]) { g.add(cylZ(0.025, 0.025, 4.4, BRASS, x, 2.42, 1.2, 8)); for (const z of [-0.6, 0.6, 1.8, 3.0]) g.add(bar([x * 0.93, 2.36, z], [x, 2.42, z], 0.03, BRASS)); }
  // the smokebox: graphite with a brass ring, a hinged door with rivets round it, a brass number plate
  g.add(cylZ(0.92, 0.92, 1.0, GRAPH, 0, 2.08, 3.9));
  g.add(cylZ(0.8, 0.8, 0.06, GRAPH, 0, 2.08, 4.42));
  g.add(ringZ(0.82, 0.06, BRASS, 0, 2.08, 4.43)); g.add(ringZ(0.6, 0.035, BRASS, 0, 2.08, 4.46));
  g.add(rivets(ringPts(0.7, 4.46, 24, 2.08), 0.024));
  g.add(cylZ(0.12, 0.12, 0.08, BRASS, 0, 2.08, 4.48, 16));
  const np = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshStandardMaterial({ map: plateTex('1', ''), metalness: 0.6, roughness: 0.3 })); np.position.set(0, 1.72, 4.47); g.add(np);
  // the funnel: tall, flared, with a brass cap ring
  const fun = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.26, 1.55, 28), BLACK); fun.position.set(0, 3.55, 3.9); g.add(fun);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.36, 0.24, 28), BLACK); lip.position.set(0, 4.4, 3.9); g.add(lip);
  const lipB = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.055, 8, 32), BRASS); lipB.rotation.x = Math.PI / 2; lipB.position.set(0, 4.52, 3.9); g.add(lipB);
  const lipC = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 28), BRASS); lipC.rotation.x = Math.PI / 2; lipC.position.set(0, 2.95, 3.9); g.add(lipC);
  // domes: polished brass with a dark base ring and a gold collar; a whistle and safety valves
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), BRASS); dome.scale.set(1, 1.3, 1.1); dome.position.set(0, 2.82, 1.6); g.add(dome);
  const dBase = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.18, 32), GREEN); dBase.position.set(0, 2.78, 1.6); g.add(dBase);
  const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 8, 32), BRASS); dRing.rotation.x = Math.PI / 2; dRing.position.set(0, 2.87, 1.6); g.add(dRing);
  const sand = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), BRASS); sand.position.set(0, 2.88, 0.0); g.add(sand);
  const sRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 28), BRASS); sRing.rotation.x = Math.PI / 2; sRing.position.set(0, 2.86, 0.0); g.add(sRing);
  const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.14, 28), GREEN); sBase.position.set(0, 2.82, 0.0); g.add(sBase);
  for (const x of [-0.14, 0.14]) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.36, 16), BRASS); v.position.set(x, 3.02, -0.95); g.add(v); }
  const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 16), BRASS); wh.position.set(0, 3.42, -1.55); g.add(wh);
  const whB = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), BRASS); whB.position.set(0, 3.66, -1.55); g.add(whB);
  // the headlamp: a black box with brass edges and rim, a reflector behind a glowing lens, a little chimney
  g.add(box(0.56, 0.48, 0.46, BLACK, 0, 3.15, 4.13));
  for (const [y, h] of [[3.4, 0.04], [2.9, 0.04]] as const) g.add(box(0.6, h, 0.5, BRASS_F, 0, y, 4.13));
  g.add(ringZ(0.2, 0.035, BRASS, 0, 3.15, 4.37));
  const refl = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.12, 24, 1, true), STEEL); refl.rotation.x = -Math.PI / 2; refl.position.set(0, 3.15, 4.32); g.add(refl);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshBasicMaterial({ color: HEADLAMP, toneMapped: false })); lamp.position.set(0, 3.15, 4.375); g.add(lamp);
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), BLACK); chim.position.set(0, 3.48, 4.05); g.add(chim);
  // the cab: green with brass window frames, lining strips, a lettered side plate, handrails, a roof with a brass edge
  g.add(box(2.5, 2.3, 2.5, GREEN_FLAT, 0, 2.45, -2.85));
  g.add(box(2.8, 0.14, 3.0, BLACK, 0, 3.66, -2.85)); g.add(box(2.84, 0.05, 3.04, BRASS_F, 0, 3.58, -2.85));
  const cabPlate = plateTex('SMOOTH LINE', 'No 1');
  for (const x of [-1.26, 1.26]) {
    g.add(box(0.04, 0.7, 0.9, GLASS, x, 2.95, -2.6));
    for (const [dy, dz, w, h] of [[0.37, 0, 0.06, 1.0], [-0.37, 0, 0.06, 1.0], [0, 0.47, 0.8, 0.06], [0, -0.47, 0.8, 0.06]] as const) g.add(box(0.05, h === 1.0 ? 0.06 : w, h === 1.0 ? 1.0 : 0.06, BRASS_F, x * 1.01, 2.95 + dy, -2.6 + dz));
    g.add(box(0.05, 0.08, 2.5, BRASS_F, x, 1.6, -2.85)); g.add(box(0.05, 0.05, 2.5, BRASS_F, x, 3.48, -2.85));
    g.add(plane(0.9, 0.32, cabPlate, x * 1.025, 2.05, -2.85, Math.sign(x) * Math.PI / 2));
    g.add(rivets(linePts([x * 1.01, 1.72, -4.0], [x * 1.01, 1.72, -1.7], 10).map(p => [p[0] + Math.sign(x) * 0.01, p[1], p[2]] as V3), 0.022));
    g.add(cylZ(0.025, 0.025, 1.4, BRASS, x * 1.04, 2.5, -1.68, 8)); g.children[g.children.length - 1].rotation.x = 0;
  }
  for (const x of [-0.6, 0.6]) { g.add(box(0.7, 0.6, 0.04, GLASS, x, 2.95, -1.58)); g.add(ringZ(0.34, 0.03, BRASS, x, 2.95, -1.56)); }
  // running boards with brass edges and a riveted valance, the red buffer beam with buffers
  for (const x of [-1.15, 1.15]) { g.add(box(0.5, 0.06, 6.0, BLACK, x, 1.34, 1.4)); g.add(box(0.03, 0.06, 6.0, BRASS_F, x * 1.2, 1.37, 1.4)); g.add(rivets(linePts([x * 1.215, 1.3, -1.5], [x * 1.215, 1.3, 4.3], 20).map(p => [p[0], p[1], p[2]] as V3), 0.018)); }
  g.add(box(2.6, 0.42, 0.22, RED_F, 0, 1.05, 4.85)); g.add(box(2.64, 0.05, 0.25, BRASS_F, 0, 1.28, 4.85));
  g.add(rivets(linePts([-1.2, 1.05, 4.97], [1.2, 1.05, 4.97], 12), 0.022));
  for (const x of [-0.95, 0.95]) { g.add(cylZ(0.08, 0.08, 0.3, GRAPH, x, 1.05, 5.1, 12)); g.add(cylZ(0.17, 0.17, 0.05, STEEL, x, 1.05, 5.27, 24)); }
  // the cowcatcher: red slats fanning down and forward in a V, a brass top rail
  for (let i = -5; i <= 5; i++) { const x = i * 0.24, tip = 5.75 - Math.abs(x) * 0.45; g.add(bar([x, 0.86, 4.98], [x * 0.92, 0.14, tip], 0.07, RED_F)); }
  g.add(bar([-1.25, 0.88, 4.98], [0, 0.88, 5.05], 0.06, BRASS_F)); g.add(bar([0, 0.88, 5.05], [1.25, 0.88, 4.98], 0.06, BRASS_F));
  g.add(bar([-1.15, 0.16, 5.24], [0, 0.14, 5.75], 0.07, BRASS_F)); g.add(bar([0, 0.14, 5.75], [1.15, 0.16, 5.24], 0.07, BRASS_F));
  // cylinders ahead of the drivers: graphite with brass end caps and rivet rings
  for (const x of [-1.18, 1.18]) { g.add(cylZ(0.34, 0.34, 1.0, GRAPH, x, 0.95, 3.2)); for (const z of [2.7, 3.7]) { g.add(cylZ(0.37, 0.37, 0.06, BRASS, x, 0.95, z)); } }
  // wheels: three red drivers a side, a small leading pair; steel coupling rods and main rods driven by the turn
  const drivers = [-1.5, 0.15, 1.8];
  for (const z of drivers) for (const x of [-1.0, 1.0]) { const w = wheel(0.74, x, z, 14); g.add(w); wheels.push(w); r.push(0.74); }
  for (const z of [3.45, 4.35]) for (const x of [-0.95, 0.95]) { const w = wheel(0.42, x, z, 10); g.add(w); wheels.push(w); r.push(0.42); }
  const CR = 0.34, LROD = 2.2;
  const rods = [-1.16, 1.16].map(x => {
    const couple = box(0.07, 0.14, drivers[2] - drivers[0], STEEL, x, 0.74, 0.15), main = box(0.08, 0.13, LROD, STEEL, x * 1.04, 0.74, 1.2), cross = box(0.12, 0.22, 0.3, BRASS_F, x * 1.04, 0.95, 2.3);
    g.add(couple, main, cross); return { x, couple, main, cross };
  });
  const spin = (dist: number) => {
    rods.forEach(({ x, couple, main, cross }, k) => {
      const th = dist / 0.74 + (k ? Math.PI / 2 : 0); // the two sides a quarter turn apart
      const py = 0.74 + CR * Math.cos(th), pz = CR * Math.sin(th);
      couple.position.set(x, py, (drivers[0] + drivers[2]) / 2 + pz);
      const pin = new THREE.Vector3(x * 1.04, py, drivers[2] + pz), cz = pin.z + Math.sqrt(LROD * LROD - (0.95 - py) ** 2);
      cross.position.set(x * 1.04, 0.95, cz);
      main.position.set(x * 1.04, (py + 0.95) / 2, (pin.z + cz) / 2); main.rotation.set(-Math.atan2(0.95 - py, cz - pin.z), 0, 0);
    });
  };
  spin(0);
  return { group: shadows(g), back: -4.25, front: 5.75, wheels, r, spin };
}
function makeTender(): Car {
  const g = new THREE.Group(), wheels: THREE.Object3D[] = [], r: number[] = [];
  g.add(box(2.5, 1.7, 5.2, GREEN_FLAT, 0, 1.95, 0));
  const side = tenderSide();
  for (const x of [-1.256, 1.256]) g.add(plane(5.2, 1.7, side, x, 1.95, 0, Math.sign(x) * Math.PI / 2));
  g.add(box(2.6, 0.1, 5.3, BRASS_F, 0, 2.82, 0)); g.add(box(2.56, 0.08, 5.26, BRASS_F, 0, 1.12, 0));
  for (let i = 0; i < 18; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + 0.2 * hash(i, 3), 0), BLACK); c.position.set((hash(i, 4) - 0.5) * 1.9, 2.8 + 0.12 * hash(i, 6), (hash(i, 5) - 0.5) * 4.5); g.add(c); }
  g.add(box(2.1, 0.3, 5.4, BLACK, 0, 0.98, 0));
  for (const z of [-1.7, 1.7]) for (const x of [-0.95, 0.95]) { const w = wheel(0.5, x, z, 10); g.add(w); wheels.push(w); r.push(0.5); }
  return { group: shadows(g), back: -2.75, front: 2.75, wheels, r };
}
function makeCoach(seed: number): Car {
  const g = new THREE.Group(), wheels: THREE.Object3D[] = [], r: number[] = [];
  g.add(box(2.7, 2.3, 10.8, GREEN_FLAT, 0, 2.25, 0));
  const side = coachSide(seed + 1);
  for (const x of [-1.356, 1.356]) g.add(plane(10.6, 2.2, side, x, 2.25, 0, Math.sign(x) * Math.PI / 2));
  // the roof: a clerestory with a brass edge and a row of vents
  const RM = mat('#4a3e48'); g.add(box(2.95, 0.22, 11.1, RM, 0, 3.47, 0)); g.add(box(2.1, 0.32, 10.6, RM, 0, 3.72, 0)); g.add(box(2.99, 0.06, 11.14, BRASS_F, 0, 3.37, 0));
  for (let i = 0; i < 6; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 12), BRASS); v.position.set(0, 3.95, -4.2 + i * 1.68); g.add(v); }
  g.add(box(2.2, 0.3, 10.6, BLACK, 0, 1.0, 0));
  // end balconies: brass rails on posts
  for (const zs of [-1, 1]) { const z = zs * 5.55; g.add(bar([-1.2, 1.9, z], [1.2, 1.9, z], 0.05, BRASS_F)); for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(bar([x, 1.15, z], [x, 1.9, z], 0.04, BRASS_F)); }
  for (const z of [-4.2, -3.2, 3.2, 4.2]) for (const x of [-0.95, 0.95]) { const w = wheel(0.45, x, z, 10); g.add(w); wheels.push(w); r.push(0.45); }
  return { group: shadows(g), back: -5.6, front: 5.6, wheels, r };
}

// ---- the path ------------------------------------------------------------------------------------------------------
const START_Z = -120, GAP = 0.55;
type Path = { pts: THREE.Vector3[]; s: number[] };
export function buildPath(track: Track, bent: boolean): Path {
  const pts: THREE.Vector3[] = [];
  const zd = S_Z[0] + (S_Z[1] - S_Z[0]) * 0.5; // the S's steepest point: where it derails
  const zEnd = bent ? zd : 300;
  for (let z = START_Z; z < zEnd; z += 0.25) pts.push(track.centre(z).p);
  if (bent) {
    const c = track.centre(zd), d = c.dir.clone();
    const edge = DECK_W / 2 - 0.2, along = (edge - c.p.x) / Math.max(0.2, d.x);
    for (let s = 0; s <= along; s += 0.25) pts.push(c.p.clone().addScaledVector(d, s));
    // over the edge in a tight bend, then down a line tilted a little outward (about 11 degrees from the vertical), so
    // the hanging chain reads as a rope swung off the deck rather than a plumb line
    const e0 = c.p.clone().addScaledVector(d, along), R = 2.2, OUT = 0.2, aEnd = Math.atan2(1, OUT);
    for (let a = 0.1; a <= aEnd; a += 0.1) pts.push(e0.clone().addScaledVector(d, R * Math.sin(a)).add(new THREE.Vector3(0, -R * (1 - Math.cos(a)), 0)));
    const e1 = pts[pts.length - 1].clone(), down = d.clone().multiplyScalar(OUT).add(new THREE.Vector3(0, -1, 0)).normalize();
    for (let s = 0.25; s < 260; s += 0.5) pts.push(e1.clone().addScaledVector(down, s));
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, s };
}
export function at(P: Path, p: number) {
  const { pts, s } = P, n = s.length;
  if (p <= 0) return pts[0].clone().add(new THREE.Vector3(0, 0, p));
  if (p >= s[n - 1]) return pts[n - 1].clone();
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= p) lo = m; else hi = m; }
  const k = (p - s[lo]) / (s[hi] - s[lo]);
  return pts[lo].clone().lerp(pts[hi], k);
}
// the engine front's distance along the path, frame by frame (C: approach; snap at 368; derail at 104.8; the deck edge
// at 111.8 and straight down from 115.2). Round 2, from the reference's side view: the nose goes over the edge at 410
// and the engine hangs nose down by 415 (keyed about 4 frames ahead of the reference's, since our deck edge is 7 m of sideways skid from the derail); the chain then pays out over the edge like a rope, about a car every 6 frames
// (tender by 421, first coach by 427, three cars down by 433), slowing a little, so at 441 four cars hang and the last
// coach is still pivoting on the deck edge when the blast goes up (442).
const PF = [293, 345, 368, 384, 398, 405, 410, 414, 418, 424, 430, 436, 441, 450, 470];
const PV = [28, 72, 88, 99, 108.3, 112.4, 115.6, 119.4, 123.6, 131, 138.5, 145, 150, 163, 205];
export const frontP = (f: number) => curve(PF, PV, f);
export const SKID = [386, 402] as const;

export interface Train { group: THREE.Group; update(f: number): void; funnelAt(f: number): V3 | null; frontAt(f: number): V3 | null }
export function makeTrain(track: Track): Train {
  const group = new THREE.Group();
  const cars = [makeEngine(), makeTender(), makeCoach(1), makeCoach(2), makeCoach(3)];
  cars.forEach(c => group.add(c.group));
  // the bent path is laid on the S itself: bend the track for a moment to read its curve, then put it back
  const was = track.bend;
  track.setBend(null); const straight = buildPath(track, false);
  track.setBend(sBend); const bent = buildPath(track, true); const derailDir = track.centre(S_Z[0] + (S_Z[1] - S_Z[0]) * 0.5).dir;
  track.setBend(was);
  const paths = { straight, bent };
  const Y = new THREE.Vector3(0, 1, 0);
  const M = new THREE.Matrix4();
  /** the world matrix of car i at frame f */
  const pose = (i: number, f: number) => {
    const P = f >= SNAP_F ? paths.bent : paths.straight;
    let p = frontP(f);
    for (let j = 0; j < i; j++) p -= (cars[j].front - cars[j].back) + GAP;
    const c = cars[i], len = c.front - c.back;
    const a = at(P, p), b = at(P, p - len), fw = a.clone().sub(b).normalize();
    const fh = new THREE.Vector3(fw.x, 0, fw.z);
    const side = (fh.lengthSq() > 0.04 ? Y.clone().cross(fh) : Y.clone().cross(derailDir)).normalize();
    const up = fw.clone().cross(side);
    M.makeBasis(side, up, fw);
    // the engine's skid (a further 0.6 rad of yaw on the deck) fades as it tips over the edge, so the hanging engine
    // lines up with the chain instead of swinging out of it (round 1's engine read as falling clear)
    if (i === 0) M.multiply(new THREE.Matrix4().makeRotationY(0.6 * smooth(prog(f, SKID[0], SKID[1])) * Math.min(1, fh.length())));
    const origin = a.clone().addScaledVector(new THREE.Vector3().setFromMatrixColumn(M, 2), -c.front);
    M.setPosition(origin);
    return { m: M.clone(), p };
  };
  const local = (i: number, f: number, v: V3): V3 | null => {
    if (f < 290) return null;
    const { m } = pose(i, f), w = new THREE.Vector3(...v).applyMatrix4(m);
    return [w.x, w.y, w.z];
  };
  return {
    group,
    update(f: number) {
      group.visible = f >= 290;
      cars.forEach((c, i) => {
        const { m, p } = pose(i, f);
        c.group.matrixAutoUpdate = false; c.group.matrix.copy(m); c.group.matrixWorldNeedsUpdate = true;
        c.wheels.forEach((w, k) => { w.rotation.x = Math.min(p, 115) / c.r[k]; });
        c.spin?.(Math.min(p, 115));
      });
    },
    funnelAt: (f: number) => local(0, f, [0, 4.55, 3.9]),
    frontAt: (f: number) => local(0, f, [0, 0.2, 4.9]),
  };
}
