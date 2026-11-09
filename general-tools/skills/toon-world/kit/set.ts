// toon-kit set: the measuring side of building a set in code. It never draws a wall, a band or a door: each video draws
// its own, from the numbers these give it.
//
// Pure maths, no Three.js import. Synced into projects by `toon-world/scripts/sync-kit.mjs`.

/** A hole in a wall, in the wall's own coordinates (metres along the wall, metres up from the floor): the same list the
 *  wall is cut with. A doorway starts at the floor (y0 0). */
export interface Opening { x0: number; x1: number; y0: number; y1: number; name?: string }

/** The pieces of a horizontal strip on a wall (a painted lower band, a dado or picture rail, a skirting, a string
 *  course) between `from` and `to` along the wall, from height y0 to y1, cut at every opening the strip crosses. Pass
 *  the same openings the wall is cut with, and draw one piece per span, so no band, rail or skirting can run across a
 *  doorway or a window. Why: a hall's lower band and its rail were one piece each, sized to the room, so they crossed
 *  the street door 5 mm in front of it and the door stood on them at waist height like a cupboard (Mona Lisa, 21.6 to
 *  22.6 s); five critic rounds missed it, the owner found it. The hotel's skirting crossed its door the same way.
 *  Returns [start, end] pairs along the wall, each at least `minPiece` long (default 0.02 m; slivers are dropped). */
export function trimSpans(from: number, to: number, openings: Opening[], y0: number, y1: number, minPiece = 0.02): [number, number][] {
  const cuts = openings
    .filter(o => o.y0 < y1 && o.y1 > y0)                 // only openings the strip's height crosses
    .map(o => [Math.max(from, Math.min(o.x0, o.x1)), Math.min(to, Math.max(o.x0, o.x1))] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let x = from;
  for (const [a, b] of cuts) {
    if (a - x >= minPiece) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (to - x >= minPiece) out.push([x, to]);
  return out;
}
