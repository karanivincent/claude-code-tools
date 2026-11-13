// b17-checklist: the Model 299's cockpit on the runway, 30 October 1935. The blend (S2-7):
//   sky/far  the airfield picture on a half-cylinder ahead (+x), seen through the glass; its sky into the dome
//   middle   code 3D with painted textures: zinc-chromate green walls and ribs, the glass frames, the instrument panel
//            (painted gauges), two seats, the control columns, the throttle quadrant with four red knobs, the
//            clipboard of test cards hanging on the left wall
//   ground   outside: the runway and grass far below the glass, sliding past from 17.5 s ("It rolled down the runway")
//   detail   the throttles pushed forward on "rolled" (17.5 s), the gauge needles rising, the clipboard swinging,
//            a strap swaying, dust motes in the sun through the glass are not used (no dots: S3-9)
// The cockpit floor is at y 0, 3.4 m above the runway; the nose (+x) is ahead.
import * as THREE from 'three';
import { NOINK } from '../../../look/ink';
import { farPicture } from './parts/blend';
import type { PlaceDef } from './index';
import { COCKPIT } from './marks';
import { COCKPIT_LIGHT } from './light';
import { add, dab, grassTex, mat, metalTex, paint, runwayTex, sheet, woodTex, tiled } from '../props/paint';

const SKY = ['#1d47c8', '#2d5fdc', '#4a7ee6', '#7aa2ec', '#a9c4f0'];
/** how far the runway has slid past (m) at film second t: still, then the roll from 17.5 s */
export const rolled = (t: number) => (t < 17.5 ? 0 : 0.5 * 22 * (t - 17.5) ** 2);

const greenTex = () => paint((g, w, h) => { g.fillStyle = '#8c9c5a'; g.fillRect(0, 0, w, h); dab(g, w, h, '#93a362', 160, 31, 0.1, 110);
  g.fillStyle = '#6f7d45'; for (let x = 0; x < w; x += w / 6) g.fillRect(x, 0, 18, h); g.fillStyle = '#5c6838'; for (let x = 30; x < w; x += w / 6) for (let y = 20; y < h; y += 40) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }, [1, 1]);
const panelTex = () => sheet(2048, 1024, (g) => {
  g.fillStyle = '#26262b'; g.fillRect(0, 0, 2048, 1024); dab(g, 2048, 1024, '#2c2c32', 80, 5, 0.08, 120);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    const x = 210 + c * 325, y = 300 + r * 420;
    g.fillStyle = '#0f0f12'; g.beginPath(); g.arc(x, y, 140, 0, 7); g.fill();
    g.fillStyle = '#f2ecd8'; g.beginPath(); g.arc(x, y, 118, 0, 7); g.fill();
    g.strokeStyle = '#1a1a1e'; g.lineWidth = 8; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 92, y + Math.sin(a) * 92); g.lineTo(x + Math.cos(a) * 112, y + Math.sin(a) * 112); g.stroke(); }
  }
});

