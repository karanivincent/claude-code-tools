import * as THREE from 'three';

// A kit for 2D-in-code sets: geometry that the camera can orbit, drawn like a TV cartoon background. Three pieces:
//
//   toonify(root, o)      every lit material under root becomes a flat cel material (MeshToonMaterial, three tones),
//                         maps kept or swapped (o.remap), and every opaque mesh joins the ink layer
//   makeInk(gl)           the outline pass: a normals-and-depth render of the ink layer, edges found on screen (depth
//                         creases and silhouettes, normal creases) and laid over the picture as bold dark lines that
//                         thin with distance and fade into the fog; things off the ink layer (the jar) hide the lines
//                         behind them; the cards are drawn last, over everything, as in the plain composition
//   flatTex(...)          a canvas texture helper, and flat stone and flagstone painters (outlined blocks, two tones)
//
// Layers: 0 everything the main picture draws, INK (1) what gets outlines, OVER (3) the cards and props drawn after
// the outlines (the lights join OVER so lit props there still light).

export const INK = 1, OVER = 3;

// ---- flat materials ------------------------------------------------------------------------------------------------
let ramp: THREE.DataTexture | null = null;
/** the cel ramp: the shadow side, the turned side, the lit side; three flat tones, nothing in between */
export function celRamp() {
  if (ramp) return ramp;
  const v = [118, 118, 196, 255];
  ramp = new THREE.DataTexture(new Uint8Array(v), v.length, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  return ramp;
}
const flatCache = new Map<string, THREE.MeshToonMaterial>();
/** a flat cel material of one colour (cached by colour and side) */
export function flat(color: string, o: { side?: THREE.Side; map?: THREE.Texture; emissive?: string; emissiveIntensity?: number } = {}) {
  const k = `${color}|${o.side ?? 0}|${o.map?.uuid ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? 0}`;
  let m = flatCache.get(k);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: celRamp(), side: o.side ?? THREE.FrontSide, map: o.map ?? null });
    if (o.emissive) { m.emissive.set(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
    else { m.emissive.set(color).multiplyScalar(0.3); m.emissiveMap = o.map ?? null; }   // the flat base tone, as toonify
    flatCache.set(k, m);
  }
  return m;
}

export interface ToonifyOptions {
  /** subtrees left exactly as they are (and off the ink layer): the realistic jar, the balls */
  skip?: THREE.Object3D[];
  /** swap a map for a flat-drawn one; return undefined to keep it */
  remap?: (map: THREE.Texture, mesh: THREE.Mesh) => THREE.Texture | undefined;
  /** how much of each surface's own colour shows unlit (0 = all from the lights; 0.3 default) */
  selfLight?: number;
}
/** turn every lit material under root into a cel material and put the opaque meshes on the ink layer */
export function toonify(root: THREE.Object3D, o: ToonifyOptions = {}) {
  const skip = new Set(o.skip ?? []);
  const done = new Map<string, THREE.Material>();
  const conv = (m: THREE.Material, mesh: THREE.Mesh): THREE.Material => {
    const s = m as THREE.MeshPhysicalMaterial;
    if (!s.isMeshStandardMaterial) return m;
    const map = s.map ? (o.remap?.(s.map, mesh) ?? s.map) : null;
    const key = `${m.uuid}|${map?.uuid ?? ''}`;
    const hit = done.get(key); if (hit) return hit;
    const t = new THREE.MeshToonMaterial({ color: s.color, map, gradientMap: celRamp(), side: s.side, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, depthWrite: s.depthWrite });
    // a flat share of the surface's own colour, whatever the light: the base tone a painted background has
    const k = o.selfLight ?? 0.3;
    t.emissive.copy(s.color).multiplyScalar(k); t.emissiveMap = map;
    if (s.emissiveMap && s.emissiveIntensity > 0) t.emissive.addScalar(s.emissiveIntensity * 0.5);
    done.set(key, t);
    return t;
  };
  const inkable = (m: THREE.Material) => !m.transparent && m.alphaTest === 0 && m.blending === THREE.NormalBlending && m.depthWrite;
  const walk = (n: THREE.Object3D) => {
    if (skip.has(n)) return;
    const mesh = n as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => conv(m, mesh)) : conv(mesh.material, mesh);
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (ms.every(inkable)) mesh.layers.enable(INK);
    }
    n.children.forEach(walk);
  };
  walk(root);
}
/** put every mesh under root on the ink layer (for props built flat from the start) */
export const inked = <T extends THREE.Object3D>(o: T, shadows = true) => {
  o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { const mt = m.material as THREE.Material; if (!mt.transparent && mt.alphaTest === 0) m.layers.enable(INK); if (shadows) { m.castShadow = true; m.receiveShadow = true; } } });
  return o;
};

