import * as THREE from 'three';
import { hash, prog, smooth, type V3 } from './shots';

// Our two bean-head people, drawn in code as flat cards (our own designs, never the reference's):
//   the young engineer   olive flat cap with a short brim, dark curly hair tufts at the sides, a pencil behind one ear,
//                        white shirt with rolled sleeves, rust-red waistcoat, brown trousers
//   the owner            round and plump, plum frock coat, gold watch chain, grey mutton-chop whiskers; his cream
//                        planter's hat with a dark band is a real 3D prop that leaves his head and tumbles
// The style follows toon-world's cast (bean head, small pill body, stick limbs, ball hands, one dark outline about 2.5 %
// of the head's width), but the faces are flat white and unlit: the card material is MeshBasic, so the world's light
// never touches them; only the grade does. Each card always faces the camera; it casts a card-shaped shadow (an
// alpha-tested depth material). A view (front, three-quarter left or right, side) is a different DRAWING, swapped on
// a frame, never a card turning in 3D. Blinks are on ones (half, shut, half). A card redraws only when its state changes.

export const INK = '#1b1420';
const OL = 7; // outline in design units (head radius ~175: 2 % of the head's width)
export const SU = 0.00175; // metres per design unit: the 1000-unit card is 1.75 m tall, soles at y = 975
export type View = 'front' | 'tql' | 'tqr' | 'side' | 'tqlNear';
export type Eyes = 'open' | 'half' | 'shut' | 'happy' | 'wide' | 'pop';
export type Mouth = 'grin' | 'smirk' | 'smile' | 'o' | 'uneasy' | 'flat';
export interface Face { eyes: Eyes; mouth: Mouth; lid?: number; brows?: boolean; sweat?: boolean }
export interface EngState extends Face { view: View; arms?: 'down' | 'up' | 'hip'; walk?: number | null }
export interface OwnerState extends Face { sit: boolean; arms: 'belly' | 'up' | 'down' | 'half'; curl: boolean }

type G = CanvasRenderingContext2D;
const circle = (g: G, x: number, y: number, r: number, fill: string | null, ol = OL) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (ol) { g.lineWidth = ol; g.strokeStyle = INK; g.stroke(); } };
const ell = (g: G, x: number, y: number, rx: number, ry: number, rot: number, fill: string | null, ol = OL) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (ol) { g.lineWidth = ol; g.strokeStyle = INK; g.stroke(); } };
const poly = (g: G, pts: [number, number][], fill: string | null, ol = OL) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (ol) { g.lineWidth = ol; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); } };
/** a limb: ink stroke under a coloured stroke, round caps */
const limb = (g: G, pts: [number, number][], w: number, fill: string) => {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [c, ww] of [[INK, w + OL * 2], [fill, w]] as [string, number][]) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = c; g.lineWidth = ww; g.stroke(); }
};
const line = (g: G, pts: [number, number][], w = OL, c = INK) => { g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = c; g.lineWidth = w; g.stroke(); };
const pill = (g: G, x0: number, y0: number, x1: number, y1: number, r: number, fill: string, ol = OL) => { g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); g.fillStyle = fill; g.fill(); if (ol) { g.lineWidth = ol; g.strokeStyle = INK; g.stroke(); } };
/** a mitten hand at the end of an arm: one rounded shape with the fingers together, a thumb on the inner side and a
 *  crease; `ang` is the arm's direction at the wrist, `thumb` which side the thumb sits (+1 or -1) */
function mitt(g: G, x: number, y: number, ang: number, thumb: number, fill = '#ffffff', s = 1) {
  g.save(); g.translate(x, y); g.rotate(ang - Math.PI / 2); g.scale(s, s);
  ell(g, -thumb * 17, 6, 8, 14, -thumb * 0.5, fill, 6);
  g.beginPath(); g.moveTo(-15, -6); g.bezierCurveTo(-24, 20, -20, 44, 0, 46); g.bezierCurveTo(20, 44, 24, 20, 15, -6); g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  line(g, [[thumb * 4, 26], [thumb * 6, 40]], 3.5);
  g.restore();
}

