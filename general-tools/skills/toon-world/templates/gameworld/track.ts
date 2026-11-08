import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { heatMaterial, type HeatMat } from './fx';
import { hash } from './shots';

// The track: two rails, sleepers, tie plates with spikes, fishplates with bolts every 39 feet (11.9 m), a ballast bed and
// modelled ballast stones, and chalked "39'" marks, all laid along ONE centre curve. The curve runs along -z in world
// space (the track group is never moved) from z = `from` to z = `to`; a sideways offset x = bend(z) bends it. Both rails
// are the centre curve pushed out along its normal, and every sleeper, plate, spike and joint sits on the curve turned
// square to it, so when `setBend` swaps the offset in (the S-bend snaps in one frame at SNAP_F) everything follows it
// and the sleepers fan out.
// The rails are a real rail profile (foot, web, rounded head; 24 points) extruded along the curve on the CPU (a ring
// every `seg` metres, flat shaded, each profile edge with its own vertices so the head's facets stay crisp). They carry
// `aU`, the distance along the track, which the heat ramp material in fx.ts reads, and a colour and a roughness and
// metalness per profile edge: the wheel-worn top of the head is polished steel (it catches the sun as a streak that
// slides along the rail as the camera moves), the sides keep the rail's own colour (silver on the deck, rust in the
// canyon). Sleepers are chamfered boxes (the chamfer catches light: worn edges) in three painted wood-grain variants,
// each laid with a hand-set wobble.

export const SNAP_F = 368;
export const GAUGE = 1.435;
export const JOINT = 11.9; // 39 feet
export type Bend = ((z: number) => number) | null;

