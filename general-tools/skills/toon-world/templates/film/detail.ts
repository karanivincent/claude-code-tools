import * as THREE from 'three';
import { NOINK } from '../../look/ink';
import { cloth as clothTex, lit } from './paint';

// The detail layer: small real things that move, so a place feels lived in (decision 1, Vincent 11 November 2026:
// "flies, smoke, dust in light shafts, cloth, birds, a goat, not dots"). Each maker returns one object tagged
// `userData.detail = '<kind>'` with `userData.tick(t, cam)`; the place calls every tick from its `update` (`ticks`). The
// look check (tools/look.mjs, toon-kit look.ts checkDetail) counts the tagged things in frame per shot and how many of
// them change while in frame, against floors by shot size (a wide: 6 in frame, 3 moving). Motes, sparkles and other
// dots do not count. Animals and birds are cards drawn in the cast's ink; they are lit like the world
// (MeshLambertMaterial), never MeshBasicMaterial, so they sit in the place's light. Add the story's own (a goat chewing,
// hens pecking: Elijah's critters.ts) with the same tag and tick.

type V3 = [number, number, number];
export type Tick = (t: number, cam: THREE.Camera) => void;
export const hash = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const INK = '#241726';
const tag = <T extends THREE.Object3D>(o: T, kind: string, tick: Tick): T => { o.userData.detail = kind; o.userData.tick = tick; return o; };
/** every detail tick under root, for the place's update: `const tick = ticks(root)` once, then `tick(t, cam)` */
export const ticks = (root: THREE.Object3D): Tick => {
  const fs: Tick[] = []; root.traverse(o => { if (typeof o.userData.tick === 'function') fs.push(o.userData.tick); });
  return (t, cam) => fs.forEach(f => f(t, cam));
};

/** a card drawn on a canvas each frame (an animal, a bird, a fly), lit by the scene, writing depth, its own outline */
function drawnCard(size: number, px: number, draw: (g: CanvasRenderingContext2D, t: number) => void) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  m.layers.set(NOINK); m.frustumCulled = false; m.userData.card = true;
  const g = c.getContext('2d')!;
  const redraw = (t: number) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px); g.setTransform(px / 256, 0, 0, px / 256, 0, 0); draw(g, t); tex.needsUpdate = true; };
  return { m, redraw };
}
const face = (m: THREE.Object3D, cam: THREE.Camera) => { const p = new THREE.Vector3(); cam.getWorldPosition(p); const q = m.getWorldPosition(new THREE.Vector3()); m.rotation.set(0, Math.atan2(p.x - q.x, p.z - q.z), 0); };

/** a few flies looping round a point (food, a jar, a doorway): tiny dark cards with a wing blur */
export function flies(at: V3, n = 4, r = 0.35, seed = 0) {
  const g = new THREE.Group(), ms: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const { m, redraw } = drawnCard(0.05, 64, (cx) => {
      cx.fillStyle = 'rgba(220,235,255,0.75)'; cx.beginPath(); cx.ellipse(100, 96, 50, 26, -0.5, 0, 6.28); cx.ellipse(156, 96, 50, 26, 0.5, 0, 6.28); cx.fill();
      cx.fillStyle = INK; cx.beginPath(); cx.ellipse(128, 140, 34, 46, 0, 0, 6.28); cx.fill();
    });
    redraw(0); ms.push(m); g.add(m);
  }
  return tag(g, 'flies', (t, cam) => ms.forEach((m, i) => {
    const w = 2.2 + 1.7 * hash(i, seed), ph = 6.28 * hash(i, seed + 1);
    m.position.set(at[0] + r * Math.sin(w * t + ph) * (0.6 + 0.4 * Math.sin(3.1 * t + i)), at[1] + 0.15 * Math.sin(1.7 * w * t + i), at[2] + r * Math.cos(1.3 * w * t + ph));
    face(m, cam);
  }));
}

/** a wisp of smoke rising from a fire, a lamp or a chimney: soft puffs that rise, swell, drift and fade (lit, soft
 *  edged, no outline, no depth written, like the look's light volumes) */
export function smoke(at: V3, height = 2.4, n = 7, colour = '#d9d2c8', seed = 0) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const cg = c.getContext('2d')!, gr = cg.createRadialGradient(128, 128, 10, 128, 128, 124);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  cg.fillStyle = gr; cg.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(), ms: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: tex, color: colour, transparent: true, depthWrite: false, opacity: 0.6 }));
    m.layers.set(NOINK); m.frustumCulled = false; m.userData.card = true; ms.push(m); g.add(m);
  }
  return tag(g, 'smoke', (t, cam) => ms.forEach((m, i) => {
    const life = 3.2, k = ((((t + (i / n) * life + hash(i, seed) * 0.4) % life) + life) % life) / life;
    m.position.set(at[0] + 0.25 * Math.sin(k * 4 + i) + 0.4 * k, at[1] + height * k, at[2] + 0.15 * Math.cos(k * 3 + i));
    m.scale.setScalar(0.25 + 0.9 * k);
    (m.material as THREE.MeshLambertMaterial).opacity = 0.65 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    m.quaternion.copy(cam.quaternion); m.rotateZ(i + t * 0.3);
  }));
}

