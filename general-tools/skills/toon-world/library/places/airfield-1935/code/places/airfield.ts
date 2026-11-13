// b17-checklist: Wright Field, Ohio, 30 October 1935, late morning, clear autumn day. The blend (S2-7):
//   sky     the far picture's own blue sky, its top faded into a dome of the same blue (S3-80)
//   far     one picture (public/b17-checklist/pictures/airfield-far.jpg): autumn trees, a red barn and silo, a water
//           tower, two far hangars, a farmhouse; on two half-cylinders 420 m out so every camera sees it (marks FAR)
//   middle  code 3D with painted textures: the curved-roof hangar, the officers' stand with bunting, 1930s cars, the
//           fire truck and ambulance, oil drums, the wind sock, the flag
//   ground  code 3D: painted autumn grass (gently bumped), the pale concrete runway along x
//   detail  the wind sock and flag flapping, birds crossing, wheel dust, the plane's propellers
//   hero    the Model 299 (props/plane.ts) on its flight (props/flight.ts); after 24.2 s the wreck, fire and smoke
// Layout (marks.ts AIRFIELD): the runway runs along x (z from -15 to 15); the apron and stand are on its north side
// (-z), the crash site to the east beyond it (+x, +z).
import * as THREE from 'three';
import { farPicture, skyClouds, midBand, fbm, group as groupParts, type Part } from './parts/blend';
import type { PlaceDef } from './index';
import { AIRFIELD, FAR, WIND, THROWN, CREW, TREELINE } from './marks';
import { DAY_AIR } from './light';
import { add, grassTex, mat, runwayTex, tiled } from '../props/paint';
import { makePlane } from '../props/plane';
import { IMPACT, WRECK, model299, parkedAt, y1b17, ENGINE_START } from '../props/flight';
import { hangar, stand, car, fireTruck, ambulance, drums, wreck, scorch, blob, tufts, crewman } from '../props/sets';
import { smokeColumn, flames, impact, wheelDust, windSock, flag, flock, groupFx } from '../props/fx';

const SKY = ['#1d47c8', '#2d5fdc', '#4a7ee6', '#7aa2ec', '#a9c4f0'];
/** the wind: toward -x (the plane takes off into it) and a little north; the sock, the flag and the smoke all follow it */
const WIND_YAW = Math.atan2(-WIND[1], WIND[0]);
/** the picture's four painted clouds, as fractions of the single picture */
const CLOUD_CROPS: [number, number, number, number][] = [[0.008, 0.012, 0.322, 0.392], [0.29, 0.318, 0.445, 0.472], [0.455, 0.045, 0.736, 0.348], [0.775, 0.168, 0.992, 0.406]];
/** clouds round the sky the cameras look up into (north and east of the field), 330-400 m out: [x, y, z, width, crop] */
const CLOUDS: [number, number, number, number, number][] = (() => {
  const out: [number, number, number, number, number][] = [];
  const list = [[-100, 22, 0], [-80, 40, 2], [-62, 28, 1], [-48, 55, 3], [-35, 20, 2], [-24, 38, 0], [-12, 62, 1], [-4, 26, 3], [8, 46, 2], [18, 18, 1], [28, 34, 0], [40, 54, 3], [55, 24, 2], [75, 40, 1], [95, 22, 0], [-150, 30, 3], [140, 30, 2], [180, 25, 1]];
  list.forEach(([az, el, k], i) => { const r = 330 + 60 * ((i * 37) % 7) / 7, a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    out.push([r * Math.cos(e) * Math.cos(a), r * Math.sin(e), r * Math.cos(e) * Math.sin(a), [190, 110, 210, 160][k] * (0.75 + 0.1 * (i % 4)), k]); });
  return out;
})();

