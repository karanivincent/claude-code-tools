// The look checks: what made a place read flat (Elijah and the widow 2D, 11 November 2026: Vincent judged the final
// "too flat"; the audit found plain code colour near the lens, textures at 1024 and 256, and a detail layer of dots).
// Pure (no Three.js): the film's Stage walks the scene in the browser and logs plain numbers (tools/look.mjs collects
// them); these functions judge them. Each threshold carries where its number comes from.

export type V3 = [number, number, number];

// ---- what the scene walk logs ---------------------------------------------------------------------------------------

export interface MapInfo { slot: string; w: number; h: number; mipmaps: boolean; anisotropy: number }
export interface MeshInfo {
  name: string;
  /** world centre and radius of the bounding sphere */
  c: V3; r: number;
  /** the material has a colour map (any texture on `map`) */
  map: boolean;
  /** emissive: an unlit picture (MeshBasicMaterial with a map), a glow, a flame, a light volume */
  emissive: boolean;
  /** a person or word card: judged by the card checks, not these */
  card?: boolean;
  /** the place file's allow-list (`userData.plainOk = '<reason>'`): a plain colour on purpose, with its reason */
  plainOk?: string;
  maps: MapInfo[];
}
export interface CamInfo { pos: V3; t?: number; shot?: string }

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** how close the mesh's surface comes to any of the cameras (its centre's distance less its radius, never below 0) */
export const nearest = (m: { c: V3; r: number }, cams: CamInfo[]) =>
  cams.reduce((d, c) => Math.min(d, Math.max(0, dist(m.c, c.pos) - m.r)), Infinity);

/** The default reach of the look checks: 8 m from a shot camera. Why: in Elijah's house and gate every mesh the lens
 *  showed large enough to read its surface (walls, floor, jar, bed, gate posts) sat within 2 to 8 m of a camera;
 *  beyond that the far band (one picture) and fog take over (decision 1: far band one picture, middle and ground code
 *  3D with painted textures). */
export const LOOK_NEAR = 8;

export interface LookIssue { check: string; what: string; name?: string; shot?: string }

/** Meshes within `near` metres of a shot camera whose material has no map and is not emissive: plain code colour where
 *  the camera can read the surface. Cards and meshes the place allows by name (`plainOk` with a reason) are skipped.
 *  Why: decision 1 (Vincent, 11 November 2026) removed "drawn in code" flat colour from the looks; Elijah's flat
 *  green ground and two-tone stones are what he called flat. */
export function plainMeshes(meshes: MeshInfo[], cams: CamInfo[], near = LOOK_NEAR): LookIssue[] {
  return meshes.filter(m => !m.card && !m.map && !m.emissive && !(m.plainOk && m.plainOk.trim()) && nearest(m, cams) <= near)
    .map(m => ({ check: 'plain-mesh', name: m.name, what: `${m.name}: plain colour (no map, not emissive) ${nearest(m, cams).toFixed(1)} m from a camera; paint it a texture or give userData.plainOk a reason` }));
}

/** The texture floor near the lens. Why each number:
 *  - 2048 px: decision 1 ("2048 near the camera"); Elijah's 1024 plaster and 256 critter canvases read soft at
 *    1080 x 1920 once the camera came within 3 m.
 *  - mipmaps: without them a painted texture shimmers and aliases as the camera moves (three.js samples one level).
 *  - anisotropy 16: floors and walls are seen at grazing angles; under 16 they smear into flat colour toward the
 *    horizon (decision 1, "16x anisotropy"). */
export const TEX_MIN = 2048, ANISO_MIN = 16;
/** Colour maps under `minSize` px on their longer side, without mipmaps, or with anisotropy under `minAniso`, on
 *  meshes within `near` metres of a shot camera. Cards are skipped (their canvas follows their size on screen), and
 *  so are emissive meshes (a glint, a flame: light, not a surface). */