// ---- faces ------------------------------------------------------------------------------------------------------------
function eye(g: G, x: number, y: number, kind: Eyes, lid: number, look: number, s = 1) {
  if (lid >= 0.99 || kind === 'shut') { line(g, [[x - 22 * s, y + 2], [x + 22 * s, y + 2]], 7); return; }
  if (kind === 'happy') { g.beginPath(); g.arc(x, y + 14 * s, 22 * s, Math.PI * 1.1, Math.PI * 1.9); g.lineWidth = 7; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); return; }
  const r = (kind === 'wide' ? 38 : kind === 'pop' ? 46 : 31) * s, pr = kind === 'wide' ? 6 : kind === 'pop' ? 5 : 10;
  circle(g, x, y, r, '#ffffff', 6);
  const half = kind === 'half' || lid >= 0.4;
  if (half) {
    // a straight lid line through the middle, the pupil below it
    g.save(); g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2); g.clip(); g.fillStyle = '#ffffff'; g.fillRect(x - r, y - r, 2 * r, r - 2); g.restore();
    line(g, [[x - r - 2, y - 3], [x + r + 2, y - 3]], 7);
    circle(g, x + look * 8, y + r * 0.45, pr, INK, 0);
  } else circle(g, x + look * (kind === 'open' ? 9 : 4), y + 2, pr, INK, 0);
}
function mouth(g: G, x: number, y: number, kind: Mouth, w = 1) {
  if (kind === 'grin') {
    const W = 78 * w;
    g.beginPath(); g.moveTo(x - W, y - 8); g.quadraticCurveTo(x, y - 18, x + W, y - 8); g.quadraticCurveTo(x + W * 0.7, y + 62, x, y + 64); g.quadraticCurveTo(x - W * 0.7, y + 62, x - W, y - 8); g.closePath();
    g.fillStyle = '#4a1624'; g.fill();
    g.save(); g.clip();
    g.fillStyle = '#ffffff'; g.fillRect(x - W, y - 20, 2 * W, 34);
    for (let i = -3; i <= 3; i++) line(g, [[x + i * W / 3.6, y - 14], [x + i * W / 3.6, y + 13]], 4);
    line(g, [[x - W, y + 14], [x + W, y + 14]], 4);
    g.fillStyle = '#e8707a'; g.beginPath(); g.ellipse(x, y + 58, W * 0.45, 18, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.beginPath(); g.moveTo(x - W, y - 8); g.quadraticCurveTo(x, y - 18, x + W, y - 8); g.quadraticCurveTo(x + W * 0.7, y + 62, x, y + 64); g.quadraticCurveTo(x - W * 0.7, y + 62, x - W, y - 8); g.closePath();
    g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    return;
  }
  if (kind === 'smile') { g.beginPath(); g.moveTo(x - 46 * w, y); g.quadraticCurveTo(x, y + 34, x + 46 * w, y); g.lineWidth = 7; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); return; }
  if (kind === 'smirk') { g.beginPath(); g.moveTo(x - 40 * w, y + 6); g.quadraticCurveTo(x + 10, y + 16, x + 44 * w, y - 10); g.lineWidth = 7; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); return; }
  if (kind === 'flat') { line(g, [[x - 20 * w, y + 6], [x + 20 * w, y + 6]], 7); return; }
  if (kind === 'o') { ell(g, x, y + 16, 22 * w, 30, 0, '#4a1624', 7); return; }
  // uneasy: clenched teeth in a wobbly box
  g.beginPath(); g.moveTo(x - 56 * w, y); g.quadraticCurveTo(x - 28 * w, y - 12, x, y); g.quadraticCurveTo(x + 28 * w, y + 12, x + 56 * w, y - 2); g.lineTo(x + 56 * w, y + 26); g.quadraticCurveTo(x, y + 34, x - 56 * w, y + 28); g.closePath();
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
  for (let i = -2; i <= 2; i++) line(g, [[x + i * 20 * w, y - 2], [x + i * 20 * w, y + 28]], 4);
  line(g, [[x - 56 * w, y + 13], [x + 56 * w, y + 13]], 4);
}
function sweatDrop(g: G, x: number, y: number) {
  g.beginPath(); g.moveTo(x, y - 34); g.quadraticCurveTo(x + 24, y + 2, x, y + 18); g.quadraticCurveTo(x - 24, y + 2, x, y - 34); g.closePath();
  g.fillStyle = '#5cb4f2'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  ell(g, x - 6, y + 2, 4, 8, 0.3, '#ffffff', 0);
}
/** the face on a head centred (cx, cy), radius r; shift moves the features sideways for the turned views */
function face(g: G, cx: number, cy: number, r: number, F: Face, shift: number, side = false) {
  const fx = cx + shift * r, gap = 64 * (1 - Math.abs(shift) * 0.5), lid = F.lid ?? 0;
  if (side) eye(g, fx + 10, cy - 10, F.eyes, lid, -1, 0.9);
  else {
    eye(g, fx - gap, cy - 10, F.eyes, lid, shift * 1.2, Math.abs(shift) > 0.2 ? 0.88 : 1);
    eye(g, fx + gap, cy - 10, F.eyes, lid, shift * 1.2, 1);
  }
  if (F.brows) { line(g, [[fx - gap - 30, cy - 62], [fx - gap + 26, cy - 50]], 8); line(g, [[fx + gap + 30, cy - 62], [fx + gap - 26, cy - 50]], 8); }
  mouth(g, side ? fx + 4 : fx, cy + r * 0.44, F.mouth, side ? 0.6 : 1 - Math.abs(shift) * 0.25);
}

