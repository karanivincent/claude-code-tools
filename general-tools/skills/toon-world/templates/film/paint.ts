import * as THREE from 'three';
import { twoTone } from '../../look/shade';

// Painted textures drawn in code, for the middle and ground bands of every place (the blend: far band one picture,
// middle and ground code 3D with painted textures, a detail layer of small real things that move). Every texture here
// is 2048 px, mipmapped and 16x anisotropic: tools/look.mjs fails a map under that within 8 m of a shot camera, and a
// mesh with no map at all (plain code colour). Seeded, so every render is the same. Pass your place's own colours;
// write new painters for its own surfaces (Elijah's house: lime plaster, cracked earth, terracotta tiles, wool).
//
// What makes a texture read as painted at phone size, measured by look.mjs's flat share: variation at every scale. A
// base fill plus large soft patches alone leaves 16 px blocks flat; add a fine grain (hundreds of 2 to 8 px marks) and
// strokes. Elijah's 1024 plaster with large blobs measured 0.47 to 0.67 flat on the final frames; these measure under
// 0.1 on their own.

export const hash = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
/** 2048: decision 1 (Vincent, 11 November 2026) and toon-kit look.ts TEX_MIN; 16: ANISO_MIN */
export const TEX = 2048, ANISO = 16;
const CACHE = new Map<string, THREE.CanvasTexture>();

/** a painted canvas texture, cached by key and repeat: 2048 square, sRGB, repeating, mipmapped, 16x anisotropic */
export function painted(key: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat: [number, number] = [1, 1]) {
  const k = `${key}|${repeat}`;
  let t = CACHE.get(k);
  if (!t) {
    const c = document.createElement('canvas'); c.width = c.height = TEX;
    draw(c.getContext('2d')!, TEX, TEX);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.repeat.set(...repeat);
    CACHE.set(k, t);
  }
  return t;
}

/** `n` soft marks of the given colours, radius r0..r1 px, at opacity a */
export function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, cols: string[], r0: number, r1: number, seed: number, a = 1) {
  g.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(hash(i, seed) * cols.length)];
    const r = r0 + (r1 - r0) * hash(i, seed + 1);
    g.beginPath(); g.ellipse(hash(i, seed + 2) * w, hash(i, seed + 3) * h, r, r * (0.5 + 0.7 * hash(i, seed + 4)), hash(i, seed + 5) * 6.28, 0, 6.28); g.fill();
  }
  g.globalAlpha = 1;
}
/** the fine grain every surface carries: thousands of small light and dark marks (what keeps 16 px blocks alive) */
export const grain = (g: CanvasRenderingContext2D, w: number, h: number, seed: number, k = 1) =>
  speckle(g, w, h, Math.round(14000 * k), ['rgba(255,255,255,0.22)', 'rgba(0,0,0,0.16)', 'rgba(255,240,210,0.18)', 'rgba(60,30,10,0.14)'], 1.5, 5, seed + 900, 1);
/** short brush strokes in a direction (radians), for wood grain, plaster trowel marks, grass blades */
export function strokes(g: CanvasRenderingContext2D, w: number, h: number, n: number, cols: string[], len: number, width: number, dir: number, seed: number) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = hash(i, seed) * w, y = hash(i, seed + 1) * h, a = dir + (hash(i, seed + 2) - 0.5) * 0.5, L = len * (0.5 + hash(i, seed + 3));
    g.strokeStyle = cols[i % cols.length]; g.lineWidth = width * (0.6 + 0.8 * hash(i, seed + 4));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
}

/** a plastered wall: base colour, trowel patches, hairline cracks, grime at the foot (v = 0 is the bottom) */
export const plaster = (base = '#EAD7B0', seed = 1, repeat: [number, number] = [1, 1]) => painted(`plaster${base}${seed}`, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 500, ['rgba(255,250,235,0.35)', 'rgba(170,130,90,0.22)'], 30, 120, seed, 1);
  strokes(g, w, h, 1600, ['rgba(255,255,255,0.18)', 'rgba(120,90,60,0.14)'], 60, 10, 0.2, seed + 10);
  grain(g, w, h, seed);
  g.strokeStyle = 'rgba(110,78,48,0.5)'; g.lineWidth = 3;
  for (let i = 0; i < 26; i++) { let x = hash(i, seed + 20) * w, y = hash(i, seed + 21) * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (hash(i * 7 + k, seed) - 0.5) * 90; y += 30 + 50 * hash(i * 9 + k, seed); g.lineTo(x, y); } g.stroke(); }
  const gr = g.createLinearGradient(0, h * 0.78, 0, h); gr.addColorStop(0, 'rgba(110,70,40,0)'); gr.addColorStop(1, 'rgba(110,70,40,0.35)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, repeat);

/** dry ground: earth with pebbles, scuffs and a few tufts */
export const ground = (base = '#D9A56A', seed = 5, repeat: [number, number] = [1, 1]) => painted(`ground${base}${seed}`, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 900, ['rgba(255,225,180,0.3)', 'rgba(140,90,50,0.25)'], 20, 90, seed, 1);
  grain(g, w, h, seed, 1.3);
  speckle(g, w, h, 1400, ['#8A6E52', '#B49A78', '#EEDDBE', '#6E5640'], 3, 12, seed + 7, 0.9);   // pebbles
  strokes(g, w, h, 900, ['rgba(90,110,40,0.7)', 'rgba(140,150,60,0.6)'], 26, 4, -1.4, seed + 30);   // dry grass tufts
}, repeat);

