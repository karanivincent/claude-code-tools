// __SLUG__: the cast, shared by every scene. People are lit flat cards (look/toon.ts bodyFront, look/cardshade.ts):
// a wide card (1100 x 1000 design units, the 600-wide figure at its centre) so arms thrown wide and spread legs are
// not clipped, a pool that redraws a card only when its pose changes, contact blobs under standing feet.
// Two card faults are refused here (Elijah and the widow 2D, critic round 2, 11 November 2026):
//  - a hand held out sideways ran off the card's canvas and showed as "an arm ending in a stub": every hand point is
//    pulled back toward its shoulder until it is inside the card (toon-kit clampHand), and every card is checked for
//    a drawing cut by its canvas right after it is drawn (toon-kit edgeTouches; `?strictCards` makes it throw);
//  - a talking face lost its expression: talking sets `talk` on the drawing, which keeps the expression's own mouth
//    and opens the lips under it (look/toon.ts talkLips), never a swap to another face.
// Replace the stand-in people with the story's. Every figure: its own head shape (seed), its own build, its own colours.
// Each person's size is in sizes.ts (set once by the shots stage, S5-74), never per scene.

import * as THREE from 'three';
import { getInputProps } from 'remotion';
import { Pen, bodyFront, fxBlob, SKINS, setFaceStyle, type FrontOpts, type Outfit } from '../../look/toon';
import { sizeOf } from './sizes';
import { NOINK } from '../../look/ink';
import { cardShade, blobMaterial, CARD_K } from '../../look/cardshade';
import { clampHand, edgeTouches } from '../../toon-kit/cards';

// Faces drawn the soft way (the cliff film, November 2026): the shock face's white ring eyes read as glasses or as
// another person in four judgings, and the nervous face's sweat drop as a blob on the hair. Off here, the old drawing
// stays the default for older stories (X-8).
setFaceStyle({ shockRings: false, sweat: false });

export type V3 = [number, number, number];
type P2 = [number, number];

// ---------------- the people (stand-ins: replace) ----------------
export const CAST: Record<string, Outfit> = {
  hero: { jacket: '#2a9d8f', pants: '#3b5b9a', boots: '#f4f1ea', hat: 'cap', cap: '#e2453c', skin: SKINS[1] },
  friend: { jacket: '#f0b43c', pants: '#4a4458', boots: '#5a3b2a', hat: 'hair', hair: '#2a1d18', skin: SKINS[3] },
};
/** each person's head shape (bodyFront seed): no two people in a shot share one */
export const SEED: Record<string, number> = { hero: 3, friend: 11 };

/** one person on one frame: where they stand (soles), their drawing, the card's lean (a turn in the air, about the body's
 *  middle), squash/stretch, and whether a contact blob sits under their feet */
export type PersonAt = { who: string; at: V3; opts: FrontOpts; lean?: number; sx?: number; sy?: number; ground?: boolean; hidden?: boolean };

