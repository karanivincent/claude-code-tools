// What a scene's frame shows, from the film's own data before any render: where each face and each caption word sits
// on screen, so a tool can say when a caption covers a face (S3-147) or sits too low (S3-147: never below 82% of the
// frame). Pure geometry, no three.js; the tool (templates/scene/tools/frame-check.mjs) projects the people through the
// scene's camera and passes the boxes in. Heads cut by an edge use camera.ts headCut.
// Why (audit C, saving 12, 18 November 2026): the faults reviewers flag most were a caption over a face and a head cut
// by the frame; Wald's camera rounds spent 35 to 40 minutes each finding them on frames (production log 9 Nov 17:26,
// 18:21, 18:50). S3-147's proof, `audit.mjs: captionOverlap`, was never built.

/** a box in pixels: x0 < x1, y0 < y1, y down */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
export const overlap = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
/** the share of `a` that `b` covers (0..1) */
export const covered = (a: Box, b: Box) => (area(a) > 0 ? area(overlap(a, b)) / area(a) : 0);

/** one caption word on screen: its text, its font size in px, and its film times (s) */
export interface Caption { text: string; size: number; s: number; e: number }
/** The words' times as the film template's captions.tsx sets them (CAPS), from the voice timeline's lines: each word on
 *  screen from just before it is said until the next word, or 0.35 s after it at a pause. A film whose own captions.tsx
 *  exports CAPS should pass those instead; this copy is for when it cannot be loaded in node. */
export function captionsFromLines(lines: { words?: { w: string; s: number | null; e?: number | null }[]; end: number }[]): Caption[] {
  const raw: [string, number, number][] = [];
  for (const l of lines) {
    const ws = l.words ?? [];
    ws.forEach((x, i) => {
      const prev = raw[raw.length - 1];
      const s = x.s ?? (prev ? prev[2] + 0.02 : 0);
      const next = ws.slice(i + 1).find((y) => y.s != null)?.s;
      const e = x.e ?? next ?? l.end;
      raw.push([x.w, s, Math.max(s + 0.08, e)]);
    });
  }
  return raw.map(([w, s, e], i) => {
    const n = raw[i + 1];
    return { text: w, s: i === 0 ? 0 : s - 0.04, e: n && n[1] - e < 0.5 ? n[1] - 0.04 : e + 0.35, size: Math.min(118, 900 / (Math.max(1, w.length) * 0.66)) };
  });
}
/** The box a caption word covers in the film template's style (captions.tsx: centred on x 540 and y capY, Arial Black at
 *  `size`, a black stroke of 0.17 of the size each side, a 900 px box): about 0.66 of the size a letter wide. */
export function captionBox(c: Pick<Caption, 'text' | 'size'>, o: { capY?: number; width?: number } = {}): Box {
  const capY = o.capY ?? 1480, W = o.width ?? 1080, stroke = 0.17 * c.size;
  const half = Math.min(450, (Math.max(1, c.text.length) * 0.66 * c.size) / 2) + stroke, halfH = c.size / 2 + stroke;
  return { x0: W / 2 - half, x1: W / 2 + half, y0: capY - halfH, y1: capY + halfH };
}
/** the caption on screen at film time t, if any */
export const captionAt = (caps: Caption[], t: number) => caps.find((c) => t >= c.s && t < c.e) ?? null;

/** A face's box on screen from where its head projects: the head's centre (px), the head's height on screen (px), and
 *  a width of 0.94 of the height (the bean head's ratio). */
export function faceBox(cx: number, cy: number, headH: number): Box {
  const hw = (headH * 0.94) / 2;
  return { x0: cx - hw, x1: cx + hw, y0: cy - headH / 2, y1: cy + headH / 2 };
}

export interface FaceAt { who: string; box: Box }
export interface FrameFault { f: number; who?: string; kind: 'caption over face' | 'caption too low'; what: string }
/** S3-147 on one frame: the caption word on screen covers more than `max` (default 0.2) of a face's box, or the word's
 *  bottom sits below `low` (default 0.82) of the frame's height. */
export function checkCaptionFrame(f: number, cap: Pick<Caption, 'text' | 'size'> | null, faces: FaceAt[], o: { capY?: number; width?: number; height?: number; max?: number; low?: number } = {}): FrameFault[] {
  if (!cap) return [];
  const H = o.height ?? 1920, box = captionBox(cap, o), out: FrameFault[] = [];
  if (box.y1 > (o.low ?? 0.82) * H) out.push({ f, kind: 'caption too low', what: `the caption "${cap.text}" reaches ${(box.y1 / H * 100).toFixed(0)}% of the height (never below ${Math.round((o.low ?? 0.82) * 100)}%)` });
  for (const face of faces) {
    const k = covered(face.box, box);
    if (k > (o.max ?? 0.2)) out.push({ f, who: face.who, kind: 'caption over face', what: `the caption "${cap.text}" covers ${(k * 100).toFixed(0)}% of ${face.who}'s face` });
  }
  return out;
}

/** Join frame faults into runs (one line per person and kind over neighbouring frames), so a 2 s overlap is one line. */
export function runsOf<T extends { f: number; who?: string; kind: string; what: string }>(faults: T[], gap = 1): { from: number; to: number; who?: string; kind: string; what: string }[] {
  const out: { from: number; to: number; who?: string; kind: string; what: string }[] = [];
  const key = (x: { who?: string; kind: string }) => `${x.who ?? ''}|${x.kind}`;
  for (const x of [...faults].sort((a, b) => key(a).localeCompare(key(b)) || a.f - b.f)) {
    const last = out.at(-1);
    if (last && key(last) === key(x) && x.f - last.to <= gap) last.to = x.f;
    else out.push({ from: x.f, to: x.f, who: x.who, kind: x.kind, what: x.what });
  }
  return out.sort((a, b) => a.from - b.from);
}