export function smallTextures(meshes: MeshInfo[], cams: CamInfo[], near = LOOK_NEAR, o: { minSize?: number; minAniso?: number } = {}): LookIssue[] {
  const minSize = o.minSize ?? TEX_MIN, minAniso = o.minAniso ?? ANISO_MIN, out: LookIssue[] = [];
  for (const m of meshes) {
    if (m.card || m.emissive || nearest(m, cams) > near) continue;   // glows and glints are light, not a surface
    for (const t of m.maps) {
      const why = [Math.max(t.w, t.h) < minSize && `${Math.max(t.w, t.h)} px (under ${minSize})`, !t.mipmaps && 'no mipmaps', t.anisotropy < minAniso && `anisotropy ${t.anisotropy} (under ${minAniso})`].filter(Boolean);
      if (why.length) out.push({ check: 'small-texture', name: m.name, what: `${m.name} ${t.slot}: ${why.join(', ')}, ${nearest(m, cams).toFixed(1)} m from a camera` });
    }
  }
  return out;
}

// ---- the detail layer ----------------------------------------------------------------------------------------------

/** One detail object as one frame's sample saw it: its kind (`userData.detail` in the place), whether it was in frame,
 *  and a signature of its transform and map version (it moves when this changes). */
export interface DetailSample { id: string; kind: string; inFrame: boolean; sig: string }
export interface DetailFrame { t: number; shot: string; size: 'wide' | 'medium' | 'close'; things: DetailSample[] }

/** Kinds that never count as detail: points of light alone do not make a place lived in. Why: Elijah's detail layer
 *  was motes and sparkles and Vincent still saw it as flat; decision 1 asks for "small real things that move (flies,
 *  smoke, dust in light shafts, cloth, birds, a goat), not dots". Dust counts only as a shaft (kind 'shaft'). */
export const NOT_DETAIL = new Set(['mote', 'motes', 'dot', 'dots', 'sparkle', 'sparkles', 'glint', 'glints', 'speck', 'points']);

/** Floors of detail things in frame per shot, and how many of them move, by how close the shot is (the biggest named
 *  person's height on screen: wide under 0.35 of the frame, close over 0.6, Stage.tsx's split). Why: set on
 *  11 November 2026 for decision 1, from Elijah's shots, which carried 0 to 3 counted things (a goat, two hens, a
 *  cat, sea gulls far off) and read flat; a wide shows the whole place and so carries the most. A close-up's frame is
 *  mostly a face, so two things behind it, one moving, is the floor. Raise these when a reference's count is measured. */
export const DETAIL_FLOORS: Record<DetailFrame['size'], { present: number; moving: number }> = {
  wide: { present: 6, moving: 3 }, medium: { present: 4, moving: 2 }, close: { present: 2, moving: 1 },
};

export interface ShotDetail { shot: string; size: DetailFrame['size']; present: number; moving: number; kinds: string[] }
/** Per shot: how many distinct detail things were in frame at any sampled moment, and how many of those changed
 *  (moved, turned, scaled or redrew their canvas) while in frame. A shot's size is its most common size. */
export function detailCount(frames: DetailFrame[]): ShotDetail[] {
  const by = new Map<string, DetailFrame[]>();
  for (const f of frames) { const l = by.get(f.shot); if (l) l.push(f); else by.set(f.shot, [f]); }
  const out: ShotDetail[] = [];
  for (const [shot, fs] of by) {
    const sizes = new Map<string, number>(); fs.forEach(f => sizes.set(f.size, (sizes.get(f.size) ?? 0) + 1));
    const size = [...sizes].sort((a, b) => b[1] - a[1])[0][0] as DetailFrame['size'];
    const seen = new Map<string, { kind: string; sigs: Set<string> }>();
    for (const f of fs) for (const d of f.things) {
      if (!d.inFrame || NOT_DETAIL.has(d.kind.toLowerCase())) continue;
      const e = seen.get(d.id) ?? { kind: d.kind, sigs: new Set<string>() };
      e.sigs.add(d.sig); seen.set(d.id, e);
    }
    const all = [...seen.values()];
    out.push({ shot, size, present: all.length, moving: all.filter(e => e.sigs.size > 1).length, kinds: [...new Set(all.map(e => e.kind))].sort() });
  }
  return out;
}
/** Shots under their floor (DETAIL_FLOORS by size) */
export function checkDetail(frames: DetailFrame[], floors = DETAIL_FLOORS): LookIssue[] {
  return detailCount(frames).flatMap(s => {
    const f = floors[s.size];
    return s.present < f.present || s.moving < f.moving
      ? [{ check: 'detail-thin', shot: s.shot, what: `${s.shot} (${s.size}): ${s.present} detail things in frame (floor ${f.present}), ${s.moving} moving (floor ${f.moving})${s.kinds.length ? `: ${s.kinds.join(', ')}` : ''}; dots, motes and sparkles do not count` }]
      : [];
  });
}

