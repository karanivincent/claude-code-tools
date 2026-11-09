import * as THREE from 'three';

// The throne hall as a real 3D set, built from the realistic pictures (out/practice/ancient-jar/hall3d/report.md).
//
//   PLAN     the hall measured off real-wide through its fitted camera (hall3d/tools/measure.mjs): every number below
//            is in the pictures' metres ("painted space"); the world stretches x by WIDEN so round 2's marks, jar and
//            orbit still fit between the arcades (as the views spike did)
//   build    floor, runner, steps and dais, two arcades of round arches on carved columns, the aisles, the upper
//            gallery, the vault, the back wall with its rose window and three tall windows, the throne alcove (pilasters,
//            curtains, canopy)
//   colour   each surface takes real-wide's colours by projection from real-wide's fitted camera, where that camera sees
//            it (a depth map from the projector stops the picture landing on what is hidden) and sees it squarely;
//            elsewhere a tileable texture cut out of the same picture (flags, runner, stone blocks). The curtains take
//            real-throne's (its camera fits nothing else in the room, so it is used as a texture, not a projector)
//   light    the picture's colour carried partly as emission and partly as albedo under real lights: warm points at the
//            fire bowls, torches and candelabra, cool light from the windows, the jar's key light for soft shadows

export type V3 = [number, number, number];
export const WIDEN = 1.3;
export const PIC = { w: 1520, h: 2688 };
/** real-wide's camera, fitted by views/depth-tool/fit-real.mjs (11 px rms) */
export const WIDE = { pos: [0.131, 3.159, 24.26] as V3, look: [-0.044, 2.93, 4.262] as V3, fov: 38.91 };

export const PLAN = {
  arcadeX: 3.6, colR: 0.31, plinthW: 0.74, plinthH: 0.55, capY0: 4.25, capY1: 4.95, impostY: 5.2, pierHalf: 0.4,
  columnsZ: [24.65, 19.1, 13.55, 8.0, 2.45, -3.1, -8.6], back: -13.1, front: 32,
  galleryY0: 8.4, galleryY1: 10.4, wallTop: 13.6, aisleX: 5.8, aisleTop: 8.2, galleryBackX: 5.0, thick: 0.6,
  stepFoot: -7.37, steps: 5, riser: 0.164, tread: 0.35, stepHalfW: 2.7, daisHalfW: 3.4,
  runnerHalfW: 1.12,
  rose: { y: 12.66, r: 2.0 }, lancets: { xs: [-1.64, -0.05, 1.52], w: 0.76, y0: 7.87, y1: 10.12 },
  alcove: { halfW: 2.05, curtainZ: -12.55, valance: [5.4, 7.27] as [number, number], canopyZ: -11.25, peak: 8.19, pilasterX: 2.78 },
  throne: { z: -11.25, h: 3.75 },
  candelabra: { x: 2.55, z: -10.7, pedTop: 1.74, h: 2.22 },
  bowls: { x: 3.06, z: -6.55, rim: 1.42, w: 0.68 },
  /** on the columns' front faces (the picture's torches at x -3.89, z 2.2 and -3.35, -3.4 on its planes): column z, flame y */
  torches: [[-1, 3.86, 2.45], [1, 3.86, 2.45], [-1, 3.53, -3.1], [1, 3.53, -3.1]] as V3[],
  chests: [[-4.45, -1.55, 1], [4.45, -1.6, -1]] as [number, number, number][],
};
export const DAIS_TOP = PLAN.steps * PLAN.riser;   // 0.82, round 2's DAIS_Y 0.8
export const wx = (x: number) => x * WIDEN;
const W = (p: V3): V3 => [p[0] * WIDEN, p[1], p[2]];

