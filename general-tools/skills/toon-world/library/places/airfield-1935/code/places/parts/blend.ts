// The blend's parts, general and named (from the cliff spikes' world.ts, spike 5: world and light rose two points with
// every judge when each place got all four bands before round 1). A place file (places/<place>.ts) builds itself from
// these; it never re-draws them.
//   far band     farPicture   one picture on a curved screen, its top faded into a sky dome of the same colour
//   middle band  midBand      lumpy tree canopies on real trunks (or bushes), a band between the ground and the far
//   ground       rockSurface  a block whose one face is displaced in code (bulges, stepped ledges, an undercut)
//                groundSurface a plane displaced in code, with a painted texture
//                water        moving water with a sparkle band where the key light lies on it
//   detail       fire, stringLights, fireflies, birds: small real things that move
// Everything takes a seed, so a place is the same on every frame and in every scene that uses it. Self-lit things
// (bulbs, flames, sparkles) go over 1.0 so the bloom picks them up. World materials are twoTone (look/shade.ts), so the
// place light (look/lights.ts applyPlaceLight) lights them.
import * as THREE from 'three';
import { twoTone } from '../../../../look/shade';
import { NOINK } from '../../../../look/ink';

export type V3 = [number, number, number];
export type Part = { root: THREE.Group; update: (f: number) => void };

// ---------------- noise and painting ----------------
export const rnd = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const h2 = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const vn = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
/** fractal value noise, about 0..1 */
export const fbm = (x: number, y: number, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f); a *= 0.5; f *= 2.03; } return s; };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

export const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); return t;
};
const hex = (c: string, k: number) => { const n = parseInt(c.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; };
/** soft paint dabs of a colour's near tones */
export const dabs = (g: CanvasRenderingContext2D, w: number, h: number, base: string, n: number, seed: number, amp = 0.07, size = 40) => {
  for (let i = 0; i < n; i++) {
    const x = rnd(seed + i) * w, y = rnd(seed + i * 1.7 + 3) * h, r = size * (0.4 + rnd(seed + i * 2.3) * 0.9);
    g.fillStyle = hex(base, 1 + amp * (rnd(seed + i * 3.1) * 2 - 1)); g.globalAlpha = 0.55;
    g.beginPath(); g.ellipse(x, y, r * 1.6, r * 0.7, rnd(seed + i * 4.7) * 3.14, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
};
export const glowTex = (inner: string, outer: string) => canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
/** a two-tone Lambert (lit by the place light) */
export const lam = (map: THREE.Texture | null, color = '#ffffff', vertexColors = false) => twoTone(new THREE.MeshLambertMaterial({ map, color, vertexColors }));
const basic = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, ...o });
const solid = (root: THREE.Object3D, m: THREE.Mesh, cast = true) => { m.castShadow = cast; m.receiveShadow = true; root.add(m); return m; };
const glow = (root: THREE.Object3D, o: THREE.Object3D) => { o.layers.set(NOINK); root.add(o); return o; };

/** strata: bands of a rock's colours with dark seams, vertical joints, rain stains, lichen and a wet foot */
export const strataTex = (cols: string[], seed: number, repeat: [number, number] = [3, 1]) => canvasTex(2048, 1024, (g) => {
  let y = 0, i = 0; const beds: number[] = [0];
  while (y < 1024) { const h = 90 + 120 * rnd(seed + i); g.fillStyle = cols[i % cols.length]; g.fillRect(0, y, 2048, h + 2); dabs(g, 2048, h, cols[i % cols.length], 100, seed + i * 9, 0.08, 30); y += h; beds.push(Math.min(1024, y)); i++; }
  for (let k = 1; k < beds.length - 1; k++) { g.strokeStyle = 'rgba(70,45,30,0.55)'; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= 2048; x += 32) g.lineTo(x, beds[k] + 6 * Math.sin(x * 0.01 + k)); g.stroke(); }
  g.strokeStyle = 'rgba(60,38,26,0.5)'; g.lineWidth = 5;
  for (let k = 0; k < beds.length - 1; k++) for (let j = 0; j < 5; j++) { if (rnd(seed + k * 7 + j * 3) < 0.35) continue; const x = (j * 410 + rnd(seed + k * 13 + j) * 150 + k * 70) % 2048; g.beginPath(); g.moveTo(x, beds[k]); g.lineTo(x + 10 * (rnd(j + k) - 0.5), beds[k + 1]); g.stroke(); }
  for (let k = 0; k < 40; k++) { const x = rnd(seed + k + 300) * 2048, yy = rnd(seed + k + 400) * 500, gr = g.createLinearGradient(0, yy, 0, yy + 400); gr.addColorStop(0, 'rgba(90,70,60,0.25)'); gr.addColorStop(1, 'rgba(90,70,60,0)'); g.fillStyle = gr; g.fillRect(x, yy, 10 + 30 * rnd(k), 400); }
  for (let k = 0; k < 900; k++) { g.fillStyle = rnd(seed + k + 9) > 0.6 ? 'rgba(120,130,80,0.35)' : 'rgba(80,60,45,0.25)'; g.beginPath(); g.arc(rnd(seed + k + 11) * 2048, rnd(seed + k + 17) * 1024, 2 + 6 * rnd(k + 19), 0, 7); g.fill(); }
  const w = g.createLinearGradient(0, 860, 0, 1024); w.addColorStop(0, 'rgba(40,50,50,0)'); w.addColorStop(1, 'rgba(40,50,50,0.6)'); g.fillStyle = w; g.fillRect(0, 860, 2048, 164);
}, repeat);
export const LIMESTONE = ['#d8bf94', '#c4a476', '#dcc69e', '#b9976a', '#d1b386', '#c09d70', '#d6bc90', '#b08a5e'];
export const SANDSTONE = ['#d9a77a', '#c98f62', '#e0b58a', '#b97a52', '#d39c70', '#c4855a'];

