import * as THREE from 'three';

// A kit for 2D-in-code sets: geometry that the camera can orbit, drawn like a TV cartoon background. Three pieces:
//
//   toonify(root, o)      every lit material under root becomes a cel material (MeshToonMaterial, three tones),
//                         maps kept or swapped (o.remap), and every opaque mesh joins the ink layer
//   makeInk(gl)           the outline pass: a normals-and-depth render of the ink layer, edges found on screen (depth
//                         creases and silhouettes, normal creases) and laid over the picture as bold dark lines that
//                         thin with distance and fade into the fog; things off the ink layer (the jar) hide the lines
//                         behind them; the cards are drawn last, over everything, as in the plain composition
//   paintedTex(...)       a canvas texture at 2048, mipmapped, 16x anisotropic (the look check's floor near the lens)
//
// The flat one-colour material and the two-tone stone and flagstone painters are gone (decision 1, 11 November 2026:
// no plain code colour; tools/look.mjs fails it within 8 m of a camera). Paint surfaces with the film template's
// paint.ts (plaster, ground, stone, wood, cloth with grain at every scale) or paintedTex.
//
// Layers: 0 everything the main picture draws, INK (1) what gets outlines, OVER (3) the cards and props drawn after
// the outlines (the lights join OVER so lit props there still light).

export const INK = 1, OVER = 3;

// ---- cel materials ------------------------------------------------------------------------------------------------
let ramp: THREE.DataTexture | null = null;
/** the cel ramp: the shadow side, the turned side, the lit side; three flat tones, nothing in between */
export function celRamp() {
  if (ramp) return ramp;
  const v = [118, 118, 196, 255];
  ramp = new THREE.DataTexture(new Uint8Array(v), v.length, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  return ramp;
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

// ---- painted canvas textures ---------------------------------------------------------------------------------------
/** a canvas texture painted by `paint` at `size` px (default 2048: toon-kit look.ts TEX_MIN), mipmapped, 16x anisotropic */
export function paintedTex(paint: (g: CanvasRenderingContext2D, size: number) => void, repeat?: [number, number], size = 2048) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  paint(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
export function rand(seed: number) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

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