// ---- the projector ---------------------------------------------------------------------------------------------
/** real-wide's camera in world terms: clip = P V S world, S taking the world's sideways stretch off */
export function wideProjector() {
  const cam = new THREE.PerspectiveCamera(WIDE.fov, PIC.w / PIC.h, 0.5, 120);
  cam.position.set(...WIDE.pos); cam.lookAt(...WIDE.look); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const S = new THREE.Matrix4().makeScale(1 / WIDEN, 1, 1);
  const view = cam.matrixWorldInverse.clone().multiply(S);
  const vp = cam.projectionMatrix.clone().multiply(view);
  // a camera that renders the world from the projector (for the depth map): its world matrix is the inverse view
  const render = cam.clone(); render.matrixAutoUpdate = false; render.matrix.copy(view.clone().invert()); render.matrixWorldNeedsUpdate = true;
  render.updateMatrixWorld(true);
  return { vp, pos: new THREE.Vector3(WIDE.pos[0] * WIDEN, WIDE.pos[1], WIDE.pos[2]), render, near: cam.near, far: cam.far };
}
export type Projector = ReturnType<typeof wideProjector>;

/** what the projector sees nearest, per pixel: rendered once from the hall and the props (layer 1) */
export function projectorDepth(gl: THREE.WebGLRenderer, scene: THREE.Scene, P: Projector) {
  const rt = new THREE.WebGLRenderTarget(PIC.w / 2, PIC.h / 2, { depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(PIC.w / 2, PIC.h / 2, THREE.UnsignedIntType);
  const cam = P.render; cam.layers.set(1);
  const om = scene.overrideMaterial, bg = scene.background;
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); scene.background = null;
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam); gl.setRenderTarget(prev);
  scene.overrideMaterial = om; scene.background = bg;
  return rt.depthTexture;
}

// ---- tileable textures cut from the pictures --------------------------------------------------------------------
/** a picture's pixels, readable */
export function pixels(img: HTMLImageElement) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
/** a patch of a plane in painted space (origin o, axes a and b, metres), resampled from real-wide through its camera
 * into a square texture: the rectified surface, which MirroredRepeat then tiles without a seam.
 * The canvas is written top row first (row j is t = (j + 0.5) / size along b), and a CanvasTexture flips it on upload,
 * so in the texture v = 1 - t: a point at (s, t) on the patch is uv (s, 1 - t). Laid with v = t, the tile runs upside
 * down and out of phase with the picture beside it (Mona Lisa r6's first `holes` try: the damask banded) */