// ---- flat canvas textures -----------------------------------------------------------------------------------------
export function flatTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
export function rand(seed: number) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rgb = (c: number[], k = 0) => `rgb(${c[0] + k},${c[1] + k},${c[2] + k})`;
/** a crack: a short dark zigzag */
function crack(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, ink: string) {
  g.strokeStyle = ink; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
  let a = r() * Math.PI * 2;
  for (let i = 0; i < 4; i++) { a += (r() - 0.5) * 1.4; x += Math.cos(a) * len / 4; y += Math.sin(a) * len / 4; g.lineTo(x, y); }
  g.stroke();
}
/** outlined stone blocks in staggered courses: a flat fill per block, a lit top-left edge, a shaded bottom-right edge,
 * a bold dark joint, now and then a crack. One tile is 512 px; `rows` courses per tile. */
export function stoneBlocks(g: CanvasRenderingContext2D, seed: number, o: { base?: number[]; rows?: number; ink?: string; S?: number } = {}) {
  const r = rand(seed), S = o.S ?? 512, rows = o.rows ?? 9, rh = S / rows, base = o.base ?? [156, 150, 168], ink = o.ink ?? '#3A3346';
  g.fillStyle = ink; g.fillRect(0, 0, S, S);
  const J = 3;   // half the joint width
  for (let row = 0; row < rows; row++) {
    let x = -(row % 2) * rh * 0.9 - r() * rh * 0.4;
    const y = row * rh;
    while (x < S) {
      const w = rh * (1.6 + r() * 1.2), v = Math.round((r() - 0.5) * 18), c = base.map(b => b + v);
      for (const xx of [x, x - S, x + S]) {
        g.fillStyle = rgb(c); g.fillRect(xx + J, y + J, w - 2 * J, rh - 2 * J);
        g.fillStyle = rgb(c, 22); g.fillRect(xx + J, y + J, w - 2 * J, 5); g.fillRect(xx + J, y + J, 4, rh - 2 * J);
        g.fillStyle = rgb(c, -26); g.fillRect(xx + J, y + rh - J - 6, w - 2 * J, 6); g.fillRect(xx + w - J - 5, y + J, 5, rh - 2 * J);
        if (r() < 0.12) crack(g, r, xx + w * (0.3 + 0.4 * r()), y + rh * (0.3 + 0.4 * r()), rh * 0.6, ink);
      }
      x += w;
    }
  }
}
/** flagstones: `n` by `n` per tile, staggered, outlined, a sheen stroke on some, cracks */
export function flagstones(g: CanvasRenderingContext2D, seed: number, o: { base?: number[]; n?: number; ink?: string } = {}) {
  const r = rand(seed), S = 512, n = o.n ?? 4, q = S / n, base = o.base ?? [150, 146, 164], ink = o.ink ?? '#3A3346';
  g.fillStyle = ink; g.fillRect(0, 0, S, S);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = Math.round((r() - 0.5) * 20), c = base.map(b => b + v), ox = (y % 2) * q / 2;
    for (const dx of [0, -S]) {
      const X = x * q + ox + dx, Y = y * q;
      g.fillStyle = rgb(c); g.fillRect(X + 3, Y + 3, q - 6, q - 6);
      g.fillStyle = rgb(c, 18); g.fillRect(X + 3, Y + 3, q - 6, 4);
      g.fillStyle = rgb(c, -18); g.fillRect(X + 3, Y + q - 8, q - 6, 5);
      if (r() < 0.35) { g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.beginPath(); const a = X + q * (0.2 + 0.4 * r()), b = Y + q * (0.25 + 0.4 * r()); g.moveTo(a, b); g.lineTo(a + q * 0.25, b - q * 0.12); g.stroke(); }
      if (r() < 0.25) crack(g, r, X + q * (0.2 + 0.6 * r()), Y + q * (0.2 + 0.6 * r()), q * 0.45, ink);
    }
  }
}

