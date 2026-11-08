import * as THREE from 'three';
import { makeDeck, makeCanyon, makeGorge, fitSun, type Look } from './places';
import { makeTrack, sBend, SNAP_F, S_Z, GAUGE, JOINT, type Track } from './track';
import { makeTrain } from './train';
import { Streaks, Puffs, Bits, Spikes, Volume, setHeat, keyed, HEAT_CAP, sparks, cone, plume, explosion, dust, wisps, godRays, glint, softTex } from './fx';
import { Card, makeHat, hatPose, drawEngineer, drawOwner, ownerDeck, engineerCanyon, engineerEnd, ownerEnd, keyOf, SU, OWNER_HAT_LAUNCH, END_HAT_LAUNCH, OWNER_HAT_FLIGHT, END_HAT_FLIGHT, LegShadow, endMarks, canyonGround } from './people';
import { GRADES, type GradeParams } from './grade';
import { deckStrain, deckSpikeFrom, bridgeStrain, makeCoin, gapClose, GAP_W } from './mechanics'; // sets r4: the mechanics of each beat
import { HIS_GAP, CLOSE_F, COIN_POP_F } from './mechanics'; // fx r4: the spark at the touch and the coin's glint
import { hash, prog, smooth, lerp, walkAt, OWNER_AT, BLAST, PLATFORM, type Cam, type Place, type V3 } from './shots';

// The glue: each place's builder from places.ts plus its track, train, effects and people, and one frame(f, cam) that
// moves everything to clip frame f. A later round gives each file to its own specialist; this file only wires them.

export interface Post { grade: GradeParams; bloom: [number, number, number]; dof?: (f: number, c: Cam) => { focus: number; aperture: number; maxblur: number } | null }
export interface World { frame(f: number, c: Cam): void; post: Post }

export function aim(camera: THREE.Camera, c: Cam, far = 6000) {
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...c.pos); cam.fov = c.fov; cam.near = 0.03; cam.far = far; cam.up.set(0, 1, 0); cam.updateProjectionMatrix(); cam.lookAt(...c.look);
  if (c.roll) cam.rotateZ(c.roll);
  cam.updateMatrixWorld(true);
  return cam;
}
const dist = (c: Cam) => Math.hypot(c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]);

export function buildWorld(place: Place, scene: THREE.Scene, camera: THREE.Camera): World {
  switch (place) {
    case 'deck': return deckWorld(scene, camera);
    case 'canyon': return canyonWorld(scene, camera);
    default: return gorgeWorld(scene, camera, place);
  }
}

