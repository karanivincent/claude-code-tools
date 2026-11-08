// The colour grade, copied from toon-world's templates/look/grade.ts (itself from the cartoon-3d-short skill,
// github.com/mromidev/claude-animated-shorts, MIT) and adapted: a three.js ShaderPass placed AFTER the OutputPass, so it
// works on display (sRGB) values directly; plus a lift that raises the blacks toward violet (the reference never shows a
// true black) and a wash toward cream (the hottest-day side view).
//   1. RGB tone curve: monotone cubic Hermite through 7 knots at x = 0, .1, .25, .5, .75, .9, 1
//   2. saturation around luma, separately for shadows / mids / highlights
//   3. 3-way tint: RGB offsets in shadows, mids, highlights
//   4. lift: c = lift + c * (1 - lift); wash: mix toward the wash colour
//   5. vignette
// Round 2 (camera and post): a contrast-limited luma sharpen first (0, the default, leaves the pass as it was), and the
// presets reworked toward the reference's measures: deep plum shadows (the reference's darkest 5% sit near RGB 22/6/21 on
// the deck and 55/12/20 in the canyon), almost no lift, an S-curve and richer shadow and mid saturation.
import * as THREE from 'three';

export interface GradeParams {
  ky: number[]; sat: [number, number, number];
  tintS: [number, number, number]; tintM: [number, number, number]; tintH: [number, number, number];
  lift: [number, number, number]; wash?: [number, number, number, number]; vig: [number, number];
  /** luma sharpen amount (0 = none) */ sharp?: number;
}
export const KX = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
export function monoTangents(ky: number[]): number[] {
  const n = KX.length, h: number[] = [], d: number[] = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h.push(KX[k + 1] - KX[k]); d.push((ky[k + 1] - ky[k]) / h[k]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) { m[k] = 0; continue; }
    const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  }
  return m;
}

