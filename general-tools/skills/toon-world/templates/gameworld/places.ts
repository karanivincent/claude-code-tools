import * as THREE from 'three';
import { hash, lerp, clamp, OWNER_AT, PLATFORM, type V3 } from './shots';

// The places, built in code as a low-poly game world (flat shaded, textures painted on canvases, colours by height):
//   deck    the smooth line's long bridge deck, afternoon: plank deck, rail fences with wire bracing, street lamps,
//           the owner's parasol, deckchair, table and lemonade; red mesas far off; lilac haze
//   canyon  the canyon floor: sand, the faceted orange-red canyon wall on the right (+x), dead palm trunks, cacti,
//           the desert plain to the left (-x), far mesas, deep blue sky
//   gorge   the smooth line again, on a steel arch bridge across a deep gorge: the gorge as one terrain with streaky
//           strata, the arch (two trussed ribs, spandrel posts), the deck with fences and lamps, the plateau, far
//           mesas; one builder with three moods: 'sunset' (shot C), 'washed' (D, the hottest-day haze), 'end' (E, blue
//           sky, with the viewing platform on the rim)
// Every place returns its lights; the sun's shadow box follows the camera (fitSun).

export type Mood = 'deck' | 'canyon' | 'sunset' | 'washed' | 'end';
export interface Look {
  skyTop: string; skyHorizon: string; skyLow: string; sunGlow: string; fog: string; fogNear: number; fogFar: number;
  sun: string; sunI: number; sunDir: V3; hemiSky: string; hemiGround: string; hemiI: number; ambient?: string;
}
export const LOOKS: Record<Mood, Look> = {
  // round 3: a deep blue sky, a hard low sun that lights every sleeper top, little lilac haze
  deck: { skyTop: '#1b4cc4', skyHorizon: '#b2ccf2', skyLow: '#cbbedf', sunGlow: '#fff6e0', fog: '#c2c8ea', fogNear: 300, fogFar: 4200,
    sun: '#fff0da', sunI: 4.2, sunDir: [-0.55, 0.42, 0.72], hemiSky: '#a2b2ee', hemiGround: '#7a4248', hemiI: 0.75 },
  canyon: { skyTop: '#2557c4', skyHorizon: '#a9c8f2', skyLow: '#e8c2a6', sunGlow: '#fff4dc', fog: '#d9b8b0', fogNear: 200, fogFar: 3200,
    sun: '#fff0d6', sunI: 3.0, sunDir: [-0.35, 0.72, -0.6], hemiSky: '#9aaaf0', hemiGround: '#8a3a4a', hemiI: 1.1 },
  sunset: { skyTop: '#a99ad8', skyHorizon: '#ffd9a2', skyLow: '#f4b08c', sunGlow: '#fff0c8', fog: '#f0b8a0', fogNear: 220, fogFar: 2100,
    sun: '#ffc890', sunI: 2.7, sunDir: [0.45, 0.32, 0.65], hemiSky: '#e0b0e0', hemiGround: '#7a3a66', hemiI: 1.2 },
  washed: { skyTop: '#f4ead8', skyHorizon: '#fff6e2', skyLow: '#fbe8c8', sunGlow: '#ffffff', fog: '#fff0d4', fogNear: 80, fogFar: 1000,
    sun: '#fff0d0', sunI: 1.7, sunDir: [0.5, 0.45, -0.5], hemiSky: '#fff0e0', hemiGround: '#9070a8', hemiI: 0.95 },
  end: { skyTop: '#2f6ad2', skyHorizon: '#d6cce8', skyLow: '#e0a8b8', sunGlow: '#fff4dc', fog: '#dcc0d4', fogNear: 400, fogFar: 5200,
    sun: '#ffe8d0', sunI: 2.5, sunDir: [-0.5, 0.55, 0.65], hemiSky: '#9aa8ff', hemiGround: '#7a3a62', hemiI: 1.2 },
};

const sm = (k: number) => { const c = clamp(k); return c * c * (3 - 2 * c); };
const col = (c: string) => new THREE.Color(c);
/** smooth 2D value noise in [-1, 1] */
export function noise2(x: number, y: number, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a: number, b: number) => hash(a * 57 + b * 131 + s * 17.3, s) * 2 - 1;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
const fbm = (x: number, y: number, s = 0) => noise2(x, y, s) * 0.6 + noise2(x * 2.1, y * 2.1, s + 1) * 0.28 + noise2(x * 4.3, y * 4.3, s + 2) * 0.12;
const flat = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...o });
const shadowy = <T extends THREE.Object3D>(o: T, cast = true, recv = true) => { o.traverse(c => { c.castShadow = cast; c.receiveShadow = recv; }); return o; };

