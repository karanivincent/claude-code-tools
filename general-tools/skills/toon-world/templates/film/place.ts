import * as THREE from 'three';
import type { LightPreset } from '../../look/lights';
import type { Person } from './cast';
import type { V3, View } from '../../toon-kit/timing';
export type { V3, View };

// The contract every place file (places/<place>.ts) keeps. A place builds its world once from its pictures and models
// and names its shots; Stage.tsx renders any shot of any place through the look stack (ink, lens blur, bloom, tone map,
// grade), lights it, and draws the people as lit bean-head cards from the story's cast.ts. The same file serves the
// still board (shots called without `t`) and the film (shots called with the film's clock).
//
// The blend (decision 1, Vincent 11 November 2026), every place: the far band is one picture; the middle and the
// ground are real 3D shapes built in code with painted textures (paint.ts: 2048, mipmaps, 16x anisotropy), never plain
// code colour; props are code 3D (a Higgsfield model only when the owner asks); people are lit cards (cast.ts); a
// detail layer of small real things that move (detail.ts: flies, smoke, cloth, birds, a goat), not dots. Vincent
// approves each place's parts plan (stories/<slug>/parts.md) before it is built. tools/look.mjs checks the result:
// plain meshes and small textures near a shot camera, the detail per shot, the flat share of every shot's still.
// What it reads on a mesh's userData: `detail` (a detail thing's kind) with `tick`, `card` (a person, animal or effect
// card: judged by the card rules), `far` (the far band: judged by eye, not by the flat share), `plainOk` (a plain
// colour on purpose, with its reason: a cord, a shadow catcher), `emissive` (a light volume, a glow).

export interface Loaded { img: Record<string, HTMLImageElement>; glb: Record<string, THREE.Object3D> }
/** a prop that must sit in a hand, for the acting audit's held-prop check: world points of the prop and of its
 *  holder's hand (leave `hand` out when no hand is on it, and the audit says so) */
export interface HeldProp { name: string; at: V3; holder?: string; hand?: V3 }
export interface Shot {
  view: View;
  /** the shot's own starting time in seconds; the film's clock runs on from it. Default 0 */
  t?: number;
  people?: Person[];
  /** the point the lens focuses on (default: the view's look point) and the far blur in px at 1080 wide (0 = sharp) */
  focus?: V3; blur?: number;
  props?: HeldProp[];
  /** the script line this shot illustrates, and what the owner should judge in it (for the board) */
  line: string; note: string;
}
export interface Built {
  /** called every frame before the render, with the shot's name and its clock: water, planes, paper, fire, sparkles */
  update?: (shot: string, t: number, cam: THREE.PerspectiveCamera) => void;
  [k: string]: unknown;
}
export interface PlaceDef {
  /** file names under public/<slug>/pictures/ and public/<slug>/models/ (without the folder) */
  pictures: string[];
  models: string[];
  grade: 'day' | 'golden';
  /** light: LIGHTS[grade] with these overrides (lit, shade, lift, charTint ...) */
  light?: Partial<LightPreset>;
  /** world direction towards the key light (sun, moon, lantern) */
  sun: V3;
  sunColour?: string;
  /** half the size of the sun's shadow box in metres around the focus (default 16): larger for wide places */
  shadow?: number;
  background: string;
  build: (scene: THREE.Scene, a: Loaded) => Built;
  /** the solids a camera must not crowd or look through (rocks, posts, a well): the audit's lens and must-see checks.
   *  Give the same positions the build uses. */
  blockers?: { c: V3; r: number; name?: string }[];
  /** the ground's height at (x, z), for the audit's empty-sky check (default: flat at 0) */
  groundAt?: (x: number, z: number) => number;
  /** each shot's framing and people. `t` is the film's clock for this shot (it starts at the shot's own `t` and runs
   *  for the shot's stretch of the voice); the board calls it without `t`. Use it to walk, gesture, fall and fly. */
  shots: Record<string, (b: Built, t?: number) => Shot>;
}
