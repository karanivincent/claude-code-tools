// The lake and the cliff at dusk, built the cartoon-3d-short way (boxes and rocks in the template's two-tone Lambert,
// painted Canvas2D textures, ink on every edge). Party props on top (string lights, a cooler, a speaker); the lake's
// splash, rings, bubbles and Josh's floating cap are here too. Self-lit things (bulbs, sky glow) go over 1.0 for bloom.
import * as THREE from "three";
import { twoTone } from "./shade";
import { NOINK } from "./ink";
import { TOP, SPLASH_AT, SPLASH_RISE as SPLASH_F, V3, clamp01, smooth, FPS, joshAt, CAP_OFF } from "./story"; // spike 7: the splash rises after the entry
import { staticFile } from "remotion";
export const FAR_IMG: { img: HTMLImageElement | null } = { img: null };
export const FAR_SRC = () => staticFile("practice-cliff/far.jpg");

const rnd = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); return t;
};
const hex = (c: string, k: number) => { const n = parseInt(c.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const dabs = (g: CanvasRenderingContext2D, w: number, h: number, base: string, n: number, seed: number, amp = 0.07, size = 40) => {
  for (let i = 0; i < n; i++) {
    const x = rnd(seed + i) * w, y = rnd(seed + i * 1.7 + 3) * h, r = size * (0.4 + rnd(seed + i * 2.3) * 0.9);
    g.fillStyle = hex(base, 1 + amp * (rnd(seed + i * 3.1) * 2 - 1)); g.globalAlpha = 0.55;
    g.beginPath(); g.ellipse(x, y, r * 1.6, r * 0.7, rnd(seed + i * 4.7) * 3.14, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
};
/** limestone in strata: cream and ochre bands, dark seams, a few cracks */
const strata = (seed: number) => canvasTex(1024, 1024, (g) => {
  const cols = ["#cdb78f", "#bfa47a", "#d6c39c", "#b08f66", "#c8ad83", "#a98760"];
  let y = 0, i = 0;
  while (y < 1024) { const h = 60 + 110 * rnd(seed + i); g.fillStyle = cols[i % cols.length]; g.fillRect(0, y, 1024, h + 2); dabs(g, 1024, h, cols[i % cols.length], 30, seed + i * 9, 0.06, 26); g.fillStyle = "rgba(60,40,30,0.35)"; g.fillRect(0, y + h - 5, 1024, 5); y += h; i++; }
  g.strokeStyle = "rgba(60,40,30,0.4)"; g.lineWidth = 3;
  for (let k = 0; k < 9; k++) { let x = rnd(seed + 50 + k) * 1024, yy = rnd(seed + 60 + k) * 900; g.beginPath(); g.moveTo(x, yy); for (let s = 0; s < 4; s++) { x += (rnd(seed + k * 7 + s) - 0.5) * 50; yy += 30 + rnd(k + s) * 40; g.lineTo(x, yy); } g.stroke(); }
});
/** dry summer grass on the top */
const grass = () => canvasTex(512, 512, (g) => { g.fillStyle = "#8f9a52"; g.fillRect(0, 0, 512, 512); dabs(g, 512, 512, "#9aa85a", 220, 3, 0.12, 16); g.strokeStyle = "#6c7a3a"; g.lineWidth = 2; for (let i = 0; i < 400; i++) { const x = rnd(i) * 512, y = rnd(i + 0.5) * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 9); g.stroke(); } }, [6, 6]);
/** the lake: deep teal with long glints reflecting the dusk sky */
const lakeTex = () => canvasTex(1024, 1024, (g) => {
  g.fillStyle = "#2f6a78"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) { const x = rnd(i) * 1024, y = rnd(i + 0.3) * 1024, w = 30 + 120 * rnd(i + 0.7); g.fillStyle = rnd(i + 0.9) > 0.5 ? "rgba(255,190,150,0.28)" : "rgba(20,50,70,0.3)"; g.fillRect(x, y, w, 3 + 3 * rnd(i + 1.3)); }
}, [14, 14]);
/** dusk sky, top to horizon */
const skyTex = () => canvasTex(16, 512, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#151a36"); gr.addColorStop(0.35, "#463c70"); gr.addColorStop(0.6, "#c8728a"); gr.addColorStop(0.8, "#f4a074"); gr.addColorStop(0.92, "#ffd08a"); gr.addColorStop(1, "#ffd99a");
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
});

// ---------------- spike 5: world, light and effects only ----------------
// value noise + fbm for rock shape
const h2 = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const vn = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f); a *= 0.5; f *= 2.03; } return s; };
/** limestone face texture: warm cream blocks, horizontal bedding, vertical joints, lichen and water stains */
const faceTex = () => canvasTex(2048, 1024, (g) => {
  g.fillStyle = "#cfb48a"; g.fillRect(0, 0, 2048, 1024);
  const beds = [0, 120, 210, 380, 470, 640, 760, 900, 1024], cols = ["#d8bf94", "#c4a476", "#dcc69e", "#b9976a", "#d1b386", "#c09d70", "#d6bc90", "#b08a5e"];
  for (let i = 0; i < beds.length - 1; i++) { g.fillStyle = cols[i]; g.fillRect(0, beds[i], 2048, beds[i + 1] - beds[i]); dabs(g, 2048, beds[i + 1] - beds[i], cols[i], 120, 40 + i * 7, 0.08, 30); }
  // bedding seams, dark and slightly wavy
  for (let i = 1; i < beds.length - 1; i++) { g.strokeStyle = "rgba(70,45,30,0.55)"; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= 2048; x += 32) g.lineTo(x, beds[i] + 6 * Math.sin(x * 0.01 + i)); g.stroke(); }
  // vertical joints, offset per bed
  g.strokeStyle = "rgba(60,38,26,0.5)"; g.lineWidth = 5;
  for (let i = 0; i < beds.length - 1; i++) for (let k = 0; k < 5; k++) { if (rnd(i * 7 + k * 3) < 0.35) continue; const x = (k * 410 + rnd(i * 13 + k) * 150 + i * 70) % 2048; g.beginPath(); g.moveTo(x, beds[i]); g.lineTo(x + 10 * (rnd(k + i) - 0.5), beds[i + 1]); g.stroke(); }
  // rain stains running down
  for (let k = 0; k < 40; k++) { const x = rnd(k + 300) * 2048, y = rnd(k + 400) * 500, gr = g.createLinearGradient(0, y, 0, y + 400); gr.addColorStop(0, "rgba(90,70,60,0.25)"); gr.addColorStop(1, "rgba(90,70,60,0)"); g.fillStyle = gr; g.fillRect(x, y, 10 + 30 * rnd(k), 400); }
  // lichen speckle and a darker wet band at the foot
  for (let k = 0; k < 900; k++) { g.fillStyle = rnd(k + 9) > 0.6 ? "rgba(120,130,80,0.35)" : "rgba(80,60,45,0.25)"; g.beginPath(); g.arc(rnd(k + 11) * 2048, rnd(k + 17) * 1024, 2 + 6 * rnd(k + 19), 0, 7); g.fill(); }
  const w = g.createLinearGradient(0, 860, 0, 1024); w.addColorStop(0, "rgba(40,50,50,0)"); w.addColorStop(1, "rgba(40,50,50,0.6)"); g.fillStyle = w; g.fillRect(0, 860, 2048, 164);
}, [3, 1]);
/** moving water: glints along the swell, a warm sky reflection band */
const waterTex = () => canvasTex(1024, 1024, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, "#2c6f80"); gr.addColorStop(1, "#245a6e"); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 520; i++) { const x = rnd(i) * 1024, y = rnd(i + 0.3) * 1024, w = 20 + 90 * rnd(i + 0.7); g.fillStyle = rnd(i + 0.9) > 0.55 ? "rgba(255,200,150,0.30)" : (rnd(i + 2.1) > 0.5 ? "rgba(150,210,230,0.22)" : "rgba(15,45,60,0.35)"); g.beginPath(); g.ellipse(x, y, w, 2 + 3 * rnd(i + 1.3), 0, 0, 7); g.fill(); }
}, [16, 16]);
const sparkTex = () => canvasTex(512, 512, (g) => {
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) { const x = rnd(i + 50) * 512, y = rnd(i + 60) * 512, w = 6 + 26 * rnd(i + 70); g.fillStyle = `rgba(255,${200 + 40 * rnd(i)},150,${0.5 + 0.5 * rnd(i + 80)})`; g.beginPath(); g.ellipse(x, y, w, 1.5, 0, 0, 7); g.fill(); }
}, [10, 10]);
const glowTex = (inner: string, outer: string) => canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
const flameTex = () => canvasTex(128, 256, (g) => {
  const r = g.createRadialGradient(64, 190, 4, 64, 170, 120); r.addColorStop(0, "rgba(255,250,200,1)"); r.addColorStop(0.3, "rgba(255,190,70,0.95)"); r.addColorStop(0.65, "rgba(240,90,30,0.7)"); r.addColorStop(1, "rgba(200,40,20,0)");
  g.fillStyle = r; g.beginPath(); g.moveTo(64, 0); g.bezierCurveTo(110, 110, 124, 200, 64, 250); g.bezierCurveTo(4, 200, 18, 110, 64, 0); g.fill();
});
const birdTex = () => canvasTex(128, 64, (g) => { g.strokeStyle = "#2a2030"; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(8, 18); g.quadraticCurveTo(36, 22, 64, 44); g.quadraticCurveTo(92, 22, 120, 18); g.stroke(); });
const foamTex = () => canvasTex(512, 512, (g) => {
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) { const a = rnd(i) * 6.283, rr = 120 + 120 * Math.pow(rnd(i + 3), 0.6), x = 256 + rr * Math.cos(a), y = 256 + rr * Math.sin(a); g.fillStyle = `rgba(240,250,255,${0.4 + 0.5 * rnd(i + 7)})`; g.beginPath(); g.arc(x, y, 6 + 18 * rnd(i + 9), 0, 7); g.fill(); }
  for (let i = 0; i < 80; i++) { const a = rnd(i + 200) * 6.283, rr = 80 * rnd(i + 210); g.fillStyle = "rgba(230,245,255,0.35)"; g.beginPath(); g.arc(256 + rr * Math.cos(a), 256 + rr * Math.sin(a), 10 + 20 * rnd(i), 0, 7); g.fill(); }
});

