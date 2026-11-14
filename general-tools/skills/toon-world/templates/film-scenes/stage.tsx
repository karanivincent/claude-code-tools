// __SLUG__: one scene through the look stack. Every scene composition is a thin wrapper round this: it gives its
// story.ts (timing, beats, camera, people) and this builds the place, the cast and the splashes, lights them from the
// place light, runs ink, lens blur, bloom, tone map and grade, and plays the scene's slice of the film's one mix.
// Post toggles for checks: --props '{"post":{"ink":false}}', '{"nopost":true}' (no look stack), '{"strictCards":true}'.
import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, getInputProps, getStaticFiles, staticFile, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { InkPass, noInkFallback, NOINK } from '../../look/ink';
import { LensBlur } from '../../look/lensblur';
import { GradeEffect, GRADES } from '../../look/grade';
import { applyPlaceLight, keyFrom, fogOf } from '../../look/lights';
import { Cast, type PersonAt } from './cast';
import { PLACES, type PlaceName } from './places';
import { splash } from './places/parts/splash';
import { MIX, sceneFrom, WIDTH, HEIGHT } from './plan';
import type { Cam, V3 } from './joins';

/** what a scene's story.ts gives the stage */
export type SceneDef = {
  SCENE: string; FRAMES: number; PLACE: PlaceName;
  camAt: (f: number) => Cam;
  /** the point in focus (the lens blur's focus distance follows it) */
  focusAt: (f: number) => V3;
  /** the blur at infinity in px: 0 by default, backgrounds sharp (S3-35); at most 4 where the reference still is soft (S3-36) */
  dofAt?: (f: number) => number;
  people: (f: number) => PersonAt[];
  /** 0..1: the light cools and darkens (an after) */
  coldAt?: (f: number) => number;
  /** splashes: where on the water and the scene frame of contact */
  SPLASHES?: { at: V3; frame: number; scale?: number }[];
};

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass; const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920); // the same bloom at any render scale
  return b;
};
type Post = { ink: boolean; lens: boolean; bloom: boolean; grade: boolean };
const props = () => getInputProps() as { post?: Partial<Post>; nopost?: boolean };
const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const Inner: React.FC<{ s: SceneDef; f: number; pics: Record<string, HTMLImageElement | null> }> = ({ s, f, pics }) => {
  const { camera, scene } = useThree();
  const on = useMemo<Post>(() => ({ ink: true, lens: true, bloom: true, grade: true, ...(props().post ?? {}) }), []);
  const place = PLACES[s.PLACE], L = place.light, film0 = sceneFrom(s.SCENE);
  const world = useMemo(() => {
    const built = place.build(pics), root = new THREE.Group(); root.add(built.root);
    const sun = new THREE.DirectionalLight(L.keyCol, L.keyI);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    root.add(sun, sun.target);
    const cast = new Cast(); root.add(cast.root);
    const splashes = (s.SPLASHES ?? []).map((sp) => { const p = splash(sp.at, { scale: sp.scale }); root.add(p.root); return { p, frame: sp.frame }; });
    scene.add(root);
    const { fog, background } = fogOf(L); scene.fog = fog; scene.background = background;
    const c0 = s.camAt(0); // the key is camera-relative and frozen for the scene
    return { built, sun, cast, splashes, root, key: new THREE.Vector3(...keyFrom(c0.pos, c0.look, L.az, L.el)).normalize() };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES[L.grade], 1),
  }), [camera, scene, L.grade]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  const post = useMemo(() => (
    <EffectComposer multisampling={4}>
      {[
        on.ink ? <primitive key="ink" object={fx.ink} dispose={null} /> : null,
        on.lens ? <primitive key="pre" object={fx.lens.pre} dispose={null} /> : null,
        on.lens ? <primitive key="main" object={fx.lens.main} dispose={null} /> : null,
        on.bloom ? <primitive key="bloom" object={fx.bloom} dispose={null} /> : null,
        <primitive key="tone" object={fx.tone} dispose={null} />,
        on.grade ? <primitive key="grade" object={fx.grade} dispose={null} /> : null,
      ].filter((x): x is React.ReactElement => x !== null)}
    </EffectComposer>
  ), [fx, on]);
  // camera
  const c = s.camAt(f), cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ((c.roll * Math.PI) / 180);
  cam.fov = c.fov; cam.near = 0.05; cam.far = 220; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  cam.layers.enable(NOINK);
  // light
  const focus = new THREE.Vector3(...s.focusAt(f));
  world.sun.position.copy(focus).addScaledVector(world.key, 40); world.sun.target.position.copy(focus); world.sun.target.updateMatrixWorld();
  const sc = world.sun.shadow.camera;
  if (sc.right !== 9) { Object.assign(sc, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 100 }); sc.updateProjectionMatrix(); }
  applyPlaceLight(L, s.coldAt?.(f) ?? 0);
  // the world on the film's clock, the people and splashes on the scene's
  world.built.update(film0 + f);
  world.splashes.forEach(({ p, frame }) => p.update(f - frame));
  world.cast.update(s.people(f), cam, world.key, world.built.groundY);
  noInkFallback(world.root);
  cam.getWorldDirection(fwd);
  fpt.copy(focus);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = Math.min(4, s.dofAt?.(f) ?? 0); // sharp backgrounds (S3-35, S3-36)
  return props().nopost ? null : <>{post}</>;
};

const IMGS: Record<string, HTMLImageElement | null> = {};
const hasFile = (name: string) => getStaticFiles().some((x) => x.name === name);
/** preload a place's pictures once (a missing file gives null: the part builds its stand-in) */
const usePictures = (name: PlaceName) => {
  const want = Object.entries(PLACES[name].pictures ?? {});
  const [ready, setReady] = useState(want.every(([k]) => k in IMGS));
  useEffect(() => {
    if (ready) return;
    const h = delayRender(`pictures for ${name}`);
    Promise.all(want.map(([k, file]) => new Promise<void>((res) => {
      if (k in IMGS) return res();
      if (!hasFile(file)) { IMGS[k] = null; return res(); }
      const im = new Image(); im.onload = () => { IMGS[k] = im; res(); }; im.onerror = () => { IMGS[k] = null; res(); }; im.src = staticFile(file);
    }))).then(() => { setReady(true); continueRender(h); }).catch((e) => cancelRender(e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ready ? IMGS : null;
};

/** one scene: its canvas and, when it plays alone, its slice of the film's mix */
export const Stage: React.FC<{ s: SceneDef; audio?: boolean; children?: React.ReactNode }> = ({ s, audio = true, children }) => {
  const f = useCurrentFrame();
  const pics = usePictures(s.PLACE);
  const bg = PLACES[s.PLACE].light.background;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {pics && (
        <ThreeCanvas width={WIDTH} height={HEIGHT} shadows gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }} camera={{ fov: 40, near: 0.05, far: 220 }}>
          <Inner s={s} f={f} pics={pics} />
        </ThreeCanvas>
      )}
      {children}
      {audio && hasFile(MIX) && <Audio src={staticFile(MIX)} trimBefore={sceneFrom(s.SCENE)} />}
    </AbsoluteFill>
  );
};
