import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { ThreeCanvas } from '@remotion/three';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FONT } from '../../story/StoryCaptions';
import { makeTimeline, type Data, type Timeline } from '../../story/timeline';
import { GradeShader, applyGrade } from './grade';
import { buildWorld } from './worlds';
import { layersAt, flashAt, FRAMES, FAST, type Cam, type Place } from './shots';
import full from './full.json';

// The railroads practice copy, round 1: the last 15.7 s of the Ricks Clips railroads Short (story 49.5 to 65.18 s) in a
// "game world" look (docs/practice/railroads-gameworld-brief.md). Clip frame 0 is the story's 49.5 s.
// One ThreeCanvas per place, layered by opacity for the dissolves (shots.ts layersAt); each canvas renders through its
// own post stack: the scene into a half-float target (so emissive things keep values over 1), bloom with threshold 1
// (only the hot rails, lamps, headlamp, sparks and fire bloom), the output transform, then the grade (lifted violet
// blacks, the place's tint; grade.ts), and a mild depth of field where part4.md notes one. No ink lines on the world.

const T = makeTimeline(full as unknown as Data);

const Scene: React.FC<{ f: number; place: Place; c: Cam }> = ({ f, place, c }) => {
  const { camera, scene, gl, size } = useThree();
  const built = useMemo(() => {
    scene.clear();
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const world = buildWorld(place, scene, camera);
    // reflections for the metals (rails, brass, the boiler): a small environment map made from the place's own sky
    const sky = scene.children.find(o => o.renderOrder === -10);
    if (sky) { const env = new THREE.Scene(); env.add(sky.clone()); const pm = new THREE.PMREMGenerator(gl); scene.environment = pm.fromScene(env, 0.02).texture; scene.environmentIntensity = 0.7; pm.dispose(); }
    const pr = gl.getPixelRatio(), w = size.width * pr, h = size.height * pr;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, rt);
    composer.addPass(new RenderPass(scene, camera));
    const [s, r, th] = world.post.bloom;
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), s, r, th));
    composer.addPass(new OutputPass());
    const grade = new ShaderPass(GradeShader);
    applyGrade(grade.uniforms as unknown as typeof GradeShader.uniforms, world.post.grade);
    (grade.uniforms as unknown as typeof GradeShader.uniforms).px.value.set(1 / w, 1 / h);
    composer.addPass(grade);
    return { world, composer };
  }, [gl, scene, camera, place, size.width, size.height]);
  built.world.frame(f, c);
  useFrame(() => { built.composer.render(); }, 1);
  return null;
};
const View: React.FC<{ f: number; place: Place; c: Cam; w: number; h: number }> = ({ f, place, c, w, h }) => (
  <ThreeCanvas width={w} height={h} shadows camera={{ fov: 50, near: 0.03, far: 8000, position: [0, 2, 10] }} gl={{ antialias: true }}>
    <Scene f={f} place={place} c={c} />
  </ThreeCanvas>
);

// ---- words on the screen: one word at a time (clip 4's Captions) -----------------------------------------------------------
type Chunk = { text: string; s: number; e: number };
const cache = new WeakMap<Timeline, Chunk[]>();
function chunksOf(TL: Timeline): Chunk[] {
  const hit = cache.get(TL); if (hit) return hit;
  const out: Chunk[] = [];
  for (const l of TL.lines) for (const w of l.words) out.push({ text: w.w.replace(/[“”"]/g, ''), s: w.s - 0.04, e: w.e });
  if (out[0]) out[0].s = Math.max(0.02, out[0].s);
  out.forEach((c, i) => { const n = out[i + 1]; c.e = n && n.s - c.e < 0.5 ? n.s : c.e + 0.25; });
  cache.set(TL, out);
  return out;
}
const Captions: React.FC<{ t: number; TL: Timeline }> = ({ t, TL }) => {
  const c = chunksOf(TL).find(x => t >= x.s && t < x.e);
  if (!c) return null;
  const size = Math.min(100, 760 / (c.text.length * 0.62));
  return (
    <div style={{ position: 'absolute', left: 140, width: 800, top: 1200, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1, whiteSpace: 'nowrap', color: '#FFFFFF',
      textShadow: '0 4px 14px rgba(0,0,0,0.45)', WebkitTextStroke: `${Math.round(size * 0.16)}px #000`, paintOrder: 'stroke fill' }}>{c.text}</div>
  );
};

/** contact-sheet frames (clip frames): the beats of the shot list */
export const SHEET_FRAMES = [0, 10, 20, 30, 40, 60, 90, 105, 125, 134, 140, 160, 185, 210, 240, 255, 270, 290, 300, 320, 345, 365, 372, 385, 398, 405, 420, 435, 445, 452, 460, 469];
/** the places for one frame. Inside the motion blur the sub-frame moves the camera only: the world (people, effects)
 *  stays on the whole frame `world`, so a card's pose never doubles into ghosted arms. The blur's samples run over
 *  (frame + 1 - shutter, frame + 1]; shifting by `centre` puts them either side of the frame. */
const Layers: React.FC<{ fixed?: number; world?: number; centre?: number }> = ({ fixed, world, centre = 0 }) => {
  const frame = useCurrentFrame();
  const fc = fixed ?? frame - centre;
  const fw = world ?? fc;
  return <>{layersAt(fc).map(l => (
    <AbsoluteFill key={l.place} style={{ opacity: l.k }}><View f={fw} place={l.place} c={l.cam} w={1080} h={1920} /></AbsoluteFill>
  ))}</>;
};
const SHUTTER = 90, SAMPLES = 6;
export const PracticeRailroads: React.FC<{ audio?: string; captions?: boolean; frames?: number[]; blur?: boolean }> = ({ audio = '', captions = true, frames, blur = true }) => {
  const frame = useCurrentFrame();
  const f = frames ? frames[Math.min(frame, frames.length - 1)] : frame;
  const flash = flashAt(f);
  // camera motion blur (@remotion/motion-blur) on the fastest move only (the swing off the rail): camera-only samples
  const fast = blur && !frames && FAST.some(([a, b]) => f >= a && f <= b);
  return (
    <AbsoluteFill style={{ backgroundColor: '#2a2232' }}>
      {fast ? <CameraMotionBlur shutterAngle={SHUTTER} samples={SAMPLES}><Layers world={f} centre={1 - SHUTTER / 720} /></CameraMotionBlur> : <Layers fixed={f} />}
      {/* fx: the flash is a white-hot heart with gold edges over the volume fireball, never a flat cream frame */}
      {flash > 0 && <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 55% at 50% 62%, rgba(255,253,246,1) 0%, rgba(255,240,196,0.92) 38%, rgba(255,196,96,0.55) 72%, rgba(255,150,40,0) 100%)', opacity: flash * 0.7 }} />}
      {captions && <Captions t={f / 30} TL={T} />}
      {audio && !frames && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
export default PracticeRailroads;
export { FRAMES };
