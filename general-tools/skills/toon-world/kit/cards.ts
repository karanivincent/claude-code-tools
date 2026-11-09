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