export function rectify(px: ImageData, o: V3, a: V3, b: V3, size = 512) {
  const cam = new THREE.PerspectiveCamera(WIDE.fov, PIC.w / PIC.h, 0.1, 500);
  cam.position.set(...WIDE.pos); cam.lookAt(...WIDE.look); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, out = g.createImageData(size, size), v = new THREE.Vector3();
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const s = (i + 0.5) / size, t = (j + 0.5) / size;
    v.set(o[0] + a[0] * s + b[0] * t, o[1] + a[1] * s + b[1] * t, o[2] + a[2] * s + b[2] * t).project(cam);
    const u = (v.x * 0.5 + 0.5) * (px.width - 1), w = (0.5 - v.y * 0.5) * (px.height - 1);
    const x0 = Math.max(0, Math.min(px.width - 2, Math.floor(u))), y0 = Math.max(0, Math.min(px.height - 2, Math.floor(w))), fx = u - x0, fy = w - y0;
    for (let k = 0; k < 3; k++) {
      const p = (x: number, y: number) => px.data[(y * px.width + x) * 4 + k];
      out.data[(j * size + i) * 4 + k] = (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy;
    }
    out.data[(j * size + i) * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.anisotropy = 8; return tex;
}
export interface Tiles { flags: THREE.Texture; runner: THREE.Texture; stone: THREE.Texture }
/** the three tiles: floor flags left of the runner (z 4 to 6.6), the runner (its full width, z 3 to 7), stone blocks
 * from the back wall below the rose window, right of the window arches */
export function cutTiles(px: ImageData): Tiles {
  return {
    flags: rectify(px, [-3.3, 0, 6.6], [2.0, 0, 0], [0, 0, -2.6]),
    runner: rectify(px, [-PLAN.runnerHalfW, 0, 7], [2 * PLAN.runnerHalfW, 0, 0], [0, 0, -4]),
    stone: rectify(px, [-2.98, 11.65, -13.1], [0.82, 0, 0], [0, 1.25, 0]),
  };
}
/** the sizes in world metres one tile covers (u, v) */
const TILE_SIZE: Record<keyof Tiles, [number, number]> = { flags: [2.0 * WIDEN, 2.6], runner: [2 * PLAN.runnerHalfW * WIDEN, 4], stone: [0.82 * WIDEN, 1.25] };

// ---- the material ---------------------------------------------------------------------------------------------
/** `holes`: take an object off the projected master by laying the wall's own tile over it, in phase. Rectangles on a
 * wall facing +z or -z at world z = `z` ([x0, x1, y0, y1], world metres) where the picture is not used: the tile cut
 * from that same wall by `rectify` (pass the same painted-space `o`, `a`, `b` it was cut with) is laid there in its own
 * colour, so its pattern runs on from the picture around the hole with no seam. Cut that tile one pattern repeat wide
 * and tall (it repeats plainly here, not mirrored). `edge` (metres, default 0.15) softens the rectangle's border.
 * Why: a master picture brought two invented canvases four times her size beside the Mona Lisa; taken off the wall this
 * way, the damask ran on through both holes with no seam and her own-size neighbours hung in their place (Mona Lisa r6,
 * proj.ts `holes`). Relit by the picture's blurred colour instead of its own, the tile banded: a patterned wall's rows
 * survive any blur at one height. Up to four rectangles per material. */
export interface Holes { z: number; rects: [number, number, number, number][]; o: V3; a: V3; b: V3; edge?: number }
export interface HallLook { emit: number; albedo: number }
export const LOOK: HallLook = { emit: 0.45, albedo: 1.0 };
/** a lit material whose colour is real-wide where the projector sees the surface (in front of the depth map, inside the
 * frame, facing it), the tile elsewhere. `face` picks the tile's axes: 'auto' from the normal */
export function hallMaterial(P: Projector, depth: THREE.Texture, picture: THREE.Texture, tiles: Tiles, tile: keyof Tiles, o: { tint?: string; minFacing?: number; roughness?: number; holes?: Holes } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: o.roughness ?? 0.82, metalness: 0, envMapIntensity: 0, side: THREE.DoubleSide });
  const t = tiles[tile], H = o.holes;
  const U = {
    uVP: { value: P.vp }, uPP: { value: P.pos }, uPic: { value: picture }, uDepth: { value: depth }, uTile: { value: t },
    uTileSize: { value: new THREE.Vector2(...TILE_SIZE[tile]) }, uTileOff: { value: new THREE.Vector2(tile === 'runner' ? wx(PLAN.runnerHalfW) : 0, 0) }, uTint: { value: new THREE.Color(o.tint ?? '#ffffff') },
    uNF: { value: new THREE.Vector2(P.near, P.far) }, uMinFacing: { value: o.minFacing ?? 0.03 }, uEmit: { value: LOOK.emit },
    uHoles: { value: [...(H?.rects ?? []), [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]].slice(0, 4).map(r => new THREE.Vector4(...r)) },
    uHoleO: { value: new THREE.Vector3(...(H?.o ?? [0, 0, 0])) }, uHoleA: { value: new THREE.Vector3(...(H?.a ?? [1, 0, 0])) },
    uHoleB: { value: new THREE.Vector3(...(H?.b ?? [0, 1, 0])) }, uHoleZ: { value: H?.z ?? 0 }, uHoleE: { value: H?.edge ?? 0.15 }, uWiden: { value: WIDEN },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vW; varying vec3 vWN;
        uniform mat4 uVP; uniform vec3 uPP; uniform sampler2D uPic; uniform sampler2D uDepth; uniform sampler2D uTile;
        uniform vec2 uTileSize; uniform vec2 uTileOff; uniform vec3 uTint; uniform vec2 uNF; uniform float uMinFacing; uniform float uEmit;
        uniform vec4 uHoles[4]; uniform vec3 uHoleO; uniform vec3 uHoleA; uniform vec3 uHoleB; uniform float uHoleZ; uniform float uHoleE; uniform float uWiden;
        float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x)); }
        vec3 hallColour(out float wPic) {
          vec3 n = normalize(vWN), an = abs(n);
          vec2 tuv = an.y > 0.6 ? vec2(vW.x, -vW.z) : (an.x > an.z ? vec2(vW.z, vW.y) : vW.xy);
          vec3 tile = texture2D(uTile, (tuv + uTileOff) / uTileSize).rgb * uTint;
          wPic = 0.0;
          vec4 q = uVP * vec4(vW, 1.0);
          if (q.w <= 0.0) return tile;
          vec2 uv = q.xy / q.w * 0.5 + 0.5;
          float e = 0.01;
          float inside = smoothstep(0.0, e, uv.x) * smoothstep(0.0, e, 1.0 - uv.x) * smoothstep(0.0, e, uv.y) * smoothstep(0.0, e, 1.0 - uv.y);
          if (inside <= 0.0) return tile;
          // seen by the projector: five taps of its depth map, nearer than the nearest thing it saw (with a margin)
          float vis = 0.0; vec2 px = vec2(1.5 / 760.0, 1.5 / 1344.0);
          for (int k = 0; k < 5; k++) {
            vec2 o = k == 0 ? vec2(0.0) : k == 1 ? vec2(px.x, 0.0) : k == 2 ? vec2(-px.x, 0.0) : k == 3 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
            float z = linZ(texture2D(uDepth, uv + o).r);
            vis += q.w <= z * 1.012 + 0.04 ? 0.2 : 0.0;
          }
          float facing = dot(n, normalize(uPP - vW));
          facing = abs(facing);
          float wf = smoothstep(uMinFacing, uMinFacing + 0.12, facing);
          wPic = inside * vis * wf;
          vec3 pic = texture2D(uPic, uv).rgb;
          vec3 outC = mix(tile, pic, wPic);
          ${H ? `
          // holes: the wall's own tile, in phase with the patch it was cut from (painted space; v = 1 - t, see rectify)
          if (abs(vW.z - uHoleZ) < 0.05) {
            float hole = 0.0;
            for (int i = 0; i < 4; i++) { vec4 r = uHoles[i]; float e = uHoleE;
              hole = max(hole, smoothstep(r.x, r.x + e, vW.x) * (1.0 - smoothstep(r.y - e, r.y, vW.x)) * smoothstep(r.z, r.z + e, vW.y) * (1.0 - smoothstep(r.w - e, r.w, vW.y))); }
            if (hole > 0.0) {
              vec3 pp = vec3(vW.x / uWiden, vW.y, vW.z) - uHoleO;
              vec2 huv = vec2(dot(pp, uHoleA) / dot(uHoleA, uHoleA), 1.0 - dot(pp, uHoleB) / dot(uHoleB, uHoleB));
              vec3 ht = textureGrad(uTile, fract(huv), dFdx(huv), dFdy(huv)).rgb;
              outC = mix(outC, ht * uTint, hole);
              wPic *= 1.0 - hole;
            }
          }` : ''}
          return outC;
        }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat wPic; vec3 hc = hallColour(wPic); diffuseColor.rgb *= hc;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hc * uEmit;');
  };
  m.customProgramCacheKey = () => 'hall3d-proj' + (H ? '-holes' : '');
  m.userData.hallUniforms = U;
  return m;
}

