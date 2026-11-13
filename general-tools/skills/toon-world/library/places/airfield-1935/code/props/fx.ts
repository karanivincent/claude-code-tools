// b17-checklist: effects and the detail layer's moving things, as code cards and meshes (S3-75, S3-9): a smoke column
// that billows and leans with the wind, a fireball and flames, dust kicked up by wheels and the impact, a wind sock and
// flags that flap, a sprayed water arc. All run on the film's clock (seconds), so they carry on across a cut.
import * as THREE from 'three';
import { NOINK } from '../../../look/ink';
import { rnd, paint, mat } from './paint';

export type V3 = [number, number, number];
export type Fx = { root: THREE.Group; update: (t: number) => void };

/** a soft painted puff (white, tinted by the material), lumpy edge, for smoke and dust */
const puffTex = (() => {
  let t: THREE.Texture | null = null;
  return () => t ??= paint((g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = w * (0.2 + 0.08 * rnd(i)), x = w / 2 + Math.cos(a) * w * 0.17, y = h / 2 + Math.sin(a) * h * 0.17;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.3); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, [1, 1], 256, 256);
})();
const sprite = (color: string, opacity: number, additive = false) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true }));
  s.layers.set(NOINK); return s;
};

// ---------------- world-r5: smoke and fire restaged as drawn shader shapes (S5-45) ----------------
// Two rounds of puff sprites read as "stacked round dark discs". The column and the flames are now each one or a few
// tall quads that turn to face the camera about the vertical (a cylindrical billboard) and draw their shape in the
// fragment shader: scrolling value noise makes the billowing edge, the shape is cut hard (a toon edge) with a dark ink
// line just inside it, and the colour is posterised into three tones lit from one side. They write depth, so the lens
// blur reads them at their own distance and leaves them sharp.
const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/** a quad standing on `at`, its bottom at the root, turned to the camera about y each frame */
const billboard = (w: number, h: number, mat: THREE.ShaderMaterial) => {
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, mat); m.layers.set(NOINK); m.frustumCulled = false;
  m.onBeforeRender = (_r, _s, cam) => { const p = m.getWorldPosition(new THREE.Vector3()); m.rotation.y = Math.atan2(cam.position.x - p.x, cam.position.z - p.z); m.updateMatrixWorld(); };
  return m;
};

/** a smoke column rising from `at`, starting at `start` s: a billowing toon column, narrow and lit orange at its root,
 *  black-brown in the body, grey and wider at the top, leaning downwind; it grows up from the fire in its first 2.5 s */
export const smokeColumn = (at: V3, start: number, o: { height?: number; width?: number; wind?: [number, number]; seed?: number } = {}): Fx => {
  const root = new THREE.Group(), H = o.height ?? 120, W = o.width ?? H * 0.42, wind = o.wind ?? [10, -4];
  const u = { uT: { value: 0 }, uGrow: { value: 0 }, uLean: { value: 0 }, uSeed: { value: o.seed ?? rnd(at[0]) * 10 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, side: THREE.DoubleSide, transparent: false, fragmentShader: `
    uniform float uT, uGrow, uLean, uSeed; varying vec2 vUv;
    ${NOISE}
    void main(){
      float v = vUv.y, x = vUv.x - 0.5;
      float cx = uLean * v * v;                                   // the lean: the column bends downwind as it climbs
      float w = 0.09 + 0.36 * pow(v, 0.7);                         // narrow root, wide top
      vec2 q = vec2(vUv.x * 3.0, v * 5.0 - uT * 0.55) + uSeed;     // the billows roll upward
      float n = fbm(q), n2 = fbm(q * 2.1 + 3.7);
      float d = 0.0;
      // the rising head: a rounded cap (the column narrows to nothing over its top 12 %), billowed by the same noise
      float cap = clamp((uGrow - v) / 0.12, 0.0, 1.0);
      d = 1.0 - abs(x - cx) / (w * sqrt(cap) + 1e-3) + (n - 0.5) * 1.3 + (n2 - 0.5) * 0.45;
      d *= smoothstep(0.0, 0.02, v) * (1.0 - smoothstep(0.82, 1.0, v));
      if (v > uGrow || d < 0.3) discard; // above the head: nothing (a zero-width cap left a hairline)
      // light from screen left: the noise one step to the left decides lit or shade (three tones)
      float lit = fbm(q + vec2(-0.12, 0.05)) - n; // finer lit/shade split: billows, not a smooth tube
      vec3 body = mix(vec3(0.035, 0.025, 0.022), vec3(0.2, 0.185, 0.18), smoothstep(0.35, 0.95, v)); // linear values: the composer lifts them
      vec3 hi = body * 2.0 + vec3(0.02, 0.015, 0.01), sh = body * 0.5;
      vec3 c = lit > 0.02 ? hi : lit < -0.04 ? sh : body;
      c = mix(c, vec3(1.0, 0.45, 0.12), (1.0 - smoothstep(0.0, 0.1, v)) * 0.85);   // the fire lights its root
      if (d < 0.36) c = vec3(0.01, 0.008, 0.008);                  // the ink edge
      gl_FragColor = vec4(c, 1.0);
    }` });
  const q = billboard(W, H, m); q.position.set(at[0], at[1], at[2]); root.add(q);
  const right = new THREE.Vector3();
  q.onAfterRender = () => {};
  const base = q.onBeforeRender;
  q.onBeforeRender = (r, s, cam, g2, m2, gr) => { base(r, s, cam, g2, m2, gr); right.set(Math.cos(q.rotation.y), 0, -Math.sin(q.rotation.y)); u.uLean.value = Math.max(-0.35, Math.min(0.35, (wind[0] * right.x + wind[1] * right.z) / W)); };
  return { root, update: (t) => { const d = t - start; q.visible = d >= 0; u.uT.value = t; u.uGrow.value = Math.min(1, 0.12 + Math.max(0, d) / 1.4); } }; // grows up past the tree line within a second
};

