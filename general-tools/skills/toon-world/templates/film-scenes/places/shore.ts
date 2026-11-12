// A stand-in place built to the blend (replace it with the story's): a rock shelf above water at dusk. Every band:
//   far     farPicture: public/__SLUG__/far.jpg when it exists (one Higgsfield picture), else painted hills
//   middle  midBand: oaks behind the shelf, bushes along its edge
//   ground  rockSurface (the shelf's water face, displaced), groundSurface (grass on top), water (moving, a sparkle band)
//   detail  fire with embers, string lights, fireflies, birds
// The shelf's top is at TOP; its edge runs along z at x = 0 and the water is at +x.
import * as THREE from 'three';
import { DUSK_SIDE } from '../../../look/lights';
import { farPicture, midBand, rockSurface, groundSurface, water, fire, stringLights, fireflies, birds, group } from './parts/blend';
import type { PlaceDef } from './index';
import { SHORE } from './marks';

export const TOP = SHORE.top;
export const shore: PlaceDef = {
  light: DUSK_SIDE,
  pictures: { far: '__SLUG__/far.jpg' },
  build: (pics) => {
    const parts = group(
      farPicture({ img: pics.far, sky: ['#151a36', '#463c70', '#c8728a', '#f4a074', '#ffd99a'], toward: [-0.6, -0.8] }),
      water({ radius: 86, sparkle: { at: [20, -20], size: [60, 80] }, shadeBand: { at: [0.8, -6], size: [4, 40] } }),
      rockSurface({ size: [30, TOP + 1, 40], at: [-15, (TOP - 1) / 2, -6], face: '+x', keep: [0, 1.2] }),
      groundSurface({ size: [29.2, 40], at: [-15.4, TOP + 0.04, -6], color: '#8f9a52', tones: '#9aa85a', blades: true, bumps: 0.03 }),
      midBand({ trees: [{ x: -9, z: -4, s: 1.6 }, { x: -12, z: -10, s: 2.0 }, { x: -15, z: 2, s: 1.8 }], y: TOP,
        bushes: { a: [-0.5, -12], b: [-0.5, 12], n: 22, gap: [0, 0] } }),
      fire([-3.8, TOP, -3.6]),
      stringLights([-0.4, TOP, -3.4], [-4.2, TOP, -0.8]),
      fireflies([[-5, -1.2], [TOP + 0.4, TOP + 1.6], [-5, 2]]),
      birds([-30, 16, -40]),
    );
    return {
      root: parts.root,
      update: (f) => parts.update(f),
      groundY: (x) => (x < 0 ? TOP : 0),
    };
  },
};
void THREE;