// ---- A: the smooth line's deck ---------------------------------------------------------------------------------------
function deckWorld(scene: THREE.Scene, camera: THREE.Camera): World {
  const env = makeDeck(scene);
  const FROM = 60;
  const track = makeTrack({ from: FROM, to: -1400, railTop: 0.32, sleeperColor: '#56423c', railColor: '#c9c2d2', fine: [12, -90], seams: true }); // sets r3: lighter warm sleepers so their tops catch the sun
  scene.add(track.group);
  const S = new Streaks(scene), P = new Puffs(scene, 60), spikes = new Spikes(scene);
  const owner = new Card(scene), hat = makeHat(); scene.add(hat);
  const head = new THREE.Vector3();
  return {
    post: { grade: GRADES.deck, bloom: [0.2, 0.1, 2.2] }, // camera r2: tight, so the white-hot rail stays a rail
    frame(f, c) {
      const cam = aim(camera, c);
      fitSun(env.sun, env.L, cam, Math.min(30, dist(c)), 26);
      // the heat sweep: the front runs away from the camera along the rails; the far rail 4 frames behind; then the
      // rails settle to hot magenta (55-75) and coral (75 on)
      // the settle steps down through the bands over 16 frames instead of jumping (a jump read as a hard cut)
      const cap = f < 48 ? 1 : f < 64 ? lerp(1, HEAT_CAP.magenta - 0.01, // fx r4: the white band again, on the head only (flank 0.6)
        smooth(prog(f, 48, 64))) : f < 75 ? HEAT_CAP.magenta - 0.01 : HEAT_CAP.coral - 0.01;
      // fx r3: the near rail (track metres 76-85 under the skim) goes purple at 28, magenta 33, orange-yellow 34 and
      // yellow with a white-hot crown 35-48, while narrow hard bands (14 m / 6) run on ahead of it along the rail
      const front = (lag: number) => { const g = f - lag; return g < 48 ? keyed(g, [20, 24, 28, 31, 33, 34, 35, 42, 48], [66, 70, 72.7, 75.6, 78.7, 85, 88, 95, 100]) : 100 + 1.5 * (g - 48); };
      setHeat(track.heat[1], f < 20 ? -1e6 : front(0), 14, cap, 1, 1, 0.6);
      setHeat(track.heat[0], f < 24 ? -1e6 : front(4), 14, cap, 1, 1, 0.6);
      track.setStrain(deckStrain(f)); // sets r4: the creak, then the bow, spikes drawn up, sleepers shoved
      S.begin(cam); P.begin();
      // gold sparks shooting up from the rail joint ahead of the camera (34-43)
      const jz = FROM - JOINT / 2 - 6 * JOINT; // z = -17.35
      // fx r3: denser and longer, and from the next joint ahead too, so they are in frame while the camera passes the first
      sparks(S, f, { seed: 1, n: 110, f0: 32, f1: 46, life: [5, 10], width: 0.009, tail: 1.3, origin: i => [GAUGE / 2, 0.33, i % 3 ? jz - JOINT : jz], vel: i => cone(i, 3, [0.15, 1, 0.25], 0.55, 0.09 + 0.08 * hash(i, 4)) });
      glint(P, f, 13, 26, [GAUGE / 2 + 0.03, 0.335, -8.2], [GAUGE / 2 + 0.03, 0.335, -14.5], 0.42);
      // spikes popping out of the sleepers and tumbling toward the camera (92-112), one glowing pop at 110
      spikes.update(f, 90, 114, deckSpikeFrom); // sets r4: each flies from the spot its drawn-up spike left (mechanics.ts)
      if (f > 107 && f < 116) P.add({ tex: softTex(), pos: [0.6, 0.6, -24.5], size: 1.4 * Math.sin(Math.PI * prog(f, 107, 116)), color: [4, 2.2, 0.8], opacity: 1, add: true, fog: false });
      // a short spark trail flying past the owner (130-131)
      sparks(S, f, { seed: 9, n: 8, f0: 129, f1: 131, life: [3, 4], width: 0.018, tail: 2.2, gravity: 0.004, origin: i => [OWNER_AT[0] + 1.6, 1.3 + 0.3 * hash(i, 1), OWNER_AT[2] + 0.6], vel: i => [-0.32 - 0.1 * hash(i, 2), 0.02, 0.05] });
      S.end(); P.end();
      // the owner in his deckchair, the hat on his head until it launches
      const st = ownerDeck(f);
      owner.draw(keyOf(st), g => drawOwner(g, st));
      const at: V3 = [OWNER_AT[0], 0, OWNER_AT[2] + 0.18];
      owner.place(at, cam);
      const tilt = new THREE.Vector3(cam.position.x - at[0], 0, cam.position.z - at[2]).normalize();
      head.set(at[0], (975 - 270) * SU + 0.02, at[2]).addScaledVector(tilt, 0.05);
      hatPose(hat, f, head, cam, OWNER_HAT_LAUNCH, OWNER_HAT_FLIGHT);
    },
  };
}