// ---- the ink pass -------------------------------------------------------------------------------------------------
const INK_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor, tDepth, tNormal, tInkDepth;
uniform vec2 texel; uniform float near, far, width, strength, fogNear, fogFar, fogK;
uniform vec3 inkColor;
varying vec2 vUv;
float lin(float d) { return -perspectiveDepthToViewZ(d, near, far); }
float hd(vec2 uv) { return lin(texture2D(tInkDepth, uv).r); }
vec3 nn(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
void main() {
  vec4 col = texture2D(tColor, vUv);
  float dMain = lin(texture2D(tDepth, vUv).r), dC = hd(vUv);
  vec3 nC = nn(vUv);
  float r = width * mix(1.0, 0.5, smoothstep(4.0, 26.0, dC));
  float e = 0.0, front = dC;
  vec2 dirs[4]; dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(0.0, 1.0); dirs[2] = vec2(0.7071, 0.7071); dirs[3] = vec2(0.7071, -0.7071);
  for (int i = 0; i < 4; i++) {
    vec2 o = dirs[i] * texel * r;
    float dA = hd(vUv + o), dB = hd(vUv - o);
    front = min(front, min(dA, dB));
    float lap = abs(dA + dB - 2.0 * dC) / dC;
    e = max(e, smoothstep(0.018, 0.045, lap));
    vec3 nA = nn(vUv + o), nB = nn(vUv - o);
    e = max(e, smoothstep(0.14, 0.3, max(1.0 - dot(nA, nC), 1.0 - dot(nB, nC))));
  }
  // a thing off the ink layer (the jar) in front hides the line; compare with the nearest ink surface round the pixel
  float hidden = step(dMain, front * 0.985 - 0.03);
  float fogF = smoothstep(fogNear, fogFar, front);
  float a = e * strength * (1.0 - fogK * fogF) * (1.0 - hidden);
  gl_FragColor = vec4(mix(col.rgb, inkColor, a), 1.0);
  gl_FragDepth = texture2D(tDepth, vUv).r;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface InkOptions { width?: number; strength?: number; color?: string; fogK?: number }
/** the outline pass for one renderer. Call render() from a useFrame with priority 1 (it takes over the drawing). */
export function makeInk(gl: THREE.WebGLRenderer, o: InkOptions = {}) {
  const size = new THREE.Vector2();
  const mk = (samples: number, type: THREE.TextureDataType) => new THREE.WebGLRenderTarget(1, 1, { samples, type, depthTexture: new THREE.DepthTexture(1, 1) });
  const main = mk(0, THREE.HalfFloatType), nrm = mk(0, THREE.UnsignedByteType);
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: main.texture }, tDepth: { value: main.depthTexture }, tNormal: { value: nrm.texture }, tInkDepth: { value: nrm.depthTexture },
      texel: { value: new THREE.Vector2() }, near: { value: 0.05 }, far: { value: 300 }, width: { value: o.width ?? 1.7 }, strength: { value: o.strength ?? 0.92 },
      fogNear: { value: 10 }, fogFar: { value: 50 }, fogK: { value: o.fogK ?? 0.6 }, inkColor: { value: new THREE.Color(o.color ?? '#140E1C') },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: INK_FRAG, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const render = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    gl.getDrawingBufferSize(size);
    if (main.width !== size.x || main.height !== size.y) { main.setSize(size.x, size.y); nrm.setSize(size.x, size.y); }
    const u = mat.uniforms;
    u.texel.value.set(1 / size.x, 1 / size.y); u.width.value = (o.width ?? 1.7) * (size.x / 1080);   // line width in 1080-wide pixels
    u.near.value = camera.near; u.far.value = camera.far;
    const fog = scene.fog as THREE.Fog | null; if (fog) { u.fogNear.value = fog.near; u.fogFar.value = fog.far; }
    const layers = camera.layers.mask, auto = gl.autoClear, bg = scene.background;
    // 1: the ink layer's normals and depth
    gl.shadowMap.autoUpdate = false;
    camera.layers.set(INK); scene.overrideMaterial = normalMat; scene.background = null;
    gl.setClearColor(0x8080ff, 1); gl.setRenderTarget(nrm); gl.clear(); gl.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg; gl.setClearColor(0x000000, 0);
    // 2: the picture without the cards
    gl.shadowMap.autoUpdate = true;
    camera.layers.set(0); gl.setRenderTarget(main); gl.clear(); gl.render(scene, camera);
    // 3: the picture and the lines to the screen (with its depth, for the cards)
    gl.setRenderTarget(null); gl.clear(); gl.render(quadScene, ortho);
    // 4: the cards over it
    gl.shadowMap.autoUpdate = false; gl.autoClear = false;
    camera.layers.set(OVER); scene.background = null; gl.render(scene, camera); scene.background = bg;
    gl.autoClear = auto; camera.layers.mask = layers; gl.shadowMap.autoUpdate = true;
  };
  return { render, dispose: () => { main.dispose(); nrm.dispose(); mat.dispose(); } };
}
/** put a subtree (the cards) on the OVER layer only, and the lights under root on OVER too */
export function toOver(o: THREE.Object3D) { o.traverse(c => c.layers.set(OVER)); }
export function lightsOver(root: THREE.Object3D) { root.traverse(c => { if ((c as THREE.Light).isLight) c.layers.enable(OVER); }); }