export interface TrackOpts {
  from: number; to: number;
  /** height of the rail tops */
  railTop: number;
  sleeperGap?: number; sleeperLen?: number; sleeperH?: number; sleeperColor: string; railColor: string; railRough?: number; railMetal?: number;
  /** the polished top of the rail head (default: the rail colour lifted toward bright steel) */
  railHead?: string;
  /** the spike heads on the tie plates (default: orange, as on the deck in the reference) */
  spikeColor?: string;
  /** where the rails are finely sampled (z range), elsewhere every 4 m */
  fine?: [number, number];
  ballast?: { z: [number, number]; width: number; colors: string[]; count: number; bed: string };
  chalk?: { every: number; z: [number, number] };
  plates?: boolean;
  /** joints in this z range get a gap of `width` between the rail ends (his line); `setGap(k)` closes them */
  gaps?: { width: number; z: [number, number] };
  /** joints in the fine range show a hairline where the two rail ends butt with no gap (the smooth line) */
  seams?: boolean;
}
/** the per-frame mechanics of a track under pressure, every part a pure function of where it is */
export interface Strain {
  /** a rail's offset at track z, for the rail on `side` (-1 left, +1 right): [across (+x), up, along (+z)] metres */
  rail?: (z: number, side: number) => [number, number, number] | null;
  /** sleeper i at z: [shift across in metres, turn in radians] */
  sleeper?: (i: number, z: number) => [number, number] | null;
  /** the spike on sleeper i, rail `side`, `which` 0 outer / 1 inner: [drawn up by metres, tilt away from the rail], or gone */
  spike?: (i: number, z: number, side: number, which: number) => [number, number] | 'gone' | null;
  /** the joint at z on `side`: [across, up, along, turn] */
  joint?: (z: number, side: number) => [number, number, number, number] | null;
}
export interface Track {
  group: THREE.Group;
  rails: [THREE.Mesh, THREE.Mesh];
  heat: [HeatMat, HeatMat];
  setBend(b: Bend): void;
  /** the centre of the track at z (x, rail-top y, z) and the unit direction of travel toward +z */
  centre(z: number): { p: THREE.Vector3; dir: THREE.Vector3 };
  bend: Bend;
  /** set this frame's strain (null: none); everything is rewritten from scratch, so it never accumulates */
  setStrain(s: Strain | null): void;
  /** close the gap joints: 0 open (gap width), 1 closed (the rail ends touch) */
  setGap(k: number): void;
  /** where each sleeper is (z) and each joint is (z) */
  sleeperZ: number[]; jointZ: number[];
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// rail profile (x across, y up), metres: foot, web, a rounded head; drawn a little chunky like the reference's rails
const PROFILE: [number, number][] = [
  [-0.075, 0], [0.075, 0], [0.075, 0.012], [0.05, 0.022], [0.017, 0.034], [0.013, 0.06], [0.013, 0.104], [0.019, 0.117],
  [0.037, 0.124], [0.039, 0.15], [0.036, 0.162], [0.029, 0.169], [0.018, 0.172],
  [-0.018, 0.172], [-0.029, 0.169], [-0.036, 0.162], [-0.039, 0.15], [-0.037, 0.124], [-0.019, 0.117], [-0.013, 0.104],
  [-0.013, 0.06], [-0.017, 0.034], [-0.05, 0.022], [-0.075, 0.012],
];
export const RAIL_H = 0.172;
/** which profile edges (edge j runs from point j to j+1) are the polished running surface of the head */
const HEAD_TOP = new Set([10, 11, 12, 13, 14]);

const cssRGB = (c: THREE.Color, v = 1) => `rgb(${Math.round(Math.min(1, c.r * v) * 255)},${Math.round(Math.min(1, c.g * v) * 255)},${Math.round(Math.min(1, c.b * v) * 255)})`;

/** a sleeper's top painted in code: grain lines that run its length, knots, end checks, cracks, worn light edges */
function woodTexture(base: string, seed: number) {
  // painted in 512x64 units on a 2048x256 canvas (4x): sharp at a few centimetres from the camera
  const W = 512, H = 64, X = 4;
  const c = document.createElement('canvas'); c.width = W * X; c.height = H * X;
  const g = c.getContext('2d')!; g.scale(X, X);
  const b = new THREE.Color(base);
  const dark = b.getHSL({ h: 0, s: 0, l: 0 }).l < 0.3;
  g.fillStyle = cssRGB(b, 0.95 + 0.1 * hash(seed, 1)); g.fillRect(0, 0, W, H);
  // broad colour streaks first, then fine grain
  for (let i = 0; i < 7; i++) {
    const y = hash(i, seed + 9) * H, h = 4 + 10 * hash(i, seed + 10);
    g.fillStyle = hash(i, seed + 11) > 0.5 ? 'rgba(0,0,0,0.10)' : (dark ? 'rgba(255,210,230,0.07)' : 'rgba(255,240,220,0.12)');
    g.fillRect(0, y, W, h);
  }
  for (let i = 0; i < 80; i++) {
    const y = hash(i, seed) * H, a = 0.08 + 0.18 * hash(i, seed + 1);
    g.strokeStyle = hash(i, seed + 2) > 0.45 ? `rgba(0,0,0,${a})` : (dark ? `rgba(255,215,235,${a * 0.6})` : `rgba(255,236,214,${a * 0.8})`);
    g.lineWidth = 0.3 + 1.1 * hash(i, seed + 3);
    g.beginPath(); g.moveTo(0, y);
    const amp = 1.2 + 2.5 * hash(i, seed + 4), fr = 0.01 + 0.02 * hash(i, seed + 5);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, y + amp * Math.sin(x * fr + i));
    g.stroke();
  }
  // knots with rings around them
  for (let k = 0; k < 2; k++) {
    const x = 60 + (W - 120) * hash(k, seed + 20), y = 14 + (H - 28) * hash(k, seed + 21), r = 3 + 3 * hash(k, seed + 22);
    for (let j = 3; j >= 0; j--) { g.strokeStyle = `rgba(0,0,0,${0.12 + 0.08 * j})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, r * 2.4 + j * 3.5, r + j * 1.4, 0, 0, 7); g.stroke(); }
    g.fillStyle = 'rgba(20,10,10,0.55)'; g.beginPath(); g.ellipse(x, y, r * 1.6, r * 0.8, 0, 0, 7); g.fill();
  }
  // cracks running in from the ends (end checks)
  for (let k = 0; k < 4; k++) {
    const fromLeft = k % 2 === 0, y = 8 + (H - 16) * hash(k, seed + 30), len = 50 + 110 * hash(k, seed + 31);
    g.strokeStyle = 'rgba(10,5,8,0.7)'; g.lineWidth = 1.4;
    g.beginPath(); let x = fromLeft ? 0 : W, yy = y; g.moveTo(x, yy);
    for (let s = 0; s < len; s += 10) { x += fromLeft ? 10 : -10; yy += (hash(s + k, seed + 32) - 0.5) * 3; g.lineTo(x, yy); }
    g.stroke();
  }
  // worn edges: lighter along the long edges, darker end grain
  const edge = dark ? 'rgba(255,220,240,0.22)' : 'rgba(255,245,230,0.35)';
  g.fillStyle = edge; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  // weathering specks
  for (let i = 0; i < 160; i++) { g.fillStyle = hash(i, seed + 40) > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,230,0.12)'; g.fillRect(hash(i, seed + 41) * W, hash(i, seed + 42) * H, 1 + 3 * hash(i, seed + 43), 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return t;
}
export function chalkTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.font = 'bold 92px "Marker Felt", "Chalkboard SE", "Comic Sans MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(250,248,240,0.92)';
  g.fillText("39'", 128, 66);
  // chalk: knock holes out of the strokes
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + 0.5 * hash(i, 4)})`; g.fillRect(hash(i, 5) * 256, hash(i, 6) * 128, 1 + 2 * hash(i, 7), 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/** packed ballast seen from above, for the bed under and beyond the modelled stones (it carries the track to the horizon) */
function pebbleTexture(colors: string[], base: string, seed: number) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S * 2; const g = c.getContext('2d')!; g.scale(2, 2);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const cs = colors.map(x => new THREE.Color(x));
  for (let i = 0; i < 1500; i++) {
    const x = hash(i, seed) * S, y = hash(i, seed + 1) * S, r = 5 + 9 * hash(i, seed + 2) ** 1.5, cc = cs[i % cs.length];
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      if (x + dx < -r * 2 || x + dx > S + r * 2 || y + dy < -r * 2 || y + dy > S + r * 2) continue;
      // an irregular stone: a lumpy polygon, its shadow, a lit upper facet
      const poly = (ox: number, oy: number, k: number) => { g.beginPath(); for (let a = 0; a < 7; a++) { const t = (a / 7) * Math.PI * 2 + hash(i, seed + 4) * 3, rr = r * k * (0.75 + 0.45 * hash(i * 7 + a, seed + 5)); const px = x + dx + ox + Math.cos(t) * rr * 1.15, py = y + dy + oy + Math.sin(t) * rr * 0.9; if (a) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); g.fill(); };
      g.fillStyle = 'rgba(30,15,20,0.45)'; poly(1.5, 2, 1);
      g.fillStyle = cssRGB(cc, 0.82 + 0.25 * hash(i, seed + 3)); poly(0, 0, 1);
      g.fillStyle = 'rgba(255,250,240,0.2)'; poly(-r * 0.25, -r * 0.25, 0.5);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return t;
}
/** metres of rail per tile of its detail texture */
const RAIL_TILE = 3;
/** the rail's detail, multiplied over its colours: u across the profile (one column band per profile edge), v along
 *  the rail. Rust blotches, pitting and streaks on the web and foot; fine bright scratches along the polished head. */
function railDetailTexture(rust: number, seed: number) {
  const W = 512, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const P = PROFILE.length, cw = W / P;
  for (let j = 0; j < P; j++) {
    const x0 = j * cw;
    if (HEAD_TOP.has(j)) {
      // scratches: thin lines running along the rail, light and dark
      for (let i = 0; i < 60; i++) {
        const x = x0 + hash(i + j * 97, seed) * cw, y = hash(i + j * 97, seed + 1) * H, len = 80 + 900 * hash(i + j * 97, seed + 2);
        g.fillStyle = hash(i, seed + 3 + j) > 0.4 ? 'rgba(150,150,165,0.55)' : 'rgba(255,255,255,1)';
        g.fillRect(x, y, 1, len);
      }
      continue;
    }
    const k = rust * (j <= 6 || j >= 19 ? 1 : 0.7);
    // rust blotches
    for (let i = 0; i < 40; i++) {
      const y = hash(i + j * 53, seed + 4) * H, r = 20 + 90 * hash(i + j * 53, seed + 5);
      g.fillStyle = `rgba(${150 + 60 * hash(i, seed + 6)},${60 + 40 * hash(i, seed + 7)},40,${(0.18 + 0.3 * hash(i, j)) * k})`;
      g.beginPath(); g.ellipse(x0 + cw / 2, y, cw, r, 0, 0, 7); g.fill();
    }
    // pitting and drips
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(50,25,25,${(0.2 + 0.4 * hash(i, j + seed)) * Math.max(0.4, k)})`;
      g.fillRect(x0 + hash(i + j * 31, seed + 8) * cw, hash(i + j * 31, seed + 9) * H, 1 + 2 * hash(i, seed + 10), 1 + 6 * hash(i, seed + 11));
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return t;
}
/** a rounded, slightly lumpy pebble (flat shaded: it reads as a modelled stone) */
function pebbleGeo(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3();
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = seen.get(key); if (k === undefined) { k = 0.82 + 0.3 * hash(seen.size, seed); seen.set(key, k); }
    v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function makeTrack(o: TrackOpts): Track {
  const group = new THREE.Group();
  const gap = o.sleeperGap ?? 0.55, slen = o.sleeperLen ?? 2.6;
  const sTop = o.railTop - RAIL_H - 0.016, sH = o.sleeperH ?? 0.2; // sleeper top sits just under the rail foot (tie plate between)
  let bend: Bend = null;
  const offAt = (z: number) => (bend ? bend(z) : 0);
  const slope = (z: number) => (offAt(z + 0.05) - offAt(z - 0.05)) / 0.1; // dx/dz

  // ---- sleepers (three painted variants), tie plates, spikes, joints (instanced; their matrices follow the curve) ----
  const zs: number[] = [];
  for (let z = o.from; z > o.to; z -= gap) zs.push(z);
  const sleeperGeo = new RoundedBoxGeometry(slen, sH, 0.3, 1, 0.03); sleeperGeo.translate(0, sTop - sH / 2, 0);
  const VARIANTS = 3;
  const sleeperSets = Array.from({ length: VARIANTS }, (_, v) => {
    const idx = zs.map((_, i) => i).filter(i => Math.floor(hash(i, 13) * VARIANTS) === v);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTexture(o.sleeperColor, 3 + v * 7), roughness: 0.92, flatShading: true });
    const mesh = new THREE.InstancedMesh(sleeperGeo, mat, Math.max(1, idx.length));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.count = idx.length;
    const tint = new THREE.Color();
    idx.forEach((i, k) => { const t = 0.84 + 0.26 * hash(i, 11); mesh.setColorAt(k, tint.setRGB(t, t * (0.95 + 0.08 * hash(i, 12)), t)); });
    group.add(mesh);
    return { mesh, idx };
  });

  const spikeCol = o.spikeColor ?? '#d97a2a';
  let plates: THREE.InstancedMesh | null = null, spikes: THREE.InstancedMesh | null = null;
  // spikes: one instance each, four a sleeper (two a plate, on opposite corners), so each can be drawn up on its own
  const CORNERS = [[-1, 1], [1, -1]] as const;
  if (o.plates !== false) {
    // the plate under each rail foot: a flat plate with two shoulders that hold the foot
    const plate = new THREE.BoxGeometry(0.36, 0.016, 0.2); plate.translate(0, sTop + 0.008, 0);
    const sh1 = new THREE.BoxGeometry(0.018, 0.016, 0.2); sh1.translate(-0.084, sTop + 0.022, 0);
    const sh2 = new THREE.BoxGeometry(0.018, 0.016, 0.2); sh2.translate(0.084, sTop + 0.022, 0);
    plates = new THREE.InstancedMesh(mergeGeometries([plate, sh1, sh2]), new THREE.MeshStandardMaterial({ color: '#3a3238', roughness: 0.6, metalness: 0.5, flatShading: true }), zs.length * 2);
    plates.castShadow = true; plates.receiveShadow = true;
    group.add(plates);
    // one spike, its origin where it enters the sleeper: a long square shank (hidden in the wood until it is drawn up),
    // a thicker collar above the plate, and a head with a lip hooked toward the rail (local -x)
    const shaft = new THREE.BoxGeometry(0.02, 0.16, 0.02); shaft.translate(0, -0.06, 0);
    const collar = new THREE.BoxGeometry(0.03, 0.03, 0.03); collar.translate(0, 0.03, 0);
    const head = new THREE.BoxGeometry(0.06, 0.016, 0.042); head.translate(-0.01, 0.05, 0);
    spikes = new THREE.InstancedMesh(mergeGeometries([shaft, collar, head]), new THREE.MeshStandardMaterial({ color: spikeCol, roughness: 0.45, metalness: 0.55, flatShading: true }), zs.length * 4);
    spikes.castShadow = true; group.add(spikes);
  }
  // a rail joint: two fishplates on the web, six bolts through them (round heads inside, hex nuts outside)
  const jz: number[] = [];
  for (let z = o.from - JOINT / 2; z > o.to; z -= JOINT) jz.push(z);
  const webY = o.railTop - RAIL_H + 0.076;
  const jparts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const fp = new THREE.BoxGeometry(0.016, 0.07, 0.68); fp.translate(s * 0.022, webY, 0); jparts.push(fp);
    for (const dz of [-0.26, -0.155, -0.05, 0.05, 0.155, 0.26]) {
      const b = new THREE.CylinderGeometry(s > 0 ? 0.019 : 0.016, s > 0 ? 0.019 : 0.016, 0.022, s > 0 ? 6 : 8); b.rotateZ(Math.PI / 2); b.translate(s * 0.04, webY, dz); jparts.push(b);
      if (s > 0) { const tip = new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6); tip.rotateZ(Math.PI / 2); tip.translate(0.058, webY, dz); jparts.push(tip); }
    }
  }
  const joints = new THREE.InstancedMesh(mergeGeometries(jparts.map(g => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: '#4a3c3e', roughness: 0.5, metalness: 0.6, flatShading: true }), jz.length * 2);
  joints.castShadow = true; joints.receiveShadow = true; group.add(joints);

  // ---- the rails: per profile edge a colour (worn head top vs sides) and a roughness/metalness (read from a tiny map) ----
  const P = PROFILE.length;
  const side = new THREE.Color(o.railColor), headC = o.railHead ? new THREE.Color(o.railHead) : side.clone().lerp(new THREE.Color('#f4f2f8'), 0.55);
  const rough = o.railRough ?? 0.3, metal = o.railMetal ?? 0.75;
  const rm = new Uint8Array(P * 4);
  for (let j = 0; j < P; j++) {
    const top = HEAD_TOP.has(j);
    // a rough rail (the canyon's rust) keeps a satin head, so its glare never wipes out the joint and chalk beside it
    const headR = rough > 0.5 ? 0.46 : Math.min(rough, 0.2), headM = rough > 0.5 ? Math.max(metal, 0.6) : Math.max(metal, 0.85);
    rm[j * 4] = 255; rm[j * 4 + 1] = Math.round(255 * (top ? headR : rough)); rm[j * 4 + 2] = Math.round(255 * (top ? headM : metal)); rm[j * 4 + 3] = 255;
  }
  const rmTex = new THREE.DataTexture(rm, P, 1, THREE.RGBAFormat); rmTex.magFilter = rmTex.minFilter = THREE.NearestFilter; rmTex.needsUpdate = true;
  const railTex = railDetailTexture(rough > 0.5 ? 1 : 0.35, 7);
  const railMat = () => heatMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 1, roughnessMap: rmTex, metalnessMap: rmTex, map: railTex });
  const heat: [HeatMat, HeatMat] = [railMat(), railMat()];
  const fine = o.fine ?? [o.from, o.to];
  // the rings the rail is extruded through: every 0.25 m in the fine range, 4 m beyond; at a gap joint two rings
  // (the two rail ends) with no strip between them and a cap on each end; at a seam joint a notch ring (ends butting)
  let zl: number[] = [];
  for (let z = o.from; z > o.to; ) { zl.push(z); z -= z <= fine[0] && z >= fine[1] ? 0.25 : 4; }
  zl.push(o.to);
  const gapW = o.gaps?.width ?? 0;
  const gapJ = o.gaps ? jz.filter(z => z <= o.gaps!.z[0] && z >= o.gaps!.z[1]) : [];
  const seamJ = o.seams ? jz.filter(z => z <= fine[0] && z >= fine[1]) : [];
  zl = zl.filter(z => !gapJ.some(j => Math.abs(z - j) < gapW / 2 + 0.03) && !seamJ.some(j => Math.abs(z - j) < 0.03));
  const rings: { z: number; k: number }[] = zl.map(z => ({ z, k: 1 }));
  for (const j of gapJ) rings.push({ z: j + gapW / 2, k: 1 }, { z: j - gapW / 2, k: 1 });
  for (const j of seamJ) rings.push({ z: j + 0.004, k: 1 }, { z: j, k: 0.88 }, { z: j - 0.004, k: 1 });
  rings.sort((a, b) => b.z - a.z);
  const N = rings.length, skip = new Set<number>(), caps: number[] = [];
  for (const j of gapJ) { const i = rings.findIndex(r => Math.abs(r.z - (j + gapW / 2)) < 1e-6); skip.add(i); caps.push(i, i + 1); }
  const capTris = THREE.ShapeUtils.triangulateShape(PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const RV = N * P * 2, V = RV + caps.length * P;
  // colours, map coordinates, track distance and triangles never change; build them once
  const col = new Float32Array(V * 3), uvs = new Float32Array(V * 2), au = new Float32Array(V), idx: number[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < P; j++) for (let e = 0; e < 2; e++) {
    const v = (i * P + j) * 2 + e, c = HEAD_TOP.has(j) ? headC : side;
    // a faint darker band low on the web and foot (grime), lighter on the head
    const k = j <= 6 || j >= 19 ? 0.82 : 1;
    col[v * 3] = c.r * k; col[v * 3 + 1] = c.g * k; col[v * 3 + 2] = c.b * k;
    uvs[v * 2] = (j + e) / P; uvs[v * 2 + 1] = (o.from - rings[i].z) / RAIL_TILE;
    au[v] = o.from - rings[i].z; // distance along the track from its start (the heat ramp's coordinate)
  }
  const capC = headC.clone().lerp(new THREE.Color('#ffffff'), 0.2); // the sawn end of a rail: bright steel
  caps.forEach((ri, c) => {
    for (let j = 0; j < P; j++) {
      const v = RV + c * P + j;
      col[v * 3] = capC.r; col[v * 3 + 1] = capC.g; col[v * 3 + 2] = capC.b;
      uvs[v * 2] = j / P; uvs[v * 2 + 1] = (o.from - rings[ri].z) / RAIL_TILE; au[v] = o.from - rings[ri].z;
    }
    for (const [a, b, d] of capTris) { const base = RV + c * P; idx.push(base + a, base + b, base + d, base + a, base + d, base + b); }
  });
  for (let i = 0; i < N - 1; i++) {
    if (skip.has(i)) continue;
    for (let j = 0; j < P; j++) { const a = (i * P + j) * 2, b = a + 1, c = a + P * 2, d = b + P * 2; idx.push(a, c, b, b, c, d); }
  }
  const rails = [-1, 1].map((s, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3)); g.setAttribute('aU', new THREE.BufferAttribute(au, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, heat[i]); m.castShadow = true; m.receiveShadow = true; m.userData.side = s; group.add(m); return m;
  }) as unknown as [THREE.Mesh, THREE.Mesh];

  // ---- strain: the per-frame mechanics (a bow, spikes drawn up, sleepers shoved, a joint shaking, gaps closing) ----
  let strain: Strain | null = null, gapK = 0;
  /** how far a ring at z slides toward its gap joint: each rail piece grows from its middle, so its ends move most */
  const slide = (z: number) => {
    if (!gapK) return 0;
    for (const j of gapJ) {
      const d = z - j, ad = Math.abs(d);
      if (ad <= JOINT / 2) return -Math.sign(d) * (gapW / 2) * gapK * clamp01(1 - (ad - gapW / 2) / (JOINT / 2 - gapW / 2));
    }
    return 0;
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), s3 = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
  const wob = new THREE.Matrix4(), tmp = new THREE.Matrix4(), loc = new THREE.Matrix4(), rot = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (z: number, along: number, across: number, out: THREE.Matrix4) => {
    // a frame on the curve at z: origin at the centre, x along the curve's normal (square to it)
    const x0 = offAt(z), d = slope(z), n = Math.hypot(1, d), nx = 1 / n, nz = d / n;
    // travel direction toward -z is (-d, 0, -1)/n; along > 0 moves toward -z
    q.setFromAxisAngle(Y, -Math.atan(d));
    p3.set(x0 + nx * across + (-d / n) * along, 0, z + nz * across - (1 / n) * along);
    out.compose(p3, q, s3);
  };
  const sleeperSlot: [number, number][] = [];
  sleeperSets.forEach((set, si) => set.idx.forEach((i, k) => { sleeperSlot[i] = [si, k]; }));
  const writeSleepers = () => {
    zs.forEach((z, i) => {
      const sh = strain?.sleeper?.(i, z) ?? null;
      place(z, (hash(i, 14) - 0.5) * 0.05, (hash(i, 15) - 0.5) * 0.08 + (sh ? sh[0] : 0), m4);
      wob.makeRotationY((hash(i, 16) - 0.5) * 0.05 + (sh ? sh[1] : 0)); m4.multiply(wob);
      const [si, k] = sleeperSlot[i]; sleeperSets[si].mesh.setMatrixAt(k, m4);
    });
    for (const set of sleeperSets) { set.mesh.instanceMatrix.needsUpdate = true; set.mesh.computeBoundingSphere(); }
  };
  const writePlates = () => {
    if (!plates || !spikes) return;
    zs.forEach((z, i) => {
      for (let r = 0; r < 2; r++) {
        const sd = r ? 1 : -1;
        place(z, 0, sd * GAUGE / 2, m4); plates!.setMatrixAt(2 * i + r, m4);
        for (let c = 0; c < 2; c++) {
          const [sx, sz] = CORNERS[c], which = sx === sd ? 0 : 1, s = strain?.spike?.(i, z, sd, which) ?? null;
          const n = (2 * i + r) * 2 + c;
          if (s === 'gone') { spikes!.setMatrixAt(n, ZERO); continue; }
          loc.makeTranslation(sx * 0.11, sTop + (s ? s[0] : 0), sz * 0.05);
          rot.makeRotationY(sx < 0 ? Math.PI : 0); loc.multiply(rot);
          if (s && s[1]) { rot.makeRotationZ(-s[1]); loc.multiply(rot); }
          spikes!.setMatrixAt(n, tmp.multiplyMatrices(m4, loc));
        }
      }
    });
    plates.instanceMatrix.needsUpdate = true; spikes.instanceMatrix.needsUpdate = true; plates.computeBoundingSphere(); spikes.computeBoundingSphere();
  };
  const writeJoints = () => {
    jz.forEach((z, i) => {
      for (let r = 0; r < 2; r++) {
        const sd = r ? 1 : -1, j = strain?.joint?.(z, sd) ?? null;
        place(z + (j ? j[2] : 0), 0, sd * GAUGE / 2 + (j ? j[0] : 0), m4);
        if (j) { m4.elements[13] += j[1]; if (j[3]) { wob.makeRotationY(j[3]); m4.multiply(wob); } }
        joints.setMatrixAt(2 * i + r, m4);
      }
    });
    joints.instanceMatrix.needsUpdate = true; joints.computeBoundingSphere();
  };
  const writeRails = () => {
    for (const r of rails) {
      const sd = r.userData.side as number, attr = r.geometry.attributes.position as THREE.BufferAttribute, pos = attr.array as Float32Array;
      rings.forEach(({ z, k }, i) => {
        const x0 = offAt(z), d = slope(z), n = Math.hypot(1, d), nx = 1 / n, nz = d / n;
        const off = strain?.rail?.(z, sd) ?? null, dz = slide(z) + (off ? off[2] : 0), da = off ? off[0] : 0, dy = off ? off[1] : 0;
        // the rail's centre line, pushed along the track ((nz, 0, nx) points toward +z) and across it (the same (nx, 0, nz)
        // as `place`, so the rails stay on their plates)
        const cx = x0 + nx * (sd * GAUGE / 2 + da) + nz * dz, cz = z + nz * (sd * GAUGE / 2 + da) + nx * dz;
        for (let j = 0; j < P; j++) for (let e = 0; e < 2; e++) {
          const [px0, py0] = PROFILE[(j + e) % P], px = px0 * k, py = 0.086 + (py0 - 0.086) * k, v = (i * P + j) * 2 + e;
          pos[v * 3] = cx + nx * px; pos[v * 3 + 1] = o.railTop - RAIL_H + py + dy; pos[v * 3 + 2] = cz + nz * px;
        }
      });
      // the caps copy their ring's points
      caps.forEach((ri, c) => { for (let j = 0; j < P; j++) { const v = RV + c * P + j, w = (ri * P + j) * 2; pos[v * 3] = pos[w * 3]; pos[v * 3 + 1] = pos[w * 3 + 1]; pos[v * 3 + 2] = pos[w * 3 + 2]; } });
      attr.needsUpdate = true; r.geometry.computeBoundingSphere();
    }
  };
  const rebuild = () => { writeSleepers(); writePlates(); writeJoints(); writeRails(); };

  // ---- ballast: a trapezoid bed painted with packed stones (to the horizon), and modelled stones near the camera ----
  if (o.ballast) {
    const B = o.ballast, len = B.z[0] - B.z[1];
    const topY = sTop - 0.04, topW = slen / 2 + 0.3, botW = B.width / 2 + 0.7, botY = 0.012;
    const L = o.from - o.to, zc = (o.from + o.to) / 2;
    // cross-section points (x, y), left to right; u in metres across the slope surface, v in metres along
    const xs: [number, number][] = [[-botW, botY], [-topW, topY], [topW, topY], [botW, botY]];
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let acc = 0;
    xs.forEach(([x, y], k) => {
      if (k) acc += Math.hypot(x - xs[k - 1][0], y - xs[k - 1][1]);
      pos.push(x, y, zc + L / 2, x, y, zc - L / 2); uv.push(acc, 0, acc, L);
      if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx); bg.computeVertexNormals();
    const btex = pebbleTexture(B.colors, B.bed, 51); btex.repeat.set(1 / 1.1, 1 / 1.1);
    const bed = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: btex, roughness: 1, side: THREE.DoubleSide }));
    bed.receiveShadow = true; group.add(bed);
    const surf = (x: number) => { const ax = Math.abs(x); return ax < topW ? topY : topY + (botY - topY) * Math.min(1, (ax - topW) / (botW - topW)); };
    const col = B.colors.map(c => new THREE.Color(c)), cc = new THREE.Color();
    const e = new THREE.Euler(), sc = new THREE.Vector3();
    const KINDS = 2, per = Math.ceil(B.count / KINDS);
    for (let kind = 0; kind < KINDS; kind++) {
      const st = new THREE.InstancedMesh(pebbleGeo(60 + kind), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), per);
      st.castShadow = true; st.receiveShadow = true;
      for (let n = 0; n < per; n++) {
        const i = kind * per + n;
        let x = 0, z = 0, r = 0;
        for (let t = 0; t < 6; t++) {
          const s = i * 7 + t * 977;
          z = B.z[0] - hash(s, 21) * len; x = (hash(s, 22) - 0.5) * 2 * botW; r = 0.026 + 0.05 * hash(s, 23) ** 1.5;
          // keep stones out of the sleepers: inside a sleeper's footprint a stone would poke through its top
          const ph = ((o.from - z) % gap + gap) % gap, dz = Math.min(ph, gap - ph);
          if (Math.abs(x) < slen / 2 + 0.02 && dz < 0.15 + r * 0.6) continue;
          break;
        }
        const y = surf(x) + r * 0.12 - 0.01;
        p3.set(x, y, z);
        e.set(hash(i, 24) * 6, hash(i, 25) * 6, hash(i, 26) * 6); q.setFromEuler(e); sc.set(r * (0.85 + 0.5 * hash(i, 27)), r * (0.55 + 0.2 * hash(i, 30)), r);
        m4.compose(p3, q, sc); st.setMatrixAt(n, m4);
        cc.copy(col[Math.floor(hash(i, 28) * col.length)]).multiplyScalar(0.85 + 0.3 * hash(i, 29));
        st.setColorAt(n, cc);
      }
      group.add(st);
    }
  }
  // ---- chalked 39' on some sleepers (the canyon track never bends, so these never move) ----
  if (o.chalk) {
    const tex = chalkTexture(), geo = new THREE.PlaneGeometry(0.56, 0.28).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    zs.forEach((z, i) => {
      if (z > o.chalk!.z[0] || z < o.chalk!.z[1] || i % o.chalk!.every) return;
      const m = new THREE.Mesh(geo, mat); m.position.set(-0.05 + 0.3 * hash(i, 31), sTop + 0.002, z - (hash(i, 14) - 0.5) * 0.05); m.rotation.y = (hash(i, 32) - 0.5) * 0.25; m.receiveShadow = true; group.add(m);
    });
  }
  rebuild();
  return {
    group, rails, heat, get bend() { return bend; },
    setBend(b: Bend) { if (b === bend) return; bend = b; rebuild(); },
    setStrain(s: Strain | null) { if (!s && !strain) return; strain = s; rebuild(); },
    setGap(k: number) { k = clamp01(k); if (k === gapK) return; gapK = k; writeRails(); },
    sleeperZ: zs, jointZ: jz,
    centre(z: number) {
      const d = slope(z), n = Math.hypot(1, d);
      return { p: new THREE.Vector3(offAt(z), o.railTop, z), dir: new THREE.Vector3(d / n, 0, 1 / n) };
    },
  };
}

/** the S the gorge track snaps into: z from S_Z[0] (far) to S_Z[1] (near); it throws the train toward +x */
export const S_Z: [number, number] = [-27, -5];
export const S_AMP = -3.0;
export function sBend(z: number) {
  if (z < S_Z[0] || z > S_Z[1]) return 0;
  const u = (z - S_Z[0]) / (S_Z[1] - S_Z[0]);
  return S_AMP * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
}