// ---- B: the canyon floor --------------------------------------------------------------------------------------------------
function canyonWorld(scene: THREE.Scene, camera: THREE.Camera): World {
  const env = makeCanyon(scene);
  const FROM = 60;
  const track = makeTrack({ from: FROM, to: -900, railTop: 0.42, sleeperColor: '#a8927a', railColor: '#8a5a4a', railMetal: 0.45, railRough: 0.6, fine: [10, -60], spikeColor: '#5e3a30', railHead: '#b4a69e', // sets r3: satin head, no glare over the joint
    ballast: { z: [6, -42], width: 4.6, colors: ['#b0583a', '#e8dac6', '#9a908c', '#7a4a38', '#d49a84', '#6a5652', '#c8784e', '#f0e6d8', '#a8442e', '#8a6a5a'], count: 46000, bed: '#8a5a4c' },
    chalk: { every: 2, z: [-3, -8] }, gaps: { width: GAP_W, z: [10, -60] } }); // sets r3/r4: chalk at his mark; his finger-wide gaps
  scene.add(track.group);
  const coin = makeCoin(); scene.add(coin.group); // sets r4: the coin standing in his gap
  const P = new Puffs(scene, 90), S = new Streaks(scene, 200); // fx r4: sparks at his gap
  const eng = new Card(scene), engShadow = new LegShadow(scene);
  return {
    post: { grade: GRADES.canyon, bloom: [0.2, 0.1, 1.6] }, // camera r2: a tight halo on the yellow rail, no glare off the polished head
    frame(f, c) {
      const cam = aim(camera, c);
      fitSun(env.sun, env.L, cam, Math.min(20, dist(c)), 22);
      // his rail heats (192-246): a fast front with wide bands, near hottest; cool again behind the swing (247-252)
      const cap = f < 247 ? 0.95 : f < 252 ? lerp(0.95, 0, prog(f, 247, 252)) : 0;
      // fx r3: the heat comes down the rail toward the camera: hard bands (purple nearest, then magenta, coral, orange,
      // yellow further off) sweep in; the near rail is purple 192-210 and yellow by 222; capped at yellow, never white
      // fx r4: the bands sweep along his rail toward his gap (track metre 65.45): it goes purple at 205 and yellow at 225, as the ends touch
      const hf = keyed(f, [186, 195, 205, 215, 225, 246], [74, 69, 64, 59, 53.5, 48]);
      setHeat(track.heat[1], f < 186 ? 1e6 : hf, 14, Math.min(cap, HEAT_CAP.yellow - 0.01), 1, -1, 0.65); // sets r3: with dir -1 'off' is +1e6 (-1e6 lit the whole rail before 186)
      setHeat(track.heat[0], -1e6, 60, 0);
      track.setGap(gapClose(f)); coin.update(f); // sets r4: his gap closes 186-225, the coin pops out
      P.begin(); S.begin(cam);
      // fx r4: heat wisps around him and his joint from 170, already rising when they fade in
      wisps(P, f, 168, 255, { x: [0.2, 3.4], z: [-2, -12], y: 0.1 }, 40, 0.5);
      // fx r4: the coin's glint as it is pinched out, then a small spark burst and a flash where the rail ends touch
      glint(P, f, COIN_POP_F - 1, COIN_POP_F + 5, [HIS_GAP[0] + 0.01, HIS_GAP[1] + 0.02, HIS_GAP[2]], [HIS_GAP[0] + 0.05, HIS_GAP[1] + 0.09, HIS_GAP[2] + 0.02], 0.018);
      sparks(S, f, { seed: 120, n: 50, f0: CLOSE_F - 0.6, f1: CLOSE_F + 2, life: [4, 10], width: 0.003, tail: 1.2, gravity: 0.0016,
        origin: () => [HIS_GAP[0], HIS_GAP[1] + 0.02, HIS_GAP[2]], vel: i => cone(i, 121, [0.5, 1, 0], 1.0, 0.015 + 0.03 * hash(i, 122)) });
      if (f >= CLOSE_F - 1 && f < CLOSE_F + 3) P.add({ tex: softTex(), pos: [HIS_GAP[0], HIS_GAP[1] + 0.015, HIS_GAP[2]], size: 0.035 * Math.sin(Math.PI * prog(f, CLOSE_F - 1, CLOSE_F + 3)), color: [4, 3, 1.8], opacity: 1, add: true, fog: false, order: 21 });
      godRays(P, f, 212, 262, [-3, 24, -62]); // fx r3: inside the frame, over the wall's top-left
      P.end(); S.end();
      const st = engineerCanyon(f), w = walkAt(f);
      eng.draw(keyOf(st), g => drawEngineer(g, st));
      const gy = canyonGround(w.pos[0]); // on the sleeper tops once he walks into the track
      eng.place(w.pos, cam, st.bob + gy);
      // his dark leg shadow on the ballast, toward the camera and to screen-left (people.ts LegShadow)
      engShadow.update(w.pos, Math.atan2(cam.position.x - w.pos[0], cam.position.z - w.pos[2]) - 0.4, st.walk ?? null, gy + 0.07);
    },
  };
}

