import * as THREE from 'three';
import { twoTone } from '../../look/shade';
import { NOINK } from '../../look/ink';

// The detail layer: the small things a picture cannot hold and that make a place feel lived in. Code 3D where it has
// form (trunks, vines, mushrooms), flat 2D drawn in code where it is small or alive (butterflies, fallen leaves),
// and light in code (shafts, floating motes, glints). Everything here is cheap and placed by the place file. Every
// shot wants some small moving thing (glints, embers, dust, insects, birds): the owner asked for "a lot of sparkling
// here and there" after a cut without it. Colours default to a forest; pass your own for another place.

type V3 = [number, number, number];
/** deterministic random in [0, 1) */
export const hash = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

/** a tree trunk in code: tapered, slightly bent, with a painted bark texture wrapped round it and a flared foot */
export function trunk(bark: THREE.Texture, at: V3, h: number, r: number, lean = 0, seed = 0) {
  const seg = 24, geo = new THREE.CylinderGeometry(r * 0.72, r, h, 18, seg, true);
  geo.translate(0, h / 2, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y / h, x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const flare = 1 + 0.9 * Math.max(0, 1 - y / (r * 3)) ** 2 * (0.7 + 0.3 * Math.sin(a * 5 + seed));   // buttress foot
    const bump = 1 + 0.05 * Math.sin(a * 3 + y * 1.7 + seed);
    p.setXYZ(i, x * flare * bump + lean * k * k * h * 0.15, y, z * flare * bump);
  }
  geo.computeVertexNormals();
  const t = bark.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, h / (2 * Math.PI * r) * 2);
  const m = new THREE.Mesh(geo, twoTone(new THREE.MeshLambertMaterial({ map: t })));
  m.position.set(...at); m.rotation.y = 6.28 * hash(seed, 3); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** a hanging vine: a thin curved tube with small heart leaves along it (code 3D) */
export function vine(top: V3, len: number, seed = 0, stemColour = '#4d6a2a', leafColour = '#4f8a34') {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector3(top[0] + 0.25 * Math.sin(k * 3 + seed), top[1] - len * k, top[2] + 0.2 * Math.cos(k * 2.3 + seed))); }
  const line = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(line, 40, 0.018, 5), twoTone(new THREE.MeshLambertMaterial({ color: stemColour }))));
  const leafMat = twoTone(new THREE.MeshLambertMaterial({ color: leafColour, side: THREE.DoubleSide }));
  const heart = new THREE.Shape(); heart.moveTo(0, 0); heart.bezierCurveTo(0.09, 0.05, 0.08, 0.16, 0, 0.13); heart.bezierCurveTo(-0.08, 0.16, -0.09, 0.05, 0, 0);
  const hg = new THREE.ShapeGeometry(heart);
  for (let i = 1; i < 14; i++) {
    const k = i / 14, q = line.getPoint(k), m = new THREE.Mesh(hg, leafMat);
    m.position.copy(q); m.rotation.set(Math.PI + 0.6 * (hash(i, seed) - 0.5), 6.28 * hash(i, seed + 1), 0.8 * (hash(i, seed + 2) - 0.5));
    m.scale.setScalar(0.8 + 0.6 * hash(i, seed + 3)); m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** fallen leaves and twigs scattered flat on the ground: one canvas sheet of litter, many small decals */
function litterSheet(cols: string[]) {
  const c = cv(512, 512), g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = 64 + i * 128, cy = 64 + j * 128, col = cols[(i * 4 + j) % cols.length], a = hash(i * 4 + j, 9) * 6.28;
    g.save(); g.translate(cx, cy); g.rotate(a);
    if ((i + j) % 5 === 4) { g.strokeStyle = '#5a3a20'; g.lineWidth = 5; g.beginPath(); g.moveTo(-50, 0); g.lineTo(50, 4); g.moveTo(10, 2); g.lineTo(30, -16); g.stroke(); }
    else {
      g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 46, 20, 0, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(40,25,10,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-44, 0); g.lineTo(44, 0); g.stroke();
      for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * 11, 0); g.lineTo(k * 11 + 9, k % 2 ? 14 : -14); g.stroke(); }
    }
    g.restore();
  }
  return ctex(c);
}
/** fallen leaves and twigs on the ground round `centre`, sitting on `groundY`; `keepClear` leaves paths and marks bare */
export function litter(n: number, centre: V3, radius: number, groundY: (x: number, z: number) => number, seed = 0, keepClear?: (x: number, z: number) => boolean,
  cols = ['#8a5a2a', '#a8742e', '#6a7a2a', '#c49a3a', '#7a4a24', '#5a6a2a']) {
  const g = new THREE.Group(), t = litterSheet(cols);
  const mat = twoTone(new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  for (let i = 0; i < n; i++) {
    const a = 6.28 * hash(i, seed), r = radius * Math.sqrt(hash(i, seed + 1)), x = centre[0] + Math.cos(a) * r, z = centre[2] + Math.sin(a) * r;
    if (keepClear?.(x, z)) continue;
    const cell = Math.floor(hash(i, seed + 2) * 16), geo = new THREE.PlaneGeometry(0.22, 0.22);
    const uv = geo.attributes.uv as THREE.BufferAttribute, u0 = (cell % 4) / 4, v0 = Math.floor(cell / 4) / 4;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 4);
    const m = new THREE.Mesh(geo, mat); m.rotation.set(-Math.PI / 2, 0, 6.28 * hash(i, seed + 3));
    m.position.set(x, groundY(x, z) + 0.012, z); m.scale.setScalar(0.7 + 0.8 * hash(i, seed + 4)); m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** small mushrooms in a clump (code 3D) */
export function mushrooms(at: V3, n = 5, seed = 0, capColour = '#c8642e') {
  const g = new THREE.Group(), stem = twoTone(new THREE.MeshLambertMaterial({ color: '#efe4cc' })), cap = twoTone(new THREE.MeshLambertMaterial({ color: capColour }));
  for (let i = 0; i < n; i++) {
    const h = 0.05 + 0.08 * hash(i, seed), x = at[0] + 0.12 * (hash(i, seed + 1) - 0.5), z = at[2] + 0.12 * (hash(i, seed + 2) - 0.5);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, h, 6), stem); s.position.set(x, at[1] + h / 2, z);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.03 + 0.02 * hash(i, seed + 3), 10, 6, 0, 6.28, 0, Math.PI / 2), cap); c.position.set(x, at[1] + h, z); c.scale.y = 0.6;
    g.add(s, c);
  }
  return g;
}