// ---------------- the card pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; check: boolean; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
/** every card cut by its canvas this render (the stills sheet and the pose sheet print them) */
export const CARD_CUTS: string[] = [];
const strict = () => !!(getInputProps() as { strictCards?: boolean }).strictCards;
export class Pool {
  private live = new Map<string, Entry>(); private free: Entry[] = []; private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void, check = true) { const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw, check }; this.reqs.push(r); return r; }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext('2d', { willReadFrequently: true })!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g)); e.tex.needsUpdate = true; this.live.set(key, e);
        if (r.check) { // the canvas border check, on every card right after it is drawn (soles may touch the bottom)
          g.setTransform(1, 0, 0, 1, 0, 0);
          const cut = edgeTouches(g.getImageData(0, 0, e.w, e.h), { allow: ['bottom'] });
          if (cut.length) {
            const msg = `card ${r.key.split('|').slice(0, 2).join('|')}: cut by its canvas at ${cut.map((c) => `${c.side} (${c.x}, ${c.y})`).join(', ')}`;
            CARD_CUTS.push(msg); console.warn(msg);
            if (strict()) throw new Error(msg);
          }
        }
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}
const blank = (() => { const c = document.createElement('canvas'); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
/** design units to metres; the card is CW wide with the figure's 600-wide design space starting at CX - 300 */
export const SU = 0.00216, CW = 1100, CX = 550;
const WIDE = (() => { const g = new THREE.PlaneGeometry(CW * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const QUAD = new THREE.PlaneGeometry(1, 1);
class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(WIDE, this.mat); this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = 'YXZ'; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK); parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
class Blob {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) { this.mat = blobMaterial(blank); this.mesh = new THREE.Mesh(QUAD, this.mat); this.mesh.visible = false; this.mesh.layers.set(NOINK); this.mesh.renderOrder = 0.5; parent.add(this.mesh); }
  bind() { const t = this.r?.tex; if (!t) return; if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; } this.mat.map = t; this.mat.needsUpdate = true; }
}

// ---------------- drawing rules ----------------
const q = (v: number, n = 1) => Math.round(v * n) / n;
const tier = (d: number): number => (d < 2.2 ? 2.0 : d < 4.6 ? 1.6 : 1.0);
/** a hand point kept inside the wide card (design space, x from -250 to 850), pulled back toward its shoulder */
const inCard = (h: P2, side: -1 | 1, drop = 0): P2 => {
  const off = CX - 300, sh: P2 = [300 + side * 76 + off, 447 + drop];
  const c = clampHand([h[0] + off, h[1]], { w: CW, h: 1000, shoulder: sh });
  return [q(c[0] - off), q(c[1])];
};
/** the drawing a card is made from: hands kept in the card, numbers rounded so the pool reuses cards */
export const cardOpts = (o: FrontOpts, light: number): FrontOpts => {
  const d = o.drop ?? 0;
  return {
    ...o, light, drop: o.drop === undefined ? undefined : q(d), lookY: o.lookY === undefined ? undefined : q(o.lookY),
    hand: o.hand && inCard(o.hand, 1, d), handL: o.handL && inCard(o.handL, -1, d),
    armsAt: o.armsAt && ([[[q(o.armsAt[0][0][0]), q(o.armsAt[0][0][1])], inCard(o.armsAt[0][1], -1, d), o.armsAt[0][2]], [[q(o.armsAt[1][0][0]), q(o.armsAt[1][0][1])], inCard(o.armsAt[1][1], 1, d), o.armsAt[1][2]]] as FrontOpts['armsAt']),
    tilt: q(o.tilt ?? 0, 2), headTilt: q(o.headTilt ?? 0, 2), phase: q(o.phase ?? 0, 20), wave: o.wave === undefined ? undefined : q(o.wave, 10),
    talk: o.talk === undefined ? undefined : q(o.talk, 4), hairSwing: o.hairSwing === undefined ? undefined : q(o.hairSwing), capLift: o.capLift === undefined ? undefined : q(o.capLift),
    blink: typeof o.blink === 'number' ? q(o.blink, 2) : o.blink ? 1 : 0,
    exprK: o.exprK === undefined ? undefined : q(o.exprK, 20),
  };
};
/** draw one person's card on a pen (the pose sheet uses it too, so it shows exactly what the film draws) */
export const drawCard = (pen: Pen, who: string, opts: FrontOpts) => { pen.g.translate(CX - 300, 0); bodyFront(pen, CAST[who], { seed: SEED[who], ...opts }); };

const contactCol = '#4a3d5c';
export class Cast {
  root = new THREE.Group();
  private pool = new Pool(); private actors: Actor[] = []; private blobs: Blob[] = [];
  update(people: PersonAt[], cam: THREE.PerspectiveCamera, key: THREE.Vector3, groundY: (x: number, z: number) => number = () => 0) {
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const lightAng = Math.round(Math.atan2(-key.y, key.dot(right)) / (Math.PI / 4)) * (Math.PI / 4);
    const shown = people.filter((p) => !p.hidden);
    while (this.actors.length < shown.length) { this.actors.push(new Actor(this.root)); this.blobs.push(new Blob(this.root)); }
    shown.forEach((p, i) => {
      const a = this.actors[i], b = this.blobs[i], at = p.at, lean = p.lean ?? 0;
      const qo = cardOpts(p.opts, lightAng);
      const k = tier(cam.position.distanceTo(new THREE.Vector3(at[0], at[1] + 1, at[2])));
      a.r = this.pool.req(`${p.who}|${JSON.stringify(qo)}`, Math.round(CW * k), Math.round(1000 * k), k, (pen) => drawCard(pen, p.who, qo));
      a.mesh.visible = true; a.mesh.position.set(...at);
      const size = sizeOf(p.who);
      a.mesh.rotation.set(0, Math.atan2(cam.position.x - at[0], cam.position.z - at[2]), lean); a.mesh.scale.set((p.sx ?? 1) * size[0], (p.sy ?? 1) * size[1], 1);
      if (lean) { // turn about the body's middle (0.9 m up), not the soles
        const h = 0.9 * size[1], ox = h * Math.sin(lean), oy = h - h * Math.cos(lean), ry = a.mesh.rotation.y;
        a.mesh.position.x += ox * Math.cos(ry); a.mesh.position.z -= ox * Math.sin(ry); a.mesh.position.y += oy;
      }
      const onGround = p.ground ?? Math.abs(at[1] - groundY(at[0], at[2])) < 0.05;
      b.r = this.pool.req('blob|' + contactCol, 128, 128, 1, (pen) => fxBlob(pen, contactCol), false);
      b.mesh.visible = onGround;
      if (onGround) { b.mesh.position.set(at[0], at[1] + 0.03, at[2]); b.mesh.rotation.set(-Math.PI / 2, 0, 0); b.mesh.scale.set(0.7, 0.32, 1); }
    });
    for (let i = shown.length; i < this.actors.length; i++) { this.actors[i].mesh.visible = false; this.blobs[i].mesh.visible = false; }
    this.pool.flush();
    shown.forEach((_, i) => { this.actors[i].bind(); if (this.blobs[i].mesh.visible) this.blobs[i].bind(); });
  }
}