// ---- the engineer ------------------------------------------------------------------------------------------------------
const E = { cap: '#6e7f38', capDark: '#56652a', hair: '#3a2418', shirt: '#ffffff', vest: '#a8432e', vestDark: '#8a3424', trousers: '#6b4a2e', shoes: '#2e2018', pencil: '#f2c230' };
function engineerBody(g: G, s: EngState, shift: number) {
  const cx = 300 + shift * 30, w = s.view === 'side' ? 64 : 84;
  // legs (behind the torso), walking on ones toward the camera: small steps, the lifted leg's foot rises and its knee
  // kinks outward, the body stays level
  const ph = s.walk ?? null;
  for (const side of [-1, 1]) {
    const lift = ph === null ? 0 : Math.max(0, side * Math.cos(ph)), a = ph === null ? 0 : side * 0.1 * Math.sin(ph);
    const hip: [number, number] = [cx + side * 30, 720], foot: [number, number] = [cx + side * 36 + Math.sin(a) * 200, 952 - lift * 70];
    const knee: [number, number] = [(hip[0] + foot[0]) / 2 + side * lift * 40, (hip[1] + foot[1]) / 2 - lift * 6];
    limb(g, [hip, knee, foot], 28, E.trousers);
    ell(g, foot[0] + side * 10, foot[1] + 14, 32, 15, 0, E.shoes, 6);
  }
  // arms: a white rolled sleeve with a dark outline to the elbow, a dark forearm, a mitten (round 2: the white stick
  // arms read as bones). 'down' hangs a little out from the hips, 'hip' puts the near hand on the hip (the smug pose),
  // 'up' throws both up; a walk swings them against the legs.
  const sw = ph === null ? 0 : 0.18 * Math.sin(ph);
  const arm = (side: number, pose: 'down' | 'up' | 'hip') => {
    const sh: [number, number] = [cx + side * (w - 8), 498];
    let el: [number, number], ha: [number, number];
    if (pose === 'up') { el = [cx + side * (w + 40), 392]; ha = [cx + side * (w + 52), 282]; }
    else if (pose === 'hip') { el = [cx + side * (w + 62), 592]; ha = [cx + side * (w - 2), 676]; }
    else { const a = side * sw; el = [cx + side * (w + 16) + Math.sin(a) * 90, 596 - Math.abs(Math.sin(a)) * 8]; ha = [el[0] + side * 6 + Math.sin(a) * 100, 694 - Math.abs(Math.sin(a)) * 10]; }
    limb(g, [el, ha], 13, INK);
    limb(g, [sh, el], 34, E.shirt);
    // the rolled cuff at the elbow, square to the upper arm
    g.save(); g.translate(el[0], el[1]); g.rotate(Math.atan2(el[1] - sh[1], el[0] - sh[0]) - Math.PI / 2); pill(g, -25, -16, 25, 8, 9, '#ece6dc', 6); g.restore();
    mitt(g, ha[0], ha[1], Math.atan2(ha[1] - el[1], ha[0] - el[0]), side * (pose === 'hip' ? -1 : 1));
  };
  // torso: white shirt, rust waistcoat with a V and buttons, pointed tips
  pill(g, cx - w, 455, cx + w, 738, 64, E.shirt);
  g.save(); g.beginPath(); g.roundRect(cx - w, 455, 2 * w, 283, 64); g.clip();
  const vx = cx + (s.view === 'side' ? -40 : shift * 70);
  poly(g, [[cx - w - 10, 455], [vx - 34, 455], [vx, 590], [vx, 760], [cx - w - 10, 760]], E.vest, 0);
  poly(g, [[cx + w + 10, 455], [vx + 34, 455], [vx, 590], [vx, 760], [cx + w + 10, 760]], E.vest, 0);
  g.fillStyle = E.vestDark; g.fillRect(cx - w, 690, 2 * w, 60);
  g.restore();
  line(g, [[vx - 34, 462], [vx, 590], [vx, 735]], 6); line(g, [[vx + 34, 462], [vx, 590]], 6);
  for (const y of [612, 650, 688]) circle(g, vx + 14, y, 7, '#e8c070', 4);
  pill(g, cx - w, 455, cx + w, 738, 64, 'rgba(0,0,0,0)');
  // a pocket with a watch-like square on the vest
  line(g, [[cx - w + 26, 640], [cx - w + 62, 636]], 5);
  const pose = (side: number) => s.arms === 'up' ? 'up' : s.arms === 'hip' && side === -1 ? 'hip' : 'down';
  arm(-1, pose(-1)); if (s.view !== 'side') arm(1, pose(1));
}
function engineerHead(g: G, s: EngState, shift: number) {
  const cx = 300, cy = 290, r = 176, side = s.view === 'side';
  // the pencil behind the back ear and the hair tufts (drawn first, so the head covers their roots)
  const back = shift < -0.05 || side ? 1 : shift > 0.05 ? -1 : 1;
  g.save(); g.translate(cx + back * 150, 214); g.rotate(back * 0.62);
  pill(g, -11, -96, 11, 40, 4, E.pencil, 6); poly(g, [[-11, -96], [11, -96], [0, -130]], '#f2d8b0', 6); circle(g, 0, -126, 4, INK, 0);
  pill(g, -11, 22, 11, 46, 3, '#e87a8a', 6);
  g.restore();
  const tuft = (x: number, y: number, k: number) => { for (const [dx, dy, rr] of [[0, 0, 32], [8, 44, 28], [-6, -40, 26], [18, 22, 24]] as [number, number, number][]) circle(g, x + dx * k, y + dy, rr, E.hair); };
  if (s.view === 'front') { tuft(cx - 168, 300, -1); tuft(cx + 168, 300, 1); }
  else if (side) tuft(cx + 165, 300, 1);
  else { tuft(cx - back * 168, 300, -back); tuft(cx + back * 172, 304, back); }
  circle(g, cx, cy, r, '#ffffff');
  face(g, cx, cy, r, s, side ? -0.62 : shift, side);
  if (s.sweat) sweatDrop(g, cx + back * 128, cy - 96);
  // the flat cap: a soft wide crown, a short brim toward where he faces
  const bx = side ? -0.6 : shift;
  g.beginPath(); g.moveTo(cx - r - 6, 200); g.bezierCurveTo(cx - r + 10, 60, cx + r - 10, 52, cx + r + 10, 196);
  g.quadraticCurveTo(cx, 226, cx - r - 6, 200); g.closePath(); g.fillStyle = E.cap; g.fill(); g.lineWidth = OL; g.strokeStyle = INK; g.stroke();
  line(g, [[cx - 40 + bx * 60, 92], [cx + bx * 120, 200]], 4, E.capDark);
  circle(g, cx + bx * 20, 88, 12, E.capDark, 5);
  const b0 = cx + bx * r * 0.9;
  g.beginPath(); g.moveTo(b0 - 130 + bx * 20, 200); g.quadraticCurveTo(b0 + bx * 50, 252, b0 + 130 + bx * 20, 200); g.quadraticCurveTo(b0 + bx * 30, 218, b0 - 130 + bx * 20, 200); g.closePath();
  g.fillStyle = E.capDark; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
}
export function drawEngineer(g: G, s: EngState) {
  const mirror = s.view === 'tqr';
  const shift = s.view === 'front' ? 0 : s.view === 'tqlNear' ? -0.14 : s.view === 'side' ? -0.6 : -0.32;
  g.save(); if (mirror) { g.translate(600, 0); g.scale(-1, 1); }
  engineerBody(g, s, shift);
  engineerHead(g, s, shift);
  g.restore();
}

