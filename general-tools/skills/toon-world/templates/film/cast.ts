import * as THREE from 'three';
import { Pen, bodyFront, fxContact, type Expr, type FrontOpts, type Outfit, SKINS } from '../../look/toon';
import { NOINK } from '../../look/ink';
import { cardShade, blobMaterial, CARD_K } from '../../look/cardshade';
import { clampHand, edgeTouches } from '../../toon-kit/cards';

// The cast: bean-head people (the look's toon.ts) as lit cards in the 3D world. The Stage calls `new Cast()`, adds
// `cast.root`, and every frame `cast.update(t, cam, sunDir, people)`. Replace OUTFITS with the story's people; keep
// the card rules below, each from a round it cost:
//  - lit by cardshade (the scene's light colour, a side gradient toward the sun, a bright floor in cast shadow), never
//    MeshBasicMaterial: an unlit card looks pasted on (the cartoon-3d-short reports, lighting 9.2).
//  - depth test on, always (alphaTest 0.5, depthWrite): with it off WebGL writes no depth, so the ink pass drew world
//    lines through faces and the lens blur blurred people as if they were the wall behind (Elijah r1: a jug's outline
//    through the widow's face). A card that must show through a solid it lies in (a boy on a mattress) passes
//    `over: true`: still depth-tested, but passing always and pulled toward the lens (depthFunc Always, polygonOffset
//    -6 / -6000), so it writes its depth in front and no bed outline crosses it (Elijah critic round 2).
//  - hands inside the card's own 600 x 1000 canvas (toon-kit clampHand): a hand held out sideways ran off the canvas
//    and only the arm showed (Elijah critic round 2, "an arm ending in a stub").
//  - the expression is kept while talking: talking opens the mouth only where the look has the same eyes and brows
//    with an open mouth (TALK); it never swaps the face for another expression's (Elijah r2: a sad widow turned
//    neutral on every word).
//  - mittens for hands (decision 2, 11 November 2026: the fingers rule is for clay figures only).

export type V3 = [number, number, number];
export interface Person {
  key: string; who: string; at: V3;
  expr?: Expr;
  /** 0..1 how open the talking mouth is this frame (from the voice's words, toon-kit TL.talk) */
  talk?: number;
  /** hand points in the card's design space (x 0..600, y 0..1000, soles at 975), kept inside the canvas */
  hand?: [number, number]; handL?: [number, number];
  mode?: FrontOpts['mode']; facing?: -1 | 0 | 1; look?: number; tilt?: number; headTilt?: number; blink?: number;
  scale?: number; roll?: number; lift?: number; vis?: boolean;
  /** shows through a solid it lies in (see above); default false */
  over?: boolean;
  order?: number;
  /** what the acting audit compares between frames (P() fills it): everything that changes when the person acts */
  fo: Record<string, unknown>;
}
/** the story's people. `who` keys; a stand-in until the cast sheet is approved */
export const OUTFITS: Record<string, Outfit> = {
  a: { jacket: '#d9a441', pants: '#3b3f52', boots: '#5a3b2a', dress: '#2f6f8f', hat: 'hair', hair: '#2a1e22', skin: SKINS[2] },
};
export const SEEDS: Record<string, number> = { a: 3 };
/** a child is smaller: who -> scale */
export const SCALE: Record<string, number> = {};

/** a person; `fo` is filled from the acting options, so the audit sees every change */
export function P(key: string, who: string, at: V3, o: Partial<Omit<Person, 'key' | 'who' | 'at' | 'fo'>> = {}): Person {
  const { expr = 'neutral', talk = 0, hand, handL, mode = 'stand', facing = 0, look = 0, tilt = 0, headTilt = 0 } = o;
  return { key, who, at, scale: SCALE[who] ?? 1, ...o, fo: { expr, talk: Math.round(talk * 4) / 4, hand, handL, mode, facing, look, tilt, headTilt } };
}

/** talking: the open-mouth face with exactly the same eyes and brows as the expression (toon.ts FACE). An expression
 *  with no such twin keeps its face while talking; a story whose drawing has its own talking mouth (Elijah's bean.ts)
 *  draws it over the base mouth instead. Add a pair here only when toon.ts gains one. */
const TALK: Partial<Record<Expr, Expr>> = { relief: 'relief_open' };
const faceOf = (expr: Expr, talk: number): Expr => (talk > 0.3 && TALK[expr] ? TALK[expr]! : expr);

/** metres per design unit: 1000 units = 2.16 m (the look's toon.ts); soles at y 975 */
const SU = 0.00216;
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
/** canvas size by distance: sharp close, cheap far (the look's tiers) */
const tier = (d: number): [number, number, number] => d < 3.2 ? [1200, 2000, 2.0] : d < 6.5 ? [900, 1500, 1.5] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];
/** the shoulders in design space (adult build): where clampHand pulls a hand back along its arm */
const SHOULDER = { x: 90, y: 440 };

