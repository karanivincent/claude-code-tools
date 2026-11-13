// b17-checklist: a Wright Field hangar, the weeks after the crash (s06, s07). The blend (S2-7):
//   sky/far  through the big door (+z): the airfield picture on a half-cylinder, its sky into the dome
//   middle   code 3D with painted textures: corrugated walls, a few thick curved roof trusses, the door frame, a work
//            table under a hanging lamp, chairs, tool chests, a workbench, oil drums, a spare propeller on the wall, a
//            blackboard with a chalk drawing of the tail, a ladder
//   ground   painted concrete floor inside; outside the door, the apron, grass and the runway
//   detail   pigeons crossing the rafters, the lamp swaying on its cord, the smaller twin-engine plane taxiing past
//            the door (s06, 33.4-35.4 s), the pencil writing the list (s07, 39.6-41.8 s)
//   hero     the clipboard on the table, its card written line by line; the thick training manual pushed aside (38.6 s)
// The floor is y 0; the door opening spans x -12..12 at z = 20; the table is under the lamp.
import * as THREE from 'three';
import { farPicture } from './parts/blend';
import type { PlaceDef } from './index';
import { HANGAR } from './marks';
import { HANGAR_LIGHT } from './light';
import { add, corrugatedTex, floorTex, grassTex, mat, metalTex, runwayTex, sheet, woodTex, tiled } from '../props/paint';
import { makePlane } from '../props/plane';
import { drums } from '../props/sets';
import { flock } from '../props/fx';
import { NOINK } from '../../../look/ink';

const SKY = ['#1d47c8', '#2d5fdc', '#4a7ee6', '#7aa2ec', '#a9c4f0'];
/** the list's lines, each written over its own stretch of film seconds (s07 "They wrote a list"), then ticked in s08 */
export const LIST = [
  { text: 'BRAKES', check: 'OFF', from: 39.55, to: 40.5 },
  { text: 'CONTROLS', check: 'UNLOCKED', from: 40.5, to: 41.6 },
  { text: 'FLAPS', check: 'UP', from: 41.6, to: 42.1 },
  { text: 'TRIM TABS', check: 'SET', from: 42.1, to: 42.3 },
];
/** the smaller plane's x outside the door (s06): it taxis past from -60 to 40 between 33.0 and 35.4 s */
export const smallPlaneX = (t: number) => -70 + 110 * Math.max(0, Math.min(1, (t - 32.2) / 2.8));

export const drawList = (g: CanvasRenderingContext2D, w: number, h: number, t: number, ticks = 0) => {
  g.fillStyle = '#f6efdc'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#9fb1d4'; g.lineWidth = 3; for (let y = 230; y < h - 40; y += 110) { g.beginPath(); g.moveTo(40, y); g.lineTo(w - 40, y); g.stroke(); }
  g.fillStyle = '#23356e'; g.font = '700 64px Georgia'; g.textAlign = 'center'; g.fillText('PILOT’S CHECKLIST', w / 2, 120);
  g.textAlign = 'left'; g.font = '600 60px "Comic Sans MS", "Marker Felt", cursive';
  LIST.forEach((l, i) => {
    const k = Math.max(0, Math.min(1, (t - l.from) / (l.to - l.from))); if (k <= 0) return;
    const line = `${l.text} — ${l.check}`, n = Math.ceil(line.length * k);
    g.fillStyle = '#1b1b24'; g.fillText(line.slice(0, n), 70, 210 + i * 110);
    if (i < ticks) { g.strokeStyle = '#d42a26'; g.lineWidth = 12; g.beginPath(); g.moveTo(w - 150, 190 + i * 110); g.lineTo(w - 120, 215 + i * 110); g.lineTo(w - 70, 150 + i * 110); g.stroke(); }
  });
};

