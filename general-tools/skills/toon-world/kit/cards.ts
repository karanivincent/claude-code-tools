// toon-kit cards: checks on the canvases a story draws its cards and words on. It never draws a card.
//
// Pure maths on pixel data, no DOM or Three.js import. Synced into projects by `toon-world/scripts/sync-kit.mjs`.

/** Pixels as a canvas gives them (`ctx.getImageData(0, 0, w, h)`): RGBA, 4 bytes a pixel, rows from the top. */
export interface Pixels { data: ArrayLike<number>; width: number; height: number }

/** The sides of a canvas that its drawing touches: opaque pixels (alpha above `alpha`, default 8 of 255) in the outer
 *  `margin` pixels (default 1) of a side. A drawing that touches its canvas's border is cut by the canvas, and shows as
 *  a straight edge across it in the film. Why: a thought cloud bigger than its canvas had a straight top and right
 *  side (Gibeon r4-r5, 18.0 to 22.6 s) and a person's card ended in a straight line across his robe (23.1 to 23.3 s),
 *  in two cuts running, and no round caught them. Run it on every card and word canvas right after it is drawn, and
 *  name the canvas in the failure. A card meant to run off the frame (a figure cut by the frame's bottom on purpose)
 *  lists that side in `allow`. Returns the touched sides, and the first touching pixel on each. */
export type Side = 'top' | 'bottom' | 'left' | 'right';
export function edgeTouches(px: Pixels, opts: { alpha?: number; margin?: number; allow?: Side[] } = {}): { side: Side; x: number; y: number }[] {
  const alpha = opts.alpha ?? 8, m = Math.max(1, opts.margin ?? 1), { width: w, height: h, data } = px, out: { side: Side; x: number; y: number }[] = [];
  const opaque = (x: number, y: number) => data[(y * w + x) * 4 + 3] > alpha;
  const scan = (side: Side, pts: () => Generator<[number, number]>) => {
    if (opts.allow?.includes(side)) return;
    for (const [x, y] of pts()) if (opaque(x, y)) { out.push({ side, x, y }); return; }
  };
  scan('top', function* () { for (let y = 0; y < Math.min(m, h); y++) for (let x = 0; x < w; x++) yield [x, y]; });
  scan('bottom', function* () { for (let y = Math.max(0, h - m); y < h; y++) for (let x = 0; x < w; x++) yield [x, y]; });
  scan('left', function* () { for (let x = 0; x < Math.min(m, w); x++) for (let y = 0; y < h; y++) yield [x, y]; });
  scan('right', function* () { for (let x = Math.max(0, w - m); x < w; x++) for (let y = 0; y < h; y++) yield [x, y]; });
  return out;
}
/** `edgeTouches` over named canvases, as one line per cut canvas, for the same no-render check as the camera's. */
export function checkCanvases(canvases: { name: string; px: Pixels; allow?: Side[] }[], opts: { alpha?: number; margin?: number } = {}): string[] {
  return canvases.flatMap(c => {
    const t = edgeTouches(c.px, { ...opts, allow: c.allow });
    return t.length ? [`${c.name}: the drawing touches its canvas at the ${t.map(e => `${e.side} (${e.x}, ${e.y})`).join(', ')}; it will show as a straight cut`] : [];
  });
}

/** A hand point kept inside its card's design canvas (the bean cards: 600 x 1000 units), `margin` units in from every
 *  side (default 45: the mitten's radius plus its outline at the adult build). Pulled straight back toward the shoulder
 *  when given (the arm keeps its direction and shortens), else clamped to the box. Why: an arm held out sideways ran
 *  its hand off the card's own canvas, so only the arm showed and the critic saw "an arm ending in a stub" (Elijah and
 *  the widow 2D, critic round 2, 11 November 2026). The canvas border check (`edgeTouches`) then has nothing to find. */
export function clampHand(hand: [number, number], opts: { w?: number; h?: number; margin?: number; shoulder?: [number, number] } = {}): [number, number] {
  const w = opts.w ?? 600, h = opts.h ?? 1000, m = opts.margin ?? 45, [x, y] = hand;
  const inside = (p: [number, number]) => p[0] >= m && p[0] <= w - m && p[1] >= m && p[1] <= h - m;
  if (inside(hand)) return hand;
  const s = opts.shoulder;
  if (s && inside(s)) {
    // the largest k in [0, 1] with shoulder + k (hand - shoulder) inside the box
    let k = 1;
    const dx = x - s[0], dy = y - s[1];
    if (dx > 0) k = Math.min(k, (w - m - s[0]) / dx); else if (dx < 0) k = Math.min(k, (m - s[0]) / dx);
    if (dy > 0) k = Math.min(k, (h - m - s[1]) / dy); else if (dy < 0) k = Math.min(k, (m - s[1]) / dy);
    return [s[0] + dx * k, s[1] + dy * k];
  }
  return [Math.min(w - m, Math.max(m, x)), Math.min(h - m, Math.max(m, y))];
}
