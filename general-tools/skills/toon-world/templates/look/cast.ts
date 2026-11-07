// From the cartoon-3d-short skill, github.com/mromidev/claude-animated-shorts (commit e3b817b), MIT licence: see
// LICENSE-cartoon-3d-short beside this file. Adapted for Bible in Clay's ancient jar test (an interior grade preset,
// extra hats and props in toon.ts, our cast in cast.ts); lights.ts is unchanged from the original.
// The ancient jar practice copy in the cartoon-3d-short skill's look: our cast as lit flat cards (their toon.ts drawing
// API and cardShade lighting), on round 2's marks and round 2's acting beats, mapped onto their expression library.
// Our own designs: the emperor in a plum robe and a squat gold crown, two bronze-helmeted guards with spears, the
// inventor in a slate robe and a tall black scholar's cap, and a court of six along the runner.
// Pool / Actor / Fx below are the skill's (templates/bridge/cast.ts, MIT), unchanged.
import * as THREE from "three";
import { Pen, bodyFront, fxContact, Outfit, Expr, FrontOpts, SKINS } from "./toon";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
import { MARKS, FEED_DRAGON, ballHome, dragonPoint, toadMouth, BALL_RADIUS, JAR } from "../practice-ancient-jar/sets-hall";
import { STAND } from "../practice-ancient-jar/cards";

type V3 = [number, number, number];
type P2 = [number, number];
const FPS = 30;
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}


// ---------------- our people ----------------
export const OUTFITS: Record<string, Outfit> = {
  inventor: { jacket: "#c9a25a", pants: "#3b3f52", boots: "#2a2228", dress: "#4f6e8c", hat: "scholar", skin: SKINS[1] },
  emperor: { jacket: "#e0b44a", pants: "#3b2a3a", boots: "#3b2230", dress: "#7a2c5c", hat: "crown", build: "stout", moustache: "#2a1e22", skin: SKINS[2] },
  guard: { jacket: "#2f7a6a", pants: "#4a3a2a", boots: "#2a2228", hat: "helmet", spear: true, belt: "#c9a25a", buttons: "#e0b44a" },
};
const COURT: { o: Outfit; at: V3 }[] = [
  { o: { jacket: "#e8d9b0", pants: "#333", boots: "#2a2228", dress: "#b0573a", hat: "hair", hair: "#2a1e22", skin: SKINS[0] }, at: [-1.2, 0, -7.3] },
  { o: { jacket: "#d9c08a", pants: "#333", boots: "#2a2228", dress: "#3f7d5a", hat: "hair", hair: "#5a3b2a", skin: SKINS[3] }, at: [-1.85, 0, -7.7] },
  { o: { jacket: "#efe2c8", pants: "#333", boots: "#2a2228", dress: "#6a5aa8", hat: "scholar", skin: SKINS[1] }, at: [-2.3, 0, -6.6] },
  { o: { jacket: "#e8d9b0", pants: "#333", boots: "#2a2228", dress: "#c4873a", hat: "hair", hair: "#1e1a20", skin: SKINS[2] }, at: [1.2, 0, -7.3] },
  { o: { jacket: "#d9c08a", pants: "#333", boots: "#2a2228", dress: "#2f5f8a", hat: "scholar", skin: SKINS[0] }, at: [1.85, 0, -7.7] },
  { o: { jacket: "#efe2c8", pants: "#333", boots: "#2a2228", dress: "#9a3a3a", hat: "hair", hair: "#6a4a2a", skin: SKINS[3] }, at: [2.3, 0, -6.6] },
];

const sm = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const span = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const ha = (t: number, rate = 7.2) => Math.abs(Math.sin(t * Math.PI * rate));
const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 60) => Math.round(v * n) / n;
/** the skill's blink: gaps 0.5-2.3 s, 4 frames half / shut / shut / half */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number) => {
  const f = Math.round(t * FPS);
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) { const k = f - s; if (k >= 0 && k < 4) return LID[k]; s += Math.round(15 + 54 * hh(i * 31 + n, 13)); }
  return 0;
};
const tier = (d: number): [number, number, number] => d < 3.2 ? [1200, 2000, 2.0] : d < 6.5 ? [900, 1500, 1.5] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