/** a noisy rock: an icosahedron pushed out by noise, with stepped facets and lighter tops (vertex colours) */
export const rockGeo = (r: number, seed: number, sx = 1, sy = 1, sz = 1) => {
  const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position as THREE.BufferAttribute, cl: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i), n = v.clone().normalize();
    const k = 1 + 0.28 * (fbm(n.x * 2 + seed, n.y * 2 + n.z * 1.7, 4) - 0.5) + 0.12 * Math.round(fbm(n.y * 3 + seed, n.z * 3, 2) * 3) / 3;
    v.multiplyScalar(k); p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz); const c = 0.8 + 0.25 * clamp01(n.y + 0.4); cl.push(c, c, c);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
};

// ---------------- far band ----------------
export type FarOpts = {
  /** the picture (preloaded by the place: one Higgsfield image, about 0.25 credits). Without one, a painted range of
   *  hills stands in, so a place renders before its picture exists */
  img?: HTMLImageElement | null;
  /** sky colours top to horizon (5 stops); the dome is painted with them and the picture's top fades into them */
  sky: string[];
  radius?: number; arc?: number; /** the screen's middle, as a direction on the ground (x, z) from the origin */ toward?: [number, number];
  /** how far the picture's bottom sits below the horizon (metres) and its lift */
  base?: number;
  /** stand-in hills' colours (far, near) */
  hills?: [string, string];
  /** world-r5: pull the picture's own painted cloud shade to the same warm grey as the cut-out sky clouds (they
   *  flipped between lavender and cream between the two) */
  warmClouds?: boolean;
};
/** The far band: a picture on a curved screen and a sky dome. The picture's top fades into the dome over its top 18 %
 *  and its bottom 14 % fades into the ground haze (spike 5: judges named "a cut-out sky band" twice before the fade).
 *  Check the seam on a full-size still. */