// ---- the owner ----------------------------------------------------------------------------------------------------------
const O = { coat: '#6a2a5e', coatDark: '#4e1c46', shirt: '#f0e6d0', chain: '#e8b830', trousers: '#4a4450', shoes: '#1e1a20', whisk: '#8e8a96', whiskDark: '#5e5a66' };
export function drawOwner(g: G, s: OwnerState) {
  const cx = 300, hy = s.sit ? 440 : 330, by = s.sit ? 735 : 640, r = 166;
  // legs
  if (s.sit) for (const side of [-1, 1]) { limb(g, [[cx + side * 50, by + 90], [cx + side * 62, 950]], 30, O.trousers); ell(g, cx + side * 70, 962, 36, 15, 0, O.shoes, 6); }
  else for (const side of [-1, 1]) { limb(g, [[cx + side * 46, by + 120], [cx + side * 50, 950]], 30, O.trousers); ell(g, cx + side * 62, 962, 38, 16, 0, O.shoes, 6); }
  // arms: plum coat sleeves with a dark outline and mitten hands. 'up' is the hands-up startle (elbows out, forearms
  // up past the hat brim), 'half' the frame before it (the near arm on its way up), 'belly' rests both hands on the belly
  const sleeve = (side: number, el: [number, number], ha: [number, number]) => {
    const sh: [number, number] = [cx + side * 112, by - 92];
    limb(g, [sh, el, ha], 28, O.coat);
    mitt(g, ha[0], ha[1], Math.atan2(ha[1] - el[1], ha[0] - el[0]), -side);
  };
  const upArm = (side: number) => sleeve(side, [cx + side * 206, by - 178], [cx + side * 214, hy - 176]);
  const halfArm = (side: number) => sleeve(side, [cx + side * 196, by - 120], [cx + side * 226, hy - 40]);
  if (s.arms === 'up') { upArm(-1); upArm(1); }
  else if (s.arms === 'half') halfArm(1);
  else if (s.arms === 'down') for (const side of [-1, 1]) sleeve(side, [cx + side * 160, by - 10], [cx + side * 150, by + 66]);
  // the belly: plum frock coat, cream shirt front, lapels, tails, gold buttons and watch chain
  poly(g, [[cx - 120, by + 60], [cx - 150, by + 150], [cx - 70, by + 120]], O.coatDark);
  poly(g, [[cx + 120, by + 60], [cx + 150, by + 150], [cx + 70, by + 120]], O.coatDark);
  ell(g, cx, by, 152, 148, 0, O.coat);
  g.save(); g.beginPath(); g.ellipse(cx, by, 152, 148, 0, 0, Math.PI * 2); g.clip();
  poly(g, [[cx - 46, by - 160], [cx + 46, by - 160], [cx + 26, by + 30], [cx - 26, by + 30]], O.shirt, 6);
  poly(g, [[cx - 46, by - 160], [cx - 92, by - 60], [cx - 40, by - 40]], O.coatDark, 6);
  poly(g, [[cx + 46, by - 160], [cx + 92, by - 60], [cx + 40, by - 40]], O.coatDark, 6);
  g.restore();
  ell(g, cx, by, 152, 148, 0, null);
  for (const y of [by + 50, by + 90]) { circle(g, cx - 30, y, 9, '#e8c050', 4); circle(g, cx + 30, y, 9, '#e8c050', 4); }
  g.beginPath(); g.moveTo(cx - 78, by + 8); g.quadraticCurveTo(cx - 10, by + 70, cx + 70, by + 4); g.lineWidth = 9; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = O.chain; g.stroke();
  circle(g, cx + 74, by + 6, 15, O.chain, 5);
  // arms over the belly when resting
  const rest = (side: number) => { limb(g, [[cx + side * 118, by - 80], [cx + side * 132, by + 6], [cx + side * 82, by + 46]], 28, O.coat); mitt(g, cx + side * 78, by + 48, Math.atan2(40, -side * 50), side); };
  if (s.arms === 'belly') { rest(-1); rest(1); } else if (s.arms === 'half') rest(-1);
  // the head, the whiskers, the curl
  if (s.curl) { g.beginPath(); g.moveTo(cx + 6, hy - r + 10); g.bezierCurveTo(cx - 30, hy - r - 60, cx + 50, hy - r - 110, cx + 20, hy - r - 130); g.bezierCurveTo(cx - 10, hy - r - 145, cx - 30, hy - r - 110, cx, hy - r - 100); g.lineWidth = 8; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); }
  circle(g, cx, hy, r, '#ffffff');
  // grey mutton-chop whiskers hugging the jaw below the ears: narrow, mid grey with dark strands, half over the head's
  // outline (round 1's pale wide puffs at ear height read as a powdered wig)
  for (const side of [-1, 1]) {
    const ox = cx + side * 140, oy = hy + 78, pts: [number, number][] = [];
    for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2, r0 = k % 2 ? 1 : 0.8; pts.push([Math.cos(a) * 30 * r0, Math.sin(a) * 62 * r0]); }
    const rot = side * 0.42;
    poly(g, pts.map(([x, y]) => [ox + x * Math.cos(rot) - y * Math.sin(rot), oy + x * Math.sin(rot) + y * Math.cos(rot)] as [number, number]), O.whisk, 6);
    for (const d of [-10, 8]) line(g, [[ox + side * d - side * 6, oy - 30], [ox + side * d + side * 10, oy + 34]], 4, O.whiskDark);
  }
  face(g, cx, hy + 6, r * 0.92, s, 0);
  if (s.sweat) sweatDrop(g, cx + 122, hy - 92);
}

