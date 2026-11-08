import * as THREE from 'three';
import { hash, prog, smooth, clamp, lerp, type V3 } from './shots';

// The effects kit. Every effect is a pure function of the clip frame f, so any frame renders on its own (Remotion
// renders frames out of order and in parallel).
//   heatMaterial  the travelling thermal ramp on a rail: hard bands purple, magenta, coral, orange, yellow, white,
//                 emissive past 1.0 at the hot end so the bloom (threshold 1) takes only them
//   Streaks       camera-facing additive quads built on the CPU each frame: sparks, embers, spark trails
//   Puffs         a pool of sprites: smoke, dust, heat wisps, god rays, fire, the white cloud, the glint
//   Bits          a pool of small dark boxes: chips, flying spikes
//   effects       sparks(), plume(), explosion(), etc.: they fill the pools for this frame

// ---- the heat ramp ------------------------------------------------------------------------------------------------
export interface HeatU { uFront: { value: number }; uWidth: { value: number }; uCap: { value: number }; uGain: { value: number }; uDir: { value: number }; uFlank: { value: number } }
export type HeatMat = THREE.MeshStandardMaterial & { userData: { heat: HeatU } };
// The rail's section (track.ts PROFILE, y in metres over RAIL_H = 0.172), edge j from point j to j + 1. Its map's u runs
// (j + e) / 24 across the section, so a fragment can tell the head from the web and the foot.
const HEAT_PROFILE = `
const float RAIL_PY[25] = float[25](0.0, 0.0, 0.012, 0.022, 0.034, 0.06, 0.104, 0.117, 0.124, 0.15, 0.162, 0.169, 0.172,
  0.172, 0.169, 0.162, 0.15, 0.124, 0.117, 0.104, 0.06, 0.034, 0.022, 0.012, 0.0);
float railProfileY(vec3 nView) {
#ifdef USE_MAP
  float x = clamp(vMapUv.x, 0.0, 0.99999) * 24.0; int j = int(floor(x));
  return mix(RAIL_PY[j], RAIL_PY[j + 1], fract(x)) / 0.172;
#else
  return 0.5 + 0.5 * clamp(inverseTransformDirection(nView, viewMatrix).y, 0.0, 1.0);
#endif
}
`;
export function heatMaterial(p: THREE.MeshStandardMaterialParameters): HeatMat {
  const m = new THREE.MeshStandardMaterial({ ...p, flatShading: true }) as HeatMat;
  const u: HeatU = { uFront: { value: -1e6 }, uWidth: { value: 4 }, uCap: { value: 1 }, uGain: { value: 1 }, uDir: { value: 1 }, uFlank: { value: 0.6 } };
  m.userData.heat = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aU;\nvarying float vU;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vU = aU;');
    sh.fragmentShader = 'varying float vU;\nuniform float uFront, uWidth, uCap, uGain, uDir, uFlank;\n' + sh.fragmentShader.replace('#include <uv_pars_fragment>', '#include <uv_pars_fragment>\n' + HEAT_PROFILE).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float hh = clamp((uFront - vU) * uDir / uWidth, 0.0, 1.0);
    hh = min(hh, uCap);
    // across the profile: where on the rail's section this fragment sits (0 at the foot, 1 on the running surface).
    // The head runs hotter than the web and the foot, so one rail shows two or three bands across its section
    // (a yellow head over an orange flank over a magenta web), the way theirs does
    float py = railProfileY(normal);
    hh *= mix(uFlank, 1.0, smoothstep(0.55, 0.98, py));
    if (hh > 0.0005) {
      // six hard bands along the rail: the colour steps, never blends, so each band's edge travels as a line
      float b = ceil(hh * 6.0);
      vec3 pc; float e;
      if (b < 1.5)      { pc = vec3(0.40, 0.08, 1.00); e = 0.55; }  // purple
      else if (b < 2.5) { pc = vec3(1.00, 0.06, 0.62); e = 0.62; }  // magenta
      else if (b < 3.5) { pc = vec3(1.00, 0.14, 0.12); e = 0.7; }   // coral red
      else if (b < 4.5) { pc = vec3(1.00, 0.36, 0.03); e = 0.85; }  // orange
      else if (b < 5.5) { pc = vec3(1.00, 0.70, 0.08); e = 1.0; }   // yellow
      else              { pc = vec3(1.00, 0.80, 0.32); e = 0.95; }  // white hot (its crown goes white)
      float head = smoothstep(0.66, 0.76, py), crown = smoothstep(0.9, 0.99, py);
      // the head burns brightest and its crown pales toward white as the band gets hotter; the web and the foot stay
      // a deep, shaded version of the band, so the section reads as a rail and the fishplates and bolts stay dark
      vec3 core = mix(pc, vec3(1.0, 0.97, 0.86), crown * mix(0.6, 1.0, step(5.5, b)) * smoothstep(3.5, 6.0, b));
      float glow = mix(0.22, 1.0, smoothstep(0.66, 0.98, py)) * mix(0.85, 1.2, crown);
      // a hot rail is no mirror (a white sky reflection read as a blown-out smear) but keeps a sharp sun glint
      metalnessFactor = mix(metalnessFactor, 0.25, smoothstep(0.0, 0.3, hh));
      roughnessFactor = mix(roughnessFactor, 0.32, smoothstep(0.0, 0.3, hh));
      diffuseColor.rgb = core * mix(0.35, 0.6, head);
      // in the white band the crown burns past the bloom threshold: a white-hot head with a little halo on it alone
      float flare = b > 5.5 ? 1.0 + 0.6 * crown : 1.0;
      totalEmissiveRadiance += core * e * uGain * glow * flare;
    }
  }`);
  };
  m.customProgramCacheKey = () => 'heat-ramp';
  return m;
}
/** set a rail's heat: the front at `front` (track metres), bands spread over `width` behind it, capped at `cap` */
/** set a rail's heat: the front at `front` (track metres), bands spread over `width` behind it, capped at `cap`; `flank`
 *  is how hot the web and foot run against the head (1 = one colour across the section, 0.4 = two or three bands cooler) */
export function setHeat(m: HeatMat, front: number, width: number, cap = 1, gain = 1, dir = 1, flank = 0.6) {
  const u = m.userData.heat; u.uFront.value = front; u.uWidth.value = width; u.uCap.value = cap; u.uGain.value = gain; u.uDir.value = dir; u.uFlank.value = flank;
}
export const HEAT_CAP = { purple: 0.16, magenta: 0.33, coral: 0.5, orange: 0.66, yellow: 0.83, white: 1 };
/** a value keyed at frames ts (ascending), straight lines between keys, held flat outside them */
export function keyed(f: number, ts: number[], vs: number[]) {
  if (f <= ts[0]) return vs[0];
  for (let i = 1; i < ts.length; i++) if (f <= ts[i]) return lerp(vs[i - 1], vs[i], (f - ts[i - 1]) / (ts[i] - ts[i - 1]));
  return vs[vs.length - 1];
}

// ---- textures painted in code --------------------------------------------------------------------------------------
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const texOf = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
let _soft: THREE.Texture | null = null, _smoke: THREE.Texture[] = [], _star: THREE.Texture | null = null, _ray: THREE.Texture | null = null, _wisp: THREE.Texture | null = null;
export function softTex() {
  if (_soft) return _soft;
  const c = canvas(128, 128), g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (_soft = texOf(c));
}
/** a cauliflower puff with its light baked in (lit top-left, darker underneath): reads as volume */
export function smokeTex(v = 0) {
  if (_smoke[v]) return _smoke[v];
  const c = canvas(256, 256), g = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    const a = hash(i, v * 7 + 1) * Math.PI * 2, r = 30 + 40 * hash(i, v * 7 + 2), d = 46 * Math.sqrt(hash(i, v * 7 + 3));
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 0.9;
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.55, 'rgba(190,190,190,0.85)'); gr.addColorStop(0.85, 'rgba(120,120,120,0.5)'); gr.addColorStop(1, 'rgba(100,100,100,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return (_smoke[v] = texOf(c));
}
export function starTex() {
  if (_star) return _star;
  const c = canvas(128, 128), g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const r of [0, Math.PI / 2]) { g.save(); g.translate(64, 64); g.rotate(r); g.beginPath(); g.moveTo(-64, 0); g.lineTo(0, -3); g.lineTo(64, 0); g.lineTo(0, 3); g.closePath(); g.fill(); g.restore(); }
  return (_star = texOf(c));
}
export function rayTex() {
  if (_ray) return _ray;
  const c = canvas(64, 256), g = c.getContext('2d')!;
  const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.3, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, 64, 256);
  return (_ray = texOf(c));
}
export function wispTex() {
  if (_wisp) return _wisp;
  const c = canvas(64, 256), g = c.getContext('2d')!;
  for (let i = 0; i < 40; i++) {
    const y = 30 + i * 5, x = 32 + 9 * Math.sin(i * 0.22), r = 10 + 4 * Math.sin(i * 0.3);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return (_wisp = texOf(c));
}

// ---- pools --------------------------------------------------------------------------------------------------------
export class Streaks {
  mesh: THREE.Mesh; private pos: Float32Array; private col: Float32Array; private n = 0; private cam = new THREE.Vector3();
  constructor(parent: THREE.Object3D, private max = 1500) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3); this.col = new Float32Array(max * 4 * 3);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
    parent.add(this.mesh);
  }
  begin(camera: THREE.Camera) { this.n = 0; camera.getWorldPosition(this.cam); }
  /** a streak from head a to tail b, w metres wide, colour c at the head fading to 15 % at the tail */
  add(a: V3, b: V3, w: number, c: V3) {
    if (this.n >= this.max) return;
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), v = this.cam.clone().sub(A);
    if (d.lengthSq() < 1e-8) d.set(0, 1e-3, 0);
    const s = d.clone().cross(v).normalize().multiplyScalar(w / 2);
    const i = this.n++ * 12;
    this.pos.set([A.x + s.x, A.y + s.y, A.z + s.z, A.x - s.x, A.y - s.y, A.z - s.z, B.x + s.x * 0.4, B.y + s.y * 0.4, B.z + s.z * 0.4, B.x - s.x * 0.4, B.y - s.y * 0.4, B.z - s.z * 0.4], i);
    this.col.set([c[0], c[1], c[2], c[0], c[1], c[2], c[0] * 0.12, c[1] * 0.12, c[2] * 0.12, c[0] * 0.12, c[1] * 0.12, c[2] * 0.12], i);
  }
  end() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n * 6);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }
}

export interface PuffSpec { tex: THREE.Texture; pos: V3; size: number | [number, number]; color: V3; opacity: number; rot?: number; add?: boolean; fog?: boolean; order?: number }
export class Puffs {
  private pool: THREE.Sprite[] = []; private n = 0;
  constructor(private parent: THREE.Object3D, size = 260) {
    for (let i = 0; i < size; i++) this.grow();
  }
  private grow() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    s.visible = false; this.parent.add(s); this.pool.push(s); return s;
  }
  begin() { this.n = 0; }
  add(p: PuffSpec) {
    const s = this.n < this.pool.length ? this.pool[this.n] : this.grow(); this.n++;
    const m = s.material as THREE.SpriteMaterial;
    if (m.map !== p.tex) { m.map = p.tex; m.needsUpdate = true; }
    const blend = p.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (m.blending !== blend) { m.blending = blend; m.needsUpdate = true; }
    const fog = p.fog ?? true; if (m.fog !== fog) { m.fog = fog; m.needsUpdate = true; }
    m.color.setRGB(p.color[0], p.color[1], p.color[2]); m.opacity = clamp(p.opacity); m.rotation = p.rot ?? 0;
    s.position.set(...p.pos);
    if (typeof p.size === 'number') s.scale.set(p.size, p.size, 1); else s.scale.set(p.size[0], p.size[1], 1);
    s.renderOrder = p.order ?? 10; s.visible = p.opacity > 0.002;
  }
  end() { for (let i = this.n; i < this.pool.length; i++) this.pool[i].visible = false; }
}

export class Bits {
  mesh: THREE.InstancedMesh; private n = 0; private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private c = new THREE.Color();
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, private max = 200) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.castShadow = true; this.mesh.frustumCulled = false; parent.add(this.mesh);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.c.set('#ffffff'));
  }
  begin() { this.n = 0; }
  add(pos: V3, rot: V3, scale: V3, color = '#ffffff') {
    if (this.n >= this.max) return;
    this.e.set(...rot); this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    this.mesh.setMatrixAt(this.n, this.m4); this.mesh.setColorAt(this.n, this.c.set(color)); this.n++;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; this.mesh.visible = this.n > 0; }
}

// ---- the volume: raymarched smoke and fire ---------------------------------------------------------------------------
// A box in world space, drawn with a shader that walks each pixel's ray through it (fixed steps, jittered, striding through empty space). The shape comes
// from soft spheres ("blobs") that the effect functions add each frame: the CPU splats them into a coarse 3D grid
// (density in R, temperature in G, about 250,000 cells), and the shader carves that coarse shape with a tiling
// billow-noise texture (inverted Worley at two sizes plus value noise), so edges roll like cumulus. Light per step:
//   smoke     albedo x (sun through a 3-tap shadow ray toward the sun + sky/ground ambient by height + glow from heat)
//   fire      a temperature ramp, deep red -> orange -> yellow -> white, past 1.0 so the bloom takes it
// The noise is scaled about an origin that grows with the fireball, so the billows swell with it instead of sliding.
export interface Blob { c: V3; r: number; heat?: number; dens?: number }
export interface VolumeLook { sun: string; sunI: number; sunDir: V3; hemiSky: string; hemiGround: string; fog: string; fogNear: number; fogFar: number }
export interface VolumeStyle {
  smoke?: V3; density?: number; noiseAmp?: number; noiseFreq?: number; noiseOrigin?: V3; noiseScale?: number; drift?: V3;
  emit?: number; heatBoost?: number; rel?: number; hollow?: number; hollowSoft?: number; shadow?: number; shadowStep?: number; glow?: number; fogAmt?: number; step?: number; ambient?: number;
}
let _noise3: THREE.Data3DTexture | null = null;
function noise3() {
  if (_noise3) return _noise3;
  const N = 64, data = new Uint8Array(N * N * N * 4);
  // tiling inverted Worley at `cells` per tile, written to channel ch
  const worley = (cells: number, seed: number, ch: number) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < cells ** 3; i++) for (let k = 0; k < 3; k++) pts[i * 3 + k] = hash(i, seed + k);
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = (x + 0.5) / N * cells, py = (y + 0.5) / N * cells, pz = (z + 0.5) / N * cells;
      const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
      let best = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx, iy = cy + dy, iz = cz + dz;
        const wx = ((ix % cells) + cells) % cells, wy = ((iy % cells) + cells) % cells, wz = ((iz % cells) + cells) % cells;
        const j = ((wz * cells + wy) * cells + wx) * 3;
        const qx = ix + pts[j] - px, qy = iy + pts[j + 1] - py, qz = iz + pts[j + 2] - pz;
        const d = qx * qx + qy * qy + qz * qz; if (d < best) best = d;
      }
      // a rounded puff per cell (a sphere's height, not a cone), so the billows read as cauliflower heads
      data[((z * N + y) * N + x) * 4 + ch] = Math.round(255 * Math.sqrt(clamp(1 - best * 1.1)));
    }
  };
  worley(4, 11, 0); worley(9, 23, 1);
  // tiling value noise, 8 a tile, smooth-interpolated
  const L = 8, lat = (x: number, y: number, z: number) => hash((((z + L) % L) * L + ((y + L) % L)) * L + ((x + L) % L), 37);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N * L, py = y / N * L, pz = z / N * L, ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = s(px - ix), fy = s(py - iy), fz = s(pz - iz);
    const v = lerp(lerp(lerp(lat(ix, iy, iz), lat(ix + 1, iy, iz), fx), lerp(lat(ix, iy + 1, iz), lat(ix + 1, iy + 1, iz), fx), fy),
      lerp(lerp(lat(ix, iy, iz + 1), lat(ix + 1, iy, iz + 1), fx), lerp(lat(ix, iy + 1, iz + 1), lat(ix + 1, iy + 1, iz + 1), fx), fy), fz);
    const i = ((z * N + y) * N + x) * 4; data[i + 2] = Math.round(255 * v); data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return (_noise3 = t);
}
const VOL_VERT = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const VOL_FRAG = /* glsl */`
precision highp float; precision highp sampler3D;
uniform sampler3D uGrid, uNoise;
uniform vec3 uMin, uMax, uSunDir, uSunCol, uSky, uGround, uSmoke, uNoiseOrigin, uDrift, uFogCol;
uniform float uHeatBoost, uRel, uHollow, uHollowSoft, uTime, uDensity, uNoiseAmp, uNoiseFreq, uNoiseScale, uEmit, uShadow, uShadowStep, uGlow, uFogNear, uFogFar, uFogAmt, uAmb;
uniform float uStep;
varying vec3 vW;
vec3 ramp(float t) {
  // temperature to light: nothing below 0.12, deep red, orange, yellow, white-hot
  // kept near 1.0 so the colour does not clip flat: only the white-hot end goes well past it and blooms
  vec3 c0 = vec3(0.0), c1 = vec3(0.32, 0.035, 0.008), c2 = vec3(0.95, 0.28, 0.035), c3 = vec3(1.5, 1.05, 0.3), c4 = vec3(2.6, 2.4, 2.0);
  if (t < 0.12) return c0;
  if (t < 0.32) return mix(c0, c1, (t - 0.12) / 0.2);
  if (t < 0.55) return mix(c1, c2, (t - 0.32) / 0.23);
  if (t < 0.78) return mix(c2, c3, (t - 0.55) / 0.23);
  return mix(c3, c4, clamp((t - 0.78) / 0.2, 0.0, 1.0));
}
float dens(vec3 p, out float base, out float n, out float heatC, out float hn) {
  vec2 g = texture(uGrid, (p - uMin) / (uMax - uMin)).rg;
  base = g.r * 4.0; heatC = g.g; n = 0.0; hn = 0.0;
  if (g.r < 0.003) return 0.0;
  vec3 q = (p - uNoiseOrigin) / uNoiseScale * uNoiseFreq + uDrift * uTime;
  // domain warp: a low, smooth noise bends the billow lattice so the cells never read as a regular pattern
  vec3 w = texture(uNoise, q * 0.31 + vec3(0.5, 0.2, 0.8)).bgr;
  q += (w - 0.5) * 0.16;
  hn = w.r;
  vec3 n1 = texture(uNoise, q).rgb;
  float n2 = texture(uNoise, q * 2.7 + vec3(0.37, 0.11, 0.73)).g;
  n = n1.r * 0.55 + n1.g * 0.22 + n1.b * 0.08 + n2 * 0.15;
  // two ways to carve: additive (the noise only bites the soft outskirts: a smooth core, good for thin smoke) and
  // cut (the same, then cut again into separate cells, so a big ball shows billows all over its face, not a smooth skin)
  float dAdd = clamp(base * 1.2 + (n - 0.62) * uNoiseAmp, 0.0, 4.0);
  float dRel = dAdd * smoothstep(0.5, 0.66, n);
  return mix(dAdd, dRel, uRel);
}
float dens1(vec3 p) {
  // the shadow ray's cheaper density: the coarse shape and the big billows only
  vec2 g = texture(uGrid, (p - uMin) / (uMax - uMin)).rg;
  if (g.r < 0.003) return 0.0;
  vec3 q = (p - uNoiseOrigin) / uNoiseScale * uNoiseFreq + uDrift * uTime;
  vec3 n1 = texture(uNoise, q).rgb;
  float nn = n1.r * 0.7 + n1.g * 0.3;
  return mix(clamp(g.r * 4.8 + (nn - 0.62) * uNoiseAmp, 0.0, 4.0), clamp(g.r * 4.8 + (nn - 0.62) * uNoiseAmp, 0.0, 4.0) * smoothstep(0.5, 0.66, nn), uRel);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vW - ro);
  vec3 inv = 1.0 / rd, ta = (uMin - ro) * inv, tb = (uMax - ro) * inv, tmn = min(ta, tb), tmx = max(ta, tb);
  float t0 = max(max(max(tmn.x, tmn.y), tmn.z), 0.0), t1 = min(min(tmx.x, tmx.y), tmx.z);
  if (t1 <= t0) discard;
  float dt = uStep;
  // interleaved gradient noise: an even jitter that hides the step bands without a grainy speckle
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float t = t0 + dt * jit, T = 1.0, first = -1.0;
  vec3 col = vec3(0.0), ext = uMax - uMin;
  for (int i = 0; i < 360; i++) {
    if (t > t1) break;
    vec3 p = ro + rd * t, uvw = (p - uMin) / ext;
    float base, n, hc, hn;
    float d = dens(p, base, n, hc, hn);
    // empty space: stride three steps at a time until the coarse grid says there is something here
    if (base <= 0.012) { t += dt * 3.0; continue; }
    // a camera inside the fireball sits in a hollow, so it sees the billowed walls around it, not a white fog
    d *= smoothstep(uHollow, uHollow + uHollowSoft, t);
    {
      if (d > 0.002) {
        if (first < 0.0) first = t;
        vec2 g = vec2(base * 0.25, hc);
        // temperature: the coarse heat, raised in big irregular hot patches (hn) and inside the billows (n)
        // and cooler at each billow's skin (low d), so dark orange lines part the bright billows
        float heat = uHeatBoost * hc * (0.35 + 0.45 * smoothstep(0.25, 0.75, hn) + 0.6 * smoothstep(0.38, 0.82, n)) * (0.3 + 0.7 * smoothstep(0.05, 1.2, d));
        // the shadow ray: three taps toward the sun at growing distances, through the noised density, so each
        // billow lights on its sunny side and darkens in its own shadow
        float sd = dens1(p + uSunDir * uShadowStep * 0.25) * 0.25 + dens1(p + uSunDir * uShadowStep * 0.8) * 0.55 + dens1(p + uSunDir * uShadowStep * 2.0) * 1.2;
        float sh = exp(-sd * uShadow * 2.0);
        vec3 amb = mix(uGround, uSky, clamp(uvw.y * 1.2, 0.0, 1.0)) * uAmb;
        vec3 lit = uSmoke * (uSunCol * sh + amb) + uSmoke * vec3(2.4, 0.7, 0.2) * uGlow * g.g * (1.0 - n);
        // fire is self-shadowed too, a little: the sunny side of each billow burns brighter, its crevices go deep orange
        vec3 em = ramp(heat) * uEmit * mix(0.25, 1.0, sh);
        float a = 1.0 - exp(-d * uDensity * dt);
        col += T * a * (lit * (1.0 - smoothstep(0.35, 0.75, heat)) + em);
        T *= 1.0 - a;
        if (T < 0.01) break;
      }
    }
    t += dt;
  }
  if (T > 0.995) discard;
  float fogK = uFogAmt * smoothstep(uFogNear, uFogFar, first < 0.0 ? t1 : first);
  col = mix(col, uFogCol * (1.0 - T), fogK);
  gl_FragColor = vec4(col, 1.0 - T);
}`;

export class Volume {
  mesh: THREE.Mesh; private mat: THREE.ShaderMaterial; private blobs: Blob[] = []; private tex: THREE.Data3DTexture | null = null;
  private dims = [0, 0, 0]; private D = new Float32Array(1); private H = new Float32Array(1);
  constructor(parent: THREE.Object3D, look: VolumeLook, private budget = 260000) {
    const c = (s: string, k = 1) => new THREE.Color(s).multiplyScalar(k);
    this.mat = new THREE.ShaderMaterial({
      // no glslVersion: three (WebGL2 only) compiles GLSL 3.00 anyway and keeps its varying / gl_FragColor defines
      vertexShader: VOL_VERT, fragmentShader: VOL_FRAG,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uGrid: { value: null }, uNoise: { value: noise3() }, uMin: { value: new THREE.Vector3() }, uMax: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(...look.sunDir).normalize() }, uSunCol: { value: c(look.sun, look.sunI * 0.42) },
        uSky: { value: c(look.hemiSky) }, uGround: { value: c(look.hemiGround) }, uSmoke: { value: new THREE.Vector3() },
        uNoiseOrigin: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector3() }, uFogCol: { value: c(look.fog) },
        uTime: { value: 0 }, uDensity: { value: 1 }, uNoiseAmp: { value: 1 }, uNoiseFreq: { value: 1 }, uNoiseScale: { value: 1 }, uEmit: { value: 1 },
        uShadow: { value: 0.5 }, uShadowStep: { value: 1 }, uGlow: { value: 0 }, uFogNear: { value: look.fogNear }, uFogFar: { value: look.fogFar },
        uFogAmt: { value: 0 }, uAmb: { value: 0.5 }, uStep: { value: 0.5 }, uRel: { value: 0 }, uHeatBoost: { value: 1 }, uHollow: { value: 0 }, uHollowSoft: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 13; this.mesh.visible = false;
    parent.add(this.mesh);
  }
  begin() { this.blobs.length = 0; }
  add(b: Blob) { if (b.r > 0.01 && (b.dens ?? 1) > 0.001) this.blobs.push(b); }
  /** splat the blobs into the grid and set the shader up for frame f, seen from camera */
  end(f: number, camera: THREE.Camera, s: VolumeStyle = {}) {
    const B = this.blobs;
    this.mesh.visible = B.length > 0;
    if (!B.length) return;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of B) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.c[k] - b.r); mx[k] = Math.max(mx[k], b.c[k] + b.r); }
    const ext = [0, 1, 2].map(k => Math.max(mx[k] - mn[k], 0.01));
    const cell = Math.cbrt(ext[0] * ext[1] * ext[2] / this.budget);
    const dims = ext.map(e => clamp(Math.ceil(e / cell) + 2, 8, 192));
    // pad one cell each side so density reaches zero inside the box
    for (let k = 0; k < 3; k++) { const h = ext[k] / (dims[k] - 2); mn[k] -= h; mx[k] += h; ext[k] = mx[k] - mn[k]; }
    const [nx, ny, nz] = dims, n = nx * ny * nz;
    if (this.D.length < n) { this.D = new Float32Array(n); this.H = new Float32Array(n); } else { this.D.fill(0, 0, n); this.H.fill(0, 0, n); }
    const D = this.D, H = this.H, cs = ext.map((e, k) => e / dims[k]);
    for (const b of B) {
      const r2 = b.r * b.r, dens = b.dens ?? 1, heat = b.heat ?? 0;
      const lo = [0, 1, 2].map(k => Math.max(0, Math.floor((b.c[k] - b.r - mn[k]) / cs[k] - 0.5)));
      const hi = [0, 1, 2].map(k => Math.min(dims[k] - 1, Math.ceil((b.c[k] + b.r - mn[k]) / cs[k] - 0.5)));
      for (let z = lo[2]; z <= hi[2]; z++) {
        const dz = mn[2] + (z + 0.5) * cs[2] - b.c[2], dz2 = dz * dz; if (dz2 > r2) continue;
        for (let y = lo[1]; y <= hi[1]; y++) {
          const dy = mn[1] + (y + 0.5) * cs[1] - b.c[1], dyz = dz2 + dy * dy; if (dyz > r2) continue;
          const row = (z * ny + y) * nx;
          for (let x = lo[0]; x <= hi[0]; x++) {
            const dx = mn[0] + (x + 0.5) * cs[0] - b.c[0], d2 = dyz + dx * dx; if (d2 > r2) continue;
            const q = 1 - d2 / r2, w = q * q * dens;
            D[row + x] += w; H[row + x] += w * heat;
          }
        }
      }
    }
    if (!this.tex || this.dims.some((d, k) => d !== dims[k])) {
      this.tex?.dispose();
      const t = new THREE.Data3DTexture(new Uint8Array(n * 2), nx, ny, nz);
      t.format = THREE.RGFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1;
      this.tex = t; this.dims = dims;
    }
    const px = this.tex.image.data as Uint8Array;
    for (let i = 0; i < n; i++) { const d = D[i]; px[i * 2] = Math.min(255, Math.round(d * 63.75)); px[i * 2 + 1] = d > 1e-4 ? Math.min(255, Math.round(255 * H[i] / d)) : 0; }
    this.tex.needsUpdate = true;
    const u = this.mat.uniforms;
    u.uGrid.value = this.tex; u.uMin.value.set(mn[0], mn[1], mn[2]); u.uMax.value.set(mx[0], mx[1], mx[2]);
    u.uTime.value = f; u.uSmoke.value.set(...(s.smoke ?? [0.17, 0.08, 0.035]));
    u.uDensity.value = s.density ?? 1.5; u.uNoiseAmp.value = s.noiseAmp ?? 1.2; u.uNoiseFreq.value = s.noiseFreq ?? 0.3; u.uNoiseScale.value = s.noiseScale ?? 1;
    u.uNoiseOrigin.value.set(...(s.noiseOrigin ?? [0, 0, 0])); u.uDrift.value.set(...(s.drift ?? [0, -0.004, 0]));
    u.uEmit.value = s.emit ?? 1; u.uShadow.value = s.shadow ?? 0.6; u.uShadowStep.value = s.shadowStep ?? Math.min(...ext) * 0.12; u.uGlow.value = s.glow ?? 0;
    u.uFogAmt.value = s.fogAmt ?? 0; u.uAmb.value = s.ambient ?? 0.45; u.uStep.value = s.step ?? Math.max(...ext) / 64; u.uHollow.value = s.hollow ?? 0; u.uRel.value = s.rel ?? 0; u.uHeatBoost.value = s.heatBoost ?? 1; u.uHollowSoft.value = s.hollowSoft ?? Math.max(1, (s.hollow ?? 0) * 1.2);
    // inside the box the front faces are behind the near plane: draw the back faces, unoccluded
    const cp = new THREE.Vector3(); camera.getWorldPosition(cp);
    const inside = cp.x > mn[0] && cp.x < mx[0] && cp.y > mn[1] && cp.y < mx[1] && cp.z > mn[2] && cp.z < mx[2];
    this.mat.side = inside ? THREE.BackSide : THREE.FrontSide; this.mat.depthTest = !inside;
    this.mesh.position.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2); this.mesh.scale.set(ext[0], ext[1], ext[2]);
    this.mesh.updateMatrixWorld(true);
  }
}

// ---- the effects ------------------------------------------------------------------------------------------------------
const GOLD: V3 = [3.2, 1.9, 0.7];
export interface Burst {
  seed: number; n: number; f0: number; f1: number; life: [number, number];
  origin: (i: number) => V3; vel: (i: number) => V3; gravity?: number; width?: number; color?: V3; tail?: number;
}
/** sparks: each born between f0 and f1 at origin(i), flying with vel(i) (m a frame), falling, fading over its life */
export function sparks(S: Streaks, f: number, b: Burst) {
  const g = b.gravity ?? 0.012;
  for (let i = 0; i < b.n; i++) {
    const born = b.f0 + (b.f1 - b.f0) * hash(i, b.seed), life = lerp(b.life[0], b.life[1], hash(i, b.seed + 1)), a = f - born;
    if (a < 0 || a > life) continue;
    const o = b.origin(i), v = b.vel(i), at = (t: number): V3 => [o[0] + v[0] * t, o[1] + v[1] * t - 0.5 * g * t * t, o[2] + v[2] * t];
    const k = 1 - a / life, c = b.color ?? GOLD, w = (b.width ?? 0.03) * (0.6 + 0.6 * hash(i, b.seed + 2));
    S.add(at(a), at(Math.max(0, a - (b.tail ?? 1.6))), w, [c[0] * (0.4 + 0.6 * k), c[1] * (0.3 + 0.7 * k), c[2] * k]);
  }
}
/** a direction in a cone around `axis` (unit), half-angle `spread` (rad), speed s */
export function cone(i: number, seed: number, axis: V3, spread: number, s: number): V3 {
  const a = hash(i, seed) * Math.PI * 2, r = spread * Math.sqrt(hash(i, seed + 1));
  const ax = new THREE.Vector3(...axis).normalize();
  const t1 = new THREE.Vector3(0, 1, 0).cross(ax); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize();
  const t2 = ax.clone().cross(t1);
  const d = ax.multiplyScalar(Math.cos(r)).add(t1.multiplyScalar(Math.sin(r) * Math.cos(a))).add(t2.multiplyScalar(Math.sin(r) * Math.sin(a)));
  return [d.x * s, d.y * s, d.z * s];
}

/** the train's smoke as one volume: a soft sphere for every frame of the funnel's past (placed where the funnel WAS,
 *  then rising, drifting and swelling), splatted into the volume grid. The column therefore bends and lags with the
 *  train, and when the engine falls it hangs behind it as a ribbon. */
export interface PlumeOpts { n?: number; rise?: number; wind?: V3; size?: number; fade?: number; smoke?: V3; fogAmt?: number; maxR?: number; wave?: number }
export function plume(V: Volume, f: number, camera: THREE.Camera, funnelAt: (f: number) => V3 | null, o: PlumeOpts = {}) {
  const n = o.n ?? 90, wind = o.wind ?? [0.02, 0, -0.06], size = o.size ?? 1.6, wave = o.wave ?? 0;
  V.begin();
  for (let k = 0; k < n; k++) {
    const born = Math.floor(f) - k, a = f - born + 0.5;
    const p0 = funnelAt(born); if (!p0) continue;
    // rising at a steady rate (no ceiling, which piled the oldest puffs into a ball on top), swelling to a cap, and
    // drifting with the wind so the column leans; `wave` sways each puff by when it left the funnel: a wavy ribbon
    const rise = (o.rise ?? 0.16) * a / (1 + a / 260);
    const r = Math.min(size * (0.32 + 0.022 * a), size * (o.maxR ?? 1.5)) * (0.9 + 0.2 * hash(born, 3));
    const dens = Math.min(1, 0.35 + a / 4) * Math.exp(-a / (o.fade ?? 80));
    const sway = wave * Math.sin(born * 0.21) * Math.min(1, a / 10), sway2 = wave * Math.cos(born * 0.17) * Math.min(1, a / 10);
    V.add({ c: [p0[0] + wind[0] * a + (hash(born, 7) - 0.5) * 0.03 * a, p0[1] + rise + 0.2 + sway, p0[2] + wind[2] * a + sway2 + (hash(born, 8) - 0.5) * 0.03 * a], r, dens, heat: 0 });
  }
  V.end(f, camera, { smoke: o.smoke ?? [0.22, 0.115, 0.055], density: 3.2, noiseAmp: 1.5, noiseFreq: 0.3, drift: [0.003, -0.02, 0.002], shadow: 0.5, shadowStep: 1.6, ambient: 0.24, fogAmt: o.fogAmt ?? 0, step: 0.22 });
}

/** the explosion at c (a volume; frames from 438): a white-hot ball erupting and swelling (438-451), cooling through
 *  yellow and orange; from 450 its billows roll up into a mushroom: a dark brown-red cap with embers glowing inside, a
 *  bright orange stem and a burning skirt at its foot. Golden embers fall under it. */
export interface BlastOpts { scale?: number; lift?: number; fogAmt?: number; capY?: number; radius?: number }
export function explosion(V: Volume, S: Streaks, f: number, camera: THREE.Camera, c0: V3, o: BlastOpts = {}) {
  const a = f - 438, s = o.scale ?? 1, fogAmt = o.fogAmt ?? 0;
  // the fireball's heart rises out of the gorge fast (lift metres, most of it in the first 6 frames)
  const lift = (o.lift ?? 0) * (1 - Math.exp(-Math.max(0, a) / 3));
  const c: V3 = [c0[0], c0[1] + lift, c0[2]];
  V.begin();
  if (a >= 0) {
    const R = (o.radius ?? 36) * s * (1 - Math.exp(-a / 5)) + 2 * s, rise = 1.0 * s * a;
    const cool = a < 6 ? 1 : Math.exp(-(a - 6) / 11);
    const kc = smooth(prog(f, 446, 470)), H = (o.capY ?? 70) * s * (0.6 + 0.4 * kc) - lift, Rc = (7 + 4 * kc) * s, rc = (6 + 2.5 * kc) * s;
    const m = smooth(prog(f, 447, 456));           // the fireball rolling up into the cap
    const mh = smooth(prog(f, 451, 461));          // ...and cooling into it a little later, so 451-453 still burns
    for (let i = 0; i < 60; i++) {
      const d = cone(i, 42, [0, 1, 0], 1.6, 1), dist = R * (0.08 + 0.72 * hash(i, 43)), r0 = R * (0.36 + 0.26 * hash(i, 44)) + s;
      const ball: V3 = [c[0] + d[0] * dist, c[1] + Math.max(-0.2 * R, d[1] * dist * 0.75) + rise, c[2] + d[2] * dist];
      const heat0 = clamp(1.4 - 0.5 * dist / R - 0.15 * hash(i, 45)) * cool;
      // its place in the cap: around the ring, on the dome or underneath it
      const th = (i / 60) * Math.PI * 2 * 3 + 0.4 * hash(i, 46), ring = hash(i, 47) > 0.5, ph = hash(i, 48) * Math.PI * 2;
      const capP: V3 = ring
        ? [c[0] + Math.cos(th) * (Rc + rc * 0.5 * Math.cos(ph)), c[1] + H + rc * 0.6 * Math.sin(ph), c[2] + Math.sin(th) * (Rc + rc * 0.5 * Math.cos(ph))]
        : [c[0] + Math.cos(th) * Rc * 0.85 * Math.sqrt(hash(i, 49)), c[1] + H + rc * (0.35 + 0.9 * hash(i, 50)) * (1 - 0.5 * hash(i, 49)), c[2] + Math.sin(th) * Rc * 0.85 * Math.sqrt(hash(i, 49))];
      V.add({ c: [lerp(ball[0], capP[0], m), lerp(ball[1], capP[1], m), lerp(ball[2], capP[2], m)], r: lerp(r0, rc * (0.75 + 0.3 * hash(i, 51)), m),
        heat: lerp(heat0, 0.08 + 0.15 * hash(i, 52), mh), dens: Math.min(1, a / 1.5 + 0.2) });
    }
    if (f > 446) {
      // the stem: a column of fire from the foot to the cap
      for (let j = 0; j < 18; j++) {
        const y = c0[1] - c[1] + (j / 17) * (H + c[1] - c0[1]), gr = smooth(prog(f, 446 + j * 0.35, 452 + j * 0.35));
        V.add({ c: [c[0] + (hash(j, 53) - 0.5) * 2 * s, c[1] + y, c[2] + (hash(j, 54) - 0.5) * 2 * s], r: (5 - 1.5 * j / 17) * s * (0.6 + 0.4 * gr), heat: 0.85 - 0.25 * j / 17, dens: 0.9 * gr });
      }
      // the burning skirt at the foot, and the hot heart where the stem feeds the cap
      for (let j = 0; j < 8; j++) {
        const th = j / 8 * Math.PI * 2;
        V.add({ c: [c[0] + Math.cos(th) * 9 * s, c0[1] + 3 * s, c[2] + Math.sin(th) * 9 * s], r: 8 * s, heat: 0.7, dens: 0.8 * smooth(prog(f, 446, 452)) });
      }
      V.add({ c: [c[0], c[1] + H - rc * 0.2, c[2]], r: rc * 1.1, heat: 0.62, dens: 0.8 * m });
    }
  }
  const Rn = s * (8 + 12 * (1 - Math.exp(-Math.max(0, a) / 7)));
  // a safety net only: a camera inside the ball sees its far side (everything nearer than the heart's distance less
  // half the radius is carved away). The cut face is smooth, so frame the ball from outside (about 1.5 radii off)
  const cp = new THREE.Vector3(); camera.getWorldPosition(cp);
  const Rb = (o.radius ?? 36) * s * (1 - Math.exp(-Math.max(0, a) / 5)) + 2 * s, rb = 1.0 * s * Math.max(0, a);
  const dc = cp.distanceTo(new THREE.Vector3(c[0], c[1] + rb, c[2])), hollow = dc < Rb * 1.3 ? Math.max(0, dc - 0.45 * Rb) : 0;
  // the white burst: everything burns past white for the first frames, then the boost falls away
  const boost = 1 + 0.9 * (1 - smooth(prog(f, 441, 447)));
  V.end(f, camera, { smoke: [0.11, 0.04, 0.02], rel: 1, heatBoost: boost, density: 4 / s, noiseAmp: 2.2, noiseFreq: 1.0, noiseScale: Rn, noiseOrigin: c,
    drift: [0, -0.012, 0], emit: 1, shadow: 0.6, shadowStep: 3 * s, glow: 0.25, ambient: 0.35, fogAmt, step: 0.5 * s, hollow, hollowSoft: 0.12 * Rb });
  // embers: a golden fountain thrown out of the fireball's underside that arcs over and falls (444-470), and a few
  // sparks lifted on the heat over the cap
  const R0 = 36 * s * (1 - Math.exp(-Math.max(0, a) / 5));
  sparks(S, f, { seed: 60, n: 260, f0: 445, f1: 455, life: [9, 16], width: 0.22 * s, tail: 0.6, gravity: 0.045 * s,
    origin: i => [c[0] + (hash(i, 61) - 0.5) * 0.4 * R0, c[1] - 0.22 * R0 + 0.1 * R0 * hash(i, 62), c[2] + (hash(i, 63) - 0.5) * 0.4 * R0],
    vel: i => cone(i, 64, [0, -0.6, 0], 1.3, (0.25 + 0.35 * hash(i, 65)) * s), color: [3.8, 2.2, 0.6] });
  sparks(S, f, { seed: 70, n: 14, f0: 452, f1: 470, life: [12, 20], width: 0.14 * s, tail: 1.5, gravity: -0.004 * s,
    origin: i => [c[0] + (hash(i, 71) - 0.5) * 40 * s, c0[1] + (o.capY ?? 70) * s * (0.8 + 0.4 * hash(i, 72)), c[2] + (hash(i, 73) - 0.5) * 30 * s],
    vel: i => [(hash(i, 74) - 0.5) * 0.3 * s, 0.15 * s, (hash(i, 75) - 0.5) * 0.3 * s], color: [3.0, 1.0, 0.25] });
}

/** soft dust puffs (the train's front wheels on the bent rails) */
export function dust(P: Puffs, f: number, at: (f: number) => V3 | null, f0: number, f1: number, color: V3 = [1.0, 0.6, 0.38]) {
  for (let i = 0; i < 18; i++) {
    const born = f0 + (f1 - f0) * (i / 18), a = f - born; if (a < 0 || a > 16) continue;
    const p = at(born); if (!p) continue;
    const s = 0.7 + 0.12 * a;
    P.add({ tex: smokeTex(i % 3), pos: [p[0] + (hash(i, 71) - 0.5) * 1.6, p[1] + 0.3 + 0.05 * a, p[2] + (hash(i, 72) - 0.5) * 1.6], size: s * 1.6, color, opacity: 0.85 * (1 - a / 16), rot: i, order: 11 });
  }
}
/** thin white heat wisps rising off the ballast */
export function wisps(P: Puffs, f: number, f0: number, f1: number, area: { x: [number, number]; z: [number, number]; y: number }, n = 26, opacity = 0.34) {
  for (let i = 0; i < n; i++) {
    // each wisp's cycle is counted from a cycle before f0, so the air is already full of them when they fade in
    const per = 34, o0 = (i * 11 + Math.floor(i / 34) * 5) % per, born = f0 - per + o0 + per * Math.floor((f - (f0 - per) - o0) / per), a = f - born;
    if (f < f0 || a < 0) continue;
    const env = smooth(prog(f, f0, f0 + 12)) * (1 - smooth(prog(f, f1 - 10, f1)));
    const x = lerp(area.x[0], area.x[1], hash(i, 81)), z = lerp(area.z[0], area.z[1], hash(i, 82));
    P.add({ tex: wispTex(), pos: [x + 0.15 * Math.sin(a * 0.2 + i), area.y + 0.4 + a * 0.035, z], size: [0.22 + 0.008 * a, 1.5 + 0.035 * a], color: [1, 1, 1], opacity: opacity * env * Math.sin(Math.PI * a / per), rot: 0.12 * Math.sin(i), order: 9 });
  }
}
/** soft god rays: long additive bands slanting down out of the sky */
export function godRays(P: Puffs, f: number, f0: number, f1: number, at: V3, color: V3 = [1, 0.96, 0.88]) {
  // broad soft beams leaning from the top left down to the right (sprite rotation counter-clockwise), staggered in depth
  const env = smooth(prog(f, f0, f0 + 15)) * (1 - smooth(prog(f, f1 - 8, f1)));
  for (let i = 0; i < 4; i++) {
    P.add({ tex: rayTex(), pos: [at[0] + i * 5 - 8, at[1] + 6 * hash(i, 91), at[2] - i * 6], size: [7 + 7 * hash(i, 92), 85], color, opacity: (0.32 + 0.16 * hash(i, 93)) * env, rot: 0.42 + 0.05 * i, add: true, order: 8, fog: false });
  }
}
/** a star glint sliding along a polyline of points between f0 and f1 */
export function glint(P: Puffs, f: number, f0: number, f1: number, a: V3, b: V3, size = 0.5) {
  if (f < f0 || f > f1) return;
  const k = prog(f, f0, f1), e = Math.sin(Math.PI * k);
  P.add({ tex: starTex(), pos: [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)], size: size * (0.6 + 0.6 * e), color: [4, 3.8, 3.4], opacity: e, rot: 0.3 + k, add: true, order: 21, fog: false });
}

// ---- the flying spikes: real 3D rail spikes (shaft and head, hot orange tip) popping out of the sleepers ----
export class Spikes {
  group = new THREE.Group(); private items: THREE.Group[] = [];
  constructor(parent: THREE.Object3D, n = 14) {
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2428', roughness: 0.5, metalness: 0.6, flatShading: true });
    const hot = new THREE.MeshStandardMaterial({ color: '#ff7a20', emissive: new THREE.Color(0.9, 0.32, 0.06), flatShading: true });
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.16, 0.022), dark); shaft.position.y = -0.08;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.035), hot); head.position.y = 0.004;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 4), dark); tip.position.y = -0.175; tip.rotation.x = Math.PI;
      g.add(shaft, head, tip); g.visible = false; g.scale.setScalar(3.0);
      shaft.castShadow = true; this.group.add(g); this.items.push(g);
    }
    parent.add(this.group);
  }
  /** spikes pop from sleepers at `from(i)` between f0 and f1 and tumble toward +z (the camera) */
  update(f: number, f0: number, f1: number, from: (i: number) => V3) {
    this.items.forEach((g, i) => {
      const born = f0 + (f1 - f0 - 8) * hash(i, 101), a = f - born;
      g.visible = a >= 0 && a < 26;
      if (!g.visible) return;
      // born at 1.5 times the static spike's size so the swap at the pop does not jump, growing to 3 as it nears the lens
      g.scale.setScalar(lerp(1.5, 3.0, smooth(prog(a, 0, 16))));
      const o = from(i), v: V3 = [(hash(i, 102) - 0.5) * 0.08, 0.13 + 0.08 * hash(i, 103), 0.24 + 0.2 * hash(i, 104)];
      g.position.set(o[0] + v[0] * a, Math.max(0.05, o[1] + v[1] * a - 0.5 * 0.009 * a * a), o[2] + v[2] * a);
      g.rotation.set(a * (0.25 + 0.3 * hash(i, 105)), a * 0.2 * hash(i, 106), a * (0.3 + 0.2 * hash(i, 107)));
    });
  }
}