class Card {
  canvas = document.createElement('canvas'); tex: THREE.CanvasTexture; mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; blob: THREE.Mesh; key = '';
  constructor(root: THREE.Object3D, blobTex: THREE.Texture) {
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 16;
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.depthTest = true; this.mat.depthWrite = true;
    this.mesh = new THREE.Mesh(BODY, this.mat);
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.receiveShadow = true; this.mesh.layers.set(NOINK); this.mesh.userData.card = true; this.mesh.frustumCulled = false;
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMaterial(blobTex));
    this.blob.layers.set(NOINK); this.blob.userData.card = true; this.blob.renderOrder = 0.5;
    root.add(this.mesh, this.blob);
  }
  draw(p: Person, cam: THREE.PerspectiveCamera, t: number, light: number) {
    const sc = p.scale ?? 1, d = cam.position.distanceTo(new THREE.Vector3(p.at[0], p.at[1] + 1.2, p.at[2])) / sc;
    const [w, h, k] = tier(d), o = OUTFITS[p.who];
    if (!o) throw new Error(`cast: no outfit for "${p.who}" (OUTFITS in cast.ts)`);
    const sh = (side: 1 | -1): [number, number] => [300 + side * SHOULDER.x, SHOULDER.y];
    const fo: FrontOpts = {
      mode: p.mode ?? 'stand', expr: faceOf(p.expr ?? 'neutral', p.talk ?? 0), look: p.look ?? 0, tilt: p.tilt ?? 0, headTilt: p.headTilt ?? 0,
      facing: p.facing ?? 0, blink: p.blink ?? 0, light, seed: SEEDS[p.who] ?? 1,
      hand: p.hand && clampHand(p.hand, { shoulder: sh(1) }), handL: p.handL && clampHand(p.handL, { shoulder: sh(-1) }),
    };
    const key = `${w}x${h}|${p.who}|${JSON.stringify(fo)}`;
    if (key !== this.key) {
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
        this.tex.dispose(); this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 16;
        this.mat.map = this.tex; this.mat.needsUpdate = true;
      }
      const g = this.canvas.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.setTransform(k, 0, 0, k, 0, 0);
      bodyFront(new Pen(g), o, fo);
      this.tex.needsUpdate = true; this.key = key;
      // the canvas border check on every redraw during the audit (toon-kit edgeTouches): a drawing cut by its canvas
      if ((globalThis as { TOON_AUDIT?: boolean }).TOON_AUDIT) {
        const cut = edgeTouches(g.getImageData(0, 0, w, h), { allow: ['bottom'] });   // the soles sit at 975 of 1000
        if (cut.length) console.log('EDGE ' + JSON.stringify({ t: +t.toFixed(3), key: p.key, who: p.who, sides: cut.map(e => e.side) }));
      }
    }
    const over = !!p.over;
    if (this.mat.depthFunc !== (over ? THREE.AlwaysDepth : THREE.LessEqualDepth)) {
      this.mat.depthTest = true; this.mat.depthFunc = over ? THREE.AlwaysDepth : THREE.LessEqualDepth;
      this.mat.polygonOffset = over; this.mat.polygonOffsetFactor = over ? -6 : 0; this.mat.polygonOffsetUnits = over ? -6000 : 0;
      this.mat.needsUpdate = true;
    }
    this.mesh.visible = p.vis !== false; this.blob.visible = p.vis !== false && !p.roll && !p.over;
    this.mesh.position.set(p.at[0], p.at[1] + (p.lift ?? 0), p.at[2]);
    this.mesh.rotation.set(0, Math.atan2(cam.position.x - p.at[0], cam.position.z - p.at[2]), -(p.roll ?? 0), 'YXZ');
    this.mesh.scale.setScalar(sc);
    this.mesh.renderOrder = 1 + (p.order ?? 0);
    this.blob.position.set(p.at[0], p.at[1] + 0.02, p.at[2]); this.blob.scale.set(0.62 * sc, 1, 0.46 * sc);
  }
  hide() { this.mesh.visible = false; this.blob.visible = false; }
}

export class Cast {
  root = new THREE.Group();
  private cards = new Map<string, Card>();
  private blobTex: THREE.CanvasTexture;
  constructor() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    fxContact(new Pen(c.getContext('2d')!), '#4a3d5c');
    this.blobTex = new THREE.CanvasTexture(c); this.blobTex.generateMipmaps = false; this.blobTex.minFilter = THREE.LinearFilter;
  }
  /** poses everyone for time t; `sun` is the world direction toward the key light */
  update(t: number, cam: THREE.PerspectiveCamera, sun: THREE.Vector3, people: Person[]) {
    void t;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    // the painted crescent and thick outline face the light, in 45 degree steps (the look's toon.ts)
    const light = Math.round(Math.atan2(-sun.y, sun.dot(right)) / (Math.PI / 4)) * (Math.PI / 4);
    const seen = new Set<string>();
    for (const p of people) {
      let c = this.cards.get(p.key);
      if (!c) { c = new Card(this.root, this.blobTex); this.cards.set(p.key, c); }
      c.draw(p, cam, t, light); seen.add(p.key);
    }
    for (const [k, c] of this.cards) if (!seen.has(k)) c.hide();
  }
}
