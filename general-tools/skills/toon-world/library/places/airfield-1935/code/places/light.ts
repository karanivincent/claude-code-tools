// b17-checklist: each place's light (look/lights.ts PlaceLight), set before round 1. Start values from DAY_SIDE, tuned on
// full-size stills at the world stage. The colour arc (profile.md): a bright autumn noon at the airfield, a cool hangar
// with one warm lamp, and the brightest warm frame above the clouds at the end.
import { DAY_SIDE, type PlaceLight } from '../../../look/lights';

/** Wright Field, late morning: warm key from the side, blue fill, fog only far out (the field is 900 m across) */
/** world-r1, the one light step: a warmer gold key (keyCol and lit), so the silver plane and the cards warm against the
 *  blue sky (reviewers: cool on cool) */
export const DAY_AIR: PlaceLight = { ...DAY_SIDE, az: 62, el: 32, // world-r2 step: the key swung toward the lens side (from 105) so the plane's sun-side edges and the cards catch a warm rim
  keyCol: '#ffd9a6', lit: [1.66, 1.44, 1.1], fog: '#b9cdeb', fogNear: 260, fogFar: 1300, background: '#4a7ee6' };
/** the cockpit: daylight through the glass from ahead and above, a little cooler inside */
export const COCKPIT_LIGHT: PlaceLight = { ...DAY_SIDE, az: 110, el: 35, // world-r2 step: a side key (from 160, which fronted Hill)
  keyI: 2.4, keyCol: '#ffd9a6', lit: [1.56, 1.38, 1.06], fog: '#b9cdeb', fogNear: 300, fogFar: 1300, background: '#4a7ee6' };
/** the hangar: cool daylight from the door, blue-grey shade (S3-41); the lamp over the table is the warm accent */
export const HANGAR_LIGHT: PlaceLight = { ...DAY_SIDE, az: 70, el: 28, keyCol: '#fff0d8', keyI: 2.3, lit: [1.35, 1.25, 1.1], shade: [0.3, 0.36, 0.6], fog: '#8c9ab8', fogNear: 60, fogFar: 600, background: '#5d6f98' };
/** above the clouds, afternoon: the warmest, brightest place, golden key low from the side */
export const SKY_LIGHT: PlaceLight = { ...DAY_SIDE, az: 115, el: 22, keyCol: '#ffd9a8', keyI: 3.0, lit: [1.7, 1.35, 1.0], shade: [0.42, 0.4, 0.7], fog: '#c7b9e6', fogNear: 300, fogFar: 1600, background: '#2f60d4', grade: 'golden' };