// ---- geometry helpers ---------------------------------------------------------------------------------------------
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = false; m.receiveShadow = true; return m;
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** a carved column in world metres: square plinth, round base mouldings, shaft, a flared capital with an abacus */
function column(mat: THREE.Material, r: number, top: number) {
  const g = new THREE.Group(), pw = PLAN.plinthW * 1.05;
  g.add(mesh(box(pw, PLAN.plinthH, pw), mat, [0, PLAN.plinthH / 2, 0]));
  const prof: [number, number][] = [
    [0, PLAN.plinthH], [r * 1.32, PLAN.plinthH], [r * 1.32, PLAN.plinthH + 0.08], [r * 1.18, PLAN.plinthH + 0.14], [r * 1.22, PLAN.plinthH + 0.2],
    [r * 1.05, PLAN.plinthH + 0.26], [r, PLAN.plinthH + 0.3], [r * 0.97, PLAN.capY0 - 0.12], [r * 1.08, PLAN.capY0 - 0.08], [r * 1.0, PLAN.capY0],
    [r * 1.25, PLAN.capY0 + 0.3], [r * 1.55, PLAN.capY1 - 0.12], [r * 1.62, PLAN.capY1], [0, PLAN.capY1],
  ];
  g.add(mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28), mat));
  const ab = r * 3.4;
  g.add(mesh(box(ab, 0.16, ab), mat, [0, PLAN.capY1 + 0.08, 0]));
  g.add(mesh(box(ab * 0.96, top - PLAN.capY1 - 0.16, ab * 0.96), mat, [0, (top + PLAN.capY1 + 0.16) / 2, 0]));
  return g;
}

