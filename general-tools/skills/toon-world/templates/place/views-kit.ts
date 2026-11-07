import * as THREE from 'three';
import { RGB, meanColour } from '../spike-blend/blend-kit';
import { PlateLight, rgbColour } from '../spike-blend/flat-kit';
import { World } from '../practice-ancient-jar/world';

// The views spike (out/practice/ancient-jar/views/report.md): the round-2 camera journey over flat 2D pictures of the
// hall instead of a modelled hall. Two ways:
//
//   F  several pictures, one per angle (flat2d-a down the hall, view-left, view-right, view-throne), each projected
//      from its own camera onto rough hall geometry (floor, steps, dais, back wall, two side walls); a shader mixes
//      them by a weight per picture that the timeline moves during camera swings, and per pixel by how squarely each
//      projector sees the surface (multiViewMaterial, roughHall)
//   G  one picture on its own depth: a monocular depth model's map of flat2d-a (Depth Anything V2 base), scaled to
//      metres on the painted floor, displaced into a dense mesh (depthMesh); torn where the depth jumps, with a
//      far layer behind the tears whose colour is pulled in from the far side. The throne's close-up picture gets the
//      same treatment for the throne section (switched inside the whip's blur)
//
// Both live in the "painted space": the hall as the pictures draw it (narrower than round 2's: its arcades at about
// x +-3.5). The group carrying it is stretched sideways by `widen` so its arcades and throne stand where round 2's
// marks expect them; the projections look up the unstretched position, so the pictures stay exact.

export type V3 = [number, number, number];
export const PIC = { w: 1520, h: 2688 };

/** each picture's camera, solved from features of known position (depth-tool/pnp.mjs; flat2d-a's floor fixes the
 * scale: its camera 2.6 m high, the step foot at z -7.4, the canopy top 6.83 m at z -11.25, the back wall -13.1).
 * rms is the fit's error in picture pixels; view-high fits no single camera (48 px) and is left out */
export interface Projector { pos: V3; look: V3; fov: number; rms: number }
export const VIEWS = {
  flat: { pos: [-0.145, 2.601, 15.69], look: [-0.217, 2.602, -4.31], fov: 49.87, rms: 1.2 },
  left: { pos: [-3.463, 3.363, 26.485], look: [-1.683, 3.182, 6.565], fov: 41.28, rms: 11.2 },
  right: { pos: [3.346, 4.059, 18.219], look: [0.804, 2.891, -1.584], fov: 52.35, rms: 11.1 },
  throne: { pos: [0.024, 2.394, -4.058], look: [-0.036, 4.263, -23.971], fov: 78.37, rms: 16 },
} satisfies Record<string, Projector>;
export type ViewName = keyof typeof VIEWS;
export const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];
/** the realistic set (spike-blend/real/), same slots: flat = real-wide. Fitted by depth-tool/fit-real.mjs against the
 * same landmarks plus the runner's detected edges. real-throne fits no camera that agrees with the other three
 * (48 px: its throne, steps and fire bowls are not where the others put them); it is used only inside the whip's blur
 * and the throne section */
export const REAL_VIEWS: Record<ViewName, Projector> = {
  flat: { pos: [0.131, 3.159, 24.26], look: [-0.044, 2.93, 4.262], fov: 38.91, rms: 11.3 },
  left: { pos: [-3.109, 2.26, 23.552], look: [-1.388, 2.748, 3.632], fov: 43.27, rms: 12.6 },
  right: { pos: [4.906, 3.834, 36.365], look: [2.66, 3.331, 16.498], fov: 33.44, rms: 13.5 },
  throne: { pos: [0.001, 3.128, 3.285], look: [-0.003, 2.983, -16.715], fov: 50.25, rms: 47.8 },
};
export type Set = 'toon' | 'real';
export const viewsOf = (set: Set) => (set === 'real' ? REAL_VIEWS : VIEWS);

/** where each realistic picture shows the same thing, the throne under its canopy (x0, y0, x1, y1 as fractions),
 * read off the pictures; colour statistics are only comparable over the same content (a first version used the
 * middle of each picture, which for the close-up is mostly curtain, and turned it grey-blue) */
