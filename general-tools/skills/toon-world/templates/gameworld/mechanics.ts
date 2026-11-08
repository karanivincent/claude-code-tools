import * as THREE from 'three';
import { hash, prog, smooth, clamp, lerp, type V3 } from './shots';
import { GAUGE, JOINT, RAIL_H, type Strain } from './track';

// The mechanics of the story (out/practice/railroads/meaning.md): each beat shows its change happening, not only the
// state after it. Every function here is a pure function of the clip frame, so any frame renders on its own.
//
//   deck   0-45    the smooth line's rails butt end to end (a hairline seam, no gap) and creak: a 1-2 mm tremble
//          46-143  shoving each other: the joint at PUSH_JOINT shakes harder, the rails lift in a slow bow behind it,
//                  the spikes there are drawn up one after another and pop (fx's flying spikes take over at their own
//                  birth frames, from the same places), and the sleepers are shoved a hand's width sideways
//   canyon 145-191 his joint (HIS_JOINT) with a finger-wide gap and a coin standing in it
//          186-225 the gap closes: both rail ends slide toward each other (each rail grows from its middle), the coin
//                  is pinched and pops out just before they touch at CLOSE_F; then still, straight, glowing
//   gorge  318-367 the bridge track under strain before the snap: a faint sideways bow, spikes standing up, a sleeper
//                  or two skewed; at 368 the S-snap releases it all

// ---- the deck: the smooth line under pressure --------------------------------------------------------------------
export const DECK_FROM = 60, DECK_RAIL_TOP = 0.32, DECK_GAP = 0.55;
const D_STOP = DECK_RAIL_TOP - RAIL_H - 0.016; // sleeper top on the deck
/** the joint the pressure builds at (both rails): z -29.25, between the camera's low push and the owner */
export const PUSH_JOINT = DECK_FROM - JOINT / 2 - 7 * JOINT;
/** the bow: from the push joint back toward the camera */
export const BOW_Z: [number, number] = [PUSH_JOINT + 0.25, PUSH_JOINT + 8.4];
const bowShape = (z: number) => { const t = (z - BOW_Z[0]) / (BOW_Z[1] - BOW_Z[0]); return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) ** 1.4; };
/** how far the rails have lifted at the top of the bow (metres), rail by rail */
export const bowLift = (f: number, side: number) => side > 0
  ? 0.085 * smooth(prog(f, 50, 112)) + 0.03 * smooth(prog(f, 108, 118))
  : 0.065 * smooth(prog(f, 58, 116)) + 0.022 * smooth(prog(f, 110, 120));