export const farPicture = (o: FarOpts): Part => {
  const root = new THREE.Group(), R = o.radius ?? 88, ARC = o.arc ?? 1.9, dir = o.toward ?? [0, -1];
  const img = o.img ?? null, iw = img ? img.width : 1344, ih = img ? img.height : 576;
  const H0 = (R * ARC) / (iw / ih), topEl = Math.atan2(H0 - 0.12 * H0 + (o.base ?? 1.2), R); // the picture's top edge, as an elevation
  // S5-60: the dome takes its colours from the picture's own sky (a row just under the top fade, and one just above the
  // horizon), so the picture's top melts into it with no band; o.sky is the fallback without a picture
  const rowCol = (y: number): string | null => {
    if (!img) return null;
    const c = document.createElement('canvas'); c.width = 64; c.height = 1; const g = c.getContext('2d')!;
    g.drawImage(img as CanvasImageSource, 0, Math.floor(y * ih), iw, 2, 0, 0, 64, 1);
    const d = g.getImageData(0, 0, 64, 1).data; const px: number[][] = [];
    for (let i = 0; i < 64; i++) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    px.sort((a, b) => a[2] - a[0] - (b[2] - b[0])); // the bluest half: clouds left out
    const k = px.slice(32); const m = [0, 1, 2].map((j) => Math.round(k.reduce((s, p) => s + p[j], 0) / k.length));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  };
  const topC = rowCol(0.2) ?? o.sky[1], mid = rowCol(0.45) ?? o.sky[2], hor = rowCol(0.64) ?? o.sky[4];
  const fTop = 0.5 - topEl / Math.PI; // the picture's top on the dome canvas (0 = zenith, 0.5 = horizon)
  const skyTex = canvasTex(16, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, img ? topC : o.sky[0]); gr.addColorStop(Math.max(0.05, fTop * 0.9), topC); gr.addColorStop(Math.min(0.47, fTop + 0.12), mid); gr.addColorStop(0.5, hor); gr.addColorStop(1, hor);
    g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  });
  // the dome draws first and writes no depth: its facets fought the screen's in the depth buffer at 420 m (a jagged band)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R + 7, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -2; glow(root, dome);
  const c = document.createElement('canvas'); c.width = iw; c.height = ih; const g = c.getContext('2d')!;
  if (img) g.drawImage(img, 0, 0);
  if (img && o.warmClouds) {
    const hh = Math.floor(ih * 0.62), d = g.getImageData(0, 0, iw, hh), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const a = smooth((p[i] - 80) / 100); if (a <= 0) continue; // the sky is low in red: only cloud pixels change
      const l = (p[i] + p[i + 1] + p[i + 2]) / 3, sh = smooth((252 - l) / 30) * a, g0 = [l * 1.07, l * 1.0, l * 0.84];
      for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, p[i + j] + (g0[j] - p[i + j]) * sh);
    }
    g.putImageData(d, 0, 0);
  }
  else { // stand-in: two ranges of painted hills under the sky's lower stops
    const [far, near] = o.hills ?? ['#7d6f9a', '#4d5a6a'];
    for (const [k, col, amp, y0] of [[0, far, 90, 0.5], [1, near, 60, 0.68]] as [number, string, number, number][]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, ih);
      for (let x = 0; x <= iw; x += 8) g.lineTo(x, ih * y0 - amp * fbm(x * 0.004 + k * 9, k * 3, 4) * 2 + amp * 0.5);
      g.lineTo(iw, ih); g.fill(); dabs(g, iw, ih * 0.4, col, 60, 30 + k * 11, 0.06, 18);
    }
  }
  g.globalCompositeOperation = 'destination-out';
  const top = g.createLinearGradient(0, 0, 0, ih * 0.18); top.addColorStop(0, 'rgba(0,0,0,1)'); top.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = top; g.fillRect(0, 0, iw, ih * 0.18);
  const bot = g.createLinearGradient(0, ih * 0.86, 0, ih); bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = bot; g.fillRect(0, ih * 0.86, iw, ih * 0.14);
  const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace; ct.wrapS = THREE.RepeatWrapping; ct.repeat.x = -1; ct.offset.x = 1; ct.anisotropy = 8;
  const H = (R * ARC) / (iw / ih), MID = Math.atan2(dir[0], dir[1]);
  const far = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true, MID - ARC / 2, ARC), new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false }));
  far.position.set(0, H / 2 - 0.12 * H + (o.base ?? 1.2), 0); far.renderOrder = -1; glow(root, far);
  return { root, update: () => {} };
};

// ---------------- middle band ----------------
export type MidOpts = { trees: { x: number; z: number; s: number }[]; y?: number; leaf?: [number, number, number]; trunk?: string; seed?: number;
  /** a row of bushes along a line from a to b at height y */
  bushes?: { a: [number, number]; b: [number, number]; n: number; tint?: [number, number, number]; gap?: [number, number] } };
