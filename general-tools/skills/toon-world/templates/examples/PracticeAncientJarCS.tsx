// The ancient jar practice copy, 0 to 10 s, made with the cartoon-3d-short skill (github.com/mromidev/claude-animated-
// shorts, MIT): its look stack on our throne hall. docs/practice/ancient-jar-cartoon-3d-short-test.md has the result.
//   kept from the skill (copied from templates/bridge, unchanged unless noted): ink.ts (ink lines on the 3D world),
//     lensblur.ts (thin-lens DOF), grade.ts (+ an interior preset), shade.ts (two-tone world shading, violet shade),
//     cardshade.ts (lit character cards), toon.ts (bean-head cards; + our crown, helmet, scholar cap, spear, free hands),
//     the composer order ink -> lens pre -> lens main -> bloom (emissive only) -> NEUTRAL tone map -> grade, MSAA 4.
//   ours: round 2's hall plan and jar (practice-ancient-jar/sets-hall.ts) re-materialled into the skill's two-tone
//     Lambert/Phong, round 2's camera journey and timing (shots.ts), round 2's narration mix, round 2's acting beats.
// No captions (the skill's rule). One extra canvas is stacked only while the camera dissolves or whips.
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, Audio, getInputProps, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { InkPass, noInkFallback, NOINK } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GradeParams } from "./grade";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { Cast } from "./cast";
import { PAJ } from "../practice-ancient-jar/PracticeAncientJar";
import { Cam, FOCUS, makeCamera, OPEN0, CLOSE0, LID0 } from "../practice-ancient-jar/shots";
import { hallSet, MARKS, JAR } from "../practice-ancient-jar/sets-hall";
import { STAND } from "../practice-ancient-jar/cards";

const CAMERA = makeCamera(PAJ);
type V3 = [number, number, number];

// ---------------- light: one warm torch key (two-tone), violet-blue shade (lighting.md: never brown) ----------------
export const HALL_LIGHT = {
  lit: [1.75, 1.48, 1.12] as V3, shade: [0.46, 0.47, 0.56] as V3, lift: [0.05, 0.035, 0.09] as V3, lambert: 0.35, sideK: 0.84, term: 0.2,
  charTint: [1.0, 0.9, 0.78] as V3, charShade: 0.88, charGrad: 0.1, bodyGrad: 0.22, sideTint: [0.88, 0.88, 0.96] as V3,
  fog: "#5c4a48", fogNear: 16, fogFar: 85, sat: 0.9,
};
/** the key light per preset, the skill's rule: camera-relative (az from the view axis, 0 = straight ahead, 90 = screen
 *  right, 180 = behind the camera) and frozen for the whole preset, from that preset's main framing */
const keyFrom = (c: Cam, az: number, el: number): V3 => {
  const f = new THREE.Vector3(c.look[0] - c.pos[0], 0, c.look[2] - c.pos[2]).normalize(), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, h = f.multiplyScalar(Math.cos(a)).addScaledVector(r, Math.sin(a)).multiplyScalar(Math.cos(e));
  return [h.x, Math.sin(e), h.z];
};
const KEY: Record<string, V3> = { hall: keyFrom(OPEN0, 105, 42), close: keyFrom(CLOSE0, -140, 38), throne: keyFrom(LID0, 120, 45) };
// interior grade (grade.md ref interior: median Y' .448, p5 .121, corners .67 of the centre, rose-violet shadows)
export const GRADE_HALL: GradeParams = {
  ky: [0, 0.1, 0.32, 0.65, 0.88, 0.975, 1],
  sat: [0.95, 0.9, 0.9],
  tintS: [0.018, 0.012], tintM: [-0.004, 0.006], tintH: [-0.01, 0.004],
  vig: [0.28, 0.3],
};

