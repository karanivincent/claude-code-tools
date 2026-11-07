import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { V3 } from './hall3d';

// The things that pop, in code: flames that burn (a noise shader on a card turned to the camera), a soft glow round
// each, light shafts from the three windows and dust motes drifting in them. And the hero props: the four models made
// from the pictures with Higgsfield image-to-3D (public/practice-ancient-jar-3d/*.glb), loaded once and cloned.

// ---- flames ---------------------------------------------------------------------------------------------------------
const NOISE = /* glsl */`
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }`;
let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)'); r.addColorStop(0.6, 'rgba(255,255,255,0.1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); return glowTex;
}
export class Fire {
  root = new THREE.Group(); card: THREE.Mesh; glow: THREE.Sprite; mat: THREE.ShaderMaterial; light: THREE.PointLight | null; base: number;
  constructor(o: { w: number; h: number; seed: number; glow: number; light?: { colour: string; intensity: number; distance: number }; gain?: number; glowColour?: string }) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: o.seed }, uGain: { value: o.gain ?? 2.4 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `${NOISE}
        uniform float uTime, uSeed, uGain; varying vec2 vUv;
        void main() {
          float t = uTime * 1.7 + uSeed * 7.0;
          vec2 q = vec2(vUv.x - 0.5, vUv.y);
          float n = fbm(vec2(q.x * 3.2 + uSeed, q.y * 2.4 - t * 2.2));
          float m = fbm(vec2(q.x * 6.0 - uSeed, q.y * 4.0 - t * 3.1));
          float x = q.x + (n - 0.5) * 0.35 * q.y + 0.04 * sin(t * 3.0 + q.y * 6.0) * q.y;
          float w = 0.36 * pow(max(1.0 - q.y, 0.0), 0.9) * (0.55 + 0.6 * n);
          float tip = 0.55 + 0.4 * m;
          float body = smoothstep(w, w * 0.25, abs(x)) * smoothstep(0.0, 0.1, q.y) * smoothstep(tip, tip - 0.35, q.y);
          float core = smoothstep(w * 0.6, 0.0, abs(x)) * smoothstep(0.55, 0.1, q.y) * smoothstep(0.0, 0.08, q.y);
          vec3 c = mix(vec3(0.9, 0.22, 0.03), vec3(1.0, 0.62, 0.18), smoothstep(0.1, 0.8, body));
          c = mix(c, vec3(1.0, 0.92, 0.7), core);
          gl_FragColor = vec4(c * body * uGain, 1.0);
        }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, side: THREE.DoubleSide,
    });
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h).translate(0, o.h / 2 - o.h * 0.05, 0), this.mat);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: o.glowColour ?? '#ff9a48', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: o.glow }));
    this.glow.scale.setScalar(o.h * 2.4); this.glow.position.y = o.h * 0.35;
    this.root.add(this.card, this.glow);
    this.base = o.light?.intensity ?? 0;
    this.light = o.light ? new THREE.PointLight(o.light.colour, o.light.intensity, o.light.distance, 1.7) : null;
    if (this.light) { this.light.position.y = o.h * 0.4; this.root.add(this.light); }
    this.root.traverse(c => { c.frustumCulled = false; });
  }
  tick(t: number, cam: THREE.Camera) {
    this.mat.uniforms.uTime.value = t;
    const s = this.mat.uniforms.uSeed.value as number;
    const k = 1 + 0.1 * Math.sin(t * 13 + s * 3) + 0.06 * Math.sin(t * 23.7 + s) + 0.04 * Math.sin(t * 41 + s * 5);
    this.glow.scale.setScalar(this.glow.userData.s0 ??= this.glow.scale.x); this.glow.scale.multiplyScalar(k);
    if (this.light) this.light.intensity = this.base * k;
    // turn the card to the camera about the vertical
    const p = new THREE.Vector3(); this.root.getWorldPosition(p);
    const c = new THREE.Vector3(); cam.getWorldPosition(c);
    this.card.rotation.y = Math.atan2(c.x - p.x, c.z - p.z) - this.root.rotation.y;
  }
}

// ---- window light: shafts and dust ------------------------------------------------------------------------------------
/** a soft cone of light from a window to the floor: an open cone whose edges fade (brightest where it is seen through
 * its thickness) and which fades along its length */
export function shaft(from: V3, to: V3, r0: number, r1: number, strength: number, colour = '#cfe0ff') {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r0, r1, len, 32, 12, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color(colour) }, uK: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vAlong;
      void main() { vAlong = 0.5 - position.y / ${len.toFixed(3)}; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColour; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vAlong;
      void main() { float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float along = smoothstep(0.0, 0.12, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong));
        gl_FragColor = vec4(uColour * f * along * uK, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
  m.frustumCulled = false;
  return m;
}
/** dust motes inside the shafts: points spread through each cone, drifting slowly and twinkling */
export function dust(shafts: { from: V3; to: V3; r0: number; r1: number }[], perShaft: number, seed = 1) {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos: number[] = [], ph: number[] = [];
  for (const sh of shafts) for (let i = 0; i < perShaft; i++) {
    const u = 0.15 + r() * 0.6, rad = (sh.r0 + (sh.r1 - sh.r0) * u) * Math.sqrt(r()), a = r() * Math.PI * 2;
    const p = new THREE.Vector3(...sh.from).lerp(new THREE.Vector3(...sh.to), u);
    pos.push(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad * 0.6, p.z + Math.sin(a) * rad * 0.8); ph.push(r() * 100);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('phase', new THREE.Float32BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1920 } },
    vertexShader: `attribute float phase; uniform float uTime; uniform float uPx; varying float vA;
      void main() { vec3 p = position + vec3(sin(uTime * 0.31 + phase) * 0.18, sin(uTime * 0.23 + phase * 1.7) * 0.12 - mod(uTime * 0.05 + phase, 1.0) * 0.1, cos(uTime * 0.27 + phase) * 0.18);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vA = 0.55 + 0.45 * sin(uTime * 2.1 + phase * 3.0);
        gl_PointSize = uPx * 0.0042 * (0.6 + 0.8 * fract(phase * 7.3)) / max(-mv.z, 0.5) * 3.0; }`,
    fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * vA * 0.9, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return pts;
}

// ---- the hero props ---------------------------------------------------------------------------------------------------
export type PropName = 'throne' | 'candelabra' | 'firebowl' | 'chest';
export const PROP_NAMES: PropName[] = ['throne', 'candelabra', 'firebowl', 'chest'];
let loading: Promise<Record<PropName, THREE.Object3D>> | null = null;
export function loadProps(url: (n: PropName) => string) {
  loading ??= Promise.all(PROP_NAMES.map(n => new GLTFLoader().loadAsync(url(n)).then(g => g.scene)))
    .then(s => Object.fromEntries(PROP_NAMES.map((n, i) => [n, s[i]])) as unknown as Record<PropName, THREE.Object3D>);
  return loading;
}
/** a prop stood on the floor at p, its height h (metres), turned by ry; sx stretches it sideways. Its materials keep
 * their textures and take the room's light (a little metal for the gold, no environment) */
export function placeProp(src: THREE.Object3D, p: V3, h: number, ry = 0, o: { sx?: number; metal?: number; rough?: number } = {}) {
  const g = new THREE.Group(), m = src.clone(true);
  const b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3()), k = h / size.y;
  m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const inner = new THREE.Group(); inner.add(m); inner.scale.set(k * (o.sx ?? 1), k, k);
  g.add(inner); g.position.set(...p); g.rotation.y = ry;
  m.traverse(c => {
    const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.layers.enable(1);
    const mt = (mesh.material as THREE.MeshStandardMaterial).clone();
    mt.metalness = o.metal ?? 0.15; mt.roughness = o.rough ?? 0.6; mt.envMapIntensity = 0.5;
    mesh.material = mt;
  });
  g.userData.size = size.clone().multiplyScalar(k);
  return g;
}
