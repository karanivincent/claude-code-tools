// toon-kit light: the time of day on the whole lit world, not only on the sky (Remotion + Three.js).
//
// Settings only: it sets no palette. Each video picks its own colour for each time of day.
// Gibeon r3: a night set changed its sky and key light while every surface kept its day paint (vertex colours and
// textures), so the camp read as late afternoon (44.5 s). Multiplying every lit material by one night colour put the
// night on the ground too, and the torches then painted warm pools on it (frames 1335 and 1360).
//
// It imports Three.js for types only, so it runs in Node tests without Three installed. camera.ts and props.ts stay
// free of Three. Synced into projects by `toon-world/scripts/sync-kit.mjs`.
import type { Material, Object3D } from 'three';

/** a colour as Three.js holds it (linear r, g, b from 0 to 1): a THREE.Color works, so does { r, g, b } */
export interface Tint { r: number; g: number; b: number }
interface Coloured { color: Tint; userData: Record<string, unknown>; clone(): Material }
const DAY = 'toonDayColour';
/** lit materials respond to lights; an unlit one (MeshBasicMaterial: a flame, a glow, a sky card) keeps its colour */
const isLit = (m: Material): boolean => {
  const x = m as unknown as Record<string, unknown>;
  return !!(x.isMeshStandardMaterial || x.isMeshPhysicalMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial || x.isMeshToonMaterial) && !!x.color;
};

/** Multiply every lit material under `root` by one colour for the time of day. Run it after the set is built and
 *  before people and effects are added (or `skip` them), so the people keep their own light rules.
 *  - A material shared with another set is cloned first, so a day set that shares it keeps its day colour.
 *  - The day colour is kept on the material, so calling it again (every frame, for a dusk that deepens) re-tints from
 *    the day colour and never compounds. A white tint gives the day back.
 *  - Material colour multiplies vertex colours and textures in the shader, so painted and textured ground darkens too.
 *  `skip` leaves out an object and everything under it. Returns the number of materials tinted.
 *  Night with this: lower the brightness and move the hue (a cool tint); keep the grade's saturation at or above the
 *  day's and add one warm light source. Never show night by draining colour (toon-world, "The look stack"). */
export function timeOfDay(root: Object3D, tint: Tint, opts: { skip?: (o: Object3D) => boolean } = {}): number {
  const done = new Map<Material, Material>();
  const one = (m: Material): Material => {
    if (!isLit(m)) return m;
    const seen = done.get(m);
    if (seen) return seen;
    // a material this block already tinted is re-tinted in place; any other is cloned so day sets keep theirs
    const own = (m.userData?.[DAY] ? m : m.clone()) as unknown as Coloured;
    const day = (own.userData[DAY] as Tint | undefined) ?? { r: own.color.r, g: own.color.g, b: own.color.b };
    own.userData[DAY] = day;
    own.color.r = day.r * tint.r; own.color.g = day.g * tint.g; own.color.b = day.b * tint.b;
    const out = own as unknown as Material;
    done.set(m, out);
    return out;
  };
  const skipped = new Set<Object3D>();
  root.traverse(o => {
    if (o.parent && skipped.has(o.parent)) { skipped.add(o); return; }
    if (opts.skip?.(o)) { skipped.add(o); return; }
    const holder = o as Object3D & { material?: Material | Material[] };
    if (!holder.material) return;
    holder.material = Array.isArray(holder.material) ? holder.material.map(one) : one(holder.material);
  });
  return done.size;
}