export const cockpit: PlaceDef = {
  light: COCKPIT_LIGHT,
  pictures: { airfieldFar: 'b17-checklist/pictures/airfield-far.jpg' },
  build: (pics) => {
    const root = new THREE.Group();
    const far = farPicture({ img: tiled(pics.airfieldFar), sky: SKY, radius: 420, arc: Math.PI * 2 + 0.006, warmClouds: true, toward: [1, 0], base: -14 });
    root.add(far.root);
    // outside: runway and grass below, sliding past (a group moved along -x as the plane rolls)
    const outside = new THREE.Group(); outside.position.y = -3.4; root.add(outside);
    const grass = add(outside, new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), mat(grassTex([110, 110]))), false);
    const rw = add(outside, new THREE.Mesh(new THREE.PlaneGeometry(900, 30).rotateX(-Math.PI / 2), mat(runwayTex([60, 2]))), false); rw.position.y = 0.03;
    void grass;
    // the shell: floor, walls with window openings, the roof ribs and the glass frames
    const green = mat(greenTex(), '#ffffff', { side: THREE.DoubleSide }), dark = mat(metalTex([1, 1]), '#5d616b');
    add(root, new THREE.Mesh(new THREE.PlaneGeometry(4, 2.3).rotateX(-Math.PI / 2), mat(woodTex([2, 1], '#6b5a44'))), false).position.set(-0.6, 0, 0);
    for (const s of [-1, 1]) {
      const low = add(root, new THREE.Mesh(new THREE.PlaneGeometry(4, 0.95), green)); low.position.set(-0.6, 0.47, s * 1.12);
      const top = add(root, new THREE.Mesh(new THREE.PlaneGeometry(4, 0.12), green)); top.position.set(-0.6, 1.78, s * 1.06);
      for (const x of [-2.2, -1.2, -0.2, 0.75]) { const post = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 0.06), dark)); post.position.set(x, 1.37, s * 1.1); }
    }
    for (let i = 0; i < 4; i++) { const rib = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.2), dark)); rib.position.set(-2.1 + i * 0.95, 1.83, 0); }
    const back = add(root, new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.9), green)); back.position.set(-2.6, 0.95, 0); back.rotation.y = Math.PI / 2;
    // world-r2: a dressed cabin, not a cage of bars. The roof skin closes over the ribs (sky showed through them), with
    // an overhead switch panel; harness straps on the seats; a red extinguisher and a
    // canvas map case on the back wall; a cable run along the left wall
    const roof = add(root, new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.24).rotateX(Math.PI / 2), green), false); roof.position.set(-0.85, 1.88, 0);
    const over = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.42), dark), false); over.position.set(0.1, 1.84, 0);
    const swT = sheet(512, 320, (g) => { g.fillStyle = '#2e3036'; g.fillRect(0, 0, 512, 320); for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = 50 + c * 80, y = 60 + r * 95; g.fillStyle = '#c9ced4'; g.fillRect(x - 6, y - 22, 12, 30); g.fillStyle = r === 1 && c % 2 ? '#e0262b' : '#f2ecd8'; g.beginPath(); g.arc(x, y + 22, 9, 0, 7); g.fill(); } });
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.4).rotateX(Math.PI / 2), mat(swT)); sw.position.set(0.1, 1.81, 0); root.add(sw);
    const ext = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 14), mat(metalTex([1, 1]), '#d42a26'))); ext.position.set(-2.5, 0.7, 0.75);
    const nozzle = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), mat(null, '#1f1e22'))); nozzle.position.set(-2.5, 0.98, 0.75);
    const mapCase = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.55), mat(woodTex([1, 1], '#b59a62')))); mapCase.position.set(-2.52, 1.05, -0.45);
    const cable = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.2, 6), mat(null, '#2b2320'))); cable.rotation.z = Math.PI / 2; cable.position.set(-0.8, 1.0, -1.08);
    for (const z of [-0.42, 0.42]) for (const dz of [-0.13, 0.13]) { const st = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.06), mat(null, '#a88a5a'))); st.position.set(-0.36, 0.85, z + dz); st.rotation.z = 0.12; }
    // the windscreen: three panes framed, leaning back
    for (const z of [-0.95, -0.32, 0.32, 0.95]) { const f = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), dark)); f.position.set(COCKPIT.glass, 1.4, z); f.rotation.z = 0.35; }
    const sill = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 2.2), dark)); sill.position.set(COCKPIT.glass + 0.12, 1.02, 0);
    // glass in every frame (world-r1: the open frames read as a bare cage): faintly blue panes with two soft diagonal glints
    const glint = sheet(512, 512, (g) => { g.clearRect(0, 0, 512, 512); g.fillStyle = 'rgba(190,215,240,0.10)'; g.fillRect(0, 0, 512, 512);
      // the glints sit in the panes' top corner only, short: never across a face (S3-46)
      for (const [x0, wd, a] of [[40, 46, 0.36], [110, 18, 0.26]] as [number, number, number][]) { const gr = g.createLinearGradient(x0, 0, x0 + wd, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.beginPath(); g.rect(0, 0, 512, 120); g.clip(); g.translate(0, 0); g.transform(1, 0, -0.7, 1, 0, 0); g.fillStyle = gr; g.fillRect(x0, 0, wd, 120); g.restore(); } });
    const glassM = new THREE.MeshBasicMaterial({ map: glint, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const zc of [-0.635, 0, 0.635]) { const gl = new THREE.Group(); gl.position.set(COCKPIT.glass, 1.4, zc); gl.rotation.z = 0.35; root.add(gl);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), glassM); pane.rotation.y = Math.PI / 2; pane.layers.set(NOINK); gl.add(pane); }
    for (const sz of [-1, 1]) for (const xc of [-1.7, -0.7, 0.28]) { const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.8), glassM); pane.position.set(xc, 1.37, sz * 1.1); pane.layers.set(NOINK); root.add(pane); }
    // the instrument panel facing the pilots
    const olive = mat(greenTex(), '#8e9478'); // in the panel's shade: a deeper olive, quieter than the lit walls
    // the panel's nose side (what the s03 cameras at the nose see under the glass) is the zinc-chromate wall with its ribs
    // and rivets, not a dark slab; the nose bay below it too
    const panel = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 2.0), [olive, mat(panelTex()), dark, dark, olive, olive] as unknown as THREE.Material));
    panel.position.set(0.9, 0.82, 0);
    const needles: THREE.Mesh[] = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.045, 0.006), new THREE.MeshBasicMaterial({ color: '#e0262b' }));
      n.geometry.translate(0, 0.02, 0); n.position.set(0.835, 0.82 + 0.15 - 0.2 * r - 0.06 + 0.06, -0.85 + c * 0.32 + 0.06); root.add(n); needles.push(n);
    }
    // seats, control columns with wheels, the throttle quadrant
    const leather = mat(null, '#7a4a2e');
    for (const z of [-0.42, 0.42]) {
      const seat = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), leather)); seat.position.set(-0.15, 0.42, z);
      const backr = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.5), leather)); backr.position.set(-0.42, 0.8, z);
      const col = add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), dark)); col.position.set(0.45, 0.35, z);
      const wheel = add(root, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24, Math.PI * 1.4), mat(null, '#1f1e22'))); wheel.position.set(0.42, 0.78, z); wheel.rotation.set(0, Math.PI / 2, -Math.PI * 0.2);
    }
    const quad = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), dark)); quad.position.set(0.55, 0.25, 0);
    const levers: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const lv = new THREE.Group(); lv.position.set(0.55, 0.5, -0.075 + i * 0.05); root.add(lv); levers.push(lv);
      const rod = add(lv, new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), mat(null, '#c9ced4')), false); rod.position.y = 0.11;
      const knob = add(lv, new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(null, '#e0262b')), false); knob.position.y = 0.23;
    }
    // the clipboard of test cards on the left wall (the motif, seen before anyone needs it: meaning.md)
    // hung on the post by Hill's shoulder, its face to the nose, so the s03 cameras see it beside him (the motif, unread)
    const clip = new THREE.Group(); clip.position.set(...COCKPIT.clipboard); clip.rotation.y = Math.PI / 2; root.add(clip);
    const card = sheet(512, 720, (g) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 512, 720); g.fillStyle = '#23356e'; g.font = '700 46px Georgia'; g.fillText('TEST No. 1', 60, 110);
      g.strokeStyle = '#7d8aa8'; g.lineWidth = 4; for (let y = 180; y < 680; y += 60) { g.beginPath(); g.moveTo(60, y); g.lineTo(452, y); g.stroke(); } });
    const board = add(clip, new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.012), mat(woodTex([1, 1], '#8a5a32'))), false); board.position.y = -0.17;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshLambertMaterial({ map: card })); paper.position.set(0, -0.18, 0.008); clip.add(paper);
    const clamp = add(clip, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.02), mat(null, '#c9ced4')), false); clamp.position.set(0, -0.03, 0.01);
    return {
      root,
      update: (f) => {
        const t = f / 30;
        outside.position.x = -rolled(t);
        const push = Math.max(0, Math.min(1, (t - 17.45) / 0.45));
        levers.forEach((lv, i) => { lv.rotation.z = -0.45 + 0.9 * Math.max(0, Math.min(1, push * 1.2 - i * 0.06)); });
        needles.forEach((n, i) => { n.rotation.x = -2.2 + (t > 7.8 ? 1.4 : 0) + 1.6 * push + 0.05 * Math.sin(t * 9 + i); });
        clip.rotation.z = 0.05 * Math.sin(t * 2.3) + (t > 17.5 ? 0.06 * Math.sin(t * 13) : 0);
      },
      groundY: () => 0,
    };
  },
};
