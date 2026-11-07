import React, { useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FONT } from '../../story/StoryCaptions';
import { Timeline, clamp } from '../../story/timeline';
import { PAJ } from '../practice-ancient-jar/PracticeAncientJar';
import { Cam, FOCUS, makeCamera } from '../practice-ancient-jar/shots';
import { buildCast, castFx } from '../practice-ancient-jar/cards';
import { buildWorld } from '../practice-ancient-jar/world';
import { hallProps } from '../spike-blend/SpikeBlend';
import { findLights } from '../practice-ancient-jar-views/views-kit';
import { PLAN, V3, buildHall, cutTiles, pixels, projectorDepth, wideProjector, wx } from './hall3d';
import { Fire, PropName, dust, loadProps, placeProp, shaft } from './fx3d';

// The ancient jar practice copy, 0 to 10 s, in the throne hall built as a real 3D set from the realistic pictures
// (out/practice/ancient-jar/hall3d/report.md). Round 2's timeline, sound, cast, acting and camera, imported unchanged.
//   the room       hall3d.ts: geometry to the plan measured off real-wide, coloured by projection from real-wide's
//                  fitted camera, tiles cut from the picture where it never sees a surface, lit by real lights
//   hero props     the throne, the candelabra (twice), the fire bowl (twice) and the chest (twice): Higgsfield
//                  image-to-3D models of the pictures' props (fx3d.ts placeProp)
//   pop            flames in the fire bowls, torches and candles, a glow on each, the windows glowing, light shafts and
//                  dust in them, bloom over all of it
//   the jar        round 2's 3D jar, bronze and gold, its dragons, balls and toads
//   the people     round 2's cards, tinted to the room's light, with a stronger contact shadow

const CAMERA = makeCamera(PAJ);
const D = 'practice-ancient-jar-3d/';

interface Assets { wide: HTMLImageElement; throne: HTMLImageElement; props: Record<PropName, THREE.Object3D> }
function useAssets(): Assets | null {
  const [handle] = useState(() => delayRender('hall 3d assets', { timeoutInMilliseconds: 120000 }));
  const [a, setA] = useState<Assets | null>(null);
  useEffect(() => {
    const load = (u: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`could not load ${u}`)); i.src = staticFile(u); });
    Promise.all([load('practice-ancient-jar-views/real-wide.jpg'), load('practice-ancient-jar-views/real-throne.jpg'), loadProps(n => staticFile(`${D}${n}.glb`))])
      .then(([wide, throne, props]) => { setA({ wide, throne, props }); continueRender(handle); })
      .catch(err => cancelRender(err));
  }, [handle]);
  return a;
}

/** real-throne's curtains for the alcove: the crop between the canopy and the dais, the throne painted out by mirroring
 * the fabric either side of it over it (the model throne and the emperor stand in front) */