/** one arcade wall (x = side * arcadeX), from the first column to the back wall: round arches between the columns from
 * the impost up, a solid wall from the last column to the back, a row of small arched gallery openings over each bay */
function arcadeWall(side: number, mat: THREE.Material) {
  const C = PLAN.columnsZ, ph = PLAN.pierHalf, top = PLAN.wallTop, imp = PLAN.impostY;
  const s = new THREE.Shape();
  s.moveTo(C[0], top); s.lineTo(C[0], imp);
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i] - ph, b = C[i + 1] + ph, cx = (a + b) / 2, r = (a - b) / 2;
    s.lineTo(a, imp); s.absarc(cx, imp, r, 0, Math.PI, false); s.lineTo(b, imp);
  }
  const last = C[C.length - 1] - ph;
  s.lineTo(last, imp); s.lineTo(last, 0); s.lineTo(PLAN.back, 0); s.lineTo(PLAN.back, top); s.lineTo(C[0], top);
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i] - ph - 0.2, b = C[i + 1] + ph + 0.2, n = Math.max(2, Math.floor((a - b) / 0.85)), step = (a - b) / n, hw = step * 0.33;
    for (let k = 0; k < n; k++) {
      const cx = a - step * (k + 0.5), h = new THREE.Path();
      h.moveTo(cx + hw, PLAN.galleryY0); h.lineTo(cx + hw, PLAN.galleryY1 - hw); h.absarc(cx, PLAN.galleryY1 - hw, hw, 0, Math.PI, false);
      h.lineTo(cx - hw, PLAN.galleryY0); h.lineTo(cx + hw, PLAN.galleryY0);
      s.holes.push(h);
    }
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: PLAN.thick, bevelEnabled: false, curveSegments: 24 });
  const m = mesh(geo, mat);
  // local x (the shape's u) runs along the world z, the extrusion along -x: placed so the wall's middle is the arcade line
  m.rotation.y = -Math.PI / 2;
  m.position.x = wx(side * PLAN.arcadeX) + PLAN.thick / 2;
  return m;
}

