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
// The mix (toon-world, route 1): sky and far things are pictures, middle depth is cut-out picture layers, ground and
// anything the camera passes close to is code 3D (with painted textures, never plain code colour), hero props are
// image-to-3D models, people are cards. Small living detail comes from detail.ts.

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
  /** each shot's framing and people. `t` is the film's clock for this shot (it starts at the shot's own `t` and runs
   *  for the shot's stretch of the voice); the board calls it without `t`. Use it to walk, gesture, fall and fly. */
  shots: Record<string, (b: Built, t?: number) => Shot>;
}