function curtainTexture(img: HTMLImageElement) {
  const x0 = 150, x1 = 1250, y0 = 905, y1 = 1790;
  const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
  const g = c.getContext('2d')!; g.drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  // the throne spans x 515..1005, from y 990 down: fill it with the fabric strips beside it, mirrored inward
  const L = 515 - x0, R = 1005 - x0, top = 990 - y0, h = c.height - top, sw = 120;
  for (let x = L; x < R; x += sw) {
    const fromLeft = x - L < (R - L) / 2, w = Math.min(sw, R - x);
    g.save(); g.translate(x + w / 2, 0); g.scale(-1, 1); g.translate(-(x + w / 2), 0);
    g.drawImage(c, fromLeft ? L - sw : R, top, w, h, x, top, w, h);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const PRESET_TINT: Record<string, string> = { hall: '#eadccb', throne: '#f0d9c0', close: '#f2d8bc' };

const Scene: React.FC<{ t: number; c: Cam; a: Assets; debug?: string }> = ({ t, c, a, debug = '' }) => {
  const { camera, scene, gl, size } = useThree();
  const built = useMemo(() => {
    const w = buildWorld(gl, scene); scene.add(w.root);
    hallProps(w).forEach(p => { p.visible = false; });
    const P = wideProjector();
    const pic = new THREE.Texture(a.wide); pic.colorSpace = THREE.SRGBColorSpace; pic.anisotropy = 8; pic.needsUpdate = true;
    const tiles = cutTiles(pixels(a.wide));
    const dummy = new THREE.DepthTexture(1, 1);
    const hall = buildHall(P, dummy, pic, curtainTexture(a.throne), tiles);
    scene.add(hall.root);
    // the hero props, to the plan's sizes
    const props = new THREE.Group(); scene.add(props);
    const throne = placeProp(a.props.throne, hall.throneAt, PLAN.throne.h, 0, { sx: 1.25, metal: 0.35, rough: 0.45 });
    props.add(throne);
    const candelabra = hall.candleBases.map(p => placeProp(a.props.candelabra, p, PLAN.candelabra.h, 0, { metal: 0.55, rough: 0.38 }));
    candelabra.forEach(o => props.add(o));
    const bowls = hall.bowlSpots.map(p => placeProp(a.props.firebowl, p, 1.42, 0, { metal: 0.4, rough: 0.55 }));
    bowls.forEach(o => props.add(o));
    const chests = hall.chestAt.map(([x, z, s]) => placeProp(a.props.chest, [x, 0, z], 0.82, s * Math.PI / 2, { metal: 0.2, rough: 0.6 }));
    chests.forEach(o => props.add(o));
    // what real-wide's camera sees nearest, so its colours land only on what it saw
    const depth = projectorDepth(gl, scene, P);
    hall.root.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; const U = m?.userData?.hallUniforms; if (U) U.uDepth.value = depth; });

    // the fires: the bowls, the torches, the candles (five per candelabrum, one light each)
    const fires: Fire[] = [];
    const fx = new THREE.Group(); scene.add(fx);
    bowls.forEach((b, i) => { const f = new Fire({ w: 0.95, h: 1.15, seed: 1 + i * 3.1, glow: 0.55, light: { colour: '#ff8a3a', intensity: 9, distance: 9 } }); f.root.position.set(b.position.x, 1.42 - 0.12, b.position.z); fx.add(f.root); fires.push(f); });
    hall.torchTips.forEach((p, i) => { const f = new Fire({ w: 0.36, h: 0.62, seed: 7 + i * 1.7, glow: 0.5, light: { colour: '#ffa04a', intensity: 4, distance: 6 } }); f.root.position.set(...p); fx.add(f.root); fires.push(f); });
    const k = PLAN.candelabra.h / 1.79;
    const CANDLES: [number, number][] = [[0, 1.79], [-0.19, 1.63], [0.19, 1.63], [-0.35, 1.5], [0.35, 1.5]];
    candelabra.forEach((cd, j) => CANDLES.forEach(([x, y], i) => {
      const f = new Fire({ w: 0.08, h: 0.17, seed: 20 + j * 5 + i, glow: 0.45, gain: 2.8, glowColour: '#ffc070', light: i === 0 ? { colour: '#ffc070', intensity: 6, distance: 7 } : undefined });
      f.root.position.set(cd.position.x + x * k, cd.position.y + y * k + 0.01, cd.position.z); fx.add(f.root); fires.push(f);
    }));
    // cool daylight through the windows: a broad spot from behind them, the shafts and the dust
    const sun = new THREE.SpotLight('#c8d8ff', 40, 45, 0.55, 0.8, 1.0);
    sun.position.set(0, 11.5, PLAN.back - 1.5); sun.target.position.set(0, 0, 1.0); scene.add(sun, sun.target);
    const SH = PLAN.lancets.xs.map(x => ({ from: [wx(x), 9.4, PLAN.back + 0.1] as V3, to: [wx(x) * 1.5, 0, 4.0] as V3, r0: 0.42, r1: 1.7 }));
    const roseShaft = { from: [0, PLAN.rose.y, PLAN.back + 0.1] as V3, to: [0, 0, 9.0] as V3, r0: 1.6, r1: 3.6 };
    SH.forEach(s => fx.add(shaft(s.from, s.to, s.r0, s.r1, 0.035)));
    fx.add(shaft(roseShaft.from, roseShaft.to, roseShaft.r0, roseShaft.r1, 0.018, '#d8d0ff'));
    const motes = dust([...SH, roseShaft], 260, 7); fx.add(motes);

    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width / 2, size.height / 2), 0.35, 0.5, 1.3);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    composer.setSize(size.width, size.height);
    return { world: w, lights: findLights(w), fires, motes, composer, throne, fx };
  }, [gl, scene, a, camera, size.width, size.height]);
  const cast = useMemo(() => { const k = buildCast(); scene.add(k.root); return k; }, [scene]);
  const { world, lights: L, fires, motes, composer } = built;
  built.fx.visible = !debug.includes('nofx');

  scene.fog = new THREE.Fog('#3A2C22', 9, 46);   // usePreset recolours the fog on a preset change; it is taken off below
  world.usePreset(c.preset, FOCUS[c.preset] ?? c.look, 16, [0.3, 0.85, -0.75]);
  gl.toneMapping = THREE.NeutralToneMapping;
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...c.pos); cam.fov = c.fov; cam.near = 0.05; cam.far = 300; cam.updateProjectionMatrix();
  cam.lookAt(...c.look); cam.updateMatrixWorld(true);
  world.aim(cam); world.tick(t);
  // the room's light over round 2's: the old fire lights off (the new fires carry their own), a soft sky, the key from
  // the windows for the jar's and the props' shadows, no haze
  for (const f of L.fires) f.intensity = 0;
  L.hemi.color.set('#d6d3d0'); L.hemi.groundColor.set('#6e6052'); L.hemi.intensity = 0.4;
  L.key.color.set('#fff0dc'); L.key.intensity = 0.9; L.key.shadow.intensity = 0.6;
  L.fill.color.set('#ffe6cc'); L.fill.intensity = 0.15;
  scene.fog = null; scene.background = null; scene.environmentIntensity = 0.35;
  gl.toneMappingExposure = 0.93;
  for (const f of fires) f.tick(t, cam);
  (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  (motes.material as THREE.ShaderMaterial).uniforms.uPx.value = size.height;
  cast.update(t, cam, world);
  cast.cards.inventor.root.visible = t < CAMERA.tFade;
  // the cards: tinted to the room's light, a darker and wider contact shadow
  const tint = PRESET_TINT[c.preset] ?? '#ffffff';
  for (const card of Object.values(cast.cards)) {
    card.mat.color.set(tint);
    if (card.shadow) { card.shadow.scale.set(1.5, 1, 1.35); (card.shadow.material as THREE.MeshBasicMaterial).opacity = 0.95; }
  }
  if (debug.includes('nojar')) { world.jar.visible = false; world.balls.forEach(b => { b.visible = false; }); world.toads.forEach(o => { o.visible = false; }); world.dragons.forEach(o => { o.visible = false; }); cast.root.visible = false; }
  gl.setClearColor('#241E26', 1);
  useFrame(() => { composer.render(); }, 1);
  return null;
};
const View: React.FC<{ t: number; c: Cam; w: number; h: number; a: Assets; debug?: string }> = ({ t, c, w, h, a, debug }) => (
  <ThreeCanvas width={w} height={h} shadows camera={{ fov: 40, near: 0.05, far: 300, position: [0, 2, 10] }} gl={{ antialias: true }}>
    <Scene t={t} c={c} a={a} debug={debug} />
  </ThreeCanvas>
);