/** the look of each place (part4.md section 2): lilac deck, hot canyon, pink-gold sunset, washed cream, blue end */
export const GRADES: Record<'deck' | 'canyon' | 'gorge' | 'side' | 'end', GradeParams> = {
  deck: { ky: [0, 0.08, 0.28, 0.6, 0.85, 0.96, 1], sat: [1.05, 0.98, 0.95], tintS: [0.02, -0.02, 0.0], tintM: [0.005, 0.0, -0.012], tintH: [0.01, 0.005, -0.015], lift: [0.02, 0.0, 0.015], vig: [0.14, 0.45], sharp: 0.6 }, // r3: no lilac cast
  canyon: { ky: [0, 0.07, 0.26, 0.57, 0.82, 0.94, 1], sat: [1.08, 0.98, 0.95], tintS: [0.04, -0.03, 0.0], tintM: [0.015, -0.005, -0.01], tintH: [0.01, 0.0, -0.01], lift: [0.03, 0.0, 0.015], vig: [0.14, 0.45], sharp: 0.6 },
  gorge: { ky: [0, 0.06, 0.22, 0.52, 0.8, 0.93, 1], sat: [1.1, 0.98, 0.95], tintS: [0.04, -0.03, 0.02], tintM: [0.02, -0.005, 0.0], tintH: [0.02, 0.01, -0.01], lift: [0.03, 0.0, 0.03], vig: [0.16, 0.42], sharp: 0.6 },
  side: { ky: [0, 0.09, 0.25, 0.53, 0.8, 0.93, 1], sat: [1.25, 1.15, 1.0], tintS: [0.03, -0.02, 0.02], tintM: [0.03, 0.015, 0.0], tintH: [0.02, 0.015, -0.02], lift: [0.12, 0.06, 0.1], wash: [1.0, 0.93, 0.82, 0.08], vig: [0.08, 0.5], sharp: 0.5 },
  end: { ky: [0, 0.07, 0.24, 0.54, 0.81, 0.93, 1], sat: [1.1, 1.0, 0.98], tintS: [0.03, -0.02, 0.03], tintM: [0.015, 0.0, 0.0], tintH: [0.01, 0.0, 0.0], lift: [0.03, 0.01, 0.035], vig: [0.14, 0.45], sharp: 0.6 },
};

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    ky: { value: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] }, km: { value: [1, 1, 1, 1, 1, 1, 1] },
    sat: { value: new THREE.Vector3(1, 1, 1) }, tintS: { value: new THREE.Vector3() }, tintM: { value: new THREE.Vector3() }, tintH: { value: new THREE.Vector3() },
    lift: { value: new THREE.Vector3() }, wash: { value: new THREE.Vector4(1, 1, 1, 0) }, vig: { value: new THREE.Vector2(0.1, 0.45) },
    sharp: { value: 0 }, px: { value: new THREE.Vector2(1 / 1080, 1 / 1920) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; varying vec2 vUv;
uniform float ky[7]; uniform float km[7];
uniform vec3 sat, tintS, tintM, tintH, lift; uniform vec4 wash; uniform vec2 vig; uniform float sharp; uniform vec2 px;
float hermite(float v, float x0, float x1, float y0, float y1, float m0, float m1) {
  float h = x1 - x0, t = (v - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * y0 + (t3 - 2.0 * t2 + t) * h * m0 + (-2.0 * t3 + 3.0 * t2) * y1 + (t3 - t2) * h * m1;
}
float curve(float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.1)  return hermite(v, 0.0, 0.1, ky[0], ky[1], km[0], km[1]);
  if (v < 0.25) return hermite(v, 0.1, 0.25, ky[1], ky[2], km[1], km[2]);
  if (v < 0.5)  return hermite(v, 0.25, 0.5, ky[2], ky[3], km[2], km[3]);
  if (v < 0.75) return hermite(v, 0.5, 0.75, ky[3], ky[4], km[3], km[4]);
  if (v < 0.9)  return hermite(v, 0.75, 0.9, ky[4], ky[5], km[4], km[5]);
  return hermite(v, 0.9, 1.0, ky[5], ky[6], km[5], km[6]);
}
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c0 = src.rgb;
  if (sharp > 0.0) {
    // unsharp mask on luma over the 8 neighbours, the change limited so edges do not ring
    const vec3 W = vec3(0.2126, 0.7152, 0.0722);
    float n = 0.0;
    n += dot(texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb, W) + dot(texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, W);
    n += dot(texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb, W) + dot(texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, W);
    float dg = dot(texture2D(tDiffuse, vUv + px).rgb, W) + dot(texture2D(tDiffuse, vUv - px).rgb, W)
             + dot(texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb, W) + dot(texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb, W);
    float blur = (n * 2.0 + dg + dot(c0, W) * 4.0) / 16.0;
    float d = clamp((dot(c0, W) - blur) * sharp * 2.0, -0.12, 0.12);
    c0 = clamp(c0 + d, 0.0, 1.0);
  }
  vec3 c = vec3(curve(c0.r), curve(c0.g), curve(c0.b));
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float wS = 1.0 - smoothstep(0.0, 0.55, y), wH = smoothstep(0.45, 1.0, y), wM = 1.0 - wS - wH;
  float s = sat.y + (sat.x - sat.y) * wS + (sat.z - sat.y) * wH;
  c = vec3(y) + s * (c - vec3(y));
  c += wS * tintS + wM * tintM + wH * tintH;
  c = clamp(c, 0.0, 1.0);
  c = lift + c * (1.0 - lift);
  c = mix(c, wash.rgb, wash.a);
  vec2 p = vUv * 2.0 - 1.0; float r = length(p) * 0.70710678;
  c *= 1.0 - vig.x * smoothstep(vig.y, 1.0, r);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`,
};
export function applyGrade(u: typeof GradeShader.uniforms, p: GradeParams) {
  u.ky.value = p.ky.slice(); u.km.value = monoTangents(p.ky);
  u.sat.value.set(...p.sat); u.tintS.value.set(...p.tintS); u.tintM.value.set(...p.tintM); u.tintH.value.set(...p.tintH);
  u.lift.value.set(...p.lift); u.wash.value.set(...(p.wash ?? [1, 1, 1, 0])); u.vig.value.set(...p.vig);
  u.sharp.value = p.sharp ?? 0;
}