export const REAL_THRONE_BOX: Record<ViewName, [number, number, number, number]> = {
  flat: [0.368, 0.335, 0.658, 0.58], left: [0.375, 0.365, 0.625, 0.58], right: [0.401, 0.346, 0.664, 0.565], throne: [0.197, 0.2, 0.803, 0.67],
};
/** colour matching before blending: each picture's mean and spread per channel over `box` (the same content in every
 * picture), moved onto the reference picture's. Returns a gain and an offset per picture (0..1 colour units) */
export function colourMatch(imgs: Record<ViewName, HTMLImageElement>, box: Record<ViewName, [number, number, number, number]>, ref: ViewName = 'flat') {
  const stats = (img: HTMLImageElement, b: [number, number, number, number]) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, b[0] * img.width, b[1] * img.height, (b[2] - b[0]) * img.width, (b[3] - b[1]) * img.height, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data, m = [0, 0, 0], q = [0, 0, 0], n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) { m[k] += d[i + k] / 255; q[k] += (d[i + k] / 255) ** 2; }
    return m.map((v, k) => ({ mean: v / n, sd: Math.sqrt(Math.max(1e-6, q[k] / n - (v / n) ** 2)) }));
  };
  const R = stats(imgs[ref], box[ref]);
  const out = {} as Record<ViewName, { gain: THREE.Vector3; off: THREE.Vector3 }>;
  for (const n of VIEW_NAMES) {
    const S = stats(imgs[n], box[n]), gain = S.map((s, k) => R[k].sd / s.sd), off = S.map((s, k) => R[k].mean - s.mean * gain[k]);
    out[n] = { gain: new THREE.Vector3(...gain), off: new THREE.Vector3(...off) };
  }
  return out;
}

export function projectorCamera(p: Projector) {
  const cam = new THREE.PerspectiveCamera(p.fov, PIC.w / PIC.h, 0.1, 500);
  cam.position.set(...p.pos); cam.lookAt(...p.look); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
}
const vpOf = (c: THREE.PerspectiveCamera) => new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);