// ---- a card in the world ------------------------------------------------------------------------------------------------
export class Card {
  mesh: THREE.Mesh; private cv: HTMLCanvasElement; private g: G; private tex: THREE.CanvasTexture; private key = '';
  constructor(parent: THREE.Object3D, private k = 3) {
    this.cv = document.createElement('canvas'); this.cv.width = 600 * k; this.cv.height = 1000 * k;
    this.g = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(600 * SU, 1000 * SU); geo.translate(0, (500 - 25) * SU, 0);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }
  draw(key: string, fn: (g: G) => void) {
    if (key === this.key) return;
    this.key = key; const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height); g.setTransform(this.k, 0, 0, this.k, 0, 0);
    fn(g); this.tex.needsUpdate = true;
  }
  /** stand at `at` (soles), face the camera (yaw only) */
  place(at: V3, cam: THREE.Camera, lift = 0) {
    this.mesh.position.set(at[0], at[1] + lift, at[2]);
    this.mesh.rotation.set(0, Math.atan2(cam.position.x - at[0], cam.position.z - at[2]), 0);
  }
}

/** the owner's 3D planter's hat: cream, wide brim, dark band; flat shaded */
export function makeHat() {
  const g = new THREE.Group(), cream = new THREE.MeshStandardMaterial({ color: '#efe2bf', roughness: 0.8, flatShading: true });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.03, 20), cream); g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.19, 16), cream); crown.position.y = 0.11; g.add(crown);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), cream); top.scale.y = 0.35; top.position.y = 0.2; g.add(top);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.242, 0.246, 0.06, 16), new THREE.MeshStandardMaterial({ color: '#3a2420', roughness: 0.6, flatShading: true })); band.position.y = 0.045; g.add(band);
  // a dent along the crown
  const dent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: '#c8b890', flatShading: true })); dent.position.y = 0.26; g.add(dent);
  g.scale.setScalar(0.78); // brim about 1.35 head widths (round 1's read as a parasol)
  g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}