/** The middle band: oaks with lumpy canopies on real trunks, and optional bushes along an edge */
export const midBand = (o: MidOpts): Part => {
  const root = new THREE.Group(), y = o.y ?? 0, seed = o.seed ?? 7;
  const leafM = lam(null, '#ffffff', true), trunkM = lam(null, o.trunk ?? '#5a3e2c'), leaf = o.leaf ?? [0.18, 0.3, 0.19];
  const canopy = (r: number, s: number, tint: [number, number, number]) => { const g = rockGeo(r, s, 1.1, 0.85, 1.1); const c = g.attributes.color as THREE.BufferAttribute; for (let i = 0; i < c.count; i++) { const k = c.getX(i); c.setXYZ(i, tint[0] * k, tint[1] * k, tint[2] * k); } return g; };
  o.trees.forEach(({ x, z, s }, n) => {
    const sd = seed + n * 6;
    const t = solid(root, new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.2 * s, 8), trunkM)); t.position.set(x, y + 1.1 * s, z);
    for (let k = 0; k < 4; k++) { const c = solid(root, new THREE.Mesh(canopy((0.9 + 0.5 * rnd(sd + k)) * s, sd + k, [leaf[0], leaf[1] + 0.05 * rnd(sd + k), leaf[2]]), leafM)); c.position.set(x + (rnd(sd + k * 3) - 0.5) * 1.6 * s, y + (2.3 + 0.8 * rnd(sd + k * 5)) * s, z + (rnd(sd + k * 7) - 0.5) * 1.6 * s); }
  });
  if (o.bushes) {
    const { a, b, n, tint = [0.45, 0.55, 0.28], gap } = o.bushes;
    for (let i = 0; i < n; i++) {
      const k = (i + rnd(seed + i + 90) * 0.5) / n, x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
      if (gap && Math.hypot(x - gap[0], z - gap[1]) < 1.3) continue;
      const m = solid(root, new THREE.Mesh(canopy(0.22 + 0.18 * rnd(seed + i), seed + i + 120, tint), leafM), false); m.position.set(x, y + 0.1, z);
    }
  }
  return { root, update: () => {} };
};

// ---------------- ground ----------------
export type RockOpts = {
  /** the block's size (x, y, z) in metres, and where its centre sits */ size: V3; at: V3;
  /** which face is the displaced rock surface */ face: '+x' | '-x' | '+z' | '-z';
  seed?: number; colors?: string[];
  /** a zone of the face kept nearly flat (a lip someone stands on): centre along the face and half width */ keep?: [number, number];
  /** bulge size (m), and a water-cut notch at the foot (m deep, m high) */ bulge?: number; notch?: [number, number];
};
/** A rock face displaced in code: big bulges, small lumps, stepped bedding ledges and an undercut at the foot, darker
 *  low down. The rest of the block is a plain box (cover its top with groundSurface or turf). */
