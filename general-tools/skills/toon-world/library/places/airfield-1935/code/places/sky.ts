// b17-checklist: above the clouds, 1940s afternoon (s09, "They called it the Flying Fortress"). The blend (S2-7):
//   sky/far  one picture (public/b17-checklist/pictures/sky-far.jpg): a sea of cloud tops under a gold-to-blue sky, on
//            two half-cylinders 420 m out (the far one mirrored), its sky into a dome of the same blue
//   middle   cloud heaps of soft puff cards (cream tops, lilac undersides) passing under and beside the formation, so
//            the speed reads (the middle band, not a sky: S3-80 rules out code clouds as the sky only)
//   ground   none: the cloud floor 60 m below is the ground band
//   detail   nine silver bombers in three Vs, each bobbing a little, props as discs, sun glints on the noses
// The formation flies along +x and holds still in this place; the clouds stream past it along -x.
import * as THREE from 'three';
import { farPicture } from './parts/blend';
import type { PlaceDef } from './index';
import { SKY } from './marks';
import { SKY_LIGHT } from './light';
import { rnd, tiled } from '../props/paint';
import { cloudHeap } from '../props/fx';
import { makePlane } from '../props/plane';

const SKYC = ['#0f3cc2', '#1e55d8', '#3d78e6', '#8cb2ee', '#f2c98a'];
/** the formation: lead at the origin, two more Vs behind, each plane's offset (m) */
export const FORMATION: [number, number, number][] = [
  [0, 0, 0], [-22, -2, 18], [-22, -2, -18],
  [-46, -7, 0], [-68, -9, 18], [-68, -9, -18],
  [-92, 3, 34], [-114, 1, 52], [-114, 1, 16],
];

export const sky: PlaceDef = {
  light: SKY_LIGHT,
  pictures: { skyFar: 'b17-checklist/pictures/sky-far.jpg' },
  build: (pics) => {
    const root = new THREE.Group();
    const a = farPicture({ img: tiled(pics.skyFar), sky: SKYC, radius: 420, arc: Math.PI * 2 - 0.001, toward: [0, -1], base: -116 });
    root.add(a.root);
    // cloud heaps streaming past below and to the sides: soft puff cards (props/fx.ts cloudHeap)
    const heaps = new THREE.Group(); root.add(heaps);
    const heapList: { m: THREE.Object3D; x0: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const r = 16 + 24 * rnd(i), x0 = -500 + (i / 30) * 1000 + 30 * rnd(i + 3), z = (rnd(i + 5) - 0.5) * 520;
      const y = SKY.floor + (rnd(i + 7) - 0.3) * 30 + (Math.abs(z) > 120 ? 25 : 0);
      const h = cloudHeap([x0, y, z], r, 40 + i * 7); heaps.add(h.root); heapList.push({ m: h.root, x0 });
    }
    const planes = FORMATION.map(() => { const p = makePlane(); root.add(p.root); return p; });
    return {
      root,
      update: (f) => {
        const t = f / 30;
        heapList.forEach(({ m, x0 }) => { let x = x0 - 70 * t; x = ((x + 500) % 1000 + 1000) % 1000 - 500; m.position.x = x; });
        planes.forEach((p, i) => { const o = FORMATION[i]; p.pose({ at: [o[0] + 0.6 * Math.sin(t * 1.1 + i), o[1] + 0.5 * Math.sin(t * 0.9 + i * 2), o[2]], yaw: 0, pitch: 2 + 0.6 * Math.sin(t * 0.8 + i), roll: 1.5 * Math.sin(t * 0.7 + i * 1.3), spin: t * 40, disc: 1, gear: false }); });
      },
      groundY: () => SKY.floor,
    };
  },
};
