// b17-checklist: the places. Each place is built once per scene from its parts and owned by the world stage: a scene's
// people, motion and sound passes never edit a place file. A place's moving things (the planes, smoke, the list being
// written) run on the FILM's frame, so they carry on across a cut instead of jumping.
import type * as THREE from 'three';
import type { PlaceLight } from '../../../look/lights';
import { airfield } from './airfield';
import { cockpit } from './cockpit';
import { hangarInside } from './hangar';
import { sky } from './sky';

export type Built = { root: THREE.Group; update: (filmFrame: number) => void; groundY: (x: number, z: number) => number };
export type PlaceDef = {
  /** the place's light (a time of day), set before round 1 (look/lights.ts) */
  light: PlaceLight;
  /** pictures to preload from public/ (the far band's picture), by name; a missing one builds the stand-in */
  pictures?: Record<string, string>;
  build: (pictures: Record<string, HTMLImageElement | null>) => Built;
};
export const PLACES = { airfield, cockpit, hangar: hangarInside, sky } satisfies Record<string, PlaceDef>;
export type PlaceName = keyof typeof PLACES;