// ---- C, D, E: the arch bridge over the gorge ----------------------------------------------------------------------------
function gorgeWorld(scene: THREE.Scene, camera: THREE.Camera, place: Place): World {
  const mood = place === 'gorge' ? 'sunset' : place === 'side' ? 'washed' : 'end';
  const env = makeGorge(scene, mood);
  const FROM = 700;
  const track: Track = makeTrack({ from: FROM, to: -1500, railTop: 0.32, sleeperColor: '#3a2c34', railColor: '#d6c6cc', fine: [20, -60] });
  scene.add(track.group);
  const train = place === 'end' ? null : makeTrain(track);
  if (train) scene.add(train.group);
  const S = new Streaks(scene), P = new Puffs(scene, 320);
  const chips = new Bits(scene, new THREE.BoxGeometry(0.12, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: '#2a2026', roughness: 0.7, flatShading: true }), 90);
  const people = place === 'end' ? { owner: new Card(scene), eng: new Card(scene), hat: makeHat(), so: new LegShadow(scene), se: new LegShadow(scene) } : null;
  if (people) scene.add(people.hat);
  const head = new THREE.Vector3();
  const post: Post = place === 'gorge'
    ? { grade: GRADES.gorge, bloom: [0.95, 0.45, 1.0] }
    : place === 'side' ? { grade: GRADES.side, bloom: [0.25, 0.1, 1.7] } : { grade: GRADES.end, bloom: [0.25, 0.1, 1.7] }; // fx: bloom kept tight to the fire
  const L: Look = env.L;
  const VP = new Volume(scene, L), VX = new Volume(scene, L); // fx: the plume and the explosion as raymarched volumes
  return {
    post,
    frame(f, c) {
      const cam = aim(camera, c, 8000);
      fitSun(env.sun, L, cam, place === 'side' ? 120 : place === 'end' ? 60 : 40, place === 'side' ? 90 : place === 'end' ? 70 : 60);
      // the snap: the whole track bends into the S in one frame and glows orange-white
      const snapped = place === 'end' || f >= SNAP_F;
      track.setBend(snapped ? sBend : null);
      track.setStrain(place === 'gorge' && !snapped ? bridgeStrain(f) : null); // sets r4: the strain before the snap
      for (const h of track.heat) setHeat(h, snapped ? 1e6 : -1e6, 1, 0.8, 0.85); // fx r3: gain for the new emission scale
      train?.update(f);
      S.begin(cam); P.begin(); chips.begin();
      if (train) {
        // fx r3: a leaning column on the bridge (wind to screen-left), a thin wavy ribbon in the side view
        plume(VP, f, cam, train.funnelAt, place === 'side' ? { size: 1.1, maxR: 1.6, wave: 0.9, fade: 140, n: 120, rise: 0.06, fogAmt: 0.25 } : { size: 2.2, maxR: 1.0, wind: [-0.07, 0, -0.03], n: 120, rise: 0.3, fade: 60 } /* fx r4: no swollen top */);
        if (place === 'gorge') {
          // a dense shower of sparks bursting sideways off the bent rails, falling in a cone (368-381)
          const zAt = (i: number) => lerp(S_Z[0], S_Z[1], hash(i, 31));
          sparks(S, f, { seed: 30, n: 260, f0: 367, f1: 382, life: [8, 18], width: 0.07, tail: 1.8, gravity: 0.02,
            origin: i => { const z = zAt(i), ct = track.centre(z), s = hash(i, 32) > 0.5 ? 1 : -1; return [ct.p.x + s * GAUGE / 2, 0.36, z]; },
            vel: i => cone(i, 33, [hash(i, 34) > 0.5 ? 1 : -1, 0.9, 0.1], 0.7, 0.18 + 0.2 * hash(i, 35)) });
          // dark chips scattering over the deck (375-395)
          for (let i = 0; i < 70; i++) {
            const born = 372 + 8 * hash(i, 41), a = f - born; if (a < 0) continue;
            const z = lerp(S_Z[0], S_Z[1], hash(i, 42)), x0 = track.centre(z).p.x, v = cone(i, 43, [hash(i, 44) - 0.5, 0.6, hash(i, 45) - 0.5], 1.1, 0.12 + 0.1 * hash(i, 46));
            const t = Math.min(a, 14);
            chips.add([x0 + v[0] * t, Math.max(0.03, 0.3 + v[1] * t - 0.5 * 0.025 * t * t), z + v[2] * t], [a * 0.4, a * 0.3 * hash(i, 47), 0], [1, 1, 1], '#2a2026');
          }
          // orange dust at the front wheels (379-393)
          dust(P, f, train.frontAt, 378, 394);
        }
      }
      explosion(VX, S, f, cam, BLAST, place === 'side' ? { scale: 1.1, lift: 30, fogAmt: 0.2 } : { scale: 1.0, lift: 14, capY: 92, radius: 16 }); // camera r3: capY 92 lifts the cap above the pair at the low END lens
      S.end(); P.end(); chips.end();
      if (people) {
        const so = ownerEnd(f), se = engineerEnd(f);
        people.owner.draw(keyOf(so), g => drawOwner(g, so));
        people.eng.draw(keyOf(se), g => drawEngineer(g, se));
        const { owner: ao, eng: ae } = endMarks(PLATFORM);
        people.owner.place(ao, cam); people.eng.place(ae, cam);
        for (const [sh, at] of [[people.so, ao], [people.se, ae]] as const) sh.update(at, Math.atan2(cam.position.x - at[0], cam.position.z - at[2]) - 0.5, null, 0.01, 0.5);
        head.set(ao[0], (975 - 160) * SU + 0.02, ao[2]);
        hatPose(people.hat, f, head, cam, END_HAT_LAUNCH, END_HAT_FLIGHT);
      }
      void smooth;
    },
  };
}