export type Acting = { expr: Expr; tilt?: number; headTilt?: number; bob?: number; hand?: P2; handL?: P2; look?: number };
/** round 2's beats (practice-ancient-jar/cards.ts acting), in the skill's expressions; reactions 2 frames early */
export function acting(t: number) {
  const L = 2 / FPS; t += L;
  const inv: Acting = { expr: "neutral" };
  if (t < 2.05) inv.expr = t > 0.42 && t < 1.6 ? "whistle" : t < 0.5 ? "stern" : "smile";
  else if (t < 3.07) inv.expr = "smile";
  else if (t < 4.4) { inv.expr = t > 3.9 ? "stern" : "smile"; const up = span(t, 3.1, 3.4); inv.hand = [300 + 100 + 70 * up, 600 - 330 * up]; }
  else if (t < 5.3) { inv.expr = "shock"; inv.handL = [300 - 130, 300 - 40 * span(t, 4.7, 4.8)]; }
  else inv.expr = "nervous";
  const emp: Acting = { expr: "stern" };
  if (t >= 5.55 && t < 5.8) emp.expr = "smile";
  else if (t >= 5.8) { const h = ha(t), fold = span(t, 6.1, 6.35) * (1 - 0.6 * span(t, 7.2, 8.2)); emp.expr = "laugh"; emp.bob = 0.025 * h; emp.tilt = -16 * fold; emp.headTilt = 8 * fold; }
  const gl: Acting = { expr: "stern" };
  if (t >= 5.95 && t < 6.15) gl.expr = "smile_closed";
  else if (t >= 6.15) { gl.expr = "laugh"; gl.bob = 0.025 * ha(t + 0.1, 6.6); gl.tilt = 6 * span(t, 6.15, 6.4); }
  const gr: Acting = { expr: "neutral", look: -1 };
  if (t >= 5.45 && t < 6.15) gr.expr = "smile";
  else if (t >= 6.15) { gr.expr = "laugh"; gr.bob = 0.03 * ha(t + 0.05, 7.6); gr.tilt = -5 * span(t, 6.15, 6.35); }
  const court = COURT.map((_, i): Acting => {
    const t0 = 5.95 + 0.07 * i;
    if (t < t0) return { expr: i % 2 ? "neutral" : "stern" };
    return { expr: i % 3 === 1 ? "grin" : "laugh", bob: 0.025 * ha(t + i * 0.13, 6.4 + i * 0.4), tilt: (i % 2 ? 5 : -5) * span(t, t0, t0 + 0.3) };
  });
  // the fed ball (home on the clink at 1.5) and the tongs drawn back 1.6-2.0; the ghost ball falls on "drops"
  const feed = t < 1.5 ? 0.8 * sm(t / 1.0) + 0.2 * sm((t - 1.0) / 0.5) : 1;
  const tongsBack = span(t, 1.6, 2.0);
  let ghost: V3 | null = null;
  if (t >= 3.93 && t < 4.95) { const k = Math.min(1, (t - 3.93) / 0.4), h = ballHome(FEED_DRAGON), m = toadMouth(FEED_DRAGON); ghost = [h[0], h[1] + (m[1] - h[1]) * k * k, h[2]]; }
  return { inv, emp, gl, gr, court, feed, tongsBack, ghost };
}

/** contact blob under a standing card (the skill's tight violet pool) */
const contactCol = "#4a3d5c";