export const rockSurface = (o: RockOpts): Part => {
  const root = new THREE.Group(), [W, Hh, D] = o.size, seed = o.seed ?? 17, bulge = o.bulge ?? 0.9, [nd, nh] = o.notch ?? [0.45, 0.9];
  const ax = o.face[1] as 'x' | 'z', sg = o.face[0] === '+' ? 1 : -1;
  const geo = new THREE.BoxGeometry(W, Hh, D, ax === 'z' ? 140 : 1, 40, ax === 'x' ? 140 : 1);
  const pos = geo.attributes.position as THREE.BufferAttribute, col: number[] = [];
  const half = ax === 'x' ? W / 2 : D / 2;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), lz = pos.getZ(i), ly = pos.getY(i) + Hh / 2; // height above the block's foot
    const n = ax === 'x' ? lx * sg : lz * sg, along = ax === 'x' ? lz + o.at[2] : lx + o.at[0];
    let shade = 1;
    if (n > half - 0.1) {
      const topK = smooth(clamp01((Hh - ly) / 0.5));
      const keepK = o.keep ? smooth(clamp01((Math.abs(along - o.keep[0]) - o.keep[1]) / 0.8)) : 1;
      const ledge = 0.18 * Math.round(fbm(ly * 0.9 + seed, along * 0.15, 4) * 4) / 4;
      const b = bulge * (fbm(along * 0.22 + seed, ly * 0.18, 5) - 0.5) + 0.35 * (fbm(along * 0.9, ly * 0.9 + seed, 3) - 0.5);
      const under = -nd * smooth(clamp01((nh - ly) / nh));
      const d = topK * (b + ledge + under) * (0.35 + 0.65 * keepK) - 0.12 * (1 - keepK) * topK;
      if (ax === 'x') pos.setX(i, lx + sg * d); else pos.setZ(i, lz + sg * d);
      shade = 0.78 + 0.32 * clamp01(0.5 + d * 1.1) - 0.18 * smooth(clamp01((0.6 - ly) / 0.6));
    }
    col.push(shade, shade, shade);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = solid(root, new THREE.Mesh(geo, lam(strataTex(o.colors ?? LIMESTONE, seed + 40), '#ffffff', true)));
  m.position.set(...o.at);
  return { root, update: () => {} };
};
export type GroundOpts = { size: [number, number]; at: V3; color: string; tones?: string; seed?: number; bumps?: number; blades?: boolean; repeat?: number };
/** Ground displaced in code (gentle bumps) with a painted texture: grass (with blades) or earth or sand */
export const groundSurface = (o: GroundOpts): Part => {
  const root = new THREE.Group(), seed = o.seed ?? 3, [w, d] = o.size;
  const tex = canvasTex(512, 512, (g) => {
    g.fillStyle = o.color; g.fillRect(0, 0, 512, 512); dabs(g, 512, 512, o.tones ?? o.color, 220, seed, 0.12, 16);
    if (o.blades) { g.strokeStyle = hex(o.color, 0.72); g.lineWidth = 2; for (let i = 0; i < 400; i++) { const x = rnd(seed + i) * 512, y = rnd(seed + i + 0.5) * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 9); g.stroke(); } }
  }, [o.repeat ?? w / 5, o.repeat ?? d / 5]);
  const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w * 2), Math.ceil(d * 2)); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute, B = o.bumps ?? 0.12;
  for (let i = 0; i < p.count; i++) p.setY(i, B * (fbm(p.getX(i) * 0.3 + seed, p.getZ(i) * 0.3, 3) - 0.5));
  geo.computeVertexNormals();
  const m = solid(root, new THREE.Mesh(geo, lam(tex)), false); m.position.set(...o.at);
  return { root, update: () => {} };
};

export type WaterOpts = { radius?: number; at?: V3; deep?: string; shallow?: string;
  /** the sparkle band: where the key light lies on the water (a rectangle on the surface), its colour and size */
  sparkle?: { at: [number, number]; size: [number, number]; color?: string };
  /** a dark band under a wall (centre, size): water in the wall's shade */ shadeBand?: { at: [number, number]; size: [number, number] } };