export const airfield: PlaceDef = {
  light: DAY_AIR,
  pictures: { airfieldFar: 'b17-checklist/pictures/airfield-far.jpg' },
  build: (pics) => {
    const root = new THREE.Group();
    // far band, on both halves (the north half is the picture mirrored, so the seam is at east and west)
    // one picture round the whole horizon (at 420 m a half-circle made its hangars four times life size)
    const farS = farPicture({ img: tiled(pics.airfieldFar), sky: SKY, radius: 420, arc: Math.PI * 2 + 0.006, warmClouds: true, toward: FAR.airfield.toward, base: -11 });
    // sky clouds cut from the picture's own clouds, for the cameras that look up past its top (s04's climb and stall)
    const clouds = skyClouds(pics.airfieldFar, { crops: CLOUD_CROPS, at: CLOUDS, drift: [WIND[0] * 0.08, WIND[1] * 0.08] });
    // ground and runway: the painted grass, its colour varied in big soft patches (gold, deep green, a little mown
    // stripe near the runway) through vertex colours, so the field is not one flat lime from the air
    const gGeo = new THREE.PlaneGeometry(900, 900, 240, 240).rotateX(-Math.PI / 2);
    const gp = gGeo.attributes.position as THREE.BufferAttribute, col: number[] = [];
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      if (Math.abs(z) > 22) gp.setY(i, 0.15 * Math.sin(x * 0.07) * Math.cos(z * 0.05));
      const big = fbm(x * 0.011 + 3, z * 0.011, 3), gold = fbm(x * 0.02 + 40, z * 0.02 - 7, 2), k = 0.8 + 0.3 * big;
      const stripe = Math.abs(z) > 16 && Math.abs(z) < 60 ? (Math.floor((Math.abs(z) - 16) / 4) % 2 ? 0.95 : 1.04) : 1;
      const gk = Math.max(0, gold - 0.45) * 1.6;
      col.push(k * stripe * (1 + 0.22 * gk), k * stripe * (1 + 0.04 * gk), k * stripe * (0.9 - 0.25 * gk));
    }
    gGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gGeo.computeVertexNormals();
    const ground = add(root, new THREE.Mesh(gGeo, mat(grassTex([110, 110]), '#ffffff', { vertexColors: true })), false);
    void ground;
    const rw = add(root, new THREE.Mesh(new THREE.PlaneGeometry(460, 30).rotateX(-Math.PI / 2), mat(runwayTex([30, 2]))), false);
    rw.position.set(30, 0.03, 0);
    const apron = add(root, new THREE.Mesh(new THREE.PlaneGeometry(120, 34).rotateX(-Math.PI / 2), mat(runwayTex([8, 2]), '#e6e0d2')), false);
    apron.position.set(-95, 0.025, -42);
    // middle band
    // world-r5: an autumn tree line with a hedge under it between s04's camera and the crash site, so the plane drops
    // behind the trees and the flash, the dust and the column rise beyond them (meaning.md: "the black smoke column
    // rising beyond the trees"). s05's cameras stand on the crash side of it and look away from it.
    { const [a, b] = TREELINE.ends, n = TREELINE.n, tints: [number, number, number][] = [[1.0, 0.26, 0.02], [0.75, 0.07, 0.03], [1.0, 0.52, 0.0], [0.26, 0.45, 0.04]]; // strong: lighter tints read pastel
      tints.forEach((leaf, ti) => {
        const trees: { x: number; z: number; s: number }[] = [];
        for (let i = ti; i < n; i += tints.length) { const k = (i + 0.5) / n, off = (Math.sin(i * 2.3) * 0.5) * 3; trees.push({ x: a[0] + (b[0] - a[0]) * k + 0.72 * off, z: a[1] + (b[1] - a[1]) * k - 0.69 * off, s: 1.3 + 0.35 * Math.abs(Math.sin(i * 1.7)) }); }
        root.add(midBand({ trees, leaf, trunk: '#4a3426', seed: 40 + ti * 13 }).root);
      });
      root.add(midBand({ trees: [], bushes: { a, b, n: 60, tint: [0.42, 0.55, 0.2] }, seed: 91 }).root);
    }
    root.add(hangar(AIRFIELD.hangar, { w: 42, d: 40 }));
    root.add(hangar([-175, 0, -78], { w: 36, d: 34 }));
    root.add(stand(AIRFIELD.stand, { w: 20 }));
    root.add(car([-52, 0, -64], 0.3, '#2f6fb3'), car([-46, 0, -66], 0.2, '#1f2a3a'), car([-40, 0, -65], 0.35, '#8a2b2b'));
    const home = new THREE.Group(); home.add(fireTruck(AIRFIELD.fireTruckHome, 1.57), ambulance(AIRFIELD.ambulanceHome, 1.57)); root.add(home);
    const rescue = new THREE.Group(); rescue.add(fireTruck(AIRFIELD.fireTruckCrash, AIRFIELD.rescueYaw), ambulance(AIRFIELD.ambulanceCrash, AIRFIELD.rescueYaw)); root.add(rescue);
    // world-r3: three firemen by the truck (dark coats, red helmets), the front one holding the hose toward the engine fire
    const firemen = AIRFIELD.firemenAt.map((at, i) => { const m = crewman(at, { suit: '#2b2d36', cap: '#c8262e' }); m.root.rotation.y = Math.atan2(-(THROWN[2] - at[2]), THROWN[0] - at[0]); m.arm.rotation.x = i === 0 ? -1.4 : -0.6; rescue.add(m.root); return m; });
    { const a = new THREE.Vector3(AIRFIELD.fireTruckCrash[0], 0.9, AIRFIELD.fireTruckCrash[2]), b = new THREE.Vector3(...AIRFIELD.firemenAt[0]).setY(1.1); const len = a.distanceTo(b);
      const hose = add(rescue, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6), mat(null, '#c9a24a'))); hose.position.copy(a).add(b).multiplyScalar(0.5); hose.lookAt(b); hose.rotateX(Math.PI / 2); }
    void firemen;
    // the two caps on the grass (s05 "both died"): Hill's brown leather flying helmet and Tower's black one, as the cast
    // draws them in s03 (o.cap colours, gold goggles pushed up, ear flaps), set upright side by side, goggles to s05's
    // last camera. people-r1 (lead's call): the old ones lay tipped over and read as blobs or mice.
    const caps = new THREE.Group(); root.add(caps);
    {
      const m0 = AIRFIELD.caps.reduce((m, c) => [m[0] + c[0] / 2, 0, m[2] + c[2] / 2], [0, 0, 0]), mid = [m0[0] + 0.45, 0, m0[2] - 0.2];
      const cam = [74.8, 34.35], dx = cam[0] - mid[0], dz = cam[1] - mid[2], dl = Math.hypot(dx, dz), side = [-dz / dl, dx / dl];
      [{ col: '#7a4a2a', s: -1 }, { col: '#2e2420', s: 1 }].forEach(({ col, s: sd }, i) => {
        const at: [number, number, number] = [mid[0] + side[0] * 0.24 * sd, 0.02, mid[2] + side[1] * 0.24 * sd];
        const g = new THREE.Group(); g.position.set(...at); g.rotation.y = Math.atan2(-(cam[1] - at[2]), cam[0] - at[0]) + (i ? -0.25 : 0.25); caps.add(g);
        const leather = mat(null, col); leather.emissive.set('#5a2a0c'); leather.emissiveIntensity = 0.35; // the fire's glow on the leather
        const gold = mat(null, '#e0b54a'), glass = mat(null, '#bfe6f2'), dark = mat(null, '#2b2320');
        const dome = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), leather)); dome.scale.set(1.12, 1.05, 1); dome.position.y = 0.035;
        for (const e of [-1, 1]) { // ear flaps hanging over the rim, side-on to the lens
          const flap = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), leather)); flap.scale.set(0.9, 1.25, 0.4); flap.position.set(-0.01, 0.06, e * 0.2);
        }
        const band = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.016, 6, 28), dark)); band.rotation.set(Math.PI / 2, 0.32, 0); band.position.set(0.0, 0.13, 0);
        for (const e of [-1, 1]) { // the goggles pushed up on the brow, facing the lens
          const rim = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.035, 18), gold)); rim.rotation.z = Math.PI / 2 - 0.45; rim.position.set(0.175, 0.15, e * 0.068);
          const lens = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 18), glass)); lens.rotation.z = Math.PI / 2 - 0.45; lens.position.set(0.195, 0.16, e * 0.068);
        }
        const strap = add(g, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.22), dark)); strap.position.set(0.12, 0.01, 0.2 * (i ? 1 : -1)); strap.rotation.y = 0.5 * (i ? -1 : 1);
        caps.add(blob([at[0], 0, at[2]], 0.34));
      });
    }
    root.add(drums([-112, 0, -58], 6), drums([-72, 0, -60], 4));
    // the plane: the Model 299 (and the Y1B-17 of s08 and s10, the same build), then the wreck
    const plane = makePlane(); root.add(plane.root);
    const wr = wreck(plane, WRECK.at, WRECK.yaw, WRECK.tail, WRECK.tailYaw, THROWN); root.add(wr.root);
    // burnt earth under the wreck, the thrown engine and the tail's skid, from the impact on
    const burnt = new THREE.Group(); burnt.add(scorch(WRECK.at, 16, 3), scorch(THROWN, 6, 11), scorch([(WRECK.at[0] + THROWN[0]) / 2, 0, (WRECK.at[2] + THROWN[2]) / 2], 5, 17), scorch([WRECK.tail[0] + 2, 0, WRECK.tail[2] + 1], 3.5, 23)); root.add(burnt);
    // grass tufts near the low cameras (s04's opening, the crash site of s05), clear of the helmets, the tail and the lock
    const grass = tufts([{ x: [-80, -10], z: [16, 48], n: 700 }, { x: [62, 112], z: [16, 50], n: 900 }],
      [...AIRFIELD.caps.map((c) => ({ at: c, r: 1.3 })), { at: WRECK.tail, r: 4 }, { at: [82.7, 0, 20.9], r: 3 }, { at: WRECK.at, r: 9 }, { at: THROWN, r: 4 }]);
    root.add(grass.root);
    // ground crew far off on the field: they turn to follow the plane, one points up at the stall, and after the impact
    // they run toward the smoke
    const crew = CREW.map((c, i) => { const m = crewman(c.at, { suit: c.suit }); root.add(m.root); return { ...m, c, i }; });
    const fx = groupFx(
      windSock(AIRFIELD.windSock, WIND_YAW),
      flag([-24, 0, -50], { yaw: WIND_YAW }),
      flock([-200, 60, -150], [250, 70, 120], 26, 9, 4),
      wheelDust((t) => { const p = model299(t); return p && p.at[1] < 3.2 ? p.at : null; }, 10.5, 19.6),
      wheelDust((t) => { const p = y1b17(t); return p && p.at[1] < 3.2 ? p.at : null; }, 45.6, 47.2),
    );
    root.add(fx.root);
    const crash = groupFx(
      impact([WRECK.at[0], 0, WRECK.at[2]], IMPACT),
      smokeColumn(WRECK.at, IMPACT + 0.05, { height: 130, width: 30, wind: [WIND[0] * 30, WIND[1] * 30] }),
      flames(WRECK.at, IMPACT, { spread: [16, 9], size: 4.2 }),
      smokeColumn(THROWN, IMPACT + 0.4, { height: 45, width: 9, wind: [WIND[0] * 18, WIND[1] * 18] }),
      flames(THROWN, IMPACT + 0.2, { spread: [4.5, 3], size: 2.4 }),
    );
    root.add(crash.root);
    const parts: Part = groupParts(farS, clouds);
    root.add(parts.root);
    return {
      root,
      update: (f) => {
        const t = f / 30;
        const p = parkedAt(t) ?? y1b17(t) ?? model299(t);
        plane.root.visible = !!p; if (p) plane.pose(p);
        wr.root.visible = t >= IMPACT && t < 31; // the wreck only on the crash day
        home.visible = t < IMPACT + 0.4 || t >= 31; rescue.visible = t >= IMPACT + 0.4 && t < 31; // r5: swaps on the s04|s05 cut, not at 25.5 s inside s05 (a one-frame jump)
        { const k = Math.min(1, Math.max(0, (t - IMPACT - 0.4) / 2.2)), e = 1 - (1 - k) * (1 - k) * (1 - k), back = 45 * (1 - e); // drives in and slows
          rescue.position.set(-Math.cos(AIRFIELD.rescueYaw) * back, 0, Math.sin(AIRFIELD.rescueYaw) * back); } caps.visible = t >= 26.4 && t < 31; // set down while the camera is on the lock
        burnt.visible = wr.root.visible;
        wr.lockFlag.rotation.y = 0.35 * Math.sin(t * 5);
        grass.update(t); parts.update(f);
        const pl = model299(t);
        crew.forEach(({ root: r, arm, c, i }) => {
          r.visible = t < 31;
          const run = Math.max(0, t - IMPACT - 0.4 - 0.25 * i), to = WRECK.at;
          const dx = to[0] - c.at[0], dz = to[2] - c.at[2], dist = Math.hypot(dx, dz), go = Math.min(dist - 14, 5.5 * run);
          r.position.set(c.at[0] + (dx / dist) * Math.max(0, go), Math.max(0, go) > 0 ? 0.08 * Math.abs(Math.sin(run * 9)) : 0, c.at[2] + (dz / dist) * Math.max(0, go));
          const look = run > 0 ? to : pl ? pl.at : to;
          r.rotation.y = Math.atan2(-(look[2] - r.position.z), look[0] - r.position.x) + (run > 0 ? 0 : 0.15 * Math.sin(t * 0.7 + i));
          arm.rotation.x = i % 3 === 0 && t > 21.6 && t < IMPACT + 0.3 ? -2.6 : run > 0 ? 0.6 * Math.sin(run * 9) : 0;
        });
        fx.update(t);
        crash.root.visible = t < 31; crash.update(t);
        void ENGINE_START;
      },
      groundY: () => 0,
    };
  },
};