// ---------------- lens blur per beat (STYLE_BIBLE: CU 12-16, MS 10-12, wides 0; focus on the front row's eyes) ----------------
const W = (l: string, w: string) => PAJ.W(l, w);
const T0 = { push: W("warn", "ball") - 0.35, swing: W("warn", "mouth") + 0.18, cut: CAMERA.cuts[0], shock: W("warn", "run") + 0.1, whip: CAMERA.tWhip, pull: W("laugh", "roared") + 0.02, fade: CAMERA.tFade };
const lin = (pts: [number, number][], x: number) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); } return pts[pts.length - 1][1]; };
const INV_EYES: V3 = [MARKS.inventor[0], 1.62, MARKS.inventor[2]];
const EMP_EYES: V3 = [STAND.emperor[0], STAND.emperor[1] + 1.55, STAND.emperor[2]];
export const dofAt = (t: number): { cInf: number; focus?: V3 } => {
  const cInf = lin([[0, 10], [T0.push, 10], [T0.push + 0.5, 14], [T0.swing, 14], [T0.swing + 0.6, 10], [T0.cut - 0.01, 10], [T0.cut, 10], [T0.shock, 10], [T0.shock + 0.36, 13], [T0.whip, 13],
    [T0.whip + 0.3, 7], [T0.whip + 0.8, 12], [T0.pull, 12], [T0.pull + 0.6, 3], [T0.fade, 0]], t);
  if (t < T0.push) return { cInf, focus: INV_EYES };
  if (t < T0.swing + 0.3) return { cInf };
  if (t < T0.cut) return { cInf, focus: EMP_EYES };
  if (t < T0.whip) return { cInf, focus: INV_EYES };
  if (t < T0.fade) return { cInf, focus: EMP_EYES };
  return { cInf };
};

// ---------------- the hall in the skill's materials ----------------
/** MeshPhysical (clay) -> the skill's two-tone Lambert, or Phong with one soft highlight on metal (lighting.md 6) */
function restyle(root: THREE.Object3D) {
  const cache = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const conv = (mat: THREE.Material): THREE.Material => {
      const hit = cache.get(mat); if (hit) return hit;
      let out: THREE.Material = mat;
      const s = mat as THREE.MeshPhysicalMaterial;
      if (s.isMeshStandardMaterial) {
        const base = { color: s.color.clone(), map: s.map, side: s.side, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, };
        out = s.metalness > 0.4
          ? twoTone(new THREE.MeshPhongMaterial({ ...base, color: base.color.clone().multiplyScalar(0.62).lerp(new THREE.Color("#a8700c"), 0.35), specular: new THREE.Color("#fff0c8").multiplyScalar(0.9), shininess: 34 }))
          : twoTone(new THREE.MeshLambertMaterial(base));
      } else if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        const b = mat as THREE.MeshBasicMaterial;
        // light sources go over 1.0 so the emissive-only bloom (threshold 1.0) finds them; windows a little
        if (!b.transparent && !b.map) b.color.multiplyScalar(2.6);
        else if (!b.transparent && b.map) b.color.multiplyScalar(1.25);
      }
      cache.set(mat, out);
      return out;
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
}

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass; const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};
const OFF = (getInputProps() as { off?: string[] }).off ?? [];
const on = (k: string) => !OFF.includes(k);
const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const Inner: React.FC<{ t: number; c: Cam; showPeople: boolean; showInventor: boolean }> = ({ t, c, showPeople, showInventor }) => {
  const { camera, scene } = useThree();
  const world = useMemo(() => {
    const set = hallSet();
    restyle(set.root);
    // the jar body, lid and toads: a dark grey bronze, not the clay's pale grey; the dragons' scale map tinted gold
    set.jar.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of [m.material].flat() as THREE.MeshLambertMaterial[]) {
      if ((mt as unknown as THREE.MeshPhongMaterial).isMeshPhongMaterial) { if (mt.map) { mt.map = null; mt.color.set("#b98320"); mt.needsUpdate = true; } }
      else if (!mt.userData.dark) { mt.color.multiplyScalar(0.6).lerp(new THREE.Color("#6e6258"), 0.25); mt.userData.dark = true; } } });
    // the shell (walls, ceiling, floor, upper arcades) must not cast: the key comes from outside the room
    set.root.updateMatrixWorld(true);
    const bb = new THREE.Box3(), sz = new THREE.Vector3();
    set.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; bb.setFromObject(m); bb.getSize(sz); if (Math.max(sz.x, sz.y, sz.z) > 6 || bb.min.y > 4.6) m.castShadow = false; });
    const root = new THREE.Group(); root.add(set.root);
    const sun = new THREE.DirectionalLight("#ffd8a8", 2.5);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    root.add(sun, sun.target);
    const cast = new Cast(); root.add(cast.root);
    scene.add(root);
    const fog = new THREE.Fog("#000", 1, 2); untone(HALL_LIGHT.fog, fog.color); fog.near = HALL_LIGHT.fogNear; fog.far = HALL_LIGHT.fogFar;
    scene.fog = fog; scene.background = untone("#2e2430");
    return { set, root, sun, cast };
  }, [scene]);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera, { widthNear: 3.6, widthFar: 2.6 }),  // outlines.md: ~3 px at 1080, near-constant
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADE_HALL, 1),
  }), [camera, scene]);
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
  // camera
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look);
  cam.fov = c.fov; cam.near = 0.05; cam.far = 300; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  cam.layers.enable(NOINK);
  // light rig: key frozen per preset, shadow box on the preset's focus (round 2's rule: a moving box flickers)
  const L = HALL_LIGHT, focus = new THREE.Vector3(...(FOCUS[c.preset] ?? c.look));
  const dir = new THREE.Vector3(...(KEY[c.preset] ?? KEY.hall)).normalize();
  world.sun.position.copy(focus).addScaledVector(dir, 40); world.sun.target.position.copy(focus); world.sun.target.updateMatrixWorld();
  const sc = world.sun.shadow.camera; const R = c.preset === "close" ? 6 : 14;
  if (sc.right !== R) { Object.assign(sc, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 120 }); sc.updateProjectionMatrix(); }
  TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
  TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(0.03, 0.015, 0); TONE.uSat.value = L.sat;
  CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad; CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
  for (const f of world.set.flames) f.flicker(t, 0.75);
  world.cast.update(t, cam, dir, world.set.balls, world.set.ghost, showPeople, showInventor);
  noInkFallback(world.root);
  // lens
  const d = dofAt(t);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus); else fpt.set(...c.look);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  return (getInputProps() as { nopost?: boolean }).nopost ? null : <>{post}</>;
};

