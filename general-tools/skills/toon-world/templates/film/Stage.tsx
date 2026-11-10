import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { AbsoluteFill, cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { InkPass, NOINK, noInkFallback } from '../../look/ink';
import { LensBlur } from '../../look/lensblur';
import { GradeEffect, GRADES, gradeFor } from '../../look/grade';
import { LIGHTS, type LightPreset } from '../../look/lights';
import { TONE, CHAR } from '../../look/shade';
import { Cast, Person, SCALE } from './cast';
import { PLACES, PlaceName } from './places';
import { STORY } from './story';
import { Built, Loaded, PlaceDef, Shot, View } from './place';

// The stage: one shot of one place through the look stack. The film (Film.tsx) and the still board (Board, below)
// both draw through it. Places load lazily (only when a shot of them plays) and stay cached, so a place builds once.
// Needs: TypeScript 5, @react-three/postprocessing 3.0.4 and postprocessing 6.39.5 (3.2 renders blank frames).

type LoadedPlace = { def: PlaceDef; a: Loaded };
const CACHE = new Map<PlaceName, Promise<LoadedPlace>>();
const DONE = new Map<PlaceName, LoadedPlace>();
export function loadPlace(place: PlaceName): Promise<LoadedPlace> {
  let p = CACHE.get(place);
  if (!p) {
    const D = `${STORY.slug}/`;
    const img = (u: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`could not load ${u}`)); i.src = staticFile(u); });
    p = PLACES[place]().then(async (def) => {
      const pics = await Promise.all(def.pictures.map(n => img(`${D}pictures/${n}`)));
      const glbs = await Promise.all(def.models.map(n => new GLTFLoader().loadAsync(staticFile(`${D}models/${n}`)).then(g => g.scene)));
      const r = { def, a: { img: Object.fromEntries(def.pictures.map((n, i) => [n, pics[i]])), glb: Object.fromEntries(def.models.map((n, i) => [n, glbs[i]])) } };
      DONE.set(place, r);
      return r;
    });
    CACHE.set(place, p);
  }
  return p;
}
/** the place, or null while it loads (the render waits for it) */
export function useLoaded(place: PlaceName): LoadedPlace | null {
  const [r, setR] = useState<{ place: PlaceName; v: LoadedPlace } | null>(() => (DONE.has(place) ? { place, v: DONE.get(place)! } : null));
  useEffect(() => {
    if (DONE.has(place)) { setR({ place, v: DONE.get(place)! }); return; }
    const handle = delayRender(`place ${place}`, { timeoutInMilliseconds: 180000 });
    loadPlace(place).then(v => { setR({ place, v }); continueRender(handle); }).catch(err => cancelRender(err));
  }, [place]);
  return DONE.get(place) ?? (r && r.place === place ? r.v : null);
}

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  // the bloom's size follows the frame height, so a quarter-scale audit or still blooms like the full render
  const mip = b.mipmapBlurPass; const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};
const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

/** what the board leaves alone and the film may change on a shot: people (the segment's acting) and the blur */
export interface Take { t?: number; view?: View; people?: (base: Person[]) => Person[]; focus?: Shot['focus']; blur?: number; relight?: Relight }
/** a thumbnail-only re-light of the same moment (story-thumbnails: bright cards are lit, never brightened after):
 *  light presets over the place's own, the key light's strength, and a tint on the unlit pictures (sky, painted leaves) */
export interface Relight { light?: Partial<LightPreset>; key?: number; pictures?: number; fog?: string;
  /** a lighter sky over the place's own picture: [top colour, horizon colour], screened on at `skyMix` (0 to 1) */
  sky?: [string, string]; skyMix?: number }

/** the film's camera and clock for this frame, from the shot's own view, any shot's view, and the shot's start time */
export type FrameView = (shotView: View, other: (shot: string) => View, shotT: number) => { view: View; t: number };

/** scale the colour of every unlit picture material (MeshBasic: the sky screen, glow cards stay as they are above 1) */
function relightPictures(scene: THREE.Scene, k: number) {
  scene.traverse(o => {
    const m = (o as THREE.Mesh).material as (THREE.MeshBasicMaterial | THREE.MeshLambertMaterial) & { userData: { c0?: THREE.Color } } | undefined;
    const mm = m as unknown as { isMeshBasicMaterial?: boolean; isMeshLambertMaterial?: boolean };
    if (!m || Array.isArray(m) || !m.color || !(mm.isMeshBasicMaterial || mm.isMeshLambertMaterial)) return;
    if (o.renderOrder > 0) return;   // props drawn over the world (papers, cards) keep their own colour
    if (k === 1 && !m.userData.c0) return;
    m.userData.c0 ??= m.color.clone();
    m.color.copy(m.userData.c0).multiplyScalar(k);
  });
}

