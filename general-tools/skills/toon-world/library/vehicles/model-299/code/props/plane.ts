// b17-checklist: the Boeing Model 299, the hero prop, built in code (S2-11): polished aluminium on a lathe fuselage, a
// glass nose, four engines with three-blade propellers that spin, a tall fin with "BOEING" on it, a tail with
// elevators that can carry the red gust lock, and the landing gear. Sized to the real plane: 31.6 m span, 21 m long,
// against a 1.8 m person (S3-26). It points along +x; the origin is the fuselage's centre line at the wing root.
// The same build makes the Y1B-17s of the later lines (s08, s09, s10) and the wreck (wreck.ts) from its parts.
import * as THREE from 'three';
import { NOINK } from '../../../look/ink';
import { add, mat, metalTex, sheet, rimmed } from './paint';
export type { V3, PlanePose } from './flight';

import type { PlanePose, V3 } from './flight';
export { ON_GROUND } from './flight';

const glassMat = () => new THREE.MeshLambertMaterial({ color: '#9fd3ea', transparent: true, opacity: 0.55, emissive: '#2a5a78', emissiveIntensity: 0.25, depthWrite: false });
const darkMat = () => mat(null, '#2c2a2e');

export const makePlane = (o: { tint?: string; twin?: boolean } = {}) => {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.rotation.order = 'YZX';
  const skin = rimmed(mat(metalTex([3, 1]), o.tint ?? '#b6bec6')), skinWing = rimmed(mat(metalTex([4, 2]), o.tint ?? '#aeb7c0')); // world-r3: a warm rim
  // fuselage: a lathe around y, turned to lie along x
  const prof: [number, number][] = [[0.0, -12.2], [0.2, -12], [0.45, -10.5], [0.75, -8], [1.05, -4.5], [1.2, -2], [1.22, 2], [1.18, 5], [1.05, 7.4], [0.86, 8.6], [0, 8.62]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28); lathe.rotateZ(-Math.PI / 2);
  add(body, new THREE.Mesh(lathe, skin));
  // the glass nose: a long dome with dark frames drawn on it
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.86, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat());
  nose.rotation.z = -Math.PI / 2; nose.scale.set(1, 1.6, 1); nose.position.x = 8.6; body.add(nose);
  for (let i = 0; i < 4; i++) { // nose frames: rings and a spine
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86 * Math.cos((i * Math.PI) / 9), 0.035, 6, 28), darkMat());
    ring.rotation.y = Math.PI / 2; ring.position.x = 8.6 + 1.38 * Math.sin((i * Math.PI) / 9); body.add(ring);
  }
  // the cockpit glasshouse on top
  const cab = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glassMat()), false);
  cab.scale.set(1.9, 0.6, 0.85); cab.position.set(5.6, 0.95, 0);
  const cabFrame = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.5), darkMat()), false); cabFrame.position.set(6.1, 1.15, 0);
  // gun blisters (the 299's teardrops on the sides and the top)
  for (const [x, y, z] of [[-2.5, 0.9, 0], [-3.5, 0.2, 1.15], [-3.5, 0.2, -1.15]] as V3[]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), glassMat()); b.scale.set(1.5, 0.8, 0.8); b.position.set(x, y, z); body.add(b);
  }
  // wings: one planform, extruded thin and laid flat
  const wing = new THREE.Shape([[0.6, -15.8], [2.2, -1], [2.2, 1], [0.6, 15.8], [-1.8, 15.8], [-3.3, 1], [-3.3, -1], [-1.8, -15.8]].map(([x, z]) => new THREE.Vector2(x, z)));
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.34, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2 });
  wg.rotateX(Math.PI / 2); wg.translate(0, -0.35, 0);
  add(body, new THREE.Mesh(wg, skinWing));
  // tail: stabiliser (fixed) and elevators (hinged at x = -11.1), the fin and rudder
  const stab = new THREE.Shape([[-9.0, -0.6], [-9.0, 0.6], [-10.2, 5.6], [-11.1, 5.6], [-11.1, -5.6], [-10.2, -5.6]].map(([x, z]) => new THREE.Vector2(x, z)));
  const sg = new THREE.ExtrudeGeometry(stab, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 1 }); sg.rotateX(Math.PI / 2); sg.translate(0, 0.1, 0);
  add(body, new THREE.Mesh(sg, skinWing));
  const elevator = new THREE.Group(); elevator.position.set(-11.1, 0.05, 0); body.add(elevator);
  const el = new THREE.Shape([[0, -5.4], [0, 5.4], [-1.0, 4.8], [-1.15, 0.4], [-1.15, -0.4], [-1.0, -4.8]].map(([x, z]) => new THREE.Vector2(x, z)));
  const eg = new THREE.ExtrudeGeometry(el, { depth: 0.09, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 1 }); eg.rotateX(Math.PI / 2);
  add(elevator, new THREE.Mesh(eg, skinWing));
  const finS = new THREE.Shape([[-12.2, 0.3], [-8.4, 0.8], [-10.6, 4.3], [-12.0, 4.4]].map(([x, y]) => new THREE.Vector2(x, y)));
  const fg = new THREE.ExtrudeGeometry(finS, { depth: 0.16, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 1 }); fg.translate(0, 0, -0.08);
  const fin = add(body, new THREE.Mesh(fg, skin));
  // "BOEING" on both sides of the fin, and "299" on the nose
  const word = (text: string, w: number, h: number, size: number) => {
    const t = sheet(1024, 256, (g) => { g.clearRect(0, 0, 1024, 256); g.fillStyle = '#1d2c5c'; g.font = `900 ${size}px Arial Black, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 132); });
    const m = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.3 });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  };
  for (const s of [1, -1]) {
    const w1 = word('BOEING', 2.6, 0.65, 190); w1.position.set(-11.0, 2.0, s * 0.17); if (s < 0) w1.rotation.y = Math.PI; w1.rotation.z = 0.12; w1.layers.set(NOINK); body.add(w1);
    const w2 = word('299', 1.4, 0.35, 200); w2.position.set(6.6, -0.35, s * 1.13); if (s < 0) w2.rotation.y = Math.PI; w2.layers.set(NOINK); body.add(w2);
  }
  void fin;
  // the gust lock: a red clamp across the elevator's hinge with a red streamer (s05: "one small lock on the tail controls")
  const lock = new THREE.Group(); lock.position.set(-11.1, 0.12, 2.2); body.add(lock);
  const red = mat(null, '#e0262b');
  add(lock, new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.34), red));
  add(lock, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.42), red)).position.x = 0.32;
  add(lock, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.42), red)).position.x = -0.32;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22, 8, 1), new THREE.MeshLambertMaterial({ color: '#e0262b', side: THREE.DoubleSide }));
  flag.position.set(-0.75, -0.15, 0.2); lock.add(flag);
  // engines: nacelles, dark cowl rings, three-blade propellers (and a disc when they spin fast)
  const props: THREE.Group[] = [], discs: THREE.Mesh[] = [];
  const blade = new THREE.BoxGeometry(0.08, 1.75, 0.24); blade.translate(0, 0.9, 0);
  const tipM = mat(null, '#f2c230'), bladeM = mat(null, '#2a2a2e');
  for (const z of o.twin ? [-4.6, 4.6] : [-9.2, -4.6, 4.6, 9.2]) {
    const le = 2.2 - (1.6 * (Math.abs(z) - 1)) / 14.8;
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.55, 3.4, 20), skin); nac.rotation.z = -Math.PI / 2; nac.position.set(le + 0.4, -0.2, z); add(body, nac);
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.5, 20), darkMat()); cowl.rotation.z = -Math.PI / 2; cowl.position.set(le + 2.0, -0.2, z); add(body, cowl);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), skin); hub.scale.set(1.4, 1, 1); hub.position.set(le + 2.35, -0.2, z); add(body, hub);
    const pr = new THREE.Group(); pr.position.set(le + 2.4, -0.2, z); body.add(pr); props.push(pr);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group(); b.rotation.x = (i * 2 * Math.PI) / 3; pr.add(b);
      add(b, new THREE.Mesh(blade, bladeM), false);
      const tip = add(b, new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.22, 0.25), tipM), false); tip.position.y = 1.67;
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.85, 32), new THREE.MeshBasicMaterial({ color: '#d8dde2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.y = Math.PI / 2; disc.position.set(le + 2.45, -0.2, z); disc.layers.set(NOINK); body.add(disc); discs.push(disc);
  }
  // landing gear under the inner nacelles and the tail wheel
  const gear = new THREE.Group(); body.add(gear);
  const tyre = mat(null, '#1f1e22');
  for (const z of [-4.6, 4.6]) {
    const leg = add(gear, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), darkMat())); leg.position.set(1.3, -1.2, z);
    const w = add(gear, new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.42, 20), tyre)); w.rotation.x = Math.PI / 2; w.position.set(1.3, -2.05, z);
  }
  const tw = add(gear, new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 14), tyre)); tw.rotation.x = Math.PI / 2; tw.position.set(-11.2, -0.75, 0);

  const pose = (p: PlanePose) => {
    body.position.set(...p.at);
    body.rotation.set((p.roll * Math.PI) / 180, (p.yaw * Math.PI) / 180, (p.pitch * Math.PI) / 180);
    const run = p.running ?? [true, true, true, true];
    props.forEach((pr, i) => { pr.rotation.x = run[i] ? (p.spin ?? 0) + i * 0.7 : i * 0.7; (discs[i].material as THREE.MeshBasicMaterial).opacity = run[i] ? 0.28 * (p.disc ?? 0) : 0; });
    gear.visible = p.gear ?? true; lock.visible = !!p.lock;
    elevator.rotation.z = ((p.elevator ?? 0) * Math.PI) / 180;
    flag.rotation.y = 0.3 * Math.sin((p.spin ?? 0) * 0.05);
  };
  return { root, body, pose, parts: { lathe, wg, sg, eg, fg }, skin };
};
export type Plane = ReturnType<typeof makePlane>;
