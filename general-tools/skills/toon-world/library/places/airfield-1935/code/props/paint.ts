// b17-checklist: painted textures for the code 3D parts (the blend's middle and ground, S3-7, S3-8). Each texture is
// painted on a 2048 canvas in code (dabs of tone, strokes, panel lines), with mipmaps and 16x anisotropy, so it holds
// up near the camera. Flat code colour is not a look (S2-8): every mesh near a camera takes one of these.
import * as THREE from 'three';
import { twoTone, patchTwoTone } from '../../../look/shade';

export const rnd = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** a painted 2048 texture (or another size), repeat-wrapped, mipmapped, 16x anisotropy */
export const paint = (draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat: [number, number] = [1, 1], w = 2048, h = 2048) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
};
const hexK = (c: string, k: number) => { const n = parseInt(c.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; };
/** soft dabs of lighter and darker tone over a base: the painted look */
export const dab = (g: CanvasRenderingContext2D, w: number, h: number, base: string, n: number, seed: number, amp = 0.08, size = 60) => {
  for (let i = 0; i < n; i++) {
    const x = rnd(seed + i * 1.7) * w, y = rnd(seed + i * 2.3 + 5) * h, r = size * (0.4 + rnd(seed + i * 3.1));
    g.fillStyle = hexK(base, 1 + amp * (rnd(seed + i * 4.9) * 2 - 1)); g.globalAlpha = 0.5;
    g.beginPath(); g.ellipse(x, y, r, r * (0.5 + 0.5 * rnd(seed + i)), rnd(seed + i * 7) * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
};
/** a lit world material (two-tone light) with a painted map */
export const mat = (map: THREE.Texture | null, color = '#ffffff', o: { side?: THREE.Side; vertexColors?: boolean } = {}) =>
  twoTone(new THREE.MeshLambertMaterial({ map, color, side: o.side ?? THREE.FrontSide, vertexColors: o.vertexColors ?? false }));
export const add = (root: THREE.Object3D, m: THREE.Mesh, cast = true) => { m.castShadow = cast; m.receiveShadow = true; root.add(m); return m; };

// ---------------- the textures ----------------
/** autumn grass: gold-green with blade strokes and darker clumps (tile about 8 m) */
export const grassTex = (repeat: [number, number], seed = 3) => paint((g, w, h) => {
  g.fillStyle = '#8fa846'; g.fillRect(0, 0, w, h);
  dab(g, w, h, '#9cb44c', 260, seed, 0.14, 90); dab(g, w, h, '#b7a447', 90, seed + 50, 0.1, 70);
  for (let i = 0; i < 5200; i++) {
    const x = rnd(seed + i * 0.37) * w, y = rnd(seed + i * 0.71 + 2) * h, l = 10 + 14 * rnd(seed + i);
    g.strokeStyle = rnd(seed + i * 9) < 0.5 ? '#6f8a34' : '#c2c25c'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd(seed + i * 5) - 0.5) * 8, y - l); g.stroke();
  }
}, repeat);
/** the runway: packed pale concrete in slabs with seams, tyre streaks and oil spots (tile 15 m) */
export const runwayTex = (repeat: [number, number]) => paint((g, w, h) => {
  g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, w, h); dab(g, w, h, '#d6cdb9', 220, 11, 0.07, 120);
  g.strokeStyle = '#8f8676'; g.lineWidth = 6; for (const x of [0, w / 2]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (const y of [0, h / 2]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.globalAlpha = 0.18; g.strokeStyle = '#3a3530'; g.lineWidth = 34;
  for (const y of [h * 0.3, h * 0.38, h * 0.62, h * 0.7]) { g.beginPath(); g.moveTo(0, y + 10 * rnd(y)); g.lineTo(w, y - 10 * rnd(y + 1)); g.stroke(); }
  g.globalAlpha = 0.35; for (let i = 0; i < 14; i++) { g.fillStyle = '#4a4238'; g.beginPath(); g.ellipse(rnd(i) * w, rnd(i + 30) * h, 40 + 50 * rnd(i + 5), 20 + 20 * rnd(i + 8), 0, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}, repeat);
/** polished aluminium: soft vertical bands of reflection, panel lines and rivet rows (tile 4 m) */
export const metalTex = (repeat: [number, number] = [1, 1]) => paint((g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#e9eef2'); gr.addColorStop(0.35, '#b9c3cc'); gr.addColorStop(0.55, '#d8dfe5'); gr.addColorStop(1, '#9ea9b3');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); dab(g, w, h, '#c7cfd6', 120, 21, 0.06, 140);
  g.strokeStyle = '#7d8790'; g.lineWidth = 4;
  for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += h / 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = '#8a949d';
  for (let x = 0; x <= w; x += w / 4) for (let y = 12; y < h; y += 26) { g.beginPath(); g.arc(x + 14, y, 3, 0, 7); g.fill(); }
}, repeat);
/** corrugated steel (hangar walls and roof): vertical ribs, weathering streaks, a few rust stains (tile 6 m) */
export const corrugatedTex = (repeat: [number, number], base = '#b8bfc4') => paint((g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, hexK(base, 0.82)); gr.addColorStop(0.5, hexK(base, 1.1)); gr.addColorStop(1, hexK(base, 0.82)); g.fillStyle = gr; g.fillRect(x, 0, 32, h); }
  g.globalAlpha = 0.16; for (let i = 0; i < 40; i++) { g.fillStyle = rnd(i) < 0.7 ? '#5d646a' : '#9a5a32'; g.fillRect(rnd(i + 3) * w, rnd(i + 7) * h * 0.4, 10 + 30 * rnd(i + 9), h * (0.2 + 0.5 * rnd(i + 11))); }
  g.globalAlpha = 1; g.strokeStyle = '#6a7177'; g.lineWidth = 5; for (const y of [h / 3, (2 * h) / 3]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
}, repeat);
/** painted wood planks (the stand, tables, crates) (tile 2 m) */
export const woodTex = (repeat: [number, number], base = '#a8733f') => paint((g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += h / 8) {
    g.fillStyle = hexK(base, 0.9 + 0.2 * rnd(y)); g.fillRect(0, y, w, h / 8 - 6);
    g.strokeStyle = hexK(base, 0.75); g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const yy = y + rnd(y + i) * (h / 8); g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + 8, w * 0.6, yy - 8, w, yy); g.stroke(); }
    g.fillStyle = hexK(base, 0.55); g.fillRect(0, y + h / 8 - 6, w, 6);
  }
}, repeat);
/** concrete floor (the hangar) with oil stains and seams (tile 6 m) */
export const floorTex = (repeat: [number, number]) => paint((g, w, h) => {
  g.fillStyle = '#9fa3a6'; g.fillRect(0, 0, w, h); dab(g, w, h, '#a8acaf', 200, 41, 0.08, 120);
  g.strokeStyle = '#6f7477'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  g.globalAlpha = 0.3; for (let i = 0; i < 10; i++) { g.fillStyle = '#3c3a36'; g.beginPath(); g.ellipse(rnd(i + 60) * w, rnd(i + 70) * h, 60 + 80 * rnd(i + 80), 30 + 40 * rnd(i + 90), rnd(i) * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}, repeat);
/** a canvas of words or a drawing on a flat thing (a sign, a dial, a newspaper, the checklist) */
export const sheet = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => paint((g) => draw(g), [1, 1], w, h);

/** a far picture repeated n times side by side (every other copy mirrored, so no seam and no exact repeat): one picture
 *  once round 360 degrees made its barns and hangars several times life size; three copies bring them near true scale */
export const tiled = (img: HTMLImageElement | null, n = 3): HTMLImageElement | null => {
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width * n; c.height = img.height; const g = c.getContext('2d')!;
  for (let i = 0; i < n; i++) { g.save(); if (i % 2) { g.translate((i + 1) * img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0); } else g.drawImage(img, i * img.width, 0); g.restore(); }
  return c as unknown as HTMLImageElement;
};

/** a warm rim on a lit metal (world-r3's light step, for the plane): the two-tone light plus a fresnel edge in gold,
 *  strongest on the side the key comes from, so the silver plane gets a gold outline against the blue sky instead of
 *  reading cool on cool. `k` is the rim's strength. */
export const PLANE_RIM = { uRimK: { value: 2.2 }, uRimC: { value: new THREE.Color('#ffa83a') } };
export const rimmed = <T extends THREE.MeshLambertMaterial>(m: T): T => {
  m.onBeforeCompile = (sh) => {
    patchTwoTone(sh);
    Object.assign(sh.uniforms, PLANE_RIM);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRimK; uniform vec3 uRimC;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      {
        vec3 vd = normalize(vViewPosition);
        float fr = pow(clamp(1.0 - dot(normal, vd), 0.0, 1.0), 2.0); // vViewPosition points to the eye
        float side = 0.45;
        #if NUM_DIR_LIGHTS > 0
          side = 0.3 + 0.7 * clamp(dot(normal, directionalLights[0].direction) + 0.35, 0.0, 1.0);
        #endif
        gl_FragColor.rgb += uRimC * uRimK * fr * side;
        // and a warm wash on the faces the key strikes, so the plane's sunlit side is gold, not cool grey
        #if NUM_DIR_LIGHTS > 0
          gl_FragColor.rgb += uRimC * 0.22 * uRimK * clamp(dot(normal, directionalLights[0].direction), 0.0, 1.0) * 0.5;
        #endif
      }`);
  };
  m.customProgramCacheKey = () => 'twoToneRim1';
  return m;
};