/** Water that moves: a drifting painted surface (glints, sky colour, dark troughs) and a twinkling sparkle band */
export const water = (o: WaterOpts = {}): Part => {
  const root = new THREE.Group(), at = o.at ?? [0, 0, 0];
  const deep = o.deep ?? '#245a6e', shallow = o.shallow ?? '#2c6f80';
  const wTex = canvasTex(1024, 1024, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, shallow); gr.addColorStop(1, deep); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 520; i++) { const x = rnd(i) * 1024, y = rnd(i + 0.3) * 1024, w = 20 + 90 * rnd(i + 0.7); g.fillStyle = rnd(i + 0.9) > 0.55 ? 'rgba(255,200,150,0.30)' : (rnd(i + 2.1) > 0.5 ? 'rgba(150,210,230,0.22)' : 'rgba(15,45,60,0.35)'); g.beginPath(); g.ellipse(x, y, w, 2 + 3 * rnd(i + 1.3), 0, 0, 7); g.fill(); }
  }, [16, 16]);
  const surf = solid(root, new THREE.Mesh(new THREE.CircleGeometry(o.radius ?? 86, 96), lam(wTex)), false); surf.rotation.x = -Math.PI / 2; surf.position.set(...at);
  let sparkM: THREE.MeshBasicMaterial | null = null, spk: THREE.Texture | null = null;
  if (o.sparkle) {
    spk = canvasTex(512, 512, (g) => { g.clearRect(0, 0, 512, 512); for (let i = 0; i < 160; i++) { const x = rnd(i + 50) * 512, y = rnd(i + 60) * 512, w = 6 + 26 * rnd(i + 70); g.fillStyle = `rgba(255,${200 + 40 * rnd(i)},150,${0.5 + 0.5 * rnd(i + 80)})`; g.beginPath(); g.ellipse(x, y, w, 1.5, 0, 0, 7); g.fill(); } }, [10, 10]);
    sparkM = basic({ map: spk, blending: THREE.AdditiveBlending, opacity: 0.55, color: new THREE.Color(o.sparkle.color ?? '#ffd2a0').multiplyScalar(1.6) });
    const s = glow(root, new THREE.Mesh(new THREE.PlaneGeometry(...o.sparkle.size), sparkM)); s.rotation.x = -Math.PI / 2; s.position.set(o.sparkle.at[0], at[1] + 0.015, o.sparkle.at[1]);
  }
  if (o.shadeBand) {
    const sb = glow(root, new THREE.Mesh(new THREE.PlaneGeometry(...o.shadeBand.size), basic({ map: glowTex('rgba(10,25,35,0.55)', 'rgba(10,25,35,0)') })));
    sb.rotation.x = -Math.PI / 2; sb.position.set(o.shadeBand.at[0], at[1] + 0.01, o.shadeBand.at[1]);
  }
  return { root, update: (f) => { const t = f / 30; wTex.offset.set(0.02 * t, 0.035 * t); if (spk && sparkM) { spk.offset.set(-0.03 * t, 0.05 * t + 0.02 * Math.sin(t * 2)); sparkM.opacity = 0.45 + 0.15 * Math.sin(t * 5.1); } } };
};