/** where the hat is: on the head until `launch`, then flying (up, toward screen-left, a little toward the camera) and
 *  tumbling; pure function of the frame */
export function hatPose(hat: THREE.Object3D, f: number, head: THREE.Vector3, cam: THREE.Camera, launch: number, o: { up?: number; left?: number; spin?: number; toward?: number; tau?: number; drift?: number } = {}) {
  const a = f - launch;
  if (a < 0) { hat.position.copy(head); hat.rotation.set(-0.12, 0.3, 0.05); return; }
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
  const toCam = cam.position.clone().sub(head).setY(0).normalize();
  const up = o.up ?? 0.075, left = o.left ?? 0.028, g = 0.0035, sp = o.spin ?? 1;
  if (o.tau) {
    // round 3, the end: a pop that eases out (speed up and left at launch, slowing with time constant tau) and then
    // drifts on left, so the hat hangs in the top-left of the frame for the whole shot, spinning about its crown with
    // the brim tipped toward the camera so it always reads as a hat (round 2's free tumble showed a flat disc and flew
    // out of frame in four frames)
    const k = o.tau * (1 - Math.exp(-a / o.tau));
    hat.position.copy(head).addScaledVector(right, -(left * k + (o.drift ?? 0) * a)).addScaledVector(toCam, (o.toward ?? 0) * a).add(new THREE.Vector3(0, up * k, 0));
    hat.rotation.set(0.55 + 0.25 * Math.sin(a * 0.45), 0.3 + 0.42 * a * sp, 0.35 + 0.2 * Math.sin(a * 0.3));
    return;
  }
  hat.position.copy(head).addScaledVector(right, -left * a).addScaledVector(toCam, (o.toward ?? 0.008) * a).add(new THREE.Vector3(0, up * a - 0.5 * g * a * a, 0));
  hat.rotation.set(-0.12 + 0.24 * a * sp, 0.3 + 0.16 * a * sp, 0.05 + 0.31 * a * sp);
}