// ---- sky, sun, haze --------------------------------------------------------------------------------------------------
export function makeSky(L: Look) {
  const u = { top: { value: col(L.skyTop) }, hor: { value: col(L.skyHorizon) }, low: { value: col(L.skyLow) }, glow: { value: col(L.sunGlow) }, sun: { value: new THREE.Vector3(...L.sunDir).normalize() } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `varying vec3 vD; uniform vec3 top, hor, low, glow, sun;
      void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y * 3.2, 0.0, 1.0), 0.55)) : mix(hor, low, clamp(-y * 6.0, 0.0, 1.0));
        float s = max(dot(normalize(vD), sun), 0.0); c += glow * (pow(s, 24.0) * 0.5 + pow(s, 4.0) * 0.12);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}
export function makeLights(scene: THREE.Scene, L: Look) {
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI);
  scene.add(hemi);
  scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
  return { sun, hemi };
}
/** keep the sun's shadow box on what the camera sees: centred `ahead` metres in front of it, `size` metres across */
export function fitSun(sun: THREE.DirectionalLight, L: Look, cam: THREE.Camera, ahead: number, size: number) {
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const c = cam.position.clone().addScaledVector(fwd, ahead);
  const d = new THREE.Vector3(...L.sunDir).normalize();
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(d, 400); sun.target.updateMatrixWorld();
  const s = sun.shadow.camera; s.left = -size; s.right = size; s.top = size; s.bottom = -size; s.near = 1; s.far = 900; s.updateProjectionMatrix();
}

/** far red mesas, a ring of them out at 1-3 km: stepped buttes (a talus base, then one or two sheer tiers, each
 *  narrower), coloured in strata by height, so even through haze they read as layered rock, not as flat slabs */
/** `size` and `far` scale them and their distance, `tall` their height; `haze` bakes a share of the haze colour into
 *  them and takes them out of the fog (fog alone washed them to flat pale boxes; baked, they keep their sunlit and
 *  shaded faces and their strata) */
export function makeMesas(seed: number, around: V3, dirs: [number, number], tone: string[], size = 1, far = 1, tall = 1, haze?: { colour: string; k: number }, count = 26) {
  const g = new THREE.Group(), hazeC = haze ? col(haze.colour) : null;
  for (let i = 0; i < count; i++) {
    const a = lerp(dirs[0], dirs[1], hash(i, seed)), r = (1100 + 1600 * hash(i, seed + 1)) * far;
    const w = (110 + 240 * hash(i, seed + 2)) * size * far, h = (50 + 120 * hash(i, seed + 3)) * size * far * tall;
    const tiers = 2 + (hash(i, seed + 6) > 0.5 ? 1 : 0), parts: THREE.BufferGeometry[] = [];
    let y0 = 0;
    for (let k = 0; k < tiers; k++) {
      const shape = new THREE.Shape(), n = 9, wk = w * (1 - 0.3 * k), hk = h * (k === 0 ? 0.45 : 0.55 / (tiers - 1));
      for (let j = 0; j < n; j++) {
        const t = (j / n) * Math.PI * 2, q = 0.72 + 0.4 * hash(i * 31 + j + k * 7, seed);
        const x = Math.cos(t) * wk * q, y = Math.sin(t) * wk * 0.5 * q;
        if (j) shape.lineTo(x, y); else shape.moveTo(x, y);
      }
      const geo = new THREE.ExtrudeGeometry(shape, k === 0
        ? { depth: hk, bevelEnabled: true, bevelThickness: hk * 0.6, bevelSize: wk * 0.28, bevelSegments: 1 }
        : { depth: hk, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); geo.translate(0, y0, 0);
      parts.push(geo.index ? geo.toNonIndexed() : geo);
      y0 += hk;
    }
    const geo = mergeGeometries(parts), pp = geo.attributes.position, cs: number[] = [], base = col(tone[i % tone.length]), cc = new THREE.Color();
    for (let t = 0; t < pp.count; t += 3) {
      const yy = (pp.getY(t) + pp.getY(t + 1) + pp.getY(t + 2)) / 3, band = Math.floor((yy / h) * 9 + 9);
      cc.copy(base).multiplyScalar([1, 1.2, 0.84, 1.08, 0.74, 1.26, 0.92, 1.12, 0.8][((band % 9) + 9) % 9]);
      // the flat tops are paler (sunlit caprock)
      if (Math.abs(pp.getY(t) - pp.getY(t + 1)) < 0.01 && Math.abs(pp.getY(t) - pp.getY(t + 2)) < 0.01 && yy > 1) cc.multiplyScalar(1.15);
      if (haze) cc.lerp(hazeC!, haze.k);
      for (let e = 0; e < 3; e++) cs.push(cc.r, cc.g, cc.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, flat('#ffffff', { roughness: 1, vertexColors: true, fog: !haze }));
    m.position.set(around[0] + Math.sin(a) * r, around[1] - 10, around[2] - Math.cos(a) * r);
    m.rotation.y = hash(i, seed + 7) * 6;
    g.add(m);
  }
  return g;
}
/** a far mountain ridge on the horizon, out past the mesas: one jagged band in a cool haze colour (unfogged) */
export function makeRidge(seed: number, around: V3, R: number, colour: string, h: [number, number], arc: [number, number] = [-Math.PI, Math.PI]) {
  const pos: number[] = [], N = 220;
  const hAt = (k: number) => lerp(h[0], h[1], 0.5 + 0.5 * (0.6 * Math.sin(k * 0.21 + seed) + 0.3 * Math.sin(k * 0.73 + seed * 2) + 0.1 * (hash(k, seed) * 2 - 1)));
  for (let k = 0; k < N; k++) {
    const t0 = lerp(arc[0], arc[1], k / N), t1 = lerp(arc[0], arc[1], (k + 1) / N);
    const p = (t: number, y: number) => [around[0] + Math.sin(t) * R, around[1] + y, around[2] - Math.cos(t) * R];
    const a0 = p(t0, -40), a1 = p(t1, -40), b0 = p(t0, hAt(k)), b1 = p(t1, hAt(k + 1));
    pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, fog: false, side: THREE.DoubleSide }));
  m.renderOrder = -5;
  return m;
}
const _clouds: THREE.Texture[] = [];
/** soft natural clouds painted in code: v 0 a cumulus heap (lit tops, lilac-grey flat underside, ragged edges),
 *  v 1 a thin streak of cirrus */
function cloudTex(v: 0 | 1) {
  if (_clouds[v]) return _clouds[v];
  const W = 1024, H = v ? 256 : 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const blob = (x: number, y: number, r: number, inner: string, outer: string) => {
    const gr = g.createRadialGradient(x, y, r * 0.05, x, y, r);
    gr.addColorStop(0, inner); gr.addColorStop(0.6, inner.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 0.6})`)); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  if (v === 0) {
    const base = H * 0.72;
    // the shaded underside first, then the lit heap over it, then small ragged puffs at the edges
    for (let i = 0; i < 26; i++) { const x = W * (0.12 + 0.76 * hash(i, 41)), r = 50 + 70 * hash(i, 42); blob(x, base - r * 0.35, r, 'rgba(196,196,226,0.85)', 'rgba(196,196,226,0)'); }
    for (let i = 0; i < 60; i++) {
      const u = hash(i, 43), x = W * (0.14 + 0.72 * u), hump = Math.sin(u * Math.PI) ** 0.7, r = 26 + 70 * hash(i, 44) * (0.5 + hump);
      const y = base - 40 - (H * 0.5) * hump * (0.4 + 0.6 * hash(i, 45));
      if (y + r * 0.5 > base) continue;
      blob(x - r * 0.15, y - r * 0.2, r, 'rgba(255,255,255,0.95)', 'rgba(250,250,255,0)');
    }
    for (let i = 0; i < 40; i++) { const x = W * (0.06 + 0.88 * hash(i, 46)), y = base - H * 0.45 * hash(i, 47), r = 10 + 22 * hash(i, 48); blob(x, y, r, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'); }
    // a crisp flat base
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, base - 6, 0, base + 18); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, base - 6, W, H);
    g.globalCompositeOperation = 'source-over';
  } else {
    for (let i = 0; i < 70; i++) {
      const y = H * (0.3 + 0.4 * hash(i, 51)), x = W * hash(i, 52), len = 120 + 420 * hash(i, 53), th = 3 + 10 * hash(i, 54);
      const gr = g.createLinearGradient(x, 0, x + len, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.12 + 0.25 * hash(i, 55)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x + len / 2, y, len / 2, th, (hash(i, 56) - 0.5) * 0.1, 0, Math.PI * 2); g.fill();
    }
    // fade the strip's ends
    g.globalCompositeOperation = 'destination-in';
    const f = g.createLinearGradient(0, 0, W, 0); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.2, 'rgba(0,0,0,1)'); f.addColorStop(0.8, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = f; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (_clouds[v] = t);
}
export function makeClouds(seed: number, n: number, around: V3, tint = '#ffffff', alt: [number, number] = [260, 520], k = 1) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const wisp = i % 3 === 2, a = (hash(i, seed) - 0.5) * 2.4, r = (700 + 900 * hash(i, seed + 1)) / Math.max(0.5, k);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(wisp ? 1 : 0), color: tint, transparent: true, depthWrite: false, fog: false, opacity: wisp ? 0.75 : 0.95 }));
    s.position.set(around[0] + Math.sin(a) * r, lerp(alt[0], alt[1], hash(i, seed + 2)) + (wisp ? 120 : 0), around[2] - Math.cos(a) * r);
    const w = (wisp ? 900 + 600 * hash(i, seed + 3) : 420 + 380 * hash(i, seed + 3)) * k;
    s.scale.set(w, wisp ? w * 0.2 : w * (0.42 + 0.14 * hash(i, seed + 4)), 1);
    g.add(s);
  }
  return g;
}

// ---- painted textures (2048 near the camera, mipmapped, anisotropic; a bump map from the same paint where it pays) ----
const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; };
function texOf(c: HTMLCanvasElement, wrapS = THREE.RepeatWrapping as THREE.Wrapping, wrapT = THREE.RepeatWrapping as THREE.Wrapping, srgb = true) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = wrapS; t.wrapT = wrapT; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const rgbOf = (c: THREE.Color, v = 1, warm = 1) => `rgb(${Math.round(Math.min(1, c.r * v * warm) * 255)},${Math.round(Math.min(1, c.g * v) * 255)},${Math.round(Math.min(1, c.b * v / warm) * 255)})`;
/** planks painted in code: rows of boards (each its own shade), grain with knots, worn light edges, dark seams, nails.
 *  Boards run along the canvas x; tile it with `repeat`, or give a flat deck its own UVs in metres (`deckUV`). */