export const hangarInside: PlaceDef = {
  light: HANGAR_LIGHT,
  pictures: { airfieldFar: 'b17-checklist/pictures/airfield-far.jpg' },
  build: (pics) => {
    const root = new THREE.Group();
    root.add(farPicture({ img: tiled(pics.airfieldFar), sky: SKY, radius: 420, arc: Math.PI * 2 - 0.001, toward: [0, 1], base: -11 }).root);
    // outside the door
    add(root, new THREE.Mesh(new THREE.PlaneGeometry(900, 440).rotateX(-Math.PI / 2), mat(grassTex([110, 55]))), false).position.set(0, -0.02, 240);
    add(root, new THREE.Mesh(new THREE.PlaneGeometry(900, 30).rotateX(-Math.PI / 2), mat(runwayTex([60, 2]))), false).position.set(0, 0.01, 60);
    add(root, new THREE.Mesh(new THREE.PlaneGeometry(80, 30).rotateX(-Math.PI / 2), mat(runwayTex([6, 2]), '#e6e0d2')), false).position.set(0, 0.0, 35);
    // the shell: floor, walls, the front wall round the door, roof trusses
    const steel = mat(corrugatedTex([6, 2], '#aab3ba'), '#c3c9cd', { side: THREE.DoubleSide });
    add(root, new THREE.Mesh(new THREE.PlaneGeometry(30, 40).rotateX(-Math.PI / 2), mat(floorTex([5, 7]))), false);
    for (const s of [-1, 1]) { const wl = add(root, new THREE.Mesh(new THREE.PlaneGeometry(40, 9), steel)); wl.rotation.y = Math.PI / 2; wl.position.set(s * 15, 4.5, 0); }
    const bk = add(root, new THREE.Mesh(new THREE.PlaneGeometry(30, 14), steel)); bk.position.set(0, 7, -20);
    for (const s of [-1, 1]) { const fw = add(root, new THREE.Mesh(new THREE.PlaneGeometry(3, 14), steel)); fw.position.set(s * 13.5, 7, 20); }
    const lintel = add(root, new THREE.Mesh(new THREE.PlaneGeometry(30, 4.5), steel)); lintel.position.set(0, 11.75, 20);
    const roof = add(root, new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 40, 30, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), steel)); roof.position.y = 9; roof.scale.set(1, 0.45, 1);
    const truss = mat(metalTex([1, 1]), '#6d7680');
    for (const z of [-14, -4, 6, 16]) { const tr = add(root, new THREE.Mesh(new THREE.TorusGeometry(14.6, 0.22, 6, 30, Math.PI), truss)); tr.position.set(0, 9, z); tr.scale.set(1, 0.45, 1); }
    // the table under the lamp, chairs, the training manual and the clipboard
    const T = HANGAR.table, wood = mat(woodTex([2, 1], '#9a6a3c'));
    const top = add(root, new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.6), wood)); top.position.set(T[0], 0.82, T[2]);
    for (const [x, z] of [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]]) add(root, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), wood)).position.set(T[0] + x, 0.4, T[2] + z);
    for (const [x, z, r] of [[-1.6, 0.2, 0.3], [1.6, 0.3, -0.4], [0.2, 1.4, 2.9]]) {
      const ch = new THREE.Group(); ch.position.set(T[0] + x, 0, T[2] + z); ch.rotation.y = r; root.add(ch);
      add(ch, new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), wood)).position.y = 0.46;
      add(ch, new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), wood)).position.set(0, 0.74, -0.2);
    }
    const manual = new THREE.Group(); root.add(manual);
    const mcover = sheet(512, 640, (g) => { g.fillStyle = '#5a2a2a'; g.fillRect(0, 0, 512, 640); g.fillStyle = '#e8c45a'; g.font = '700 52px Georgia'; g.textAlign = 'center'; g.fillText('FLIGHT', 256, 230); g.fillText('TRAINING', 256, 300); g.fillText('MANUAL', 256, 370); g.fillText('VOL. III', 256, 470); });
    const mb = add(manual, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.44), [mat(null, '#e9e0c8'), mat(null, '#e9e0c8'), mat(mcover), mat(null, '#4a2222'), mat(null, '#e9e0c8'), mat(null, '#4a2222')] as unknown as THREE.Material));
    mb.position.y = 0.08;
    // the clipboard: a canvas card redrawn as the pencil writes
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1400;
    const listTex = new THREE.CanvasTexture(cv); listTex.colorSpace = THREE.SRGBColorSpace; listTex.anisotropy = 16;
    const clip = new THREE.Group(); clip.position.set(T[0] - 0.2, 0.87, T[2] + 0.15); clip.rotation.set(-Math.PI / 2, 0, 0.12); root.add(clip);
    add(clip, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.015), mat(woodTex([1, 1], '#8a5a32'))), false);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.41), new THREE.MeshLambertMaterial({ map: listTex })); paper.position.z = 0.009; clip.add(paper);
    add(clip, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.025), mat(null, '#c9ced4')), false).position.set(0, 0.2, 0.012);
    const pencil = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 6), mat(null, '#f2c230')), false);
    // the lamp: a green enamel shade on a cord, glowing warm; a glow card under it on the table
    const lamp = new THREE.Group(); lamp.position.set(T[0], 4.2, T[2]); root.add(lamp);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4.8, 4), new THREE.MeshLambertMaterial({ color: '#1b1b1f' })); cord.position.y = 2.4; lamp.add(cord);
    const shade = add(lamp, new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 20, 1, true), mat(null, '#2f6b4a', { side: THREE.DoubleSide })), false); shade.position.y = 0;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.6) })); bulb.position.y = -0.1; bulb.layers.set(NOINK); lamp.add(bulb);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.position.set(T[0], 0.875, T[2]); pool.layers.set(NOINK); root.add(pool);
    // the edges: tool chests, a workbench, drums, a spare propeller, the blackboard, a ladder
    const red = mat(metalTex([1, 1]), '#c0392b');
    for (const [x, z] of [[-13.6, -6], [-13.6, -3.6]]) add(root, new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.8), red)).position.set(x, 0.6, z);
    add(root, new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 5), wood)).position.set(13.5, 0.45, -4);
    root.add(drums([10.5, 0, 10], 5), drums([-12, 0, 12], 3));
    const prop = new THREE.Group(); prop.position.set(-14.8, 5.5, -10); prop.rotation.set(0, Math.PI / 2, 0.4); root.add(prop);
    for (let i = 0; i < 3; i++) { const b = add(prop, new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.3), mat(null, '#2a2a2e')), false); b.geometry.translate(0, 0.95, 0); b.rotation.z = (i * 2 * Math.PI) / 3; }
    const chalk = sheet(1536, 1024, (g) => { g.fillStyle = '#2d3b33'; g.fillRect(0, 0, 1536, 1024); g.strokeStyle = '#eef0e8'; g.lineWidth = 9; g.beginPath(); g.moveTo(200, 700); g.lineTo(1150, 650); g.lineTo(1350, 300); g.lineTo(1250, 300); g.lineTo(1050, 640); g.stroke(); g.beginPath(); g.ellipse(1200, 640, 220, 40, 0, 0, 7); g.stroke(); g.fillStyle = '#eef0e8'; g.font = '600 80px "Comic Sans MS", cursive'; g.fillText('ELEVATOR?', 300, 300); g.fillText('?', 1300, 200); });
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.8), new THREE.MeshLambertMaterial({ map: chalk })); bb.position.set(14.85, 2.6, 5); bb.rotation.y = -Math.PI / 2; root.add(bb);
    const ladder = new THREE.Group(); ladder.position.set(-9, 0, -16); ladder.rotation.x = -0.2; root.add(ladder);
    for (const x of [-0.3, 0.3]) add(ladder, new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.5, 0.08), wood)).position.set(x, 2.25, 0);
    for (let i = 0; i < 6; i++) add(ladder, new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), wood)).position.set(0, 0.5 + i * 0.7, 0);
    // the smaller plane outside (s06) and the pigeons
    const small = makePlane({ twin: true, tint: '#c3c9cf' }); small.root.scale.setScalar(0.72); root.add(small.root);
    const birds = flock([-20, 8.5, -10], [20, 9.2, 10], 7, 4, 21); root.add(birds.root);
    let drawn = '';
    return {
      root,
      update: (f) => {
        const t = f / 30;
        // the manual: pushed aside on "training" (38.6 s), sliding 0.7 m and turning
        const k = Math.max(0, Math.min(1, (t - 38.45) / 0.45)), ke = k * k * (3 - 2 * k);
        manual.position.set(T[0] + 0.55 + 0.75 * ke, 0.86, T[2] - 0.25 - 0.2 * ke); manual.rotation.y = 0.2 + 0.7 * ke;
        // the list, redrawn when its text changes
        const key = LIST.map((l) => Math.round(Math.max(0, Math.min(1, (t - l.from) / (l.to - l.from))) * 24)).join(',');
        if (key !== drawn) { drawList(cv.getContext('2d')!, cv.width, cv.height, t, 0); listTex.needsUpdate = true; drawn = key; }
        // the pencil rides the line being written
        const cur = LIST.findIndex((l) => t >= l.from && t < l.to), cl = LIST[Math.max(0, cur)];
        const pk = cur < 0 ? 0 : (t - cl.from) / (cl.to - cl.from), row = Math.max(0, cur);
        pencil.visible = t >= 39.3 && t < 42.4;
        pencil.position.set(clip.position.x - 0.1 + 0.2 * pk + 0.01 * Math.sin(t * 40), 0.92, clip.position.z - 0.14 + row * 0.033);
        pencil.rotation.set(0.6, 0, -0.7);
        lamp.rotation.z = 0.03 * Math.sin(t * 1.3);
        small.root.visible = t >= 32.0 && t < 35.6;
        small.pose({ at: [smallPlaneX(t) / 0.72, 2.55, HANGAR.smallPlaneZ / 0.72], yaw: 0, pitch: 7, roll: 0, spin: t * 40, disc: 1, gear: true });
        birds.update(t);
      },
      groundY: () => 0,
    };
  },
};