// ---- speed lines and words: as the other practice compositions ----------------------------------------------------
const SPEED = Array.from({ length: 34 }, (_, i) => { const a = (i / 34) * Math.PI * 2 + Math.sin(i * 7.3) * 0.08; return { a, r0: 0.42 + 0.12 * Math.abs(Math.sin(i * 3.1)), w: 2 + 3 * Math.abs(Math.sin(i * 5.7)) }; });
const SpeedLines: React.FC<{ k: number; w: number; h: number }> = ({ k, w, h }) => (
  <svg width={w} height={h} style={{ position: 'absolute', inset: 0, opacity: k }}>
    {SPEED.map((l, i) => { const cx = w * 0.5, cy = h * 0.42, R = Math.hypot(w, h); return <line key={i} x1={cx + Math.cos(l.a) * R * l.r0} y1={cy + Math.sin(l.a) * R * l.r0} x2={cx + Math.cos(l.a) * R} y2={cy + Math.sin(l.a) * R} stroke="#FFFFFF" strokeWidth={l.w} strokeOpacity={0.85} />; })}
  </svg>
);
type Chunk = { text: string; s: number; e: number };
const cache = new WeakMap<Timeline, Chunk[]>();
function chunksOf(T: Timeline): Chunk[] {
  const hit = cache.get(T); if (hit) return hit;
  const out: Chunk[] = [];
  for (const l of T.lines) for (const w of l.words) out.push({ text: w.w.replace(/[“”"]/g, '').replace(/[.,:;?!]+$/, '').replace(/—.*$/, ''), s: w.s - 0.04, e: w.e });
  if (out[0]) out[0].s = 0;
  out.forEach((c, i) => { const n = out[i + 1]; c.e = n && n.s - c.e < 0.5 ? n.s : c.e + 0.25; });
  cache.set(T, out);
  return out;
}
const Captions: React.FC<{ t: number; T: Timeline }> = ({ t, T }) => {
  const c = chunksOf(T).find(x => t >= x.s && t < x.e);
  if (!c) return null;
  const pop = clamp((t - c.s) / 0.06), size = Math.min(100, 760 / (c.text.length * 0.62));
  return (
    <div style={{ position: 'absolute', left: 140, width: 800, top: 1194, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1, whiteSpace: 'nowrap', color: '#FFFFFF',
      textShadow: '0 4px 14px rgba(0,0,0,0.45)', WebkitTextStroke: `${Math.round(size * 0.16)}px #000`, paintOrder: 'stroke fill', transform: `scale(${0.92 + 0.08 * pop})` }}>{c.text}</div>
  );
};

export const PracticeAncientJar3D: React.FC<{ audio?: string; at?: number; captions?: boolean; cam?: Cam; debug?: string }> = ({ audio = 'practice-ancient-jar/full/mix.wav', at: atT, captions = true, cam, debug }) => {
  const { width, height: h, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const a = useAssets();
  const t = atT ?? frame / fps;
  const f = cam ? { cam, blur: 0 } as ReturnType<typeof CAMERA.at> : CAMERA.at(t);
  const blur = f.blur * (width / 1080);
  return (
    <AbsoluteFill style={{ backgroundColor: '#241E26' }}>
      {blur > 0.3 && <svg width={0} height={0} style={{ position: 'absolute' }}><filter id="paj3d-whip"><feGaussianBlur stdDeviation={`${blur.toFixed(1)} ${(blur * (f.even ? 1 : 0.08)).toFixed(2)}`} /></filter></svg>}
      {a && <AbsoluteFill style={blur > 0.3 ? { filter: 'url(#paj3d-whip)' } : undefined}>
        <View t={t} c={f.cam} w={width} h={h} a={a} debug={debug} />
      </AbsoluteFill>}
      {a && f.dissolve && <AbsoluteFill style={{ opacity: f.dissolve.k, ...(blur > 0.3 ? { filter: 'url(#paj3d-whip)' } : {}) }}><View t={t} c={f.dissolve.cam} w={width} h={h} a={a} debug={debug} /></AbsoluteFill>}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 45%, rgba(0,0,0,0) 62%, rgba(20,16,30,0.25) 100%)' }} />
      {castFx(t).speed > 0 && <SpeedLines k={castFx(t).speed} w={width} h={h} />}
      {captions && <Captions t={t} T={PAJ} />}
      {audio && atT === undefined && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
export default PracticeAncientJar3D;