export type World = { root: THREE.Group; update: (f: number) => void };

export function buildWorld(): World {
  const root = new THREE.Group();
  const lam = (map: THREE.Texture | null, color = "#ffffff", vc = false) => twoTone(new THREE.MeshLambertMaterial({ map, color, vertexColors: vc }));
  const add = (m: THREE.Mesh, cast = true) => { m.castShadow = cast; m.receiveShadow = true; root.add(m); return m; };
  const basic = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, ...o });
  // sky dome (above the far picture) and the far band: one Higgsfield picture on a curved screen
  const sky = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false }));
  sky.layers.set(NOINK); root.add(sky);
  const farM = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false });
  const R = 88, ARC = 1.9, H = (R * ARC) / (1344 / 576), MID = Math.atan2(-0.62, -0.78);
  const far = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true, MID - ARC / 2, ARC), farM);
  far.position.set(0, H / 2 - 0.12 * H + 1.2, 0); far.layers.set(NOINK); far.renderOrder = -1; root.add(far);
  { // the picture is preloaded by PracticeCliff (FAR_IMG) before the canvas mounts
    const img = FAR_IMG.img!, c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0); g.globalCompositeOperation = "destination-out"; const gr = g.createLinearGradient(0, c.height * 0.86, 0, c.height); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)"); g.fillStyle = gr; g.fillRect(0, c.height * 0.86, c.width, c.height * 0.14);
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace; ct.wrapS = THREE.RepeatWrapping; ct.repeat.x = -1; ct.offset.x = 1; ct.anisotropy = 8; farM.map = ct;
  }
  // the lake: moving water, a warm reflection band of sparkles, darker under the cliff
  const wTex = waterTex();
  const lake = add(new THREE.Mesh(new THREE.CircleGeometry(86, 96), lam(wTex)), false); lake.rotation.x = -Math.PI / 2;
  const spk = sparkTex(); const sparkM = basic({ map: spk, blending: THREE.AdditiveBlending, opacity: 0.55, color: new THREE.Color("#ffd2a0").multiplyScalar(1.6) });
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), sparkM); spark.rotation.x = -Math.PI / 2; spark.position.set(20, 0.015, -20); spark.layers.set(NOINK); root.add(spark);
  const shadeW = new THREE.Mesh(new THREE.PlaneGeometry(4, 40), basic({ map: glowTex("rgba(10,25,35,0.55)", "rgba(10,25,35,0)"), opacity: 1 })); shadeW.rotation.x = -Math.PI / 2; shadeW.scale.set(1, 1, 1); shadeW.position.set(0.8, 0.01, -6); shadeW.layers.set(NOINK); root.add(shadeW);
  // the cliff: a block whose lake face is a displaced rock surface (bulges, ledges, an undercut at the foot)
  const SEG_Y = 40, SEG_Z = 140;
  const geo = new THREE.BoxGeometry(30, TOP + 1, 40, 1, SEG_Y, SEG_Z);
  const pos = geo.attributes.position as THREE.BufferAttribute, colA: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), ly = pos.getY(i) + (TOP - 1) / 2, lz = pos.getZ(i) - 6; // world y and z
    let shade = 1;
    if (lx > 14.9) {
      const top = smooth(clamp01((TOP - ly) / 0.5)), lipZone = smooth(clamp01((Math.abs(lz - 0.1) - 1.2) / 0.8));
      const ledge = 0.18 * Math.round(fbm(ly * 0.9, lz * 0.15) * 4) / 4;                    // stepped bedding ledges
      const bulge = 0.9 * (fbm(lz * 0.22, ly * 0.18, 5) - 0.5) + 0.35 * (fbm(lz * 0.9, ly * 0.9, 3) - 0.5);
      const under = -0.45 * smooth(clamp01((0.9 - ly) / 0.9));                              // water-cut notch
      const d = top * (bulge + ledge + under) * (0.35 + 0.65 * lipZone) - 0.12 * (1 - lipZone) * top;
      pos.setX(i, lx + d);
      shade = 0.78 + 0.32 * clamp01(0.5 + d * 1.1) - 0.18 * smooth(clamp01((0.6 - ly) / 0.6));
    }
    colA.push(shade, shade, shade);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3)); geo.computeVertexNormals();
  const faceM = lam(faceTex(), "#ffffff", true);
  const block = add(new THREE.Mesh(geo, faceM)); block.position.set(-15, (TOP - 1) / 2, -6);
  // rocks: noisy icosahedra (buttresses on the face, boulders at the foot, a few on the top)
  const rockGeo = (r: number, seed: number, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position as THREE.BufferAttribute, cl: number[] = [];
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), n = v.clone().normalize(); const k = 1 + 0.28 * (fbm(n.x * 2 + seed, n.y * 2 + n.z * 1.7, 4) - 0.5) + 0.12 * Math.round(fbm(n.y * 3 + seed, n.z * 3, 2) * 3) / 3; v.multiplyScalar(k); p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz); const c = 0.8 + 0.25 * clamp01(n.y + 0.4); cl.push(c, c, c); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
  };
  const rockM = lam(strata(17), "#ffffff", true);
  for (let i = 0; i < 7; i++) { const z = -16 + i * 4.6 + 1.5 * rnd(i + 70); if (Math.abs(z) < 2.6) continue; const b = add(new THREE.Mesh(rockGeo(1, i * 3.3, 0.9, 2.2 + rnd(i) * 1.2, 1.4), rockM)); b.position.set(-0.2, 1.4 + rnd(i + 3) * 1.2, z); b.rotation.y = rnd(i + 5) * 3; }
  for (let i = 0; i < 12; i++) {
    const r = 0.35 + 0.75 * rnd(i + 20), b = add(new THREE.Mesh(rockGeo(r, i * 1.7 + 9, 1.3, 0.75, 1.1), rockM)); b.position.set(0.5 + 1.4 * rnd(i + 21), r * 0.2, -10 + i * 1.8 + rnd(i + 22)); if (Math.abs(b.position.z) < 2.6) b.position.z += b.position.z < 0 ? -2.6 : 2.6;
    if (b.position.z > -9 && b.position.z < 3.5) b.visible = false; // spike 7: none behind his fall in the side view (he read as landing on them) b.rotation.y = rnd(i) * 3;
  }
  // the lip where Josh stands
  { const g = rockGeo(1, 4.2, 0.78, 1.25, 1.2), p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.7) p.setY(i, 0.7); g.computeVertexNormals();
    const lip = add(new THREE.Mesh(g, rockM)); lip.position.set(-0.42, TOP - 0.7, 0.1); }
  const turf = add(new THREE.Mesh(new THREE.BoxGeometry(29.2, 0.08, 40), lam(grass())), false); turf.position.set(-15.4, TOP + 0.04, -6);
  // grass tufts along the edge and a mid band of oaks on the top (lumpy canopies, real trunks)
  const leafM = lam(null, "#ffffff", true), trunkM = lam(null, "#5a3e2c");
  const canopy = (r: number, seed: number, tint: [number, number, number]) => { const g = rockGeo(r, seed, 1.1, 0.85, 1.1); const c = g.attributes.color as THREE.BufferAttribute; for (let i = 0; i < c.count; i++) { const k = c.getX(i); c.setXYZ(i, tint[0] * k, tint[1] * k, tint[2] * k); } return g; };
  const oak = (x: number, z: number, s: number, seed: number) => {
    const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.2 * s, 8), trunkM)); t.position.set(x, TOP + 1.1 * s, z);
    for (let k = 0; k < 4; k++) { const c = add(new THREE.Mesh(canopy((0.9 + 0.5 * rnd(seed + k)) * s, seed + k, [0.18, 0.3 + 0.05 * rnd(seed + k), 0.19]), leafM)); c.position.set(x + (rnd(seed + k * 3) - 0.5) * 1.6 * s, TOP + (2.3 + 0.8 * rnd(seed + k * 5)) * s, z + (rnd(seed + k * 7) - 0.5) * 1.6 * s); }
  };
  oak(-14, -4, 2.0, 7); oak(-17, -11, 2.3, 19); oak(-21, -13, 1.8, 13); oak(-19, 2, 2.2, 31); oak(-15, 7, 2.0, 25);
  for (let i = 0; i < 26; i++) { const z = -14 + i * 1.1 + rnd(i + 90) * 0.6; if (Math.abs(z - 0.1) < 1.3) continue; const b = add(new THREE.Mesh(canopy(0.22 + 0.18 * rnd(i), i + 120, [0.45, 0.55, 0.28]), leafM), false); b.position.set(-0.35 - 0.5 * rnd(i + 91), TOP + 0.1, z); }
  // party on top: cooler, speaker, cups, two poles of string lights
  const cool = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.4), lam(null, "#3f8fcf"))); cool.position.set(-3.0, TOP + 0.27, -0.3); // spike 7: out from behind his crouch (read as sitting on it)
  const lid = add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.07, 0.44), lam(null, "#f1efe6"))); lid.position.set(-3.0, TOP + 0.49, -0.3);
  const spkr = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.26), lam(null, "#2b2a33"))); spkr.position.set(-3.2, TOP + 0.33, -1.6);
  for (const [x, z] of [[-2.85, -0.4], [-3.12, -0.22], [-3.0, 0.3]] as [number, number][]) { const c = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 10), lam(null, "#d33a33"))); c.position.set(x, z > 0 ? TOP + 0.14 : TOP + 0.59, z); }
  const pole = lam(null, "#6b4a32"), P1: V3 = [-0.25, TOP, -3.7], P2: V3 = [-4.6, TOP, -0.6];
  for (const p of [P1, P2]) { const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), pole)); m.position.set(p[0], TOP + 1.3, p[2]); }
  const wire: THREE.Vector3[] = [], bulbs = new THREE.Group(); root.add(bulbs);
  const bulbCols = ["#ffd27a", "#ff9a6a", "#fff0b0", "#ffb86a"];
  const halo = glowTex("rgba(255,200,120,0.9)", "rgba(255,160,80,0)");
  for (let i = 0; i <= 16; i++) {
    const k = i / 16, x = P1[0] + (P2[0] - P1[0]) * k, z = P1[2] + (P2[2] - P1[2]) * k, y = TOP + 2.5 - 0.55 * Math.sin(Math.PI * k);
    wire.push(new THREE.Vector3(x, y, z));
    if (i > 0 && i < 16) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(bulbCols[i % 4]).multiplyScalar(3), fog: false })); b.position.set(x, y - 0.07, z); b.layers.set(NOINK); bulbs.add(b);
      const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false })); hs.scale.setScalar(0.45); hs.position.copy(b.position); hs.layers.set(NOINK); bulbs.add(hs); }
  }
  const wireM = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire), 40, 0.008, 4), new THREE.MeshBasicMaterial({ color: "#241726" })); root.add(wireM);
  // a campfire behind the party: stone ring, logs, flickering tongues, embers, a warm glow on the grass
  const FIRE: V3 = [-4.4, TOP, -4.6];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283, s = add(new THREE.Mesh(rockGeo(0.13, i + 50, 1.2, 0.7, 1), rockM)); s.position.set(FIRE[0] + 0.42 * Math.cos(a), TOP + 0.08, FIRE[2] + 0.42 * Math.sin(a)); }
  for (let i = 0; i < 3; i++) { const l = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), trunkM)); l.position.set(FIRE[0], TOP + 0.1, FIRE[2]); l.rotation.set(Math.PI / 2, 0, i * 1.05); }
  const fGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), basic({ map: glowTex("rgba(255,150,60,0.75)", "rgba(255,120,40,0)"), blending: THREE.AdditiveBlending })); fGlow.rotation.x = -Math.PI / 2; fGlow.position.set(FIRE[0], TOP + 0.1, FIRE[2]); fGlow.layers.set(NOINK); root.add(fGlow);
  const fT = flameTex(), flames: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fT, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(1.8, 1.4, 1.0) })); s.layers.set(NOINK); root.add(s); flames.push(s); }
  const emberM = new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(2.5, 1.2, 0.4) });
  const embers: THREE.Sprite[] = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(emberM); s.layers.set(NOINK); root.add(s); embers.push(s); }
  // fireflies over the grass and birds crossing the far sky
  const flyM = new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(2.2, 2.4, 0.9) });
  const flies: THREE.Sprite[] = []; for (let i = 0; i < 22; i++) { const s = new THREE.Sprite(flyM); s.layers.set(NOINK); root.add(s); flies.push(s); }
  const bT = birdTex(), birds: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), basic({ map: bT, side: THREE.DoubleSide })); b.layers.set(NOINK); root.add(b); birds.push(b); }
  // the lake's answer: rings, a foam disc, a spray of drops, bubbles that stop, and his cap
  const ringMats: THREE.MeshBasicMaterial[] = [], rings: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = basic({ color: "#eaf7ff", opacity: 0 });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.0, 96), m); r.rotation.x = -Math.PI / 2; r.position.set(SPLASH_AT[0], 0.02 + i * 0.002, SPLASH_AT[2]); r.layers.set(NOINK); root.add(r); rings.push(r); ringMats.push(m);
  }
  const foamM = basic({ map: foamTex(), opacity: 0 }); const foam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), foamM); foam.rotation.x = -Math.PI / 2; foam.position.set(SPLASH_AT[0], 0.03, SPLASH_AT[2]); foam.layers.set(NOINK); root.add(foam);
  const N = 90, dotT = glowTex("rgba(240,250,255,1)", "rgba(220,240,255,0)");
  const dGeo = [0, 1].map(() => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((N / 2) * 3), 3)));
  const dropSets = dGeo.map((g, k) => { const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: dotT, size: k ? 0.2 : 0.11, transparent: true, depthWrite: false, fog: false, color: "#eef9ff" })); pts.layers.set(NOINK); pts.frustumCulled = false; root.add(pts); return pts; });
  const dv = Array.from({ length: N }, (_, i) => { const a = rnd(i + 500) * 6.283, sp = 0.6 + 2.4 * rnd(i + 510), up = 2 + 5.5 * Math.pow(rnd(i + 520), 1.3), r0 = 0.1 + 0.35 * rnd(i + 530); return { a, sp, up, r0, t0: 4 * rnd(i + 550) }; });
  // the water column and crown: lathed, noisy, translucent water with a white core (replaces the paper card)
  const streak = canvasTex(256, 256, (g) => { const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, "#9fd6f0"); gr.addColorStop(0.5, "#f2fbff"); gr.addColorStop(1, "#9fd6f0"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * rnd(i + 800)})`; g.fillRect(rnd(i + 810) * 256, 0, 2 + 6 * rnd(i + 820), 256); } g.globalCompositeOperation = "destination-out"; const fo = g.createLinearGradient(0, 0, 0, 110); fo.addColorStop(0, "rgba(0,0,0,0.85)"); fo.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = fo; g.fillRect(0, 0, 256, 110); }, [3, 1]);
  const waterM = new THREE.MeshBasicMaterial({ map: streak, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: true, fog: false });
  const prof = [[0.5, 0], [0.38, 0.25], [0.3, 0.6], [0.24, 0.85], [0.14, 1.0], [0.0, 1.06]].map(([r, y]) => new THREE.Vector2(r, y));
  const colG = new THREE.LatheGeometry(prof, 32); { const p = colG.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.35 * (fbm(a * 2 + 5, y * 4, 3) - 0.5); p.setXYZ(i, x * k, y, z * k); } colG.computeVertexNormals(); }
  const column = new THREE.Mesh(colG, waterM); column.layers.set(NOINK); column.position.set(SPLASH_AT[0], 0, SPLASH_AT[2]); root.add(column);
  const core = new THREE.Mesh(colG, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, fog: false })); core.layers.set(NOINK); core.position.copy(column.position); root.add(core);
  const crG = new THREE.CylinderGeometry(1, 0.5, 1, 48, 3, true); { const p = crG.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.45) { const a = Math.atan2(p.getZ(i), p.getX(i)), sp = Math.pow(Math.abs(Math.sin(a * 6 + 0.6 * Math.sin(a * 3))), 1.6); p.setY(i, y + 0.45 * sp + 0.08 * rnd(i)); } } crG.translate(0, 0.5, 0); crG.computeVertexNormals(); }
  const crown = new THREE.Mesh(crG, new THREE.MeshBasicMaterial({ map: streak, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false })); crown.layers.set(NOINK); crown.position.copy(column.position); root.add(crown);
  const bubM = new THREE.MeshBasicMaterial({ color: "#dff4ff", transparent: true, opacity: 0, depthWrite: false });
  const bubs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05 + 0.03 * rnd(i), 10, 6), bubM); b.layers.set(NOINK); root.add(b); bubs.push(b); }
  const cap = new THREE.Group();
  const capM = lam(null, "#e2453c");
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM); dome.castShadow = true;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16, 1, false, 0, Math.PI), capM); brim.position.set(0.12, 0.0, 0); brim.scale.set(1.2, 1, 0.9);
  cap.add(dome, brim); cap.visible = false; root.add(cap);
    const update = (f: number) => {
    const s = f - SPLASH_F, t = f / FPS;
    wTex.offset.set(0.02 * t, 0.035 * t); spk.offset.set(-0.03 * t, 0.05 * t + 0.02 * Math.sin(t * 2)); sparkM.opacity = 0.45 + 0.15 * Math.sin(t * 5.1);
    rings.forEach((r, i) => { const k = (s - 3 - i * 7) / 52; const on = k > 0 && k < 1; r.visible = on; if (on) { const sc = 0.3 + 3.6 * Math.sqrt(k); r.scale.set(sc, sc * (1 + 0.04 * Math.sin(i + f * 0.2)), 1); ringMats[i].opacity = 0.8 * (1 - k) * (i === 0 ? 1 : 0.7); } });
    const fk = clamp01(s / 30); foam.visible = s > 0 && s < 110; foam.scale.setScalar(0.6 + 2.6 * Math.sqrt(fk)); foamM.opacity = s > 0 ? 0.85 * (1 - smooth((s - 20) / 90)) : 0; foam.rotation.z = 0.01 * s;
    // drops: thrown on contact over ~4 frames, fall under gravity, gone when they land
    dGeo.forEach((g, k) => { const a = g.attributes.position as THREE.BufferAttribute; for (let j = 0; j < N / 2; j++) { const d = dv[j * 2 + k], tt = (s - d.t0) / FPS; let y = -9, rr = 0; if (tt > 0) { y = d.up * tt - 9.8 * tt * tt * 0.5; rr = d.r0 + d.sp * tt; if (y < -0.02) y = -9; } a.setXYZ(j, SPLASH_AT[0] + rr * Math.cos(d.a), y + 0.05, SPLASH_AT[2] + rr * Math.sin(d.a)); } a.needsUpdate = true; });
    dropSets.forEach((p) => (p.visible = s > 0 && s < 60));
    // column and crown on the card's old timing (21 frames from 2 before contact)
    const st = (f - SPLASH_F + 2) / 21, up = st > 0 && st < 1 ? Math.sin(Math.min(1, st * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, (st - 0.45) / 0.55) ** 1.5) : 0;
    column.visible = core.visible = up > 0.02; crown.visible = st > 0 && st < 1.25;
    if (column.visible) { column.scale.set(0.75 + 0.45 * st, 2.0 * up, 0.75 + 0.45 * st); core.scale.set(0.4 + 0.25 * st, 1.75 * up, 0.4 + 0.25 * st); column.rotation.y = core.rotation.y = 0.3 * st; }
    if (crown.visible) { const cu = Math.sin(Math.min(1, st * 2.2) * Math.PI * 0.5) * (1 - smooth((st - 0.35) / 0.9)); crown.scale.set(0.45 + 1.0 * st, 1.0 * cu + 0.01, 0.45 + 1.0 * st); (crown.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - smooth((st - 0.45) / 0.6)); }
    bubM.opacity = s > 14 && s < 44 ? 0.85 : 0;
    bubs.forEach((b, i) => { const ph = ((s + i * 6) % 12) / 12; b.position.set(SPLASH_AT[0] + 0.25 * (rnd(i) - 0.5), 0.02 + 0.05 * Math.sin(ph * Math.PI), SPLASH_AT[2] + 0.3 * (rnd(i + 5) - 0.5)); b.scale.setScalar(ph < 0.85 ? 1 : 0.2); });
    // spike 7: the cap comes off at the top of his arc, trails above him and lands on the water alone
    cap.visible = f >= CAP_OFF;
    if (cap.visible) {
      const h = joshAt(CAP_OFF).pos, tau = (f - CAP_OFF) / FPS, y0 = h[1] + 1.7, y = y0 - 1.0 * tau - 5.5 * tau * tau;
      const tl = (-1.0 + Math.sqrt(1 + 22 * y0)) / 11, tt = Math.min(tau, tl), fl = Math.max(0, tau - tl);
      cap.position.set(h[0] + 1.56 * tt + 0.12 * fl, Math.max(0.03, y) + (y <= 0.03 ? 0.025 * Math.sin(f * 0.21) : 0), h[2] + 1.1 * tt + 0.25 * fl); // r4: it lands in front of the splash, alone
      cap.rotation.set(0.6 * Math.sin(tau * 9) * (y > 0.03 ? 1 : 0.15), 1.2 + 5 * tt, 0.5 * Math.sin(tau * 7) * (y > 0.03 ? 1 : 0.2));
    }
    if (false) { const k = smooth(clamp01((s - 6) / 16)); cap.position.set(SPLASH_AT[0] + 0.35 * k + 0.004 * Math.max(0, s - 22), 0.03 + 0.9 * Math.sin(Math.PI * clamp01((s - 6) / 16)) + 0.025 * Math.sin(f * 0.21), SPLASH_AT[2] + 1.1 * k + 0.006 * Math.max(0, s - 22)); cap.rotation.set(0.15 * Math.sin(f * 0.17), 1.2 + 4 * (1 - k), 0.12 * Math.sin(f * 0.23)); }
    bulbs.children.forEach((b, i) => b.scale.multiplyScalar(1).setScalar((b instanceof THREE.Sprite ? 0.45 : 1) * (0.9 + 0.12 * Math.sin(f * 0.3 + i))));
    flames.forEach((fl, i) => { const ph = f * 0.45 + i * 1.7, h = 0.55 + 0.25 * Math.sin(ph) + 0.12 * Math.sin(ph * 2.3); fl.scale.set(0.32 + 0.06 * Math.sin(ph * 1.3), h, 1); fl.position.set(FIRE[0] + 0.12 * Math.sin(i * 2.1), TOP + 0.12 + h / 2, FIRE[2] + 0.12 * Math.cos(i * 2.1)); });
    (fGlow.material as THREE.MeshBasicMaterial).opacity = 0.85 + 0.15 * Math.sin(f * 0.7);
    embers.forEach((e, i) => { const ph = ((f + i * 9) % 45) / 45; e.position.set(FIRE[0] + 0.3 * Math.sin(i * 3 + ph * 4), TOP + 0.3 + 2.2 * ph, FIRE[2] + 0.3 * Math.cos(i * 5 + ph * 3)); e.scale.setScalar(0.07 * (1 - ph)); });
    flies.forEach((fl, i) => { const bx = -1.2 - 4 * rnd(i + 600), bz = -5 + 7 * rnd(i + 610); fl.position.set(bx + 0.4 * Math.sin(f * 0.04 + i), TOP + 0.4 + 1.2 * rnd(i + 620) + 0.2 * Math.sin(f * 0.06 + i * 2), bz + 0.4 * Math.cos(f * 0.05 + i)); fl.scale.setScalar(0.09 * (0.4 + 0.6 * Math.max(0, Math.sin(f * 0.15 + i * 2.7)))); });
    birds.forEach((b, i) => { const k = (f + i * 7) / 150; b.position.set(-30 + 26 * k + 3 * i, 16 + 2 * rnd(i + 700) + 0.4 * Math.sin(f * 0.1 + i), -40 - 4 * i); b.scale.set(1.6, 1.6 * (0.55 + 0.45 * Math.sin(f * 0.55 + i * 1.3)), 1); b.lookAt(5, 5, 8); });
  };
  return { root, update };
}