export function pictureTexture(img: HTMLImageElement | HTMLCanvasElement): THREE.Texture {
  const t = img instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// ---- F: several pictures projected onto rough geometry --------------------------------------------------------------
/** one material for the whole rough hall: each fragment takes every picture whose frustum holds it, weighted by the
 * timeline's weight for that picture and by how squarely its projector sees the surface (a picture seen edge-on is
 * smeared; another one's view of the same wall is better). Outside every frustum: flat2d-a, mirrored. */
export function multiViewMaterial(tex: Record<ViewName, THREE.Texture>, widen: number, views: Record<ViewName, Projector> = VIEWS, match?: ReturnType<typeof colourMatch>, trace = 0.02) {
  const cams = VIEW_NAMES.map(n => projectorCamera(views[n]));
  return new THREE.ShaderMaterial({
    uniforms: {
      m0: { value: tex.flat }, m1: { value: tex.left }, m2: { value: tex.right }, m3: { value: tex.throne },
      vp: { value: cams.map(vpOf) }, pp: { value: cams.map(c => c.position.clone()) },
      w: { value: new THREE.Vector4(1, 0, 0, 0) }, widen: { value: widen }, trace: { value: trace },
      gain: { value: VIEW_NAMES.map(n => match ? match[n].gain : new THREE.Vector3(1, 1, 1)) }, off: { value: VIEW_NAMES.map(n => match ? match[n].off : new THREE.Vector3()) },
    },
    // vL, vN: the position and normal in painted space (the world with the group's sideways stretch taken off)
    vertexShader: /* glsl */`
      uniform float widen; varying vec3 vL; varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vL = vec3(wp.x / widen, wp.y, wp.z);
        vec3 nw = normalize(mat3(modelMatrix) * normal); vN = normalize(vec3(nw.x * widen, nw.y, nw.z));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D m0, m1, m2, m3; uniform mat4 vp[4]; uniform vec3 pp[4]; uniform vec4 w; uniform float trace; uniform vec3 gain[4], off[4];
      varying vec3 vL; varying vec3 vN;
      vec4 take(sampler2D m, mat4 P, vec3 o, float wt, vec3 g, vec3 b) {
        vec4 q = P * vec4(vL, 1.0);
        if (q.w <= 0.0) return vec4(0.0);
        vec2 uv = q.xy / q.w * 0.5 + 0.5;
        float e = 0.025;
        float inside = smoothstep(0.0, e, uv.x) * smoothstep(0.0, e, 1.0 - uv.x) * smoothstep(0.0, e, uv.y) * smoothstep(0.0, e, 1.0 - uv.y);
        // a picture that sees the surface edge-on gives way to any other that sees it squarely: every picture keeps a
        // trace of weight (0.02, invisible as a ghost), and the facing term is steep
        float facing = max(dot(normalize(vN), normalize(o - vL)), 0.0), f2 = facing * facing;
        float k = (wt + trace) * inside * (1e-4 + f2 * f2);
        // colour matched to the reference picture (in the picture's own sRGB values), then back to linear
        vec3 s = clamp(pow(texture2D(m, clamp(uv, 0.001, 0.999)).rgb, vec3(1.0 / 2.2)) * g + b, 0.0, 1.0);
        return vec4(pow(s, vec3(2.2)) * k, k);
      }
      void main() {
        vec4 c = take(m0, vp[0], pp[0], w.x, gain[0], off[0]) + take(m1, vp[1], pp[1], w.y, gain[1], off[1]) + take(m2, vp[2], pp[2], w.z, gain[2], off[2]) + take(m3, vp[3], pp[3], w.w, gain[3], off[3]);
        // beyond every picture: flat2d-a mirrored (a symmetric hall carries on)
        vec4 q = vp[0] * vec4(vL, 1.0); vec2 uv = q.xy / max(q.w, 1e-4) * 0.5 + 0.5;
        uv = 1.0 - abs(mod(uv, 2.0) - 1.0);
        c += vec4(texture2D(m0, uv).rgb * 1e-3, 1e-3);
        gl_FragColor = vec4(c.rgb / c.a, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
}

/** the hall as the pictures draw it, in painted space: the floor, four steps up to the dais, the dais, the back wall
 * (the throne, candelabra and the windows above all flattened onto z -11.3), and a wall at each arcade (x +-3.5) */
export function roughHall(mat: THREE.Material) {
  const g = new THREE.Group(); g.name = 'rough-hall';
  const add = (geo: THREE.BufferGeometry, p: V3, r: V3 = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); g.add(m); };
  const FOOT = -7.4, DAIS = -10.5, BACK = -11.3, TOP = 0.77, SIDE = 3.5, FRONT = 40, H = 34;
  add(new THREE.PlaneGeometry(2 * SIDE, FRONT - FOOT, 1, 1), [0, 0, (FRONT + FOOT) / 2], [-Math.PI / 2, 0, 0]);
  const n = 4, d = (FOOT - DAIS) / n;
  for (let i = 0; i < n; i++) {
    const y = (TOP * (i + 1)) / n, z0 = FOOT - i * d;
    add(new THREE.BoxGeometry(5.6, y, z0 - BACK), [0, y / 2, (z0 + BACK) / 2]);
  }
  add(new THREE.PlaneGeometry(2 * SIDE, BACK - DAIS), [0, TOP + 0.001, (BACK + DAIS) / 2], [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(2 * SIDE, H), [0, H / 2, BACK]);
  for (const s of [-1, 1]) add(new THREE.PlaneGeometry(FRONT - BACK, H), [s * SIDE, H / 2, (FRONT + BACK) / 2], [0, -s * Math.PI / 2, 0]);
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

// ---- G: one picture displaced by its depth --------------------------------------------------------------------------
export const GRID = { step: 4, w: PIC.w / 4 + 1, h: PIC.h / 4 + 1 };

/** the colour behind the foreground: pixels much nearer than the far-filtered depth are dropped and refilled from the
 * far side by a push-pull (downsample the kept pixels, then fill the dropped ones from the coarser levels) */
function farFill(img: HTMLImageElement, near: Float32Array, far: Float32Array) {
  const W = GRID.w, H = GRID.h;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  // level 0: colour premultiplied by a keep weight
  let lw = W, lh = H, col = new Float32Array(W * H * 3), wt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const k = near[i] > far[i] * 0.93 ? 1 : 0; wt[i] = k; col[i * 3] = d[i * 4] * k; col[i * 3 + 1] = d[i * 4 + 1] * k; col[i * 3 + 2] = d[i * 4 + 2] * k; }
  const levels: { w: number; h: number; col: Float32Array; wt: Float32Array }[] = [{ w: lw, h: lh, col, wt }];
  while (lw > 2 && lh > 2) {
    const nw = Math.ceil(lw / 2), nh = Math.ceil(lh / 2), nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const s = y * lw + x, t = (y >> 1) * nw + (x >> 1); nwt[t] += wt[s]; for (let k = 0; k < 3; k++) nc[t * 3 + k] += col[s * 3 + k]; }
    // keep it normalised-ish so far levels do not overflow the weight meaning
    for (let t = 0; t < nw * nh; t++) { const a = Math.min(1, nwt[t]) / Math.max(nwt[t], 1e-6); nwt[t] *= a; for (let k = 0; k < 3; k++) nc[t * 3 + k] *= a; }
    lw = nw; lh = nh; col = nc; wt = nwt; levels.push({ w: lw, h: lh, col, wt });
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const a = levels[l], b = levels[l + 1];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const s = y * a.w + x, t = (y >> 1) * b.w + (x >> 1), r = 1 - Math.min(1, a.wt[s]);
      if (r <= 0) continue;
      const bw = Math.max(b.wt[t], 1e-6);
      for (let k = 0; k < 3; k++) a.col[s * 3 + k] += r * (b.col[t * 3 + k] / bw);
      a.wt[s] += r;
    }
  }
  const L0 = levels[0];
  for (let i = 0; i < W * H; i++) { const w0 = Math.max(L0.wt[i], 1e-6); for (let k = 0; k < 3; k++) d[i * 4 + k] = L0.col[i * 3 + k] / w0; d[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  return c;
}

/** a max filter then a box blur of the depth: the far surface behind every foreground thing */
function farDepth(z: Float32Array, r = 7) {
  const W = GRID.w, H = GRID.h, a = new Float32Array(W * H), b = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let k = -r; k <= r; k++) m = Math.max(m, z[y * W + Math.min(W - 1, Math.max(0, x + k))]); a[y * W + x] = m; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let k = -r; k <= r; k++) m = Math.max(m, a[Math.min(H - 1, Math.max(0, y + k)) * W + x]); b[y * W + x] = m; }
  // soften so the far layer is a smooth sheet
  const s = 4, out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let t = 0, n = 0; for (let j = -s; j <= s; j += 2) for (let i = -s; i <= s; i += 2) { t += b[Math.min(H - 1, Math.max(0, y + j)) * W + Math.min(W - 1, Math.max(0, x + i))]; n++; } out[y * W + x] = t / n; }
  for (let i = 0; i < W * H; i++) out[i] = Math.max(out[i], z[i]);
  return out;
}

/** the picture as a displaced mesh: every grid point pushed along its projector ray to its depth. `tear` gives each
 * vertex the largest relative depth step to a neighbour; the near layer drops fragments over a tear (a column's edge
 * would otherwise stretch into a curtain to the wall behind it) and the far layer shows through */
export function depthMesh(img: HTMLImageElement, zGrid: Float32Array, p: Projector, o: { tearAt?: number; far?: boolean } = {}) {
  const W = GRID.w, H = GRID.h, cam = projectorCamera(p);
  const tanV = Math.tan((p.fov * Math.PI) / 360), tanH = tanV * (PIC.w / PIC.h);
  const build = (z: Float32Array, withTear: boolean) => {
    const pos = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2), tear = new Float32Array(W * H);
    const v = new THREE.Vector3();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, nx = ((i * GRID.step) / PIC.w) * 2 - 1, ny = 1 - ((j * GRID.step) / PIC.h) * 2, Z = z[k];
      v.set(nx * tanH * Z, ny * tanV * Z, -Z).applyMatrix4(cam.matrixWorld);
      pos.set([v.x, v.y, v.z], k * 3); uv.set([(i * GRID.step) / PIC.w, 1 - (j * GRID.step) / PIC.h], k * 2);
      if (withTear) {
        let m = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; m = Math.max(m, Math.abs(z[jj * W + ii] - Z) / Math.min(Z, z[jj * W + ii])); }
        tear[k] = m;
      }
    }
    const idx = new Uint32Array((W - 1) * (H - 1) * 6); let n = 0;
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.set([a, c, b, b, c, d], n); n += 6; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('tear', new THREE.BufferAttribute(tear, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
  };
  const tearAt = o.tearAt ?? 0.06;
  const mat = (tex: THREE.Texture, torn: boolean) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, tearAt: { value: tearAt }, fade: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float tear; varying float vT; varying vec2 vUv;
      void main() { vT = tear; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float tearAt; varying float vT; varying vec2 vUv;
      void main() {
        ${torn ? 'if (vT > tearAt) discard;' : ''}
        gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  const g = new THREE.Group(); g.name = 'depth-mesh';
  const near = new THREE.Mesh(build(zGrid, true), mat(pictureTexture(img), true));
  g.add(near);
  if (o.far !== false) {
    const zf = farDepth(zGrid);
    const farMesh = new THREE.Mesh(build(zf, false), mat(pictureTexture(farFill(img, zGrid, zf)), false));
    g.add(farMesh);
  }
  g.traverse(c => { c.frustumCulled = false; });
  return g;
}

// ---- the 3D things lit to the picture (from the flat spike, SpikeFlat.tsx) -------------------------------------------
interface Lights { hemi: THREE.HemisphereLight; key: THREE.DirectionalLight; fill: THREE.DirectionalLight; fires: THREE.PointLight[] }
export function findLights(world: World): Lights {
  let hemi!: THREE.HemisphereLight; const dirs: THREE.DirectionalLight[] = [], fires: THREE.PointLight[] = [];
  world.root.traverse(o => {
    if ((o as THREE.HemisphereLight).isHemisphereLight) hemi = o as THREE.HemisphereLight;
    else if ((o as THREE.DirectionalLight).isDirectionalLight) dirs.push(o as THREE.DirectionalLight);
    else if ((o as THREE.PointLight).isPointLight) fires.push(o as THREE.PointLight);
  });
  return { hemi, key: dirs[0], fill: dirs[1], fires };
}
/** E2's toon light: sky the picture's walls, ground its floor, the key its torch colour mixed toward white, every
 * live fire light off (the picture's fires are painted), no fog, exposure 1 */
export function lightToPicture(L: Lights, pl: PlateLight, gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  const wall = rgbColour(pl.wall), floor = rgbColour(pl.floor), warm = rgbColour(pl.warm).lerp(new THREE.Color('#ffffff'), 0.8);
  const asLight = (c: THREE.Color) => { const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.18), 0.76); };
  L.hemi.color.copy(asLight(wall)); L.hemi.groundColor.copy(asLight(floor)).multiplyScalar(0.7); L.hemi.intensity = 1.5;
  L.key.color.copy(warm); L.key.intensity = 1.4; L.key.shadow.intensity = 0.4;
  L.fill.color.copy(asLight(wall)); L.fill.intensity = 0.15;
  for (const f of L.fires) f.intensity = 0;
  scene.fog = null; scene.environmentIntensity = 0; scene.background = null;
  gl.toneMappingExposure = 1.0;
}
/** the realistic jar (round 2's bronze and gold, physically lit) lit to a realistic picture: sky its walls, ground its
 * floor, a warm key the colour of its torches half toward white, the environment kept for the metal's reflections, the
 * live fire lights low (the picture's fires are in the picture), no fog */
export function lightRealistic(L: Lights, pl: PlateLight, gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  const wall = rgbColour(pl.wall), floor = rgbColour(pl.floor), warm = rgbColour(pl.warm).lerp(new THREE.Color('#ffffff'), 0.5);
  const asLight = (c: THREE.Color) => { const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.25), 0.62); };
  // about round 2's levels (hemi 0.42, key 0.7, exposure 0.82) lifted a little for the pictures' daylight; brighter
  // turned the grey bronze white
  L.hemi.color.copy(asLight(wall)); L.hemi.groundColor.copy(asLight(floor)).multiplyScalar(0.7); L.hemi.intensity = 0.55;
  L.key.color.copy(warm); L.key.intensity = 1.0; L.key.shadow.intensity = 0.75;
  L.fill.color.copy(asLight(wall)); L.fill.intensity = 0.25;
  for (const f of L.fires) f.intensity *= 0.15;
  scene.fog = null; scene.environmentIntensity = 0.3; scene.background = null;
  gl.toneMappingExposure = 0.9;
}
export const floorDark = (pl: PlateLight) => rgbColour(pl.floor).multiplyScalar(0.35);
export type { RGB };
export { meanColour };