/** a cloth hung from a line or a doorway, moving in the breeze: a painted woven plane whose free end waves */
export function hangingCloth(top: V3, w = 0.9, h = 1.2, a = '#C8402E', b = '#F2E2C2', yaw = 0, seed = 0) {
  const geo = new THREE.PlaneGeometry(w, h, 12, 16); geo.translate(0, -h / 2, 0);
  const base = (geo.attributes.position as THREE.BufferAttribute).array.slice();
  const m = new THREE.Mesh(geo, lit(clothTex(a, b, seed), { side: THREE.DoubleSide }));
  m.position.set(...top); m.rotation.y = yaw; m.castShadow = true; m.receiveShadow = true;
  return tag(m, 'cloth', (t) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], k = -y / h;   // 0 at the line, 1 at the free end
      p.setZ(i, k * k * (0.12 * Math.sin(2.1 * t + x * 3 + seed) + 0.05 * Math.sin(5.3 * t + x * 7)));
      p.setX(i, x + k * 0.03 * Math.sin(1.7 * t + seed));
    }
    p.needsUpdate = true; geo.computeVertexNormals();
    // the transform stays put while the cloth moves: the version tells the look check it changed
    m.userData.version = Math.round(t * 10);
  });
}

/** birds crossing or circling far off (seen against the far band): flapping ink cards on loops of radius `r` */
export function birds(centre: V3, n = 3, r = 6, size = 0.5, seed = 0) {
  const g = new THREE.Group(), cards: { m: THREE.Mesh; redraw: (t: number) => void }[] = [];
  for (let i = 0; i < n; i++) {
    const card = drawnCard(size, 128, (cx, t) => {
      const f = Math.sin(t * 9 + i * 2) * 34;
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.beginPath(); cx.moveTo(30, 128 + f); cx.lineTo(88, 120); cx.lineTo(128, 132); cx.lineTo(168, 120); cx.lineTo(226, 128 + f);
      cx.strokeStyle = '#ffffff'; cx.lineWidth = 14; cx.stroke();
      cx.strokeStyle = INK; cx.lineWidth = 5; cx.stroke();
    });
    cards.push(card); g.add(card.m);
  }
  return tag(g, 'birds', (t, cam) => cards.forEach(({ m, redraw }, i) => {
    const w = 0.35 + 0.15 * hash(i, seed), a = w * t + 6.28 * hash(i, seed + 1);
    m.position.set(centre[0] + r * Math.cos(a), centre[1] + 0.6 * Math.sin(2 * a + i), centre[2] + r * 0.5 * Math.sin(a));
    redraw(t); face(m, cam);
  }));
}

/** dust turning in a shaft of light (through a window, a door, a gap in a roof): the shaft is the detail; its light
 *  breathes and its dust drifts along it. Counts as one thing ('shaft'); dust alone (motes) does not. */
export function shaft(from: V3, to: V3, r0: number, r1: number, strength = 0.18, colour = '#fff0c8') {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true); geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(colour) }, uK: { value: strength }, uT: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vY = uv.y; vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uK; uniform float uT; varying float vY; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); vec2 q = vec2(vUv.x * 40.0, vUv.y * 60.0 + uT * 0.8); float dust = step(0.985, h(floor(q))) * 0.8;
        gl_FragColor = vec4(uCol * uK * (edge * (0.85 + 0.15 * sin(uT * 1.3)) + dust) * smoothstep(0.0, 0.5, vY), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat); m.position.copy(a); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  m.layers.set(NOINK); m.userData.emissive = true;
  return tag(m, 'shaft', (t) => { mat.uniforms.uT.value = t; m.userData.version = Math.round(t * 10); });
}

/** twinkling glints (sun on water, metal): a finishing touch only. They do not count as detail (look.ts NOT_DETAIL). */
export function sparkles(centre: V3, size: V3, n = 24, seed = 0, colour = '#fff8dc', scale = 0.12): THREE.Group {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const grp = new THREE.Group(), geo = new THREE.PlaneGeometry(1, 1), ms: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(centre[0] + size[0] * (hash(i, seed) - 0.5), centre[1] + size[1] * (hash(i, seed + 1) - 0.5), centre[2] + size[2] * (hash(i, seed + 2) - 0.5));
    m.layers.set(NOINK); ms.push(m); grp.add(m);
  }
  return tag(grp, 'sparkle', (t, cam) => ms.forEach((m, i) => {
    const period = 0.7 + 1.1 * hash(i, seed + 3), ph = ((t + hash(i, seed + 4) * period) % period) / period, k = Math.max(0, Math.sin(ph * Math.PI)) ** 6;
    m.quaternion.copy(cam.quaternion); m.rotateZ(t * 0.8 + i);
    m.scale.setScalar(scale * (0.4 + 0.8 * hash(i, seed + 5)) * (0.15 + k)); m.visible = k > 0.02;
  }));
}
