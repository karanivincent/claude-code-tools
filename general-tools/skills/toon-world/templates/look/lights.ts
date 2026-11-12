// From the cartoon-3d-short skill, github.com/mromidev/claude-animated-shorts (commit e3b817b), MIT licence: see
// LICENSE-cartoon-3d-short beside this file. Adapted for Bible in Clay's ancient jar test (an interior grade preset,
// extra hats and props in toon.ts, our cast in cast.ts). The scene loop (November 2026) added options, each off by
// default so an existing story renders the same: free poses, talk, secondary motion (toon.ts), the dusk place light
// (lights.ts), its rims (cardshade.ts) and grade (grade.ts).
// Light presets per time of day. The sun is CAMERA-RELATIVE and frozen per shot (world.ts update()):
// az = degrees from the shot camera's forward axis (0 = sun straight ahead = backlight, +90 = screen right,
// 180 = behind camera), el = elevation. lit/shade/lift are LINEAR RGB multipliers for shade.ts (may exceed 1).
// Field names follow lighting.md 9.1 exactly (the CHAR and POST agents read them); values are tuned on renders.
import * as THREE from "three";
import { TONE, CHAR, untone } from "./shade";
import { setRims, RIM_DEFAULT, RIM_DUSK, type Rims } from "./cardshade";
type C3 = [number, number, number];
export type LightPreset = {
  az: number; el: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number;      // world two-tone (shade.ts)
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3; // character cards (cast.ts)
  blob: C3; actorShadow: boolean;                                                    // contact blobs / card shadows
  top: string; hor: string; skyCurve: C3; fog: string; fogNear: number; fogFar: number; sunDisc: string; // depth.md 6.5
  sunCol: string; sunI: number; sky: string; ground: string; hemiI: number;         // three lights (unpatched mats only)
  bias: number; normalBias: number;
};
export const LIGHTS: Record<"day" | "golden", LightPreset> = {
  day: {
    az: 75, el: 48,
    lit: [1.58, 1.5, 1.33], shade: [0.3, 0.29, 0.36], lift: [0.05, 0.06, 0.11], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.94, 0.92], charShade: 0.86, charGrad: 0.07, bodyGrad: 0.2, sideTint: [0.92, 0.90, 0.96],
    blob: [0.62, 0.58, 0.58], actorShadow: false,
    top: "#3e7fd2", hor: "#b8d0ec", skyCurve: [0.0, 0.5, 0.6], fog: "#b8d0ec", fogNear: 25, fogFar: 300, sunDisc: "#000000",
    sunCol: "#fff3e0", sunI: 2.8, sky: "#dcecff", ground: "#b49a78", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  golden: {
    az: 6, el: 7,
    lit: [1.5, 0.68, 0.24], shade: [0.15, 0.15, 0.3], lift: [0.04, 0.06, 0.17], lambert: 0.35, sideK: 0.82, term: 0.07,
    charTint: [1.0, 0.78, 0.56], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.85, 0.80, 0.95],
    blob: [0.75, 0.74, 0.9], actorShadow: true,
    top: "#6a4f8c", hor: "#ffd08a", skyCurve: [0.05, 0.6, 1.0], fog: "#efb489", fogNear: 50, fogFar: 380, sunDisc: "#ffcf9e",
    sunCol: "#ffab5e", sunI: 5.5, sky: "#d8b0b8", ground: "#8a6a60", hemiI: 0.5,
    bias: -0.0006, normalBias: 0.03,
  },
};

/** world-only look per light (sky stops by elevation in degrees, river colours, cloud palette). All colours are
 *  ON-SCREEN targets under the current PBR-Neutral tone map; world.ts pre-inverts the tone map (shade.ts untone). */