// ---- the build ------------------------------------------------------------------------------------------------------
export interface HallParts {
  root: THREE.Group;
  /** places for the code lights and flames (world) */
  torchTips: V3[]; bowlSpots: V3[]; candleBases: V3[]; throneAt: V3; chestAt: [number, number, number][];
  /** the windows' glow and the curtain (lit separately) */
  glows: THREE.Object3D[];
}
export function buildHall(P: Projector, depth: THREE.Texture, picture: THREE.Texture, throneTex: THREE.Texture, tiles: Tiles): HallParts {
  const root = new THREE.Group(); root.name = 'hall3d';
  const floorM = hallMaterial(P, depth, picture, tiles, 'flags', { roughness: 0.55 });
  const runnerM = hallMaterial(P, depth, picture, tiles, 'runner', { roughness: 0.95 });
  const stoneM = hallMaterial(P, depth, picture, tiles, 'stone');
  const darkStoneM = hallMaterial(P, depth, picture, tiles, 'stone', { tint: '#8a8078' });
  const H = PLAN, X = WIDEN;
  const z0 = H.back, z1 = H.front, L = z1 - z0;

  // floor (to the aisles' walls) and the runner down the middle, up to the step foot
  root.add(mesh(new THREE.PlaneGeometry(wx(H.aisleX) * 2, L), floorM, [0, 0, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]));
  root.add(mesh(new THREE.PlaneGeometry(wx(H.runnerHalfW) * 2, z1 - H.stepFoot), runnerM, [0, 0.006, (H.stepFoot + z1) / 2], [-Math.PI / 2, 0, 0]));
  // steps and dais (the runner continues up them, in the picture's paint)
  for (let i = 0; i < H.steps; i++) {
    const y = H.riser * (i + 1), zf = H.stepFoot - i * H.tread, d = zf - z0;
    root.add(mesh(box(wx(H.stepHalfW) * 2, y, d), stoneM, [0, y / 2, (zf + z0) / 2]));
  }
  const daisFront = H.stepFoot - H.steps * H.tread;
  // the runner over the dais to the throne (the projector sees the dais top almost edge-on, so its tile carries it)
  root.add(mesh(new THREE.PlaneGeometry(wx(H.runnerHalfW) * 2, daisFront - (H.throne.z + 0.3)), runnerM, [0, DAIS_TOP + 0.006, (daisFront + H.throne.z + 0.3) / 2], [-Math.PI / 2, 0, 0]));
  root.add(mesh(box(wx(H.daisHalfW) * 2, DAIS_TOP, daisFront - z0), stoneM, [0, DAIS_TOP / 2 - 0.002, (daisFront + z0) / 2]));

  // the arcades: columns and the walls over them
  const top = H.impostY;
  for (const s of [-1, 1]) {
    for (const z of H.columnsZ) { const c = column(stoneM, H.colR * 1.12, top); c.position.set(wx(s * H.arcadeX), 0, z); root.add(c); }
    root.add(arcadeWall(s, stoneM));
    // the aisle: its outer wall, its ceiling (the gallery's floor), the gallery's back wall and roof
    root.add(mesh(new THREE.PlaneGeometry(L, H.aisleTop), darkStoneM, [wx(s * H.aisleX), H.aisleTop / 2, (z0 + z1) / 2], [0, -s * Math.PI / 2, 0]));
    root.add(mesh(new THREE.PlaneGeometry(wx(H.aisleX - H.arcadeX), L), darkStoneM, [wx(s * (H.aisleX + H.arcadeX) / 2), H.aisleTop, (z0 + z1) / 2], [Math.PI / 2, 0, 0]));
    root.add(mesh(new THREE.PlaneGeometry(L, H.wallTop - H.aisleTop), darkStoneM, [wx(s * H.galleryBackX), (H.wallTop + H.aisleTop) / 2, (z0 + z1) / 2], [0, -s * Math.PI / 2, 0]));
    root.add(mesh(new THREE.PlaneGeometry(wx(H.galleryBackX - H.arcadeX), L), darkStoneM, [wx(s * (H.galleryBackX + H.arcadeX) / 2), H.wallTop, (z0 + z1) / 2], [Math.PI / 2, 0, 0]));
  }
  // the vault: a half barrel from the walls' tops
  const vault = new THREE.CylinderGeometry(wx(H.arcadeX), wx(H.arcadeX), L, 40, 1, true, -Math.PI / 2, Math.PI);
  const vm = mesh(vault, stoneM, [0, H.wallTop, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]); vm.scale.set(1, 1, 1 / WIDEN); root.add(vm);

  // the back wall, the full width, up into the vault; the alcove's pilasters with their capitals
  root.add(mesh(new THREE.PlaneGeometry(wx(H.aisleX) * 2, H.wallTop + 3.8), stoneM, [0, (H.wallTop + 3.8) / 2, z0]));
  for (const s of [-1, 1]) {
    const px = wx(s * H.alcove.pilasterX);
    root.add(mesh(box(0.95, 7.2 - DAIS_TOP, 0.5), stoneM, [px, (7.2 + DAIS_TOP) / 2, z0 + 0.25]));
    root.add(mesh(box(1.15, 0.36, 0.66), stoneM, [px, 7.3, z0 + 0.33]));
  }

  // the throne alcove: the curtains (real-throne's own, gathered in folds), the canopy (a box, a pitched top, gold finials)
  const A = H.alcove, cw = wx(A.halfW) * 2, ch = A.valance[0] - DAIS_TOP;
  const cg = new THREE.PlaneGeometry(cw, ch, 96, 1), cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i); cp.setZ(i, 0.09 * Math.sin((x / cw) * Math.PI * 22) + 0.05 * Math.sin((x / cw) * Math.PI * 9)); }
  cg.computeVertexNormals();
  const curtain = mesh(cg, new THREE.MeshStandardMaterial({ map: throneTex, roughness: 0.9, emissive: '#ffffff', emissiveMap: throneTex, emissiveIntensity: LOOK.emit, envMapIntensity: 0, side: THREE.DoubleSide }), [0, DAIS_TOP + ch / 2, A.curtainZ]);
  root.add(curtain);
  const cd = A.canopyZ - (A.curtainZ - 0.05), vh = A.valance[1] - A.valance[0];
  // the canopy box: its front face takes the picture; its sides and underside are red velvet (the picture never sees
  // them squarely: projected, the underside smeared the valance's fringe into a grey band in the throne close-ups)
  const velvet = new THREE.MeshStandardMaterial({ color: '#5a1016', roughness: 0.92, envMapIntensity: 0, emissive: '#2a0608', side: THREE.DoubleSide });
  const under = new THREE.MeshStandardMaterial({ color: '#3a0a0e', roughness: 0.95, envMapIntensity: 0, emissive: '#1a0406', side: THREE.DoubleSide });
  root.add(mesh(box(cw + 0.1, vh, cd), [velvet, velvet, stoneM, under, stoneM, velvet], [0, A.valance[0] + vh / 2, A.canopyZ - cd / 2]));
  const roof = new THREE.CylinderGeometry(0.0001, 1, 1, 4, 1); roof.rotateY(Math.PI / 4);
  const rm = mesh(roof, stoneM, [0, A.valance[1] + (A.peak - A.valance[1] - 0.3) / 2, A.canopyZ - cd / 2]);
  rm.scale.set((cw + 0.1) / Math.SQRT2, A.peak - A.valance[1] - 0.3, cd / Math.SQRT2); root.add(rm);
  const gold = new THREE.MeshStandardMaterial({ color: '#d9a640', metalness: 0.85, roughness: 0.32, envMapIntensity: 0.9 });
  const finial = (x: number, y: number, z: number, s: number) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.09 * s, 14, 10), gold, [0, 0.09 * s, 0]));
    g.add(mesh(new THREE.ConeGeometry(0.07 * s, 0.42 * s, 12), gold, [0, 0.36 * s, 0]));
    g.position.set(x, y, z); return g;
  };
  root.add(finial(0, A.peak - 0.32, A.canopyZ - cd / 2, 1.4));
  for (const s of [-1, 1]) root.add(finial(s * (cw / 2 + 0.02), A.valance[1], A.canopyZ, 1.0));

  // candelabra pedestals on the dais
  const C = H.candelabra;
  const candleBases: V3[] = [];
  for (const s of [-1, 1]) {
    const x = wx(s * C.x), ph = C.pedTop - DAIS_TOP;
    root.add(mesh(box(0.74, ph, 0.74), stoneM, [x, DAIS_TOP + ph / 2, C.z]));
    root.add(mesh(box(0.86, 0.08, 0.86), stoneM, [x, C.pedTop - 0.04, C.z]));
    candleBases.push([x, C.pedTop, C.z]);
  }

  // the torches: an iron bracket and cup on each column's nave face
  const iron = new THREE.MeshStandardMaterial({ color: '#2a2422', metalness: 0.6, roughness: 0.5, envMapIntensity: 0.4 });
  const torchTips: V3[] = [];
  for (const [s, y, cz] of H.torches) {
    const x = wx(s * H.arcadeX) - s * 0.12, z = cz + H.colR * 1.12 + 0.2;
    const g = new THREE.Group(); g.position.set(x, y - 0.45, z);
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), iron, [0, -0.1, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.05, 0.2, 12, 1, true), iron, [0, 0.22, 0]));
    g.add(mesh(box(0.06, 0.06, 0.3), iron, [0, -0.25, -0.15]));
    root.add(g); torchTips.push([x, y - 0.13, z]);
  }

  // the windows' glow: the rose and the three lancets, taken from the picture through the projector, drawn bright
  const glows: THREE.Object3D[] = [];
  const glowMat = (gain: number) => new THREE.ShaderMaterial({
    uniforms: { uVP: { value: P.vp }, uPic: { value: picture }, uGain: { value: gain } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform mat4 uVP; uniform sampler2D uPic; uniform float uGain; varying vec3 vW;
      void main() { vec4 q = uVP * vec4(vW, 1.0); vec2 uv = q.xy / q.w * 0.5 + 0.5; vec3 c = texture2D(uPic, uv).rgb;
        float l = dot(c, vec3(0.3, 0.5, 0.2)); gl_FragColor = vec4(c * uGain * smoothstep(0.08, 0.5, l), 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
  });
  const rose = mesh(new THREE.CircleGeometry(wx(H.rose.r) * 0.97 / WIDEN, 64), glowMat(0.15), [0, H.rose.y, z0 + 0.02]);
  rose.scale.x = WIDEN; root.add(rose); glows.push(rose);
  const lan = H.lancets;
  for (const x of lan.xs) {
    const s = new THREE.Shape(), hw = lan.w / 2, sp = lan.y1 - hw;
    s.moveTo(-hw, lan.y0); s.lineTo(hw, lan.y0); s.lineTo(hw, sp); s.absarc(0, sp, hw, 0, Math.PI, false); s.lineTo(-hw, lan.y0);
    const m = mesh(new THREE.ShapeGeometry(s, 16), glowMat(0.12), [wx(x), 0, z0 + 0.02]); m.scale.x = WIDEN; root.add(m); glows.push(m);
  }

  root.traverse(o => { o.frustumCulled = false; o.layers.enable(1); });
  glows.forEach(g => g.layers.disable(1));
  const bowlSpots: V3[] = [-1, 1].map(s => [wx(s * H.bowls.x), 0, H.bowls.z] as V3);
  return {
    root, torchTips, bowlSpots, candleBases, throneAt: [0, DAIS_TOP, H.throne.z],
    chestAt: H.chests.map(([x, z, s]) => [wx(x), z, s] as [number, number, number]), glows,
  };
}