function plankTexture(base: string, seam: string, seed: number, rows = 8, S = 2048, gapPx = 5) {
  const [c, g] = canvasOf(S, S), k = S / 1024;
  const b = col(base), ph = S / rows;
  g.fillStyle = seam; g.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    let x = -hash(r, seed) * 400 * k;
    while (x < S) {
      const w = (300 + 300 * hash(r * 31 + x, seed + 1)) * k, v = 0.8 + 0.32 * hash(r * 17 + x, seed + 2), warm = 0.96 + 0.08 * hash(r + x, 9);
      const y0 = r * ph + gapPx * 0.4 * k, hh = ph - gapPx * k;
      g.fillStyle = rgbOf(b, v, warm); g.fillRect(x + 2 * k, y0, w - 4 * k, hh);
      // a lighter worn top edge and a darker lower edge on each board (reads as a bevel)
      g.fillStyle = 'rgba(255,240,235,0.25)'; g.fillRect(x + 2 * k, y0, w - 4 * k, 3 * k);
      g.fillStyle = 'rgba(30,10,30,0.25)'; g.fillRect(x + 2 * k, y0 + hh - 4 * k, w - 4 * k, 4 * k);
      // grain: long gently wavy lines, darker and lighter
      for (let n = 0; n < 16; n++) {
        const dark = hash(r * 7 + n + x, 4) > 0.35;
        g.strokeStyle = dark ? `rgba(40,10,30,${0.08 + 0.1 * hash(r * 7 + n + x, 3)})` : `rgba(255,235,225,${0.06 + 0.07 * hash(n + x, 5)})`;
        g.lineWidth = (0.7 + 1.4 * hash(n + x, 6)) * k;
        const yy = y0 + hh * (0.08 + 0.84 * hash(n + x, r)), a = (2 + 4 * hash(n, r + x)) * k;
        g.beginPath(); g.moveTo(x + 4 * k, yy); g.bezierCurveTo(x + w * 0.3, yy + a, x + w * 0.6, yy - a, x + w - 4 * k, yy + a * 0.5); g.stroke();
      }
      // scuffs
      for (let n = 0; n < 10; n++) { g.fillStyle = `rgba(255,235,230,${0.05 + 0.06 * hash(n, x + r)})`; g.fillRect(x + w * hash(n, r + 3 + x), y0 + hh * hash(n, r + 5), (10 + 40 * hash(n, r + 6)) * k, 1.5 * k); }
      // a knot now and then
      if (hash(r * 13 + x, seed + 7) > 0.55) {
        const kx = x + w * (0.2 + 0.6 * hash(r + x, 8)), ky = y0 + hh * (0.3 + 0.4 * hash(x, r + 2));
        for (let j = 2; j >= 0; j--) { g.strokeStyle = `rgba(40,10,30,${0.18 + 0.1 * j})`; g.lineWidth = 1.4 * k; g.beginPath(); g.ellipse(kx, ky, (9 + j * 6) * k, (4 + j * 2.5) * k, 0, 0, 7); g.stroke(); }
        g.fillStyle = 'rgba(40,10,30,0.5)'; g.beginPath(); g.ellipse(kx, ky, 6 * k, 3 * k, 0, 0, 7); g.fill();
      }
      // nails at the board ends, with a glint
      for (const xx of [x + 14 * k, x + w - 14 * k]) for (const yy of [y0 + hh * 0.28, y0 + hh * 0.72]) {
        g.fillStyle = 'rgba(40,24,40,0.8)'; g.beginPath(); g.arc(xx, yy, 3.4 * k, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,240,230,0.45)'; g.beginPath(); g.arc(xx - k, yy - k, 1.2 * k, 0, 7); g.fill();
      }
      x += w;
    }
  }
  return texOf(c);
}
/** UVs in metres for a deck laid flat along z: boards run along z; `texAlong` metres of world per texture width */
function deckUV(geo: THREE.BufferGeometry, texAlong: number, texAcross: number) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) / texAlong; uv[i * 2 + 1] = p.getX(i) / texAcross; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function noiseTexture(base: string, spots: string[], seed: number, size = 512, n = 2200) {
  const [c, g] = canvasOf(size, size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) { g.fillStyle = spots[i % spots.length]; g.globalAlpha = 0.25 + 0.5 * hash(i, seed + 2); const r = (1 + 4 * hash(i, seed + 3)) * size / 512; g.beginPath(); g.ellipse(hash(i, seed) * size, hash(i, seed + 1) * size, r * 1.6, r, hash(i, seed + 4) * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  return texOf(c);
}
/** an irregular band edge that still tiles across the texture: integer-frequency sines with random phases per band */
const wavy = (x: number, W: number, i: number, a = 14) => {
  let v = 0;
  for (let k = 0; k < 5; k++) { const n = 1 + Math.floor(hash(i * 5 + k, 71) * (3 + k * 4)); v += (a / (1 + k * 0.9)) * Math.sin((x / W) * Math.PI * 2 * n + hash(i * 5 + k, 72) * 6.28); }
  return v * 0.6;
};
/** canyon rock: strata bands with wavy edges (from the foot up), seams, fine strata lines, dark varnish patches and
 *  streaks, and dark cracks. u runs along the wall (it tiles), v from the foot (0) to the top (1). */
function rockStrataTexture(bands: string[], seed: number) {
  const W = 2048, H = 2048, [c, g] = canvasOf(W, H);
  const tops: number[] = [];
  for (let y = H, k = 0; y > -40; k++) { const th = 60 + 170 * hash(k, seed); tops.push(y - th); y -= th; }
  // paint top-down so each band keeps its own height (canvas y grows downward; v = 0 is the canvas bottom)
  for (let i = tops.length - 1; i >= 0; i--) {
    g.fillStyle = bands[i % bands.length];
    g.beginPath(); g.moveTo(0, H + 10);
    for (let x = 0; x <= W; x += 32) g.lineTo(x, tops[i] + wavy(x, W, i));
    g.lineTo(W, H + 10); g.closePath(); g.fill();
  }
  // light speckle and soft mottling inside the bands
  for (let i = 0; i < 30000; i++) { g.fillStyle = hash(i, seed + 20) > 0.5 ? 'rgba(255,225,190,0.16)' : 'rgba(80,10,20,0.16)'; const r = 0.8 + 2.2 * hash(i, seed + 21); g.fillRect(hash(i, seed + 22) * W, hash(i, seed + 23) * H, r * 2, r); }
  for (let i = 0; i < tops.length; i++) {
    // a dark seam and a thin light line at each band's top edge
    g.strokeStyle = 'rgba(60,8,20,0.5)'; g.lineWidth = 5;
    g.beginPath(); for (let x = 0; x <= W; x += 32) { const yy = tops[i] + wavy(x, W, i); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke();
    g.strokeStyle = 'rgba(255,225,190,0.4)'; g.lineWidth = 3;
    g.beginPath(); for (let x = 0; x <= W; x += 32) { const yy = tops[i] + 7 + wavy(x, W, i); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke();
  }
  // thin fine strata lines inside the bands
  for (let i = 0; i < 140; i++) {
    const yy = hash(i, seed + 3) * H, a = 0.06 + 0.12 * hash(i, seed + 4);
    g.strokeStyle = hash(i, seed + 5) > 0.5 ? `rgba(70,12,20,${a})` : `rgba(255,220,180,${a})`; g.lineWidth = 1 + 2 * hash(i, seed + 6);
    g.beginPath(); for (let x = 0; x <= W; x += 32) { const v = yy + wavy(x, W, i, 6); if (x) g.lineTo(x, v); else g.moveTo(x, v); } g.stroke();
  }
  // dark blotches (desert varnish) and vertical varnish streaks running down from them
  for (let i = 0; i < 30; i++) {
    const x = hash(i, seed + 7) * W, yy = hash(i, seed + 8) * H, r = 40 + 120 * hash(i, seed + 9);
    g.fillStyle = `rgba(90,12,30,${0.14 + 0.16 * hash(i, seed + 10)})`;
    g.beginPath(); g.ellipse(x, yy, r * 1.4, r * 0.7, 0, 0, 7); g.fill();
    for (let s = 0; s < 8; s++) { const sx = x + (hash(i * 9 + s, seed + 11) - 0.5) * r * 2; g.fillStyle = `rgba(80,10,28,${0.08 + 0.12 * hash(s, i)})`; g.fillRect(sx, yy, 3 + 8 * hash(s, i + 1), 100 + 340 * hash(s, i + 2)); }
  }
  // dark cracks: jagged lines running down, with a light lip on one side
  for (let i = 0; i < 60; i++) {
    const x0 = hash(i, seed + 12) * W, y0 = hash(i, seed + 13) * H, len = 140 + 520 * hash(i, seed + 14), w = 2 + 4 * hash(i, seed + 16);
    for (const [dx, sty, lw] of [[2.5, 'rgba(255,215,180,0.35)', w * 0.6], [0, `rgba(40,4,12,${0.55 + 0.35 * hash(i, seed + 15)})`, w]] as const) {
      let x = x0 + dx, yy = y0;
      g.strokeStyle = sty; g.lineWidth = lw; g.beginPath(); g.moveTo(x, yy);
      for (let s = 0; s < len; s += 18) { x += (hash(s + i, seed + 17) - 0.5) * 18; yy += 18; g.lineTo(x, yy); }
      g.stroke();
    }
  }
  return texOf(c, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);
}
/** a fine tiling rock detail for the bump map: pits, chips and hairline cracks (grey, not colour) */
function rockDetailTexture(seed: number) {
  const S = 1024, [c, g] = canvasOf(S, S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { const v = hash(i, seed) > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${0.06 + 0.12 * hash(i, seed + 1)})`; const r = 2 + 18 * hash(i, seed + 2) ** 2; g.beginPath(); g.ellipse(hash(i, seed + 3) * S, hash(i, seed + 4) * S, r * 1.5, r, hash(i, seed + 5) * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 40; i++) {
    let x = hash(i, seed + 6) * S, y = hash(i, seed + 7) * S; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5 + 2 * hash(i, seed + 8);
    g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 12; s++) { x += (hash(s, i + seed) - 0.5) * 40; y += 14 + 10 * hash(s, i); g.lineTo(x, y); } g.stroke();
  }
  return texOf(c, THREE.RepeatWrapping, THREE.RepeatWrapping, false);
}
/** the gorge's strata: horizontal bands smeared by vertical streaks (the reference's stretched-canyon look), the deep
 *  colour at the bottom (v = 0), and a sand band at the very top (v > 0.985) for the plateau */
function gorgeStrataTexture(bands: string[], deep: string, top: string, seed: number) {
  const W = 2048, H = 2048, [c, g] = canvasOf(W, H);
  const tops: number[] = [];
  for (let y = H, k = 0; y > H * 0.015; k++) { const th = 26 + 80 * hash(k, seed); tops.push(y - th); y -= th; }
  const wav = (x: number, i: number) => wavy(x, W, i + 40, 9);
  for (let i = tops.length - 1; i >= 0; i--) {
    g.fillStyle = bands[(i * 3 + Math.floor(hash(i, seed + 1) * 2)) % bands.length];
    g.beginPath(); g.moveTo(0, H + 10);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, tops[i] + wav(x, i));
    g.lineTo(W, H + 10); g.closePath(); g.fill();
  }
  // the deep bottom: fade to the deep colour over the lowest quarter
  const d = col(deep), dd = `${Math.round(d.r * 255)},${Math.round(d.g * 255)},${Math.round(d.b * 255)}`;
  const gr = g.createLinearGradient(0, H * 0.72, 0, H);
  gr.addColorStop(0, `rgba(${dd},0)`); gr.addColorStop(1, `rgba(${dd},0.92)`);
  g.fillStyle = gr; g.fillRect(0, H * 0.72, W, H * 0.28);
  // vertical streaks: thin strokes in the band colours, each dragging its colour down over the next bands
  for (let i = 0; i < 5200; i++) {
    const x = hash(i, seed + 2) * W, yy = hash(i, seed + 3) * H, len = 40 + 420 * hash(i, seed + 4) ** 2;
    const cc = hash(i, seed + 5) > 0.72 ? deep : bands[Math.floor(hash(i, seed + 6) * bands.length)];
    g.globalAlpha = 0.16 + 0.32 * hash(i, seed + 7);
    g.fillStyle = cc; g.fillRect(x, yy, 1.5 + 5 * hash(i, seed + 8), len);
  }
  g.globalAlpha = 1;
  // dark seams under some bands, light lips over others
  for (let i = 0; i < tops.length; i++) {
    g.strokeStyle = i % 2 ? 'rgba(40,8,60,0.4)' : 'rgba(255,220,200,0.22)'; g.lineWidth = i % 2 ? 4 : 2.5;
    g.beginPath(); for (let x = 0; x <= W; x += 16) { const v = tops[i] + wav(x, i); if (x) g.lineTo(x, v); else g.moveTo(x, v); } g.stroke();
  }
  // the plateau sand at the top
  g.fillStyle = top; g.fillRect(0, 0, W, H * 0.016);
  return texOf(c, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);
}
/** the side view's wall in the hottest-day haze: many fine, nearly straight strata lines (no cartoon waves), soft
 *  vertical smears, deep violet at the bottom fading to warm white at the top (the haze thickens with height) */
function hazeStrataTexture(bands: string[], deep: string, top: string, seed: number) {
  const W = 2048, H = 2048, [c, g] = canvasOf(W, H);
  const lo = col(deep), hi = col(top), cc = new THREE.Color();
  // fine bands, 6-26 px, each a band colour pulled toward deep (low) or the haze (high)
  for (let y = H, k = 0; y > 0; k++) {
    const th = 6 + 20 * hash(k, seed) ** 1.5, v = 1 - y / H; // v: 0 at the bottom of the wall, 1 at the top
    cc.set(bands[Math.floor(hash(k, seed + 1) * bands.length)]).lerp(lo, 0.4 * (1 - v) ** 2).lerp(hi, 0.5 * v ** 2.2);
    g.fillStyle = `rgb(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)})`;
    g.beginPath(); g.moveTo(0, y + 2);
    for (let x = 0; x <= W; x += 64) g.lineTo(x, y - th + 2.5 * Math.sin((x / W) * Math.PI * 2 * (1 + (k % 3)) + k));
    g.lineTo(W, y + 2); g.closePath(); g.fill();
    y -= th;
  }
  // hairline light and dark strata lines
  for (let i = 0; i < 260; i++) {
    const y = hash(i, seed + 2) * H, a = 0.08 + 0.14 * hash(i, seed + 3);
    g.fillStyle = hash(i, seed + 4) > 0.5 ? `rgba(255,244,230,${a})` : `rgba(50,24,80,${a})`;
    g.fillRect(0, y, W, 1 + 1.5 * hash(i, seed + 5));
  }
  // soft vertical smears (the stretched look), faint
  for (let i = 0; i < 2600; i++) {
    const x = hash(i, seed + 6) * W, y = hash(i, seed + 7) * H, len = 60 + 360 * hash(i, seed + 8) ** 2;
    g.fillStyle = hash(i, seed + 9) > 0.5 ? 'rgba(255,240,230,0.07)' : 'rgba(60,30,90,0.08)';
    g.fillRect(x, y, 2 + 4 * hash(i, seed + 10), len);
  }
  g.fillStyle = `rgb(${Math.round(hi.r * 255)},${Math.round(hi.g * 255)},${Math.round(hi.b * 255)})`; g.fillRect(0, 0, W, H * 0.016);
  return texOf(c, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);
}
/** ringed palm bark (u around, v up) */
function barkTexture(seed: number) {
  const [c, g] = canvasOf(256, 1024);
  g.fillStyle = '#7a5640'; g.fillRect(0, 0, 256, 1024);
  for (let y = 0; y < 1024; y += 22 + 10 * hash(y, seed)) {
    g.fillStyle = 'rgba(40,20,20,0.55)'; g.fillRect(0, y, 256, 4);
    g.fillStyle = 'rgba(230,190,150,0.25)'; g.fillRect(0, y + 4, 256, 3);
    for (let x = 0; x < 256; x += 18) { g.fillStyle = `rgba(30,15,15,${0.12 + 0.15 * hash(x, y)})`; g.fillRect(x, y + 6, 2, 12); }
  }
  return texOf(c);
}

// ---- a rail fence with wire bracing, and street lamps ------------------------------------------------------------------
function makeFence(x: number, z0: number, z1: number, y: number, colour: string, wire: string, step = 3) {
  const g = new THREE.Group(), m = flat(colour, { metalness: 0.4, roughness: 0.55 }), wm = flat(wire, { metalness: 0.8, roughness: 0.3 });
  const posts: THREE.BufferGeometry[] = [], wires: THREE.BufferGeometry[] = [];
  const H = 1.15;
  for (let z = z0; z >= z1; z -= step) { const p = new THREE.BoxGeometry(0.09, H, 0.09); p.translate(x, y + H / 2, z); posts.push(p); }
  const len = z0 - z1;
  for (const hh of [H, H * 0.55, 0.12]) { const r = new THREE.BoxGeometry(0.07, 0.07, len); r.translate(x, y + hh, (z0 + z1) / 2); posts.push(r); }
  // diagonal wire cross-bracing between posts
  for (let z = z0; z > z1 + 0.1; z -= step) {
    for (const s of [1, -1]) {
      const a = new THREE.Vector3(x, y + (s > 0 ? 0.15 : H - 0.05), z), b = new THREE.Vector3(x, y + (s > 0 ? H - 0.05 : 0.15), z - step);
      const d = b.clone().sub(a), l = d.length(), cyl = new THREE.CylinderGeometry(0.012, 0.012, l, 4);
      cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); cyl.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      wires.push(cyl);
    }
  }
  g.add(shadowy(new THREE.Mesh(mergeAll(posts), m)), shadowy(new THREE.Mesh(mergeAll(wires), wm), true, false));
  return g;
}
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const mergeAll = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map(g => (g.index ? g.toNonIndexed() : g)));
export const LAMP_GLOW = new THREE.Color(3.2, 2.3, 1.2);
function makeLamps(xs: number[], z0: number, z1: number, step: number, y: number, post: string, glow: THREE.Color = LAMP_GLOW) {
  const g = new THREE.Group(), pm = flat(post, { metalness: 0.5, roughness: 0.45 }), glass = new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: glow, flatShading: true });
  const parts: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [];
  for (let z = z0; z >= z1; z -= step) for (const x of xs) {
    const p = new THREE.CylinderGeometry(0.06, 0.09, 3.6, 6); p.translate(x, y + 1.8, z); parts.push(p);
    const base = new THREE.CylinderGeometry(0.16, 0.2, 0.4, 6); base.translate(x, y + 0.2, z); parts.push(base);
    const cap = new THREE.ConeGeometry(0.24, 0.26, 6); cap.translate(x, y + 4.3, z); parts.push(cap);
    const l = new THREE.CylinderGeometry(0.15, 0.11, 0.5, 6); l.translate(x, y + 3.92, z); lights.push(l);
  }
  g.add(shadowy(new THREE.Mesh(mergeAll(parts), pm), true, false), new THREE.Mesh(mergeAll(lights), glass));
  return g;
}

// ---- the owner's corner on the deck: parasol, deckchair, table, lemonade ------------------------------------------------
function stripes(a: string, b: string, n: number, w = 256, h = 256, vertical = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; if (vertical) g.fillRect((i * w) / n, 0, w / n + 1, h); else g.fillRect(0, (i * h) / n, w, h / n + 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeOwnerCorner(at: V3) {
  const g = new THREE.Group(); g.position.set(...at);
  const wood = flat('#8a5a3a'), white = flat('#efe6d6');
  // the deckchair: wooden frame, a green-and-white striped canvas sling, faces +z (toward the approaching camera)
  const chair = new THREE.Group();
  const CW = 0.5; const legA = (x: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), wood); b.position.set(x, 0.48, -0.28); b.rotation.x = -0.45; return b; };
  const legB = (x: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), wood); b.position.set(x, 0.3, 0.22); b.rotation.x = 0.35; return b; };
  const arm = (x: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.6), wood); b.position.set(x, 0.55, 0.0); return b; };
  chair.add(legA(-CW), legA(CW), legB(-CW), legB(CW), arm(-CW - 0.02), arm(CW + 0.02));
  const slingGeo = new THREE.PlaneGeometry(2 * CW - 0.06, 1.25, 1, 12); const pa = slingGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const v = (pa.getY(i) + 0.625) / 1.25; pa.setZ(i, -0.18 * Math.sin(v * Math.PI) - 0.45 * v + 0.2); pa.setY(i, 0.2 + v * 0.85); }
  slingGeo.computeVertexNormals();
  const sling = new THREE.Mesh(slingGeo, new THREE.MeshStandardMaterial({ map: stripes('#3f8a4e', '#f2efe4', 9), side: THREE.DoubleSide, roughness: 0.9 }));
  chair.add(sling); chair.rotation.y = -0.25; g.add(chair);
  // the parasol: pole, eight red and cream panels, a gold finial
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), flat('#d8c8a8', { metalness: 0.3 })); pole.position.set(-0.6, 1.4, -0.25); g.add(pole);
  const canopy = new THREE.Group(); canopy.position.set(-0.6, 2.72, -0.25); canopy.rotation.z = 0.14;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2, R = 1.85;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.32, 0, Math.cos(a0) * R, -0.12, Math.sin(a0) * R, Math.cos(a1) * R, -0.12, Math.sin(a1) * R], 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, flat(i % 2 ? '#f0e2c4' : '#d8302a', { side: THREE.DoubleSide, emissive: new THREE.Color(i % 2 ? '#806850' : '#701010') })); canopy.add(m);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), flat('#e0b040', { metalness: 0.7 })); tip.position.set(Math.cos(a0) * R, -0.12, Math.sin(a0) * R); canopy.add(tip);
  }
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), flat('#e0b040', { metalness: 0.8, roughness: 0.3 })); fin.position.y = 0.38; canopy.add(fin);
  g.add(canopy);
  // the table and the lemonade
  const table = new THREE.Group(); table.position.set(0.95, 0, 0.15);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), flat('#e88a3a')); top.position.y = 0.72;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), flat('#e88a3a')); stem.position.y = 0.36;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 12), flat('#3a8ab0')); foot.position.y = 0.015;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.17, 10), new THREE.MeshStandardMaterial({ color: '#ffe680', roughness: 0.15, transparent: true, opacity: 0.85, flatShading: true })); glass.position.set(0.08, 0.83, 0.05);
  const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10), flat('#f8f070')); lemon.position.set(0.12, 0.915, 0.05); lemon.rotation.z = 1.2;
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), flat('#e8403a')); straw.position.set(0.07, 0.95, 0.04); straw.rotation.z = 0.25;
  table.add(top, stem, foot, glass, lemon, straw); g.add(table);
  void white;
  return shadowy(g);
}

// ---- the deck place ------------------------------------------------------------------------------------------------------
export function makeDeck(scene: THREE.Scene) {
  const L = LOOKS.deck;
  scene.add(makeSky(L));
  const lights = makeLights(scene, L);
  const W = 10, z0 = 80, z1 = -1400;
  // warm pink-brown boards running along the track, about 0.27 m wide and 2-4 m long, bump from the same paint
  const tex = plankTexture('#d68e78', '#40202e', 2, 12);
  const deckGeo = deckUV(new THREE.PlaneGeometry(W, z0 - z1, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, (z0 + z1) / 2), 7, 3.2);
  const deckTop = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.6, roughness: 0.78 }));
  deckTop.receiveShadow = true; scene.add(deckTop);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 1.2, z0 - z1), flat('#5a3048')); slab.position.set(0, -0.61, (z0 + z1) / 2); scene.add(slab);
  scene.add(makeFence(-W / 2 + 0.1, z0, -600, 0, '#4a2632', '#e0d0e0'), makeFence(W / 2 - 0.1, z0, -600, 0, '#4a2632', '#e0d0e0'));
  scene.add(makeLamps([-W / 2 + 0.35, W / 2 - 0.35], 30, -600, 21, 0, '#3a2234', new THREE.Color(0.22, 0.18, 0.12)));
  // the desert floor far below the bridge, and the far mesas
  const dirt = noiseTexture('#c87050', ['#a85a42', '#dc9068', '#8a4a3c', '#e8a878', '#6a7a4a'], 8, 1024, 26000); dirt.repeat.set(160, 160);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2).translate(0, -80, -2000), new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }));
  scene.add(floor);
  scene.add(makeMesas(5, [0, -60, -100], [-1.3, 1.3], ['#b8442e', '#a83a3c', '#cc5a3a', '#9a3448'], 0.62, 1.12, 1.9, { colour: '#c8b8d8', k: 0.2 })); // sets r4: in front of the ridge, tops over the horizon
  scene.add(makeRidge(2, [0, -80, -100], 3600, '#8f97cc', [70, 230]));
  scene.add(makeClouds(3, 14, [0, 0, 0], '#ffffff', [300, 650], 1));
  scene.add(makeOwnerCorner(OWNER_AT));
  return { L, ...lights };
}

// ---- the canyon floor ------------------------------------------------------------------------------------------------------
/** the canyon wall's foot: it runs along z at about this x, facing -x toward the track */
export const WALL_X = 5.6;
function makeWall(x0: number, z0: number, z1: number, H: number, bands: string[]) {
  // a faceted cliff face along z, facing -x, with stepped ledges; painted strata (map) plus fine bump detail, and vertex
  // colours that only shade (flat shaded: the facets stay)
  const nz = Math.ceil((z0 - z1) / 1.5), ny = Math.ceil(H / 1.5);
  const geo = new THREE.PlaneGeometry(1, 1, nz, ny); const p = geo.attributes.position, uv = geo.attributes.uv;
  const cols: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5, z = lerp(z0, z1, u), y = v * H;
    const ledge = Math.floor(y / 7) * 0.9 + sm((y % 7) / 7) * 0.9; // stepped ledges
    const n = 3.2 * fbm(z * 0.04, y * 0.06, 3) + 1.9 * noise2(z * 0.35, y * 0.22, 4) + 0.8 * noise2(z * 1.1, y * 0.15, 5);
    // the foot never comes nearer the track than x0 - 0.3; higher up it leans back and bulges
    const x = Math.max(x0 - 0.3, x0 + 1.8 + ledge + 0.8 * n + y * 0.08) + (y > H * 0.82 ? -1.6 * sm((y / H - 0.82) / 0.18) : 0);
    const edge = u < 0.0001 || u > 0.9999 || v < 0.0001 || v > 0.9999;
    const j = edge ? 0 : 1;
    p.setXYZ(i, x + j * 0.7 * (hash(i, 61) - 0.5), y - 0.5 + j * 0.5 * (hash(i, 62) - 0.5), z + j * 0.5 * (hash(i, 63) - 0.5));
    uv.setXY(i, -z / 36, clamp(v + 0.012 * noise2(z * 0.1, y * 0.1, 11)));
    const patch = noise2(z * 0.07, y * 0.09, 10) > 0.4 ? 0.82 : 1;
    const shade = (0.9 + 0.14 * noise2(z * 0.2, y * 0.2, 9)) * patch; cols.push(shade, shade * 0.98, shade);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const detail = rockDetailTexture(5); detail.repeat.set(9, H / 4);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rockStrataTexture(bands, 3), bumpMap: detail, bumpScale: 2.2, vertexColors: true, roughness: 0.92, flatShading: true, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** green desert shrubs, sat on wall vertices near the top and on a few ledges (sampled from the wall's own geometry) */
function makeShrubs(wall: THREE.Mesh, n: number, seed: number) {
  const p = (wall.geometry as THREE.BufferGeometry).attributes.position;
  let top = -Infinity; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const inst = new THREE.InstancedMesh(geo, flat('#3f7a4a', { roughness: 0.8 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color();
  let k = 0;
  for (let t = 0; k < n && t < n * 40; t++) {
    const i = Math.floor(hash(t, seed) * p.count), y = p.getY(i);
    const nearTop = y > top - 4, ledge = (y % 7) < 0.6 && y > 6;
    if (!nearTop && !(ledge && hash(t, seed + 1) > 0.6)) continue;
    const s = (nearTop ? 0.7 : 0.4) + 0.8 * hash(t, seed + 2);
    q.setFromEuler(new THREE.Euler(0, hash(t, seed + 3) * 6, 0));
    m4.compose(new THREE.Vector3(p.getX(i) - 0.3, y + s * 0.4, p.getZ(i)), q, new THREE.Vector3(s, s * 0.7, s));
    inst.setMatrixAt(k, m4); inst.setColorAt(k, cc.set(hash(t, seed + 4) > 0.5 ? '#4a8a4a' : '#2f6a48').multiplyScalar(0.85 + 0.3 * hash(t, seed + 5))); k++;
  }
  inst.count = k;
  return shadowy(inst, true, false);
}
function makePalm(seed: number, h: number, bark: THREE.Texture) {
  // a dead palm: a tall thin ringed trunk with a slight lean and a few dried fronds drooping from the top
  const g = new THREE.Group(), barkM = new THREE.MeshStandardMaterial({ map: bark, bumpMap: bark, bumpScale: 1.5, roughness: 0.95, flatShading: true }), frond = flat('#8a6a3c', { side: THREE.DoubleSide });
  let y = 0, x = 0; const lean = (hash(seed, 1) - 0.5) * 0.08;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15 - i * 0.012, 0.18 - i * 0.012, h / 6, 7), barkM);
    seg.position.set(x, y + h / 12, 0); seg.rotation.z = -lean * (1 + i * 0.3); g.add(seg); y += h / 6; x += lean * h / 6 * (1 + i * 0.3);
  }
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.6), frond); f.position.set(x, y - 0.4, 0);
    f.rotation.set(0.2, (i / 5) * Math.PI * 2 + hash(seed, i), 0); f.rotateX(2.6 + 0.3 * hash(i, seed)); f.translateY(0.7); g.add(f);
  }
  return shadowy(g, true, false);
}
function makeCactus(seed: number, h: number) {
  const g = new THREE.Group(), m = flat('#3f8a52');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, h, 2, 8), m); body.position.y = h / 2; g.add(body);
  for (const s of [-1, 1]) {
    if (hash(seed, s + 3) < 0.25) continue;
    const ay = h * (0.35 + 0.3 * hash(seed, s + 5));
    const a1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 2, 6), m); a1.rotation.z = Math.PI / 2; a1.position.set(s * 0.4, ay, 0);
    const a2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.7, 2, 6), m); a2.position.set(s * 0.65, ay + 0.4, 0);
    g.add(a1, a2);
  }
  return shadowy(g, true, false);
}
/** a prickly pear: flat oval pads stacked on each other, a few pink fruits */
function makePricklyPear(seed: number) {
  const g = new THREE.Group(), pad = flat('#4f9a6a'), fruit = flat('#d8406a');
  const add = (x: number, y: number, z: number, ry: number, rz: number, s: number, depth: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), pad); m.scale.set(0.26 * s, 0.34 * s, 0.07 * s); m.position.set(x, y, z); m.rotation.set(0, ry, rz); g.add(m);
    if (depth < 2) for (let k = 0; k < 2; k++) {
      if (hash(seed * 7 + depth * 3 + k, 2) < 0.3) continue;
      const a = rz + (k ? 0.6 : -0.6) * (0.6 + 0.6 * hash(seed + k, depth)), d = 0.3 * s;
      add(x - Math.sin(a) * d * 1.6, y + Math.cos(a) * d * 1.6, z + (hash(k, seed) - 0.5) * 0.1, ry + (hash(k, seed + depth) - 0.5), a, s * 0.85, depth + 1);
    } else if (hash(seed, depth + x) > 0.4) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), fruit); f.position.set(x, y + 0.3 * s, z); g.add(f); }
  };
  add(0, 0.3, 0, hash(seed, 1) * 3, 0, 1, 0);
  return shadowy(g, true, false);
}
export function makeCanyon(scene: THREE.Scene) {
  const L = LOOKS.canyon;
  scene.add(makeSky(L));
  const lights = makeLights(scene, L);
  const sand = noiseTexture('#d8864e', ['#c06a3a', '#ecac70', '#b0603c', '#f2c088', '#a8503a'], 3, 1024, 22000); sand.repeat.set(1200, 1200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sand, bumpMap: sand, bumpScale: 1, roughness: 1 }));
  ground.receiveShadow = true; scene.add(ground);
  const wall = makeWall(WALL_X, 80, -900, 62, ['#de7232', '#f0a458', '#c4442a', '#e6803a', '#a62a28', '#d65a2c', '#f2b270', '#8a1e2a', '#c63a2c', '#741a2c']);
  scene.add(wall, makeShrubs(wall, 140, 7));
  const bark = barkTexture(2);
  for (let i = 0; i < 9; i++) { const z = 30 - i * 22 + 6 * hash(i, 3); const p = makePalm(i, 9 + 4 * hash(i, 4), bark); p.position.set(WALL_X - 1.4 + 0.6 * hash(i, 5), 0, z); scene.add(p); }
  // cacti and prickly pears along the wall's foot, a few out on the plain to the left
  for (let i = 0; i < 12; i++) { const c = makeCactus(i, 1.0 + 1.6 * hash(i, 6)); const right = i % 3 !== 0; c.position.set(right ? WALL_X - 1.9 + 1.2 * hash(i, 7) : -4 - 12 * hash(i, 7), 0, 6 - i * 14 - 8 * hash(i, 8)); c.rotation.y = hash(i, 9) * 6; scene.add(c); }
  for (let i = 0; i < 16; i++) { const c = makePricklyPear(i); c.position.set(WALL_X - 2.2 + 1.6 * hash(i, 17), 0, 12 - i * 9 - 5 * hash(i, 18)); c.scale.setScalar(0.9 + 0.7 * hash(i, 19)); scene.add(c); }
  // scattered rocks on the sand
  const rock = new THREE.IcosahedronGeometry(1, 1), rm = flat('#a85e46');
  const rocks = new THREE.InstancedMesh(rock, rm, 220); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color();
  for (let i = 0; i < 220; i++) {
    const x = (hash(i, 11) - 0.5) * 80, z = 20 - hash(i, 12) * 260;
    if (Math.abs(x) < 3.1 || x > WALL_X + 0.5) { m4.makeScale(0, 0, 0); rocks.setMatrixAt(i, m4); continue; }
    const s = 0.1 + 0.45 * hash(i, 13) ** 2; q.setFromEuler(new THREE.Euler(hash(i, 14) * 6, hash(i, 15) * 6, 0));
    m4.compose(new THREE.Vector3(x, s * 0.3, z), q, new THREE.Vector3(s, s * 0.65, s)); rocks.setMatrixAt(i, m4);
    rocks.setColorAt(i, cc.set(['#a85e46', '#c88a6a', '#8a5a52', '#d8b8a0'][i % 4]));
  }
  shadowy(rocks); scene.add(rocks);
  scene.add(makeMesas(9, [0, 0, 0], [-2.2, 0.2], ['#c85238', '#b04236', '#d8684a'], 0.8, 1.05, 1.4, { colour: '#d9b8b0', k: 0.3 })); // sets r4: hazed, not fogged flat
  scene.add(makeRidge(4, [0, 0, 0], 3600, '#8e9ad0', [60, 200]));
  scene.add(makeClouds(4, 7, [0, 0, 0], '#ffffff', [300, 600]));
  return { L, ...lights };
}

// ---- the gorge and its arch bridge ---------------------------------------------------------------------------------------
export const DECK_W = 9;
export const GORGE = { floor: -70, top: 80, bottom: 30 };
const rimN = (x: number, z: number) => 9 * fbm(x * 0.006, 0.5, 21) + 3 * noise2(x * 0.05, z * 0.02, 22);
/** the rim under the viewing platform: carved so the drop starts just past its yellow rail (z PLATFORM - 2.1) */
const RIM_AT = PLATFORM[2] - 2.1, RIM_CARVE = RIM_AT + rimN(PLATFORM[0], RIM_AT) - GORGE.top;
function gorgeDepth(x: number, z: number) {
  const w = z > 0 ? sm(clamp(1 - Math.abs(x - PLATFORM[0]) / 40)) : 0;
  const zz = Math.abs(z) + rimN(x, z) - RIM_CARVE * w;
  const t = clamp((zz - GORGE.bottom) / (GORGE.top - GORGE.bottom));
  // terraces: steep faces between flat ledges
  const steps = 9, f = t * steps, i = Math.floor(f), fr = f - i;
  const terr = (i + sm(clamp((fr - 0.3) / 0.7))) / steps;
  const endClose = sm(clamp((-x - 130) / 90)); // the gorge closes off far down -x (the wall the side view looks at)
  return GORGE.floor * (1 - terr) * (1 - endClose);
}
function makeGorgeTerrain(map: THREE.Texture, wanderK = 1) {
  const xs: number[] = [], zs: number[] = [];
  for (let x = -900; x <= 900; x += Math.abs(x) < 260 ? 5 : 20) xs.push(x);
  for (let z = -1400; z <= 1400; z += Math.abs(z) < 100 ? 1.6 : Math.abs(z) < 300 ? 10 : 60) zs.push(z);
  const pos: number[] = [], cols: number[] = [], uvs: number[] = [], idx: number[] = [];
  xs.forEach(x => zs.forEach(z => {
    const y = gorgeDepth(x, z) + (Math.abs(z) > GORGE.top + 10 ? 0.4 * noise2(x * 0.05, z * 0.05, 5) : 0);
    pos.push(x, y, z);
    // the strata are painted (map): u along the walls whichever way they face, v by depth (the top band is the plateau)
    // on the flat ledges v would be one band: wander it so a ledge shows several bands in patches
    const wander = wanderK * (0.03 * noise2(x * 0.04, z * 0.12, 35) + 0.012 * noise2(x * 0.25, z * 0.5, 36));
    uvs.push((x + z) / 60, y > -0.5 ? 0.995 : clamp(1 - y / GORGE.floor + wander, 0, 0.98));
    const top = y > -0.5, s = top ? 0.78 + 0.22 * noise2(x * 0.06, z * 0.06, 37) + 0.12 * (hash(x * 7.1 + z, 38) - 0.5) : 0.88 + 0.16 * noise2(x * 0.03, y * 0.8, 34);
    cols.push(s, s * (top ? 0.97 : 1), s);
  }));
  const nz = zs.length;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < nz - 1; j++) { const a = i * nz + j, b = a + 1, cc = a + nz, d = cc + 1; idx.push(a, b, cc, b, d, cc); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, flatShading: true }));
  m.receiveShadow = true; m.castShadow = true;
  return m;
}
function makeArch(steel: THREE.Material) {
  const g = new THREE.Group(), parts: THREE.BufferGeometry[] = [];
  const span = 64, base = -48, crown = -3.2;
  const yAt = (z: number, off: number) => base + (crown - base) * (1 - (z / span) ** 2) - off;
  const bar = (a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) => {
    const d = b.clone().sub(a), l = d.length(), geo = new THREE.BoxGeometry(w, h, l);
    const m4 = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)); geo.applyMatrix4(m4); geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(geo);
  };
  for (const x of [-3.6, 3.6]) {
    const n = 28;
    for (let i = 0; i < n; i++) {
      const z0 = -span + (2 * span * i) / n, z1 = -span + (2 * span * (i + 1)) / n;
      const u0 = new THREE.Vector3(x, yAt(z0, 0), z0), u1 = new THREE.Vector3(x, yAt(z1, 0), z1);
      const l0 = new THREE.Vector3(x, yAt(z0, 3.2 + 2 * (1 - Math.abs(z0) / span)), z0), l1 = new THREE.Vector3(x, yAt(z1, 3.2 + 2 * (1 - Math.abs(z1) / span)), z1);
      bar(u0, u1, 0.7, 0.8); bar(l0, l1, 0.7, 0.8); bar(i % 2 ? u0 : l0, i % 2 ? l1 : u1, 0.25); bar(u0, l0, 0.25);
    }
  }
  // cross ties between the two ribs, and the spandrel posts up to the deck
  for (let z = -span + 4; z <= span - 4; z += 6.4) {
    const y = yAt(z, 0);
    bar(new THREE.Vector3(-3.6, y, z), new THREE.Vector3(3.6, y, z), 0.3);
    if (y < -2.0) for (const x of [-3.6, 3.6]) { bar(new THREE.Vector3(x, y, z), new THREE.Vector3(x, -1.0, z), 0.4); bar(new THREE.Vector3(x, y, z), new THREE.Vector3(x, -1.0, z + 6.4), 0.12); }
  }
  // the deck girders
  for (const x of [-3.9, 3.9]) bar(new THREE.Vector3(x, -1.6, -96), new THREE.Vector3(x, -1.6, 96), 0.5, 1.4);
  const m = new THREE.Mesh(mergeAll(parts), steel); m.castShadow = true; m.receiveShadow = true; g.add(m);
  return g;
}
export function makePlatform(at: V3) {
  // the viewing platform on the rim: timber slats with gaps and grain (boards running toward the gorge), a thick frame,
  // the yellow rail along the front and sides, and posts and braces down the cliff under its overhanging front
  const g = new THREE.Group(); g.position.set(...at);
  const frame = flat('#5a3a2a');
  const base = new THREE.Mesh(new THREE.BoxGeometry(8, 0.28, 6), frame); base.position.y = -0.17; g.add(base);
  const tex = plankTexture('#b07a4c', '#2a1810', 7, 12, 2048, 26);
  const top = new THREE.Mesh(deckUV(new THREE.PlaneGeometry(8, 6, 1, 1).rotateX(-Math.PI / 2), 4.5, 2.2), new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2, roughness: 0.82 }));
  top.position.y = 0.001; g.add(top);
  const yel = flat('#f2c230', { roughness: 0.45, metalness: 0.25 });
  for (let x = -3.8; x <= 3.9; x += 1.9) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), yel); p.position.set(x, 0.55, -2.9); g.add(p); }
  for (const h of [1.1, 0.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.08, 0.08), yel); r.position.set(0, h, -2.9); g.add(r); }
  for (const s of [-1, 1]) for (const h of [1.1, 0.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 5.8), yel); r.position.set(s * 3.9, h, 0); g.add(r); }
  for (const s of [-1, 1]) for (const z of [0, 2.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), yel); p.position.set(s * 3.9, 0.55, z); g.add(p); }
  // posts down the cliff under the front edge, with cross braces
  const wood = flat('#4a2e22');
  for (const x of [-3.6, 0, 3.6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 26, 0.28), wood); p.position.set(x, -13.3, -2.6); g.add(p);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6.2, 0.16), wood); b.position.set(x, -2.6, -1.3); b.rotation.x = -0.45; g.add(b);
  }
  for (const y of [-3, -8]) { const r = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.16, 0.16), wood); r.position.set(0, y, -2.6); g.add(r); }
  return shadowy(g);
}
/** boulders and green shrubs on the plateau and the gorge's ledges (the end shot's foreground and telephoto view) */
function makeScatter(seed: number) {
  const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color();
  const rocks = new THREE.InstancedMesh(geo, flat('#ffffff'), 1400), shrubs = new THREE.InstancedMesh(geo, flat('#ffffff', { roughness: 0.8 }), 700);
  const rockC = ['#a8523a', '#d8b49a', '#7a4636', '#c4805e', '#8a6a62', '#e2c8b2'];
  let nr = 0, ns = 0;
  for (let i = 0; i < 6000 && (nr < 1400 || ns < 700); i++) {
    const x = -90 + 220 * hash(i, seed), z = -150 + 320 * hash(i, seed + 1);
    if (Math.abs(x) < 6.5) continue; // the bridge deck and track
    if (x > PLATFORM[0] - 5 && x < PLATFORM[0] + 5 && z > PLATFORM[2] - 4 && z < PLATFORM[2] + 6) continue; // the platform and its camera
    const y = gorgeDepth(x, z), top = y > -0.5;
    // keep things on flat ground: compare with the ground a metre away
    if (Math.abs(gorgeDepth(x + 1, z) - y) > 0.4 || Math.abs(gorgeDepth(x, z + 1) - y) > 0.4) continue;
    const shrub = hash(i, seed + 2) < (top ? 0.4 : 0.25);
    const sz = shrub ? 0.5 + 1.1 * hash(i, seed + 3) : 0.25 + 1.4 * hash(i, seed + 3) ** 2;
    q.setFromEuler(new THREE.Euler(hash(i, seed + 4) * 6, hash(i, seed + 5) * 6, 0));
    m4.compose(new THREE.Vector3(x, y + sz * (shrub ? 0.35 : 0.2), z), q, new THREE.Vector3(sz, sz * (shrub ? 0.7 : 0.6), sz * (0.8 + 0.4 * hash(i, seed + 6))));
    if (shrub && ns < 700) { shrubs.setMatrixAt(ns, m4); shrubs.setColorAt(ns++, cc.set(hash(i, seed + 7) > 0.5 ? '#4a8a4a' : '#2f6a48').multiplyScalar(0.8 + 0.35 * hash(i, seed + 8))); }
    else if (!shrub && nr < 1400) { rocks.setMatrixAt(nr, m4); rocks.setColorAt(nr++, cc.set(rockC[Math.floor(hash(i, seed + 9) * rockC.length)])); }
  }
  rocks.count = nr; shrubs.count = ns;
  g.add(shadowy(rocks), shadowy(shrubs, true, false));
  return g;
}
export function makeGorge(scene: THREE.Scene, mood: 'sunset' | 'washed' | 'end') {
  const L = LOOKS[mood];
  scene.add(makeSky(L));
  const lights = makeLights(scene, L);
  // streaky purple and orange strata for the sunset and the end, lilac in the washed side view
  const strata = mood === 'washed'
    ? hazeStrataTexture(['#7a52aa', '#9670c0', '#6a4498', '#b090cc', '#8660b4', '#a684c6'], '#4e3486', '#f4e6dc', 12)
    : gorgeStrataTexture(['#ff8a4a', '#e8406a', '#7a3a9a', '#ffb064', '#c02a6e', '#ff6a50', '#5a2a8a', '#ffc884', '#e85a3a', '#9a3a90'], '#2e1a5e', '#e2a084', 12);
  scene.add(makeGorgeTerrain(strata, mood === 'washed' ? 0.15 : 1));
  const steel = new THREE.MeshStandardMaterial({ color: mood === 'washed' ? '#b08850' : '#3a2a30', metalness: 0.65, roughness: 0.38, flatShading: true });
  scene.add(makeArch(steel));
  // the deck across the gorge and the track bed on the plateau beyond
  const tex = plankTexture('#6e5068', '#2e1c30', 4, 10); tex.repeat.set(1, 192 / 3);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 1.0, 192), [flat('#4a3044'), flat('#4a3044'), new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.2, roughness: 0.8 }), flat('#4a3044'), flat('#4a3044'), flat('#4a3044')]);
  deck.position.set(0, -0.5, 0); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
  scene.add(makeFence(-DECK_W / 2 + 0.1, 96, -96, 0, '#3a2830', '#c8b8c8', 2.4), makeFence(DECK_W / 2 - 0.1, 96, -96, 0, '#3a2830', '#c8b8c8', 2.4));
  scene.add(makeLamps([-DECK_W / 2 + 0.4, DECK_W / 2 - 0.4], 90, -90, 15, 0, '#2a2028'));
  scene.add(mood === 'washed'
    ? makeMesas(13, [0, 0, 0], [-1.4, 1.4], ['#d89a88', '#c88a84'], 0.6, 1.2, 1.2, { colour: '#fff0d4', k: 0.72 })
    : makeMesas(13, [0, 0, 0], [-1.4, 1.4], ['#c8563c', '#b84a42', '#d8684a'], 0.7, 1.15, 1.3, { colour: mood === 'sunset' ? '#f0b49c' : '#dcc0d4', k: 0.42 }, 12)); // sets r4: stepped red mesas, hazed, not fogged flat
  if (mood !== 'washed') scene.add(makeRidge(6, [0, 0, 0], 3600, mood === 'sunset' ? '#c494b8' : '#9aa0d4', [60, 200]));
  if (mood === 'end') scene.add(makeScatter(14));
  if (mood !== 'washed') scene.add(makeClouds(6, 6, [0, 0, 0], mood === 'sunset' ? '#ffe0c8' : '#ffffff', [300, 650]));
  if (mood === 'end') scene.add(makePlatform(PLATFORM));
  return { L, ...lights };
}