/** dressed stone in courses: every block its own tone, worn edges, joints, grain */
export const stone = (seed = 3, cols = ['#E8D2A6', '#DCC092', '#F0DEB8', '#D6B48C', '#E4C89A'], repeat: [number, number] = [1, 1]) => painted(`stone${seed}${cols}`, (g, w, h) => {
  g.fillStyle = '#8E7254'; g.fillRect(0, 0, w, h);
  const rows = 10, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -hash(r, seed) * 200;
    while (x < w) {
      const bw = 200 + 160 * hash(r * 31 + x, seed);
      g.fillStyle = cols[Math.floor(hash(r * 17 + x, seed + 1) * cols.length)];
      g.beginPath(); g.roundRect(x + 6, r * rh + 6, bw - 12, rh - 12, 14); g.fill();
      g.fillStyle = 'rgba(255,248,226,0.35)'; g.fillRect(x + 12, r * rh + 9, bw - 24, 8);
      g.fillStyle = 'rgba(90,64,40,0.28)'; g.fillRect(x + 12, r * rh + rh - 20, bw - 24, 10);
      x += bw;
    }
  }
  speckle(g, w, h, 400, ['rgba(120,90,60,0.25)', 'rgba(255,255,255,0.2)'], 10, 40, seed + 4, 1);
  grain(g, w, h, seed);
}, repeat);

/** planks or beams: grain lines along u, knots, grain */
export const wood = (base = '#8E5E36', seed = 7, repeat: [number, number] = [1, 1]) => painted(`wood${base}${seed}`, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 180; i++) {
    const y = hash(i, seed) * h; g.strokeStyle = hash(i, seed + 1) > 0.5 ? 'rgba(60,34,16,0.4)' : 'rgba(210,160,110,0.3)'; g.lineWidth = 2 + 6 * hash(i, seed + 2);
    g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x / 140 + i) * 9); g.stroke();
  }
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(50,28,12,0.6)'; g.beginPath(); g.ellipse(hash(i, seed + 3) * w, hash(i, seed + 4) * h, 26, 14, 0, 0, 6.28); g.fill(); }
  grain(g, w, h, seed, 0.8);
}, repeat);

/** woven cloth: a weave, stripes in two colours, grain (awnings, blankets, a hanging cloth) */
export const cloth = (a = '#C8402E', b = '#F2E2C2', seed = 9, repeat: [number, number] = [1, 1]) => painted(`cloth${a}${b}${seed}`, (g, w, h) => {
  g.fillStyle = b; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : '#2E5AAE'; g.fillRect(0, 120 + i * 230, w, i % 2 ? 90 : 26); }
  g.globalAlpha = 0.18; g.fillStyle = '#000';
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
  for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
  g.globalAlpha = 1;
  grain(g, w, h, seed, 0.6);
}, repeat);

/** a world material: a painted map, two-tone lit (the look's shading), shadows on. Never a plain colour (look.mjs). */
export function lit(map: THREE.Texture, o: { color?: string; side?: THREE.Side } = {}) {
  return twoTone(new THREE.MeshLambertMaterial({ map, color: o.color ?? '#ffffff', side: o.side ?? THREE.FrontSide }));
}

/** a box with a painted material, UVs scaled to its size so the texture's density stays even (one tile per `tile` m) */
export function block(w: number, h: number, d: number, m: THREE.Material, at: [number, number, number], o: { cast?: boolean; rot?: number; tile?: number } = {}) {
  const g = new THREE.BoxGeometry(w, h, d), tile = o.tile ?? 2.5;
  const uv = g.attributes.uv as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    uv.setXY(i, uv.getX(i) * (nx > 0.5 ? d : w) / tile, uv.getY(i) * (ny > 0.5 ? d : h) / tile);
  }
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(at[0], at[1] + h / 2, at[2]);
  if (o.rot) mesh.rotation.y = o.rot;
  mesh.castShadow = o.cast ?? true; mesh.receiveShadow = true;
  return mesh;
}