/** fx's flying spikes: its Spikes pool (14) is born at 90 + 16 hash(i, 101) (fx.ts Spikes.update with f0 90, f1 114) */
export const DECK_SPIKES = 14;
const spikeBorn = (i: number) => 90 + 16 * hash(i, 101);
/** the sleeper and rail each flying spike comes out of: the outer spike of every sleeper in the bow, rails alternating */
const spikeSlot = (i: number) => ({ sleeper: Math.ceil((DECK_FROM - (PUSH_JOINT + 7.9)) / DECK_GAP) + i, side: i % 2 ? 1 : -1 });
const slotOf = new Map<string, number>();
for (let i = 0; i < DECK_SPIKES; i++) { const s = spikeSlot(i); slotOf.set(`${s.sleeper},${s.side}`, i); }
/** how far spike i has been drawn up (it rises over 24 frames before it pops) */
const spikeRise = (i: number, f: number) => 0.075 * smooth(prog(f, spikeBorn(i) - 24, spikeBorn(i)));
/** where fx's flying spike i starts: the spot its static spike left from, at the height it had been drawn up to */
export function deckSpikeFrom(i: number): V3 {
  const { sleeper, side } = spikeSlot(i), z = DECK_FROM - sleeper * DECK_GAP;
  return [side * (GAUGE / 2 + 0.11), D_STOP + 0.05 + 0.075, z - side * 0.05];
}
/** the creak (0-45, every rail a 1-2 mm tremble) and the shove (46-143) */
export function deckStrain(f: number): Strain | null {
  if (f > 160) return null;
  const creak = (z: number, side: number) => {
    const near = Math.abs(z - PUSH_JOINT) < 14 ? 1 : 0;
    const amp = 0.0012 + near * 0.003 * smooth(prog(f, 46, 112));
    return amp * Math.sin(f * 2.3 + z * 0.9 + side * 1.7);
  };
  return {
    rail: (z, side) => {
      const b = bowShape(z), lift = b * bowLift(f, side);
      return [b * 0.3 * lift + 0.5 * creak(z + 3, side), lift + creak(z, side), 0];
    },
    sleeper: (i, z) => {
      if (z > BOW_Z[1] + 1.2 || z < BOW_Z[0] - 1.2) return null;
      const d = hash(i, 71), k = smooth(prog(f, 72 + 30 * d, 122 + 18 * d));
      return [(0.08 + 0.08 * hash(i, 72)) * k, (hash(i, 73) - 0.5) * 0.12 * k];
    },
    spike: (i, z, side, which) => {
      if (z > BOW_Z[1] + 0.3 || z < BOW_Z[0] - 0.3) return null;
      const n = which === 0 ? slotOf.get(`${i},${side}`) : undefined;
      if (n !== undefined) { if (f >= spikeBorn(n)) return 'gone'; const r = spikeRise(n, f); return [r, 3.5 * r]; }
      // the others are drawn up part way and stay, leaning
      const r = (0.012 + 0.03 * hash(i * 4 + which + side, 74)) * smooth(prog(f, 70 + 40 * hash(i, 75 + which), 130));
      return [r, 4 * r];
    },
    joint: (z, side) => {
      const near = Math.abs(z - PUSH_JOINT) < 0.1;
      const amp = near ? 0.0015 + 0.004 * smooth(prog(f, 46, 112)) : 0.0008;
      return [amp * Math.sin(f * 3.1 + side), amp * 0.6 * Math.sin(f * 4.3 + side * 2), near ? amp * Math.sin(f * 2.7) : 0, near ? 0.25 * amp * 10 * Math.sin(f * 1.9 + side) : 0];
    },
  };
}

// ---- the canyon: his gap closing ------------------------------------------------------------------------------------
export const CANYON_FROM = 60, CANYON_RAIL_TOP = 0.42;
/** a finger-wide gap between his rail ends */
export const GAP_W = 0.022;
/** his joint, right at his feet and the chalked 39': on the right-hand rail (x +0.72) at z -5.45 */
export const HIS_JOINT_Z = CANYON_FROM - JOINT / 2 - 5 * JOINT;
/** the gap's centre on the rail head (world): aim the macro here */
export const HIS_GAP: V3 = [GAUGE / 2, CANYON_RAIL_TOP - 0.02, HIS_JOINT_Z];
/** the gap closes from GAP_F[0] (the heat arrives) and the rail ends touch at CLOSE_F */
export const GAP_F: [number, number] = [186, 225];
export const CLOSE_F = GAP_F[1];
/** 0 open, 1 closed: smooth at the start, still moving when the ends touch (so the touch is a touch, with a tink) */
export const gapClose = (f: number) => { const t = prog(f, GAP_F[0], GAP_F[1]); return clamp(0.55 * smooth(t) + 0.45 * t * t); };
/** the gap's width in metres at frame f */
export const gapWidth = (f: number) => GAP_W * (1 - gapClose(f));