export type WorldLook = {
  sky: { c: string[]; e: number[] };                         // 5 stops: c[i] at elevation e[i] (deg), smoothstep between
  water: { near: string; mid: string; far: string; crest: string; trough: string; glint: string; shade: C3 };
  bounce: C3;                                                 // shade.ts uBounce: albedo x bounce on shaded faces turned to the lens
  sat: number;                                                // shade.ts uSat: world albedo saturation (1 = as painted)
  cloud: { lit: string; mid: string; shade: string };
};
export const LOOK: Record<"day" | "golden", WorldLook> = {
  day: {
    // depth.md 2.2: horizon #9fb6e6 just above the skyline, upper sky #5e93d9 at ~20 deg (grade: frame top #5997e2)
    sky: { c: ["#b8d0ec", "#9cbfea", "#6a9fe0", "#4f8cdb", "#3373cc"], e: [0, 3, 8, 16, 40] },
    water: { near: "#22a7b6", mid: "#167fb2", far: "#1a5596", crest: "#7ddfe8", trough: "#0e4a80", glint: "#ffffff", shade: [0.5, 0.56, 0.72] },
    cloud: { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" },
    bounce: [0, 0, 0],
    sat: 1.08,
  },
  golden: {
    // sunset, not dusk: #ffd08a horizon, peach/orange through ~10 deg, warm rose at 20, muted warm mauve only near the top
    // (the golden grade adds ~+11/255 blue to shadows/mids, so these lean warm)
    sky: { c: ["#ffc47c", "#f7ae78", "#e8967c", "#c4848e", "#8a6f8a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#1e3a6e", mid: "#355f96", far: "#d4a48e", crest: "#d9a088", trough: "#16294f", glint: "#ffe2b0", shade: [0.42, 0.46, 0.72] },
    cloud: { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" },
    bounce: [0.04, 0.02, 0.0],
    sat: 1.1,
  },
};

// ---------------- place lights (the scene loop, November 2026) ----------------
// A place gets its light, with a time of day, before round 1 (cliff spike 5: world and light rose two points each).
// One warm key from the side of the shot (never from straight behind the camera: the cards get no rim), a cool fill
// (the shade colour), warm and cool rims on the cards, a cool fog, and the grade with teal shadows and warm highlights
// (grade.ts GRADE_DUSK). Change it one step a round (one colour or one direction): a whole-scene relight lost by 0.4.
// Keep a warm subject against a cool or dark field, never cool on cool.

export type PlaceLight = {
  /** key direction relative to the shot camera: az degrees from its forward axis (+90 = screen right), el elevation */
  az: number; el: number; keyCol: string; keyI: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number; bounce: C3; sat: number;
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3;
  fog: string; fogNear: number; fogFar: number; background: string;
  rims: Rims; grade: "day" | "golden" | "dusk";
};
/** dusk with a side key (the cliff clip's winner): golden-hour key from the side, cool sky fill, cool fog */
export const DUSK_SIDE: PlaceLight = {
  az: 108, el: 18, keyCol: "#ffd0a0", keyI: 2.5,
  lit: [1.6, 1.12, 0.74], shade: [0.3, 0.36, 0.64], lift: [0.03, 0.05, 0.1], lambert: 0.35, sideK: 0.84, term: 0.2, bounce: [0.03, 0.015, 0], sat: 1,
  charTint: [1.04, 0.92, 0.84], charShade: 0.86, charGrad: 0.1, bodyGrad: 0.2, sideTint: [0.86, 0.86, 1.0],
  fog: "#9a88b4", fogNear: 18, fogFar: 100, background: "#5a4f86",
  rims: RIM_DUSK, grade: "dusk",
};
/** day with a side key: the same recipe at noon-ish (warm key, blue fill, a light haze); a start, tune it on stills */
export const DAY_SIDE: PlaceLight = {
  az: 100, el: 40, keyCol: "#fff1dc", keyI: 2.8,
  lit: [1.55, 1.42, 1.22], shade: [0.34, 0.38, 0.56], lift: [0.04, 0.05, 0.09], lambert: 0.35, sideK: 0.84, term: 0.2, bounce: [0.02, 0.012, 0], sat: 1.04,
  charTint: [1.0, 0.95, 0.9], charShade: 0.86, charGrad: 0.08, bodyGrad: 0.2, sideTint: [0.9, 0.9, 1.0],
  fog: "#b8c8e0", fogNear: 25, fogFar: 160, background: "#9ab6dc",
  rims: { ...RIM_DUSK, on: 1, col: [0.9, 0.6, 0.3], cool: 0.4 }, grade: "day",
};
/** the key's world direction (towards the light) for a camera at `pos` looking at `look` */
export const keyFrom = (pos: C3, look: C3, az: number, el: number): C3 => {
  const f = new THREE.Vector3(look[0] - pos[0], 0, look[2] - pos[2]).normalize(), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, h = f.multiplyScalar(Math.cos(a)).addScaledVector(r, Math.sin(a)).multiplyScalar(Math.cos(e));
  return [h.x, Math.sin(e), h.z];
};
/** Set the world and card uniforms and the card rims from a place light. `cold` 0..1 cools and darkens it (an after:
 *  a splash, a death), as the cliff clip did after the entry. Call once a frame before rendering. */
export const applyPlaceLight = (L: PlaceLight, cold = 0) => {
  TONE.uLitCol.value.set(L.lit[0] * (1 - 0.42 * cold), L.lit[1] * (1 - 0.3 * cold), L.lit[2] * (1 - 0.05 * cold));
  TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
  TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...L.bounce); TONE.uSat.value = L.sat;
  CHAR.uCharTint.value.set(L.charTint[0] * (1 - 0.18 * cold), L.charTint[1] * (1 - 0.08 * cold), L.charTint[2] * (1 + 0.1 * cold));
  CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad; CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
  setRims(L.rims);
};
/** back to the original rims (a story that mixes old and new places) */
export const resetRims = () => setRims(RIM_DEFAULT);
/** the fog and background of a place light, in the tone-mapped space the screen shows */
export const fogOf = (L: PlaceLight) => { const fog = new THREE.Fog(untone(L.fog), L.fogNear, L.fogFar); return { fog, background: untone(L.background) }; };