const View: React.FC<{ t: number; c: Cam; alpha: number; showPeople: boolean; showInventor: boolean }> = (p) => (
  <AbsoluteFill style={{ opacity: p.alpha }}>
    <ThreeCanvas width={1080} height={1920} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }} camera={{ fov: 40, near: 0.05, far: 300 }}>
      <Inner t={p.t} c={p.c} showPeople={p.showPeople} showInventor={p.showInventor} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const PracticeAncientJarCS: React.FC<{ audio?: string }> = ({ audio = "practice-ancient-jar/full/mix.wav" }) => {
  const f = useCurrentFrame(), t = f / 30;
  const fr = CAMERA.at(t);
  // the orbit (from 7.25 s, camera in front of the jar) shows the jar alone, as theirs; the inventor leaves after the fade
  const alone = (c: Cam) => t >= 7.25 && c.pos[2] > JAR.z + 1;
  const second = fr.dissolve && fr.dissolve.cam.pos.some((v, i) => Math.abs(v - fr.cam.pos[i]) > 1e-4) ? fr.dissolve : null;
  return (
    <AbsoluteFill style={{ background: "#2e2430" }}>
      <View t={t} c={fr.cam} alpha={1} showPeople={!alone(fr.cam)} showInventor={t < CAMERA.tFade && !alone(fr.cam)} />
      {second ? <View t={t} c={second.cam} alpha={second.k} showPeople={!alone(second.cam)} showInventor={t < CAMERA.tFade && !alone(second.cam)} /> : null}
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};
export default PracticeAncientJarCS;