// ---------------- detail layer ----------------
const halo = () => glowTex('rgba(255,200,120,0.9)', 'rgba(255,160,80,0)');
/** a campfire: a stone ring, logs, flickering tongues, rising embers and a warm glow on the ground */
export const fire = (at: V3, seed = 50): Part => {
  const root = new THREE.Group(), rockM = lam(strataTex(SANDSTONE, seed), '#ffffff', true), logM = lam(null, '#5a3e2c');
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283, s = solid(root, new THREE.Mesh(rockGeo(0.13, i + seed, 1.2, 0.7, 1), rockM)); s.position.set(at[0] + 0.42 * Math.cos(a), at[1] + 0.08, at[2] + 0.42 * Math.sin(a)); }
  for (let i = 0; i < 3; i++) { const l = solid(root, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), logM)); l.position.set(at[0], at[1] + 0.1, at[2]); l.rotation.set(Math.PI / 2, 0, i * 1.05); }
  const gm = basic({ map: glowTex('rgba(255,150,60,0.75)', 'rgba(255,120,40,0)'), blending: THREE.AdditiveBlending });
  const fg = glow(root, new THREE.Mesh(new THREE.PlaneGeometry(4, 4), gm)); fg.rotation.x = -Math.PI / 2; fg.position.set(at[0], at[1] + 0.1, at[2]);
  const fT = canvasTex(128, 256, (g) => {
    const r = g.createRadialGradient(64, 190, 4, 64, 170, 120); r.addColorStop(0, 'rgba(255,250,200,1)'); r.addColorStop(0.3, 'rgba(255,190,70,0.95)'); r.addColorStop(0.65, 'rgba(240,90,30,0.7)'); r.addColorStop(1, 'rgba(200,40,20,0)');
    g.fillStyle = r; g.beginPath(); g.moveTo(64, 0); g.bezierCurveTo(110, 110, 124, 200, 64, 250); g.bezierCurveTo(4, 200, 18, 110, 64, 0); g.fill();
  });
  const flames = Array.from({ length: 6 }, () => glow(root, new THREE.Sprite(new THREE.SpriteMaterial({ map: fT, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(1.8, 1.4, 1.0) }))) as THREE.Sprite);
  const emberM = new THREE.SpriteMaterial({ map: halo(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(2.5, 1.2, 0.4) });
  const embers = Array.from({ length: 14 }, () => glow(root, new THREE.Sprite(emberM)) as THREE.Sprite);
  return { root, update: (f) => {
    flames.forEach((fl, i) => { const ph = f * 0.45 + i * 1.7, h = 0.55 + 0.25 * Math.sin(ph) + 0.12 * Math.sin(ph * 2.3); fl.scale.set(0.32 + 0.06 * Math.sin(ph * 1.3), h, 1); fl.position.set(at[0] + 0.12 * Math.sin(i * 2.1), at[1] + 0.12 + h / 2, at[2] + 0.12 * Math.cos(i * 2.1)); });
    gm.opacity = 0.85 + 0.15 * Math.sin(f * 0.7);
    embers.forEach((e, i) => { const ph = ((f + i * 9) % 45) / 45; e.position.set(at[0] + 0.3 * Math.sin(i * 3 + ph * 4), at[1] + 0.3 + 2.2 * ph, at[2] + 0.3 * Math.cos(i * 5 + ph * 3)); e.scale.setScalar(0.07 * (1 - ph)); });
  } };
};
/** string lights between two poles: a sagging wire, bulbs over 1.0 for the bloom, soft halos that breathe */
export const stringLights = (a: V3, b: V3, o: { n?: number; height?: number; sag?: number; colors?: string[] } = {}): Part => {
  const root = new THREE.Group(), n = o.n ?? 16, top = o.height ?? 2.5, sag = o.sag ?? 0.55, cols = o.colors ?? ['#ffd27a', '#ff9a6a', '#fff0b0', '#ffb86a'];
  const pole = lam(null, '#6b4a32');
  for (const p of [a, b]) { const m = solid(root, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, top + 0.1, 8), pole)); m.position.set(p[0], p[1] + (top + 0.1) / 2, p[2]); }
  const wire: THREE.Vector3[] = [], bulbs: THREE.Object3D[] = [], hm = halo();
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = a[0] + (b[0] - a[0]) * k, z = a[2] + (b[2] - a[2]) * k, y = a[1] + top - sag * Math.sin(Math.PI * k);
    wire.push(new THREE.Vector3(x, y, z));
    if (i > 0 && i < n) {
      const bl = glow(root, new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i % cols.length]).multiplyScalar(3), fog: false }))); bl.position.set(x, y - 0.07, z);
      const hs = glow(root, new THREE.Sprite(new THREE.SpriteMaterial({ map: hm, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false }))); hs.scale.setScalar(0.45); hs.position.copy(bl.position);
      bulbs.push(bl, hs);
    }
  }
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire), 40, 0.008, 4), new THREE.MeshBasicMaterial({ color: '#241726' })));
  return { root, update: (f) => bulbs.forEach((bl, i) => bl.scale.setScalar((bl instanceof THREE.Sprite ? 0.45 : 1) * (0.9 + 0.12 * Math.sin(f * 0.3 + i)))) };
};
/** fireflies (or dust motes, with a colour) drifting in a box: [x0, x1], [y0, y1], [z0, z1] */
export const fireflies = (box: [[number, number], [number, number], [number, number]], n = 22, color: [number, number, number] = [2.2, 2.4, 0.9], seed = 600): Part => {
  const root = new THREE.Group(), m = new THREE.SpriteMaterial({ map: halo(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(...color) });
  const flies = Array.from({ length: n }, () => glow(root, new THREE.Sprite(m)) as THREE.Sprite);
  const L = (r: [number, number], k: number) => r[0] + (r[1] - r[0]) * k;
  return { root, update: (f) => flies.forEach((fl, i) => {
    fl.position.set(L(box[0], rnd(seed + i)) + 0.4 * Math.sin(f * 0.04 + i), L(box[1], rnd(seed + i + 20)) + 0.2 * Math.sin(f * 0.06 + i * 2), L(box[2], rnd(seed + i + 10)) + 0.4 * Math.cos(f * 0.05 + i));
    fl.scale.setScalar(0.09 * (0.4 + 0.6 * Math.max(0, Math.sin(f * 0.15 + i * 2.7))));
  }) };
};
/** birds crossing the far sky: wing-beat strokes on cards, flying from `from` toward +x over `frames` frames */
export const birds = (from: V3, o: { n?: number; frames?: number; dist?: number; face?: V3; seed?: number } = {}): Part => {
  const root = new THREE.Group(), n = o.n ?? 5, T = o.frames ?? 150, dist = o.dist ?? 26, face = o.face ?? [5, 5, 8], seed = o.seed ?? 700;
  const bT = canvasTex(128, 64, (g) => { g.strokeStyle = '#2a2030'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, 18); g.quadraticCurveTo(36, 22, 64, 44); g.quadraticCurveTo(92, 22, 120, 18); g.stroke(); });
  const bs = Array.from({ length: n }, () => glow(root, new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), basic({ map: bT, side: THREE.DoubleSide }))));
  return { root, update: (f) => bs.forEach((b, i) => {
    const k = (((f + i * 7) / T) % 1.4);
    b.position.set(from[0] + dist * k + 3 * i, from[1] + 2 * rnd(seed + i) + 0.4 * Math.sin(f * 0.1 + i), from[2] - 4 * i);
    b.scale.set(1.6, 1.6 * (0.55 + 0.45 * Math.sin(f * 0.55 + i * 1.3)), 1); b.lookAt(...face);
  }) };
};
/** a group of parts as one */
export const group = (...parts: Part[]): Part => { const root = new THREE.Group(); parts.forEach((p) => root.add(p.root)); return { root, update: (f) => parts.forEach((p) => p.update(f)) }; };