export class Cast {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private tongs = new THREE.Group();
  private rod: THREE.Mesh; private prongA: THREE.Mesh; private prongB: THREE.Mesh; private ring: THREE.Mesh;
  constructor() {
    const iron = new THREE.MeshLambertMaterial({ color: "#2a2228" });
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 10), iron);
    this.prongA = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 1, 8), iron); this.prongB = this.prongA.clone();
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 8, 20), iron);
    this.tongs.add(this.rod, this.prongA, this.prongB, this.ring); this.root.add(this.tongs);
    this.tongs.traverse((o) => { o.frustumCulled = false; });
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  /** poses everyone for time t; `sun` = world direction toward the key light; `balls` = the jar's eight balls */
  update(t: number, cam: THREE.PerspectiveCamera, sun: THREE.Vector3, balls: THREE.Object3D[], ghost: THREE.Mesh, showPeople: boolean, showInventor: boolean) {
    const A = acting(t);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const lightAng = Math.round(Math.atan2(-sun.y, sun.dot(right)) / (Math.PI / 4)) * (Math.PI / 4);
    // ---- the balls, the ghost, the tongs (round 2's feed, in 3D) ----
    const home = new THREE.Vector3(...ballHome(FEED_DRAGON)), inv = new THREE.Vector3(...MARKS.inventor);
    const toward = inv.clone().setY(home.y).sub(home).normalize();
    const snout = new THREE.Vector3(...dragonPoint(FEED_DRAGON, "snout")).sub(home).setY(0).normalize();
    const start = home.clone().addScaledVector(snout, 0.45).addScaledVector(toward, 0.1).add(new THREE.Vector3(0, -0.12, 0));
    const grip = home.clone().addScaledVector(snout, 0.62).addScaledVector(toward, 0.12).add(new THREE.Vector3(0, -0.3, 0));
    balls.forEach((b, i) => b.position.set(...ballHome(i)));
    const ball = start.clone().lerp(home, A.feed);
    balls[FEED_DRAGON].position.copy(ball);
    ghost.visible = !!A.ghost; if (A.ghost) ghost.position.set(...A.ghost);
    let invHand: P2 | undefined;
    this.tongs.visible = showInventor && t < 2.05 && A.tongsBack < 1;
    if (this.tongs.visible) {
      const Y = new THREE.Vector3(0, 1, 0);
      const place = (m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => { const d = b.clone().sub(a), n = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Y, d.normalize()); m.scale.set(1, n, 1); };
      const tipW = ball.clone().lerp(grip, A.tongsBack * 0.6);
      let handW = grip.clone().lerp(inv.clone().add(new THREE.Vector3(0, 1.05, 0)), A.tongsBack * 0.5);
      // the hand on the card: design units (SU m each), x along the camera's right, soles at y 975; arm reach 0.62 m
      const shoulder = inv.clone().addScaledVector(right, 0.17).add(new THREE.Vector3(0, (975 - 447) * SU, 0));
      const v = handW.clone().sub(shoulder); if (v.length() > 0.62) handW = shoulder.clone().addScaledVector(v.normalize(), 0.62);
      invHand = [300 + handW.clone().sub(inv).dot(right) / SU, 975 - (handW.y - inv.y) / SU];
      const dir = tipW.clone().sub(handW).normalize(), side = new THREE.Vector3().crossVectors(dir, Y).normalize();
      const jawEnd = tipW.clone().addScaledVector(dir, -BALL_RADIUS * 1.3);
      place(this.rod, handW, jawEnd);
      place(this.prongA, jawEnd.clone().addScaledVector(side, 0.02), tipW.clone().addScaledVector(side, BALL_RADIUS * 0.95).addScaledVector(dir, 0.03));
      place(this.prongB, jawEnd.clone().addScaledVector(side, -0.02), tipW.clone().addScaledVector(side, -BALL_RADIUS * 0.95).addScaledVector(dir, 0.03));
      this.ring.position.copy(handW).addScaledVector(dir, -0.035); this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    }
    // ---- people ----
    type P = { key: string; o: Outfit; at: V3; a: Acting; seed: number; scale?: number };
    const people: P[] = [];
    if (showInventor) people.push({ key: "inv", o: OUTFITS.inventor, at: MARKS.inventor, a: { ...A.inv, hand: invHand ?? A.inv.hand }, seed: 3, scale: 1.05 });
    if (showPeople) {
      people.push({ key: "emp", o: OUTFITS.emperor, at: STAND.emperor, a: A.emp, seed: 6, scale: 1.08 });
      people.push({ key: "gl", o: OUTFITS.guard, at: STAND.guardL, a: A.gl, seed: 2 });
      people.push({ key: "gr", o: { ...OUTFITS.guard, jacket: "#2a6a7a" }, at: STAND.guardR, a: A.gr, seed: 5 });
      if (t > 5.2) COURT.forEach((c, i) => people.push({ key: "c" + i, o: c.o, at: c.at, a: A.court[i], seed: 1 + ((i * 3) % 7) }));
    }
    let ai = 0, fi = 0;
    const used: Actor[] = [], fused: Fx[] = [];
    people.forEach((p, i) => {
      const sc = p.scale ?? 1;
      const d = cam.position.distanceTo(new THREE.Vector3(p.at[0], p.at[1] + 1.2, p.at[2])) / sc;
      const [w, h, k] = tier(d);
      const fo: FrontOpts = { mode: "stand", expr: p.a.expr, tilt: p.a.tilt ? q(p.a.tilt, 2) : 0, headTilt: p.a.headTilt ? q(p.a.headTilt, 2) : 0,
        blink: lidAt(t, i + 1), light: lightAng, seed: p.seed, look: p.a.look ?? 0,
        hand: p.a.hand ? [Math.round(p.a.hand[0]), Math.round(p.a.hand[1])] : undefined, handL: p.a.handL ? [Math.round(p.a.handL[0]), Math.round(p.a.handL[1])] : undefined };
      const a = this.actor(ai++);
      a.r = this.pool.req(`${p.key}|${JSON.stringify(fo)}`, w, h, k, (pen) => bodyFront(pen, p.o, fo));
      a.mesh.visible = true;
      a.mesh.position.set(p.at[0], p.at[1] + (p.a.bob ?? 0), p.at[2]);
      a.mesh.rotation.set(0, Math.atan2(cam.position.x - p.at[0], cam.position.z - p.at[2]), 0);
      a.mesh.scale.set(sc, sc, sc);
      used.push(a);
      const e = this.fx(fi++);
      e.r = this.pool.req("blob|contact|" + contactCol, 128, 128, 1, (pen) => fxContact(pen, contactCol));
      e.mesh.visible = true; e.mesh.position.set(p.at[0], p.at[1] + 0.02, p.at[2]); e.mesh.rotation.set(-Math.PI / 2, 0, 0);
      e.mesh.scale.set(0.62 * sc, 0.46 * sc, 1);
      fused.push(e);
    });
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    used.forEach((a) => a.bind()); fused.forEach((e) => e.bind());
    void JAR;
  }
}