// ---- the acting, frame by frame (clip frames) ------------------------------------------------------------------------------
/** blinks on ones: half, shut, half, one frame each, starting at each frame in `starts` */
const blink = (f: number, starts: number[]) => { for (const s of starts) { const k = Math.round(f) - s; if (k === 0 || k === 2) return 0.5; if (k === 1) return 1; } return 0; };
export function ownerDeck(f: number): OwnerState {
  // the reference beat by beat: content to 127; the sweat drop 128; still smiling but the teeth clench 130-131; the
  // smug half-lid 132 as the hat starts to lift; eyes pop and the near arm comes up 133; at 134 wide eyes, "o" mouth,
  // both arms up and the curl springing up, held while the hat tumbles away
  const F = Math.round(f);
  const base = { sit: true, arms: 'belly' as const, curl: false };
  if (F < 128) return { ...base, eyes: 'happy', mouth: 'smile' };
  if (F < 130) return { ...base, eyes: 'happy', mouth: 'smile', sweat: true };
  if (F < 132) return { ...base, eyes: 'happy', mouth: 'uneasy', sweat: true };
  if (F < 133) return { ...base, eyes: 'half', mouth: 'uneasy', sweat: true };
  if (F < 134) return { sit: true, arms: 'half', curl: false, eyes: 'pop', mouth: 'o', sweat: true };
  return { sit: true, arms: 'up', curl: true, eyes: 'wide', mouth: 'o', sweat: true };
}
/** the hat leaves his head as the half-lid lands (132) and flies up and to screen-right, tumbling (the reference's way) */
export const OWNER_HAT_LAUNCH = 132;
export const OWNER_HAT_FLIGHT = { up: 0.1, left: -0.06, spin: 0.8, toward: 0.035 };
export function engineerCanyon(f: number): EngState & { bob: number } {
  // B1, the reference beat by beat: smug half-lid with the grin, near hand on the hip, three-quarter (150-154); eyes open,
  // still three-quarter (155-158); the turn by drawing swap, tqlNear at 159, front at 160 with the eyes shut through
  // the swap (160-161, half at 162); the big grin, front (163-188) with blinks on ones at 167 and 185; the grin shrinks
  // to a smile (189) and a smirk (190-205) as he settles about 60 px down (179-191). B3: the blissful walk (247 on).
  const F = Math.round(f);
  const bob = -0.05 * smooth(prog(f, 179, 191)) + 0.012 * Math.sin(f * 0.2) * (f < 179 ? 1 : 0);
  if (F >= 247) return { view: 'front', eyes: 'happy', mouth: 'smile', walk: f * 0.42, bob: 0 };
  const view: View = F < 159 ? 'tql' : F < 160 ? 'tqlNear' : 'front';
  const arms = F < 163 ? 'hip' : 'down';
  if (F < 155) return { view, arms, eyes: 'half', mouth: 'grin', bob };
  if (F < 160) return { view, arms, eyes: 'open', mouth: 'grin', bob };
  if (F < 162) return { view, arms, eyes: 'shut', mouth: 'grin', bob };
  if (F < 163) return { view, arms, eyes: 'half', mouth: 'grin', bob };
  if (F < 189) return { view, arms, eyes: 'open', mouth: 'grin', lid: blink(f, [167, 185]), bob };
  if (F < 206) return { view, arms, eyes: 'open', mouth: F < 190 ? 'smile' : 'smirk', bob };
  return { view, arms, eyes: 'half', mouth: 'smirk', bob }; // the smug half-lid as the camera sinks past him (206-246)
}
export function engineerEnd(f: number): EngState { return { view: 'tqr', arms: 'down', eyes: 'wide', mouth: 'o', lid: blink(f, [464]) }; }
export function ownerEnd(f: number): OwnerState { void f; return { sit: false, arms: 'belly', curl: true, eyes: 'wide', mouth: 'o', sweat: true }; }
/** E: the hat leaves his head as the pair come up into frame and flies up and off screen-left, spinning */
export const END_HAT_LAUNCH = 453;
/** about 1.4 m up and 0.2 m left in the first 15 frames, then a slow drift left: it hangs in the top-left, above the
 *  owner, from 455 to 469 (the reference's bowler sits there the whole time) */