// the coin: a big brass coin standing on edge in the gap, its lower edge 9 mm down between the rail ends
const COIN_R = 0.019, COIN_T = 0.0028;
/** the frame the closing ends pinch the coin and it pops out (found once: the first frame the gap is under its thickness) */
export const COIN_POP_F = (() => { for (let f = GAP_F[0]; f <= GAP_F[1]; f += 0.25) if (gapWidth(f) <= COIN_T * 1.1) return f; return GAP_F[1] - 2; })();
function coinTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(S * 0.4, S * 0.35, 10, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#f6d27a'); gr.addColorStop(1, '#a8742c');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(90,50,10,0.75)'; g.lineWidth = 8; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; g.fillStyle = 'rgba(90,50,10,0.5)'; g.fillRect(S / 2 + Math.cos(a) * (S / 2 - 30) - 2, S / 2 + Math.sin(a) * (S / 2 - 30) - 2, 4, 4); }
  // a locomotive wheel in the middle: our own design
  g.strokeStyle = 'rgba(80,44,8,0.85)'; g.lineWidth = 7; g.beginPath(); g.arc(S / 2, S / 2, 52, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * 52, S / 2 + Math.sin(a) * 52); g.stroke(); }
  g.fillStyle = 'rgba(80,44,8,0.85)'; g.beginPath(); g.arc(S / 2, S / 2, 12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export interface Coin { group: THREE.Group; update(f: number): void }
/** the coin in his gap: standing from the first frame, pinched and popped out at COIN_POP_F, lying on the ballast after */
export function makeCoin(): Coin {
  const tex = coinTexture();
  const face = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.85, roughness: 0.3 });
  const rim = new THREE.MeshStandardMaterial({ color: '#c08a3a', metalness: 0.9, roughness: 0.28 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 40), [rim, face, face]);
  mesh.castShadow = true;
  const group = new THREE.Group(); group.add(mesh);
  const start = new THREE.Vector3(GAUGE / 2, CANYON_RAIL_TOP + COIN_R - 0.009, HIS_JOINT_Z);
  const ground = CANYON_RAIL_TOP - RAIL_H - 0.016 - 0.04 + 0.03; // on the ballast beside the rail
  return {
    group,
    update(f: number) {
      const a = f - COIN_POP_F;
      if (a < 0) {
        // standing in the gap, its faces toward the rail ends (the cylinder's axis along the rail); a faint lean while
        // the gap is wide, upright as it narrows
        const lean = 0.12 * (gapWidth(f) / GAP_W);
        group.position.copy(start); group.rotation.set(Math.PI / 2 + lean, 0, 0);
        return;
      }
      // pinched out: up and outward, spinning, then down onto the ballast, where it lies
      const v = new THREE.Vector3(0.011, 0.03, 0.004), gr = 0.0024;
      const tLand = (v.y + Math.sqrt(v.y * v.y + 2 * gr * (start.y - ground))) / gr, t = Math.min(a, tLand);
      group.position.set(start.x + v.x * t, start.y + v.y * t - 0.5 * gr * t * t, start.z + v.z * t);
      if (a < tLand) group.rotation.set(Math.PI / 2 + 0.55 * a, 0.4 * a, 0.2 * a);
      else group.rotation.set(0.05, 1.1, 0.04); // flat on the stones
    },
  };
}

// ---- the gorge: the bridge track straining before the snap ---------------------------------------------------------
const B_Z: [number, number] = [-25, -7];
/** the bridge's strain, 318-367, then nothing once the snap releases it (the caller passes null from SNAP_F) */
export function bridgeStrain(f: number): Strain | null {
  if (f < 300) return null;
  const A = smooth(prog(f, 318, 366));
  const shape = (z: number) => { const t = (z - B_Z[0]) / (B_Z[1] - B_Z[0]); return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) ** 1.5; };
  return {
    // a faint sideways bow (toward where the S will throw it, -x at the far half), a shiver as the train comes on
    rail: (z, side) => { const s = shape(z); return [-0.2 * A * s, 0.012 * A * s + 0.0015 * A * Math.sin(f * 2.9 + z + side), 0]; },
    sleeper: (i, z) => {
      if (z < B_Z[0] || z > B_Z[1] || hash(i, 82) > 0.12) return null;
      const k = smooth(prog(f, 335 + 20 * hash(i, 83), 362));
      return [-0.12 * k, (hash(i, 84) > 0.5 ? 1 : -1) * 0.28 * k];
    },
    spike: (i, z, side, which) => {
      if (z < B_Z[0] || z > B_Z[1] || hash(i * 4 + which + side, 85) > 0.1) return null;
      const r = (0.05 + 0.04 * hash(i, 86)) * smooth(prog(f, 322 + 36 * hash(i * 2 + which, 87), 366));
      return [r, 4 * r];
    },
  };
}
void lerp;