/** the sky screens (renderOrder -10) get a lighter sky: the place's picture, then a vertical gradient screened over it */
const SKIES = new Map<string, THREE.Texture>(), OURS = new WeakSet<THREE.Texture>();
function relightSky(scene: THREE.Scene, sky: [string, string], mix: number) {

  scene.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    if (o.renderOrder !== -10 || !m || Array.isArray(m) || !m.map || OURS.has(m.map)) return;
    const src = m.map, id = `${src.uuid}|${sky.join()}|${mix}`;
    let t = SKIES.get(id);
    if (!t) {
      const img = src.image as CanvasImageSource & { width: number; height: number };
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const c = cv.getContext('2d')!; c.drawImage(img, 0, 0);
      const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
      c.globalAlpha = mix; c.globalCompositeOperation = 'screen'; c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
      t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.repeat.copy(src.repeat); t.offset.copy(src.offset);
      OURS.add(t); SKIES.set(id, t);
    }
    m.map = t; m.needsUpdate = true;
  });
}

export const Stage: React.FC<{ def: PlaceDef; a: Loaded; shot: string; take?: Take; frameView?: FrameView; debug?: string; filmT?: number }> = ({ def, a, shot, take = {}, frameView, debug = '', filmT }) => {
  const { camera, scene, size } = useThree();
  const W = useMemo(() => {
    const built: Built = def.build(scene, a);
    scene.background = new THREE.Color(def.background);
    const cast = new Cast(); scene.add(cast.root);
    const sun = new THREE.DirectionalLight(def.sunColour ?? '#fff3e0', 2.6);
    const box = def.shadow ?? 16;
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 300 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun, sun.target);
    scene.traverse(o => { o.frustumCulled = false; });
    return { built, cast, sun };
  }, [scene, def, a]);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera, { widthNear: 4.6, widthFar: 3.0 }),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES[def.grade], 1),
  }), [camera, scene, def]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  const post = useMemo(() => (
    <EffectComposer multisampling={4}>
      <primitive object={fx.ink} dispose={null} />
      <primitive object={fx.lens.pre} dispose={null} />
      <primitive object={fx.lens.main} dispose={null} />
      <primitive object={fx.bloom} dispose={null} />
      <primitive object={fx.tone} dispose={null} />
      <primitive object={fx.grade} dispose={null} />
    </EffectComposer>
  ), [fx]);
  const shotFn = def.shots[shot];
  if (!shotFn) throw new Error(`the place has no shot "${shot}" (it has ${Object.keys(def.shots).join(', ')})`);
  const other = (n: string) => {
    const f = def.shots[n];
    if (!f) throw new Error(`to: "${n}" is not a shot of this place`);
    return f(W.built).view;
  };
  const B0 = shotFn(W.built);
  const fv = frameView?.(B0.view, other, B0.t ?? 0);
  // the film's clock reaches the shot so its people move; the camera is the board's view eased by the film
  const S0 = fv ? { ...shotFn(W.built, fv.t), view: B0.view } : B0;
  const S: Shot = { ...S0, view: fv?.view ?? take.view ?? S0.view, t: fv?.t ?? take.t ?? S0.t, people: take.people ? take.people(S0.people ?? []) : S0.people,
    focus: take.focus ?? S0.focus, blur: take.blur ?? S0.blur };
  const v = S.view, t = S.t ?? 0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...v.pos); cam.up.set(0, 1, 0); cam.lookAt(...v.look);
  if (v.roll) cam.rotateZ(v.roll);
  cam.fov = v.fov; cam.near = 0.05; cam.far = 3000; cam.aspect = size.width / size.height; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  cam.layers.enable(NOINK);
  const P = { ...LIGHTS[def.grade], ...(def.light ?? {}), ...(take.relight?.light ?? {}) };
  W.sun.intensity = 2.6 * (take.relight?.key ?? 1);
  relightPictures(scene, take.relight?.pictures ?? 1);
  if (take.relight?.fog && scene.fog) (scene.fog as THREE.Fog).color.set(take.relight.fog);
  TONE.uLitCol.value.set(...P.lit); TONE.uShadeCol.value.set(...P.shade); TONE.uShadeLift.value.set(...P.lift);
  TONE.uLambert.value = P.lambert; TONE.uSideK.value = P.sideK; TONE.uTerm.value = P.term; TONE.uSat.value = 1; TONE.uBounce.value.set(0, 0, 0);
  CHAR.uCharTint.value.set(...P.charTint); CHAR.uCharShade.value = P.charShade; CHAR.uGrad.value = P.charGrad; CHAR.uBodyGrad.value = P.bodyGrad; CHAR.uSideTint.value.set(...P.sideTint);
  const sunDir = new THREE.Vector3(...def.sun).normalize(), focus = new THREE.Vector3(...(S.focus ?? v.look));
  W.sun.position.copy(focus).addScaledVector(sunDir, 120); W.sun.target.position.copy(focus); W.sun.target.updateMatrixWorld();
  W.built.update?.(shot, t, cam);
  if (take.relight?.sky) relightSky(scene, take.relight.sky, take.relight.skyMix ?? 0.5);
  W.cast.update(t, cam, sunDir, S.people ?? []);
  // the acting audit (toon-kit acting.ts): one sample per frame, logged instead of judged by eye after a render
  if (debug.includes('audit') && filmT !== undefined) {
    const pr = (p: THREE.Vector3): [number, number] => { const q = p.clone().project(cam); return [+((q.x + 1) / 2).toFixed(3), +((1 - q.y) / 2).toFixed(3)]; };
    // only people in front of the lens and at least partly in frame: one behind the camera or wholly off screen
    // would read as a cut head with a negative height
    const inView = (p: Person) => {
      const sc = SCALE[p.who] ?? 1, y0 = p.at[1] + (p.lift ?? 0);
      const feetW = new THREE.Vector3(p.at[0], y0, p.at[2]);
      if (feetW.clone().applyMatrix4(cam.matrixWorldInverse).z >= -0.05) return false;
      const f = pr(feetW), c = pr(new THREE.Vector3(p.at[0], y0 + STORY.topY * sc, p.at[2]));
      const x0 = Math.min(f[0], c[0]), x1 = Math.max(f[0], c[0]), ya = Math.min(f[1], c[1]), yb = Math.max(f[1], c[1]);
      return x1 > 0 && x0 < 1 && yb > 0 && ya < 1;
    };
    const people = (S.people ?? []).filter(p => p.vis !== false && inView(p)).map(p => {
      const sc = SCALE[p.who] ?? 1, { blink: _b, light: _l, ...fo } = p.fo as Record<string, unknown>;
      void _b; void _l;
      const r = (x: number) => Math.round(x / 0.03);
      const sig = JSON.stringify([fo, p.at.map(r), p.roll ? Math.round(p.roll * 20) : 0, p.lift ? r(p.lift) : 0]);
      const y0 = p.at[1] + (p.lift ?? 0);
      const head = pr(new THREE.Vector3(p.at[0], y0 + STORY.headY * sc, p.at[2]));
      const top = pr(new THREE.Vector3(p.at[0], y0 + STORY.topY * sc, p.at[2]));
      const feet = pr(new THREE.Vector3(p.at[0], y0, p.at[2]));
      return { key: p.key, sig, head, feet, height: +(feet[1] - top[1]).toFixed(3), named: STORY.named.has(String(p.who)) };
    });
    const props = (S.props ?? []).map(q => ({ name: q.name, holder: q.holder, at: pr(new THREE.Vector3(...q.at)), hand: q.hand ? pr(new THREE.Vector3(...q.hand)) : undefined }));
    console.log('AUDIT ' + JSON.stringify({ t: +filmT.toFixed(3), shot, people, props }));
  }
  gradeFor(fx.grade, def.grade);
  noInkFallback(scene);
  cam.getWorldDirection(fwd);
  fpt.copy(focus);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  // background blur: every shot with people blurs what is behind them (at least 11 px, close shots more), so the
  // characters stay the sharpest thing in frame; blur: 0 keeps a flat or map shot sharp
  const blurPx = S.blur === 0 ? 0 : Math.max(S.blur ?? 12, 11) * (S.blur && S.blur >= 6 ? 1.6 : 1.1);
  fx.lens.cInf = blurPx * (size.width / 1080);
  return debug.includes('nopost') ? null : <>{post}</>;
};

/** the shot board: one still of any shot of any place, props { place, shot } */
export const Board: React.FC<{ place: PlaceName; shot: string; debug?: string }> = ({ place, shot, debug = '' }) => {
  const r = useLoaded(place);
  return (
    <AbsoluteFill style={{ backgroundColor: STORY.background }}>
      {r && <ThreeCanvas width={1080} height={1920} shadows gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }} camera={{ fov: 40, near: 0.05, far: 3000 }}>
        <Stage def={r.def} a={r.a} shot={shot} debug={debug} />
      </ThreeCanvas>}
    </AbsoluteFill>
  );
};
export default Board;