/** a flat 2D butterfly drawn in code, as a card; flap it in update by scaling x (|sin|) and move it along a path */
export function butterfly(colour = '#f2a12e', seed = 0) {
  const c = cv(256, 256), g = c.getContext('2d')!;
  g.translate(128, 128);
  for (const s of [-1, 1]) {
    g.fillStyle = colour; g.strokeStyle = '#241726'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(s * 52, -26, 50, 40, s * 0.5, 0, 6.28); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(s * 40, 34, 34, 28, -s * 0.4, 0, 6.28); g.fill(); g.stroke();
    g.fillStyle = '#241726'; g.beginPath(); g.arc(s * 62, -34, 9, 0, 6.28); g.fill();
  }
  g.fillStyle = '#241726'; g.beginPath(); g.ellipse(0, 4, 8, 44, 0, 0, 6.28); g.fill();
  g.strokeStyle = '#241726'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -38); g.lineTo(-18, -70); g.moveTo(0, -38); g.lineTo(18, -70); g.stroke();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: ctex(c), alphaTest: 0.5, side: THREE.DoubleSide }));
  m.layers.set(NOINK); m.userData.seed = seed;
  return m;
}

/** a soft shaft of sunlight through the canopy (additive cone, code) */
export function shaft(from: V3, to: V3, r0: number, r1: number, strength = 0.18, colour = '#fff0c8') {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true); geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(colour) }, uK: { value: strength } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uK; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uCol * uK * edge * smoothstep(0.0, 0.5, vY), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat); m.position.copy(a); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  m.layers.set(NOINK);
  return m;
}

/** floating motes in a shaft of light (points, code) */
export function motes(centre: V3, size: V3, n = 120, seed = 0) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = centre[0] + size[0] * (hash(i, seed) - 0.5); pos[i * 3 + 1] = centre[1] + size[1] * (hash(i, seed + 1) - 0.5); pos[i * 3 + 2] = centre[2] + size[2] * (hash(i, seed + 2) - 0.5); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff4cc', size: 0.025, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  p.layers.set(NOINK);
  return p;
}

/** twinkling glints (sun on water, dew, metal, embers' sparks): small four-point stars that flash on and off by time.
 *  Call `.userData.tick(t, cam)` every frame from the place's update. */
export function sparkles(centre: V3, size: V3, n = 24, seed = 0, colour = '#fff8dc', scale = 0.12): THREE.Group {
  const c = cv(128, 128), g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 0); g.lineTo(70, 58); g.lineTo(128, 64); g.lineTo(70, 70); g.lineTo(64, 128); g.lineTo(58, 70); g.lineTo(0, 64); g.lineTo(58, 58); g.closePath(); g.fill();
  const mat = new THREE.MeshBasicMaterial({ map: ctex(c), color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const grp = new THREE.Group(), geo = new THREE.PlaneGeometry(1, 1), ms: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(centre[0] + size[0] * (hash(i, seed) - 0.5), centre[1] + size[1] * (hash(i, seed + 1) - 0.5), centre[2] + size[2] * (hash(i, seed + 2) - 0.5));
    m.layers.set(NOINK); ms.push(m); grp.add(m);
  }
  grp.userData.tick = (t: number, cam: THREE.Camera) => ms.forEach((m, i) => {
    const period = 0.7 + 1.1 * hash(i, seed + 3), ph = ((t + hash(i, seed + 4) * period) % period) / period;
    const k = Math.max(0, Math.sin(ph * Math.PI)) ** 6;                                     // a short flash each period
    m.quaternion.copy(cam.quaternion); m.rotateZ(t * 0.8 + i);
    m.scale.setScalar(scale * (0.4 + 0.8 * hash(i, seed + 5)) * (0.15 + k)); m.visible = k > 0.02;
  });
  return grp;
}