/** Sky clouds cut from the far picture's own painted clouds (no new picture): each crop's blue is keyed to alpha by its
 *  red channel (the sky is low in red, the clouds and their lilac shade high), and set on a sprite far out, so a camera
 *  that looks up past the picture's top still sees the same painted sky. They drift slowly with the wind. */
export type CloudOpts = {
  /** crops of the picture as fractions [x0, y0, x1, y1] */
  crops: [number, number, number, number][];
  /** where each cloud sits: [x, y, z, width m, crop index] */
  at: [number, number, number, number, number][];
  /** drift in m/s along x and z */
  drift?: [number, number];
};
export const skyClouds = (img: HTMLImageElement | null, o: CloudOpts): Part => {
  const root = new THREE.Group();
  if (!img) return { root, update: () => {} };
  const iw = img.width, ih = img.height;
  const texs = o.crops.map(([x0, y0, x1, y1]) => {
    const w = Math.round((x1 - x0) * iw), h = Math.round((y1 - y0) * ih);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
    g.drawImage(img as CanvasImageSource, x0 * iw, y0 * ih, w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const a = smooth((p[i] - 80) / 100);
      // un-mix the sky out of the edge so the rim is not a blue halo: c = a*cloud + (1-a)*sky
      // the rim keeps the cloud's own light colour (un-mixing the sky out of thin edges divided by a small alpha and left a
      // dark ragged fringe): the thinner the edge, the closer to the cloud's lit white
      if (a < 0.9) { const w = 1 - a / 0.9, rim = [236, 236, 240]; for (let j = 0; j < 3; j++) p[i + j] = p[i + j] + (rim[j] - p[i + j]) * w; }
      // the painted shade is lilac; un-mixed it went pink-purple against the noon ground: pull the shaded pixels toward
      // one warm grey (by how far below white they are)
      { const l = (p[i] + p[i + 1] + p[i + 2]) / 3, sh = smooth((252 - l) / 30), g0 = [l * 1.07, l * 1.0, l * 0.84]; // r4: warmer still, to stay warm grey after the grade's teal shadows // world-r3: fully to one warm grey (r2 still read lavender)
        for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, p[i + j] + (g0[j] - p[i + j]) * sh); }
      p[i + 3] = Math.round(255 * a);
      // fade the crop's own border so no cut edge shows
      const x = (i / 4) % w, y = Math.floor(i / 4 / w), e = Math.min(x, w - 1 - x, y, h - 1 - y) / Math.min(w, h);
      p[i + 3] = Math.round(p[i + 3] * smooth(e / 0.16)); // a wide feather: no crop edge can cut a cloud flat
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return { t, aspect: w / h };
  });
  const sprites = o.at.map(([x, y, z, wM, k]) => {
    const { t, aspect } = texs[k % texs.length];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(wM, wM / aspect, 1); s.position.set(x, y, z); s.renderOrder = -1; glow(root, s);
    return { s, x, z };
  });
  const [dx, dz] = o.drift ?? [-1.5, -0.8];
  return { root, update: (f) => sprites.forEach(({ s, x, z }) => { s.position.x = x + (dx * f) / 30; s.position.z = z + (dz * f) / 30; }) };
};