export const END_HAT_FLIGHT = { up: 0.24, left: 0.03, tau: 6, drift: 0.004, spin: 1, toward: 0.01 };
/** E: where the two stand on the viewing platform (soles), the owner in front and to the left, the engineer a step
 *  behind him to the right; both face the camera with the mushroom cloud behind them. Round 3: 0.35 m apart in depth
 *  and 0.8 m across, so the pair is one tight group. The camera sits about 4.7 m from them at 1.6-2 m up, looking past
 *  them at the stem (round-3/acting.md has the keys): heads about a quarter of the frame wide, the pair about 35% of the
 *  frame's height in its lower half. */
export const endMarks = (P: V3): { owner: V3; eng: V3 } => ({ owner: [P[0] - 0.45, 0, P[2] - 0.9], eng: [P[0] + 0.35, 0, P[2] - 1.25] });

// ---- a dark leg shadow on the ground ------------------------------------------------------------------------------------
/** the canyon ground under a person at x: the sleeper tops (0.232 m, sleepers 2.6 m long) inside the track, the
 *  ballast bed outside it, with a short step up over the sleeper ends */
export const canyonGround = (x: number) => 0.232 * smooth(prog(1.45 - Math.abs(x), 0, 0.25));
/** A soft violet shadow of the legs laid flat on the ground from the soles, pointing `dir` (horizontal, radians from +z),
 *  redrawn with the walk phase. The card's own cast shadow often falls behind the card where the camera cannot see it;
 *  this is the reference's dark leg shadow on the ballast. */
export class LegShadow {
  mesh: THREE.Mesh; private cv: HTMLCanvasElement; private g: G; private tex: THREE.CanvasTexture; private key = '';
  constructor(parent: THREE.Object3D, private len = 1.35, private wide = 0.75) {
    this.cv = document.createElement('canvas'); this.cv.width = 192; this.cv.height = 320;
    this.g = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    const geo = new THREE.PlaneGeometry(wide, len); geo.translate(0, -len / 2, 0); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, color: '#1a0c22', transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }
  update(at: V3, dir: number, phase: number | null, y = 0.06, opacity = 0.88) {
    const key = phase === null ? 'still' : (Math.round(phase * 8) / 8).toFixed(3);
    if (key !== this.key) {
      this.key = key; const g = this.g, W = this.cv.width, H = this.cv.height;
      g.clearRect(0, 0, W, H); g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineCap = 'round';
      // soles at the top edge (the feet), the hips about 0.45 down the shadow, a short fading body beyond
      const hip = H * 0.5;
      for (const side of [-1, 1]) {
        const a = phase === null ? 0 : side * 0.24 * Math.sin(phase);
        const fx = W / 2 + side * 26 + Math.sin(a) * 60, hx = W / 2 + side * 20;
        g.lineWidth = 34; g.beginPath(); g.moveTo(fx, 14); g.lineTo(hx, hip); g.stroke();
        g.beginPath(); g.ellipse(fx, 18, 28, 18, 0, 0, Math.PI * 2); g.fill();
      }
      const grd = g.createLinearGradient(0, hip - 20, 0, H);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(W / 2, hip + 60, 74, 110, 0, 0, Math.PI * 2); g.fill();
      this.tex.needsUpdate = true;
    }
    this.mesh.position.set(at[0], at[1] + y, at[2]);
    this.mesh.rotation.set(0, dir, 0);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
  }
}
export const keyOf = (s: object) => JSON.stringify(s);
