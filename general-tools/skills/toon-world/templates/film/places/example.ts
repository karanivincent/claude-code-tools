import * as THREE from 'three';
import { painted, plaster, ground, stone, wood, lit, block, hash, speckle, grain } from '../paint';
import { flies, smoke, hangingCloth, birds, ticks } from '../detail';
import { P } from '../cast';
import type { PlaceDef } from '../place';

// A stand-in place built to the blend, so the film renders, and passes the look checks, before the first real place
// exists: a courtyard in front of a house. Far band: one painted picture round the place (a real place uses its
// picture from public/<slug>/pictures/). Middle and ground: code 3D with painted textures (2048, mipmaps, 16x
// anisotropy: paint.ts). Detail layer: small real things that move (two swarms of flies, smoke from the fire, two
// cloths on a line, birds). Replace it with the story's places, each built to its parts plan (stories/<slug>/parts.md).
// What look.mjs checks here: no plain colour within 8 m of a shot camera (the line is allowed, with its reason), no
// map under 2048, at least 6 detail things in the wide and 4 in the medium, of which 3 and 2 move.

/** the far band: hills, a town and a sky with clouds, painted once on a canvas and hung on a cylinder round the place */
function farBand() {
  const t = painted('farband', (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, '#3e86d8'); sky.addColorStop(1, '#bfe0f6');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) {   // clouds
      const x = hash(i, 61) * w, y = h * (0.08 + 0.3 * hash(i, 62)), s = 40 + 90 * hash(i, 63);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + (k - 2.5) * s * 0.55, y + Math.sin(k * 1.7) * s * 0.18, s * 0.6, s * 0.38, 0, 0, 6.28); g.fill(); }
    }
    const hill = (y0: number, amp: number, col: string, seed: number) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + amp * Math.sin(x / 210 + seed) + amp * 0.4 * Math.sin(x / 67 + seed * 3));
      g.lineTo(w, h); g.fill();
    };
    hill(h * 0.6, 40, '#8fae7a', 1); hill(h * 0.66, 30, '#b9a06a', 2);
    for (let i = 0; i < 40; i++) {   // a town on the far hill: flat roofs, walls, windows
      const x = w * (0.55 + 0.25 * hash(i, 71)), bw = 30 + 40 * hash(i, 72), bh = 24 + 40 * hash(i, 73), y = h * 0.64 - bh;
      g.fillStyle = ['#efe0c0', '#e2cba0', '#f4ead2'][i % 3]; g.fillRect(x, y, bw, bh);
      g.fillStyle = 'rgba(80,50,30,0.6)'; g.fillRect(x + bw * 0.3, y + bh * 0.4, 6, 9);
    }
    speckle(g, w, h * 0.4, 1600, ['rgba(70,100,50,0.5)', 'rgba(150,120,70,0.5)'], 3, 10, 74, 1);
    g.save(); g.translate(0, h * 0.6); speckle(g, w, h * 0.4, 1600, ['rgba(70,100,50,0.5)', 'rgba(150,120,70,0.5)'], 3, 10, 75, 1); g.restore();
    grain(g, w, h, 76, 0.4);
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 70, 64, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, toneMapped: false }));
  m.position.y = 18; m.renderOrder = -10; m.userData.far = true;
  return m;
}

const place: PlaceDef = {
  pictures: [], models: [], grade: 'day', sun: [0.5, 0.8, 0.45], background: '#9cc4e4',
  build: (scene) => {
    const root = new THREE.Group(); scene.add(root);
    root.add(farBand());
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), lit(ground('#D9A56A', 5, [10, 10])));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'ground';
    const wall = lit(plaster('#EAD7B0', 1)), stoneM = lit(stone(3)), woodM = lit(wood('#8E5E36', 7));
    const house = block(10, 3.2, 0.4, wall, [0, 0, -4.2]); house.name = 'house wall';
    const door = block(1.1, 2.1, 0.12, woodM, [1.6, 0, -3.98]); door.name = 'door';
    const side = block(0.5, 1.2, 7, stoneM, [-4.5, 0, -0.8]); side.name = 'side wall';
    const bench = block(1.6, 0.45, 0.45, woodM, [2.6, 0, -2.9]); bench.name = 'bench';
    root.add(floor, house, door, side, bench);
    // the fire: a ring of stones, glowing embers, smoke
    const fire = new THREE.Group(); fire.name = 'fire';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.28, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + 0.04 * hash(i, 3)), stoneM);
      s.position.set(1.6 + 0.42 * Math.cos(a), 0.08, -1.6 + 0.42 * Math.sin(a)); s.castShadow = true; s.name = 'fire stone'; fire.add(s);
    }
    const embers = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a1408', emissive: '#ff6a20', emissiveIntensity: 1.6 }));
    embers.position.set(1.6, 0.03, -1.6); embers.name = 'embers'; fire.add(embers);
    root.add(fire);
    // a jar by the door, its own painted clay
    const jarPts = [[0, 0], [0.16, 0], [0.26, 0.14], [0.3, 0.4], [0.24, 0.62], [0.15, 0.72], [0.18, 0.76]].map(([r, y]) => new THREE.Vector2(r, y));
    const jar = new THREE.Mesh(new THREE.LatheGeometry(jarPts, 36), lit(plaster('#C46A3E', 11)));
    jar.position.set(-1.4, 0, -3.5); jar.castShadow = true; jar.name = 'jar'; root.add(jar);
    // a line between two posts, two cloths hung from it
    for (const x of [-3.4, 0.4]) { const post = block(0.12, 2.2, 0.12, woodM, [x, 0, -2.8]); post.name = 'line post'; root.add(post); }
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 3.8, 6).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d8c8a8' }));
    line.position.set(-1.5, 2.1, -2.8); line.name = 'line'; line.userData.plainOk = 'a cord 1.6 cm thick: no texture can show on it';
    root.add(line);
    root.add(hangingCloth([-2.6, 2.08, -2.8], 0.9, 1.1, '#C8402E', '#F2E2C2', 0, 1), hangingCloth([-1.3, 2.08, -2.8], 0.8, 1.3, '#2E7A5A', '#F4E6C8', 0, 2));
    // the detail layer's moving things
    root.add(flies([-1.4, 0.95, -3.4], 4, 0.3, 1), flies([1.6, 1.4, -3.7], 3, 0.25, 2), smoke([1.6, 0.1, -1.6], 2.6, 7, '#e2dcd2', 3), birds([0, 7, -14], 3, 7, 0.6, 4));
    const tick = ticks(root);
    return { update: (_shot: string, t: number, cam: THREE.PerspectiveCamera) => tick(t, cam) };
  },
  shots: {
    wide: (_b, t = 0) => ({ view: { pos: [0.3, 1.6, 7.5], look: [-0.4, 1.2, -1.5], fov: 42 }, t,
      people: [P('a', 'a', [-0.6, 0, -1.2], { expr: 'smile', hand: [430, 520], talk: Math.abs(Math.sin(t * 9)) })],
      line: 'stand-in', note: "replace with the story's first place" }),
    medium: (_b, t = 0) => ({ view: { pos: [0.4, 1.45, 1.6], look: [-0.5, 1.3, -1.2], fov: 36 }, t,
      people: [P('a', 'a', [-0.6, 0, -1.2], { expr: 'smile', hand: [430, 520 - 40 * Math.sin(t * 3)], talk: Math.abs(Math.sin(t * 9)) })],
      line: 'stand-in', note: 'a medium shot: the background blurs behind the person' }),
  },
};
export default place;