// ---- flat colour on a still ----------------------------------------------------------------------------------------

/** an RGB picture: `data` is width * height * 3 bytes, row by row (ffmpeg's rgb24) */
export interface Rgb { width: number; height: number; data: Uint8Array | Uint8ClampedArray | Buffer }

/** The flat-share thresholds. Why each number:
 *  - block 16 px at 1080 wide (scaled with the picture): about a brush stroke of a painted texture at phone size; a
 *    plain fill shows as many such blocks with no change inside.
 *  - flat when the block's luma standard deviation is under 3.0 (of 255): H.264 noise on a plain fill measures about
 *    0.5 to 1.5, and at 2.0 a frame of Elijah's final (the one with a lens-blurred room, 48 s) still measured 0.347.
 *  - fail over 0.40 of the judged pixels. Calibrated 11 November 2026: four frames of Elijah's final
 *    (toon-full-v2.mp4 at 3, 15, 30 and 48 s, which Vincent judged too flat) measure 0.47 to 0.67 with the caption
 *    band skipped (cards included: no mask on a finished video); the template's textured courtyard measures 0.22 and
 *    0.26 on the look check's own stills (cards and far band masked); the same courtyard in plain colours 0.89. */
export const FLAT = { block: 16, std: 3.0, max: 0.40 };
/** the checks look.mjs makes. STORY.acknowledged is one list for both tools: look.mjs judges the acknowledgements of
 *  these checks and audit.mjs the rest, so neither reports the other's as unused (Elijah and the widow, 11 November
 *  2026: two look acknowledgements failed the audit as "ack-unused"). */
export const LOOK_CHECKS = new Set(['plain-mesh', 'small-texture', 'detail-thin', 'flat-share']);

/** The share of judged pixels lying in flat blocks (see FLAT). `skip(x, y)` leaves out pixels that are not the world:
 *  cards (the toon people are flat fills by design) and the caption band. A block is judged when most of it is kept. */
export function flatShare(img: Rgb, o: { block?: number; std?: number; skip?: (x: number, y: number) => boolean } = {}): number {
  const { width: W, height: H, data } = img;
  const B = Math.max(4, Math.round((o.block ?? FLAT.block) * W / 1080)), lim = o.std ?? FLAT.std;
  let flat = 0, judged = 0;
  for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
    let n = 0, s = 0, s2 = 0;
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
      if (o.skip?.(x, y)) continue;
      const i = (y * W + x) * 3, l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++; s += l; s2 += l * l;
    }
    if (n < (B * B) / 2) continue;
    const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
    judged += n; if (sd < lim) flat += n;
  }
  return judged ? flat / judged : 0;
}

/** where two renders of the same frame differ (one with the cards, one without): the cards' pixels. `tol` is the
 *  largest channel difference that still counts as the same (default 12: the same frame rendered twice differs by
 *  0 to 3 in the antialiasing). */
export function cardMask(withCards: Rgb, without: Rgb, tol = 12): (x: number, y: number) => boolean {
  if (withCards.width !== without.width || withCards.height !== without.height) throw new Error('cardMask: the two pictures differ in size');
  const W = withCards.width, a = withCards.data, b = without.data;
  return (x, y) => { const i = (y * W + x) * 3; return Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol; };
}

/** the running captions' band as shares of the height (the film template's overlays.tsx: a 240 px box centred at
 *  y 1344 of 1920): never judged */
export const CAPTION_BAND = { top: 0.635, bottom: 0.765 };