/** fire: a few drawn flame quads (varied widths and heights) whose tongues are cut from noise rising up the quad,
 *  posterised white-yellow core, orange, red rim and an ink line; embers rising; a warm spill on the ground round it */
export const flames = (at: V3, start: number, o: { spread?: [number, number]; size?: number; n?: number } = {}): Fx => {
  const root = new THREE.Group(), [sx, sz] = o.spread ?? [8, 4], S = o.size ?? 4;
  const quads: { mesh: THREE.Mesh; u: { uT: { value: number }; uGrow: { value: number }; uSeed: { value: number } } }[] = [];
  const k = Math.max(2, Math.round(Math.max(sx, sz) / 3.5));
  for (let i = 0; i < k; i++) {
    const u = { uT: { value: 0 }, uGrow: { value: 0 }, uSeed: { value: rnd(at[0] + i * 7.7) * 40 } };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, side: THREE.DoubleSide, fragmentShader: `
      uniform float uT, uGrow, uSeed; varying vec2 vUv;
      ${NOISE}
      void main(){
        float v = vUv.y, x = vUv.x;
        // the tongue line: how high the fire reaches at this x, a few lobes that flicker and climb
        float lobes = fbm(vec2(x * 3.5 + uSeed, uT * 0.9)) ;
        float top = (0.25 + 0.75 * pow(lobes, 1.4) * 1.5) * uGrow;
        float edgeX = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
        float n = fbm(vec2(x * 6.0 + uSeed, v * 4.0 - uT * 3.2));
        float d = (top * edgeX - v) / max(top, 0.05) + (n - 0.5) * 0.55;
        if (d < 0.0) discard;
        vec3 c = d > 0.78 ? vec3(1.0, 0.92, 0.55) : d > 0.45 ? vec3(1.0, 0.6, 0.08) : d > 0.16 ? vec3(1.0, 0.3, 0.04) : vec3(0.7, 0.08, 0.03);
        if (d < 0.035) c = vec3(0.25, 0.04, 0.02);
        gl_FragColor = vec4(c * 1.15, 1.0);
      }` });
    const w = (sx * (0.45 + 0.4 * rnd(i + at[0])) + 1.5), h = S * (0.7 + 0.6 * rnd(i * 3.1 + at[2]));
    const mesh = billboard(w, h, m);
    mesh.position.set(at[0] + (rnd(i + 2.3) - 0.5) * sx * 0.6, at[1], at[2] + (rnd(i + 4.1) - 0.5) * sz * 0.6);
    root.add(mesh); quads.push({ mesh, u });
  }
  const embers = Array.from({ length: 14 }, () => { const s = sprite('#ff8a24', 1); root.add(s); return s; });
  const spillTex = paint((g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,140,50,0.75)'); gr.addColorStop(0.5, 'rgba(255,110,40,0.3)'); gr.addColorStop(1, 'rgba(255,90,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, [1, 1], 256, 256);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }));
  spill.layers.set(NOINK); spill.position.set(at[0], 0.1, at[2]); root.add(spill);
  const R = Math.max(sx, sz) * 0.7 + 3;
  return {
    root, update: (t) => {
      const d = t - start, on = d >= 0, grow = Math.min(1, Math.max(0, d) / 0.6 + 0.15);
      quads.forEach(({ mesh, u }) => { mesh.visible = on; u.uT.value = t; u.uGrow.value = grow; });
      embers.forEach((s, i) => {
        s.visible = on; if (!on) return;
        const ph = (t * (0.5 + 0.4 * rnd(i + 30)) + rnd(i + 31)) % 1;
        s.position.set(at[0] + (rnd(i + 32) - 0.5) * sx + Math.sin(t * 3 + i) * 1.2 * ph, at[1] + 1 + ph * S * 3, at[2] + (rnd(i + 33) - 0.5) * sz);
        const e = 0.12 + 0.08 * rnd(i); s.scale.set(e, e, 1); (s.material as THREE.SpriteMaterial).opacity = 1 - ph;
      });
      spill.visible = on; const f = 1 + 0.08 * Math.sin(t * 11) + 0.05 * Math.sin(t * 17); spill.scale.set(R * 2 * f * grow, 1, R * 2 * f * grow);
      (spill.material as THREE.MeshBasicMaterial).opacity = 0.4 * grow;
    },
  };
};
/** the impact: a fireball that swells and rolls up into smoke in about 1.2 s, and a ring of dust thrown out low */
export const impact = (at: V3, start: number): Fx => {
  // world-r4: the hit must read in 3-4 frames from 100 m at a low angle: a standing flash (a bright sprite, not a disc
  // flat on the grass that a low camera sees edge-on), a wall of earth thrown out fast, chunks of debris kicked up on
  // arcs; then a SMALL fireball (big puffs crossed the frame edge as soft discs in s05) that rolls into soot
  const root = new THREE.Group();
  const balls = Array.from({ length: 40 }, () => { const s = sprite('#ff8a20', 1); root.add(s); return s; });
  const HOT = new THREE.Color('#ffc43a'), MIDC = new THREE.Color('#ff5a14'), SOOT = new THREE.Color('#3a302c'), tmp = new THREE.Color();
  const flash = sprite('#ffc860', 1, true); root.add(flash);
  const dust = Array.from({ length: 40 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color: i % 2 ? '#a08560' : '#7a6448', transparent: true, depthWrite: true, alphaTest: 0.15, fog: true }));
    s.layers.set(NOINK); root.add(s); return s;
  });
  const chunkM = mat(null, '#3a3532');
  const chunks = Array.from({ length: 16 }, (_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 + rnd(i) * 0.9, 0.2 + rnd(i + 1) * 0.4, 0.4 + rnd(i + 2) * 0.6), chunkM); m.castShadow = true; root.add(m); return m; });
  return {
    root, update: (t) => {
      const d = t - start;
      { const on = d >= 0 && d < 0.3; flash.visible = on; if (on) { const k = d / 0.3, r = 13 * Math.sin(Math.PI * Math.min(1, 0.35 + k)); flash.position.set(at[0], at[1] + 3, at[2]); flash.scale.set(r * 1.5, r, 1); (flash.material as THREE.SpriteMaterial).opacity = 1 - k * k; } }
      dust.forEach((s, i) => {
        const L = 0.42, on = d >= 0 && d < L; s.visible = on; if (!on) return; // over by s05's first frame (0.4 s after): it filled the lens there
        const k = d / L, a = (i / 40) * Math.PI * 2 + rnd(i) * 0.3, r = 3 + 11 * (1 - Math.pow(1 - k, 3)); // out in 0.4 s to 14 m (s05's camera stands 25 m off), then settles
        s.position.set(at[0] + Math.cos(a) * r, at[1] + 0.6 + (1.5 + 3 * rnd(i + 4)) * Math.min(1, k * 3), at[2] + Math.sin(a) * r);
        const sz = (2.5 + 4 * k) * (0.7 + 0.6 * rnd(i + 7)) * (1 - k * 0.6); s.scale.set(sz * 1.3, sz, 1);
        s.visible = k < 0.92;
      });
      chunks.forEach((m, i) => {
        const on = d >= 0 && d < 7; m.visible = on; if (!on) return; // the chunks land and lie as debris
        const a = rnd(i + 11) * Math.PI * 2, v = 2 + 3 * rnd(i + 12), vy = 5 + 3 * rnd(i + 13), /* r5: they land within 8.5 m: a chunk thrown 12 m flew through s05's lens at f39 */ land = (vy + Math.sqrt(vy * vy + 5.88)) / 9.8, tt = Math.min(d, land); // r5: clamp at the real landing time (r4's clamp froze chunks in the sky)
        const y = Math.max(0.2, 0.5 + vy * tt - 4.9 * tt * tt);
        m.position.set(at[0] + Math.cos(a) * v * tt * (y > 0.2 ? 1 : 0.9), y, at[2] + Math.sin(a) * v * tt); m.rotation.set(tt * 9 * rnd(i), tt * 7, tt * 5 * rnd(i + 3)); if (y <= 0.2) m.position.y = 0.15;
      });
      balls.forEach((s, i) => {
        const L = i < 4 ? 0.7 : 2.0, on = d >= 0 && d < L; s.visible = on; if (!on) return;
        const k = d / L, a = rnd(i) * Math.PI * 2, r = (2 + 6 * Math.sqrt(k)) * (0.5 + rnd(i + 5));
        s.position.set(at[0] + Math.cos(a) * r * (i < 4 ? 0.3 : 0.7), at[1] + 1.5 + (i < 4 ? 3 : 12) * k * (0.4 + rnd(i + 3)), at[2] + Math.sin(a) * r * (i < 4 ? 0.3 : 0.7));
        const sz = i < 4 ? 5 * Math.sin(Math.PI * Math.min(1, k * 1.2 + 0.15)) : (2 + 4 * Math.sqrt(k)) * (0.6 + 0.8 * rnd(i + 9)); s.scale.set(sz, sz, 1);
        const m = s.material as THREE.SpriteMaterial;
        if (i < 4) { m.color.copy(HOT); m.opacity = 0.95; }
        else { if (k < 0.18) tmp.copy(HOT).lerp(MIDC, k / 0.18); else tmp.copy(MIDC).lerp(SOOT, Math.min(1, (k - 0.18) / 0.3)); if (i % 3 === 0) tmp.lerp(SOOT, 0.5); m.color.copy(tmp); m.opacity = 0.95 * (1 - Math.pow(k, 4)); }
      });
    },
  };
};
/** dust kicked up behind a moving wheel (a taxi, a takeoff run): puffs left behind where it was */
export const wheelDust = (where: (t: number) => V3 | null, from: number, to: number): Fx => {
  const root = new THREE.Group(), n = 30;
  const puffs = Array.from({ length: n }, () => { const s = sprite('#d8c79c', 0.7); root.add(s); return s; });
  return {
    root, update: (t) => {
      puffs.forEach((s, i) => {
        const born = t - (i / n) * 1.6; const p = born >= from && born <= to ? where(born) : null;
        s.visible = !!p; if (!p) return;
        const age = t - born; s.position.set(p[0] - 1, 0.6 + age * 1.2, p[2] + (rnd(i) - 0.5) * 3);
        const sz = 2 + age * 4; s.scale.set(sz, sz * 0.7, 1); (s.material as THREE.SpriteMaterial).opacity = 0.6 * (1 - age / 1.6);
      });
    },
  };
};
/** a wind sock on a pole: an orange-and-white cone that streams and ripples */
export const windSock = (at: V3, dir = 0.4): Fx => {
  const root = new THREE.Group(); root.position.set(...at); root.rotation.y = dir;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 8), mat(null, '#e8e8e2')); pole.position.y = 3.5; root.add(pole);
  const tex = paint((g, w, h) => { for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#ff6a1a'; g.fillRect((i * w) / 5, 0, w / 5, h); } }, [1, 1], 512, 128);
  const geo = new THREE.CylinderGeometry(0.2, 0.55, 3.2, 16, 10, true); geo.rotateZ(Math.PI / 2); geo.translate(1.7, 0, 0);
  const base = (geo.attributes.position as THREE.BufferAttribute).array.slice();
  const sock = new THREE.Mesh(geo, mat(tex, '#ffffff', { side: THREE.DoubleSide })); sock.position.y = 6.8; root.add(sock);
  return {
    root, update: (t) => {
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setY(i, base[i * 3 + 1] - 0.05 * x * x * 0.1 + 0.12 * Math.sin(t * 6 - x * 1.5) * x / 3); p.setZ(i, base[i * 3 + 2] + 0.1 * Math.sin(t * 5 - x * 2) * x / 3); }
      p.needsUpdate = true;
    },
  };
};
/** a flag (a canvas of stripes or a star field) on a pole, flapping */
export const flag = (at: V3, o: { size?: [number, number]; pole?: number; paint?: (g: CanvasRenderingContext2D, w: number, h: number) => void; yaw?: number } = {}): Fx => {
  const root = new THREE.Group(); root.position.set(...at); root.rotation.y = o.yaw ?? 0;
  const [fw, fh] = o.size ?? [3, 1.8], P = o.pole ?? 9;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, P, 8), mat(null, '#d8d8d0')); pole.position.y = P / 2; root.add(pole);
  const tex = paint((g, w, h) => (o.paint ?? usFlag)(g, w, h), [1, 1], 512, 320);
  const geo = new THREE.PlaneGeometry(fw, fh, 16, 4); geo.translate(fw / 2, 0, 0);
  const base = (geo.attributes.position as THREE.BufferAttribute).array.slice();
  const m = new THREE.Mesh(geo, mat(tex, '#ffffff', { side: THREE.DoubleSide })); m.position.y = P - fh / 2; root.add(m);
  return {
    root, update: (t) => {
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, 0.25 * Math.sin(t * 6 - x * 2.2) * (x / fw)); }
      p.needsUpdate = true;
    },
  };
};
/** the 1935 American flag, drawn simply: stripes and a blue field with a few stars */
export const usFlag = (g: CanvasRenderingContext2D, w: number, h: number) => {
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#c8262e'; g.fillRect(0, (i * h) / 13, w, h / 13 + 1); }
  g.fillStyle = '#23356e'; g.fillRect(0, 0, w * 0.42, (h * 7) / 13);
  g.fillStyle = '#f4f1ea'; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { g.beginPath(); g.arc(18 + c * 40 + (r % 2) * 20, 18 + r * 40, 6, 0, 7); g.fill(); }
};
/** birds: a loose flock crossing the sky, wings flapping (small card shapes) */
export const flock = (from: V3, to: V3, period: number, n = 7, seed = 3): Fx => {
  const root = new THREE.Group();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.6, 0, 0, 0, 0, 0.15, 0, 0, -0.15, 0.6, 0, 0, 0, 0, 0.15, 0, 0, -0.15], 3));
  const birds = Array.from({ length: n }, () => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2a2630', side: THREE.DoubleSide })); m.layers.set(NOINK); root.add(m); return m; });
  return {
    root, update: (t) => {
      const k = ((t / period) % 1);
      birds.forEach((b, i) => {
        const o = [(rnd(seed + i) - 0.5) * 10, (rnd(seed + i + 3) - 0.5) * 4, (rnd(seed + i + 6) - 0.5) * 10];
        b.position.set(from[0] + (to[0] - from[0]) * k + o[0], from[1] + (to[1] - from[1]) * k + o[1], from[2] + (to[2] - from[2]) * k + o[2]);
        b.rotation.y = Math.atan2(-(to[2] - from[2]), to[0] - from[0]); b.scale.set(1.4, 1 + 0.8 * Math.sin(t * 14 + i * 2), 1.4);
      });
    },
  };
};
export const groupFx = (...fx: Fx[]): Fx => { const root = new THREE.Group(); fx.forEach((f) => root.add(f.root)); return { root, update: (t) => fx.forEach((f) => f.update(t)) }; };

/** cloud heaps as clusters of soft puff cards (cream tops, lilac under), for the sky's middle band */
export const cloudHeap = (at: V3, r: number, seed: number): Fx => {
  const root = new THREE.Group(); root.position.set(...at);
  const n = 9 + Math.floor(rnd(seed) * 6);
  for (let i = 0; i < n; i++) {
    const s = sprite(i % 3 === 0 ? '#c9bde8' : i % 3 === 1 ? '#fff4e2' : '#ece4f6', 1);
    const a = rnd(seed + i) * Math.PI * 2, d = r * 0.7 * rnd(seed + i * 2);
    s.position.set(Math.cos(a) * d * 1.4, (rnd(seed + i * 3) - 0.2) * r * 0.5 + (i % 3 === 0 ? -r * 0.15 : r * 0.1), Math.sin(a) * d);
    const sz = r * (0.9 + 0.7 * rnd(seed + i * 5)); s.scale.set(sz, sz * 0.75, 1); root.add(s);
  }
  return { root, update: () => {} };
};
