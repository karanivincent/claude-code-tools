import * as THREE from 'three';

// Is anything solid between the lens and what the shot is about, or does the camera pass through a wall on its way
// from one view to the next? Elijah and the widow 2D (11 November 2026): camera glides between shots of one place went
// through walls and floors, and nothing found it; the rule says cut, and these two tests are the proof.
//
//   const solids = solidsOf(scene);
//   blockedView(solids, cam.position, subjectPoint)       // hits between the lens and the subject (a head, a jar)
//   glideHits(solids, [viewA.pos, ...samples, viewB.pos])  // solids the camera's path passes through, with where
//
// Call them in the audit sample (Stage.tsx, debug 'audit'), where the scene is built: log a blocked view for each
// named person and must-see subject, and the glide's hits from the last frame's camera to this one in the same place.
// A hit nearer than `skip` to either end is ignored (the floor under the feet, a wall the subject leans on).

/** what can block a view: visible meshes that write depth, not the far band (userData.far, renderOrder -10), not
 *  people's cards (userData.card), not glows and dust (additive or transparent without depth) */
export function solidsOf(scene: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let hidden = false, far = false, card = false;
    for (let q: THREE.Object3D | null = o; q; q = q.parent) { hidden ||= !q.visible; far ||= !!q.userData.far || q.renderOrder === -10; card ||= !!q.userData.card; }
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[];
    const see = mats.every(mt => mt.blending === THREE.AdditiveBlending || mt.blending === THREE.CustomBlending || (mt.transparent && !mt.depthWrite) || !mt.visible);
    if (!hidden && !far && !card && !see) out.push(o);
  });
  return out;
}

export interface Hit { name: string; at: [number, number, number]; distance: number }
const ray = new THREE.Raycaster();
const hitsOn = (solids: THREE.Object3D[], a: THREE.Vector3, b: THREE.Vector3, skip: number): Hit[] => {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-6) return [];
  // both ways: a one-sided wall is only hit from its front, and a glide may cross it from behind
  const cast = (from: THREE.Vector3, dir: THREE.Vector3, flip: boolean) => {
    ray.set(from, dir); ray.near = skip; ray.far = Math.max(skip, len - skip);
    return ray.intersectObjects(solids, false).map(h => ({ o: h.object, p: h.point, d: flip ? len - h.distance : h.distance }));
  };
  const dir = d.divideScalar(len), seen = new Map<string, Hit>();
  for (const h of [...cast(a, dir, false), ...cast(b, dir.clone().negate(), true)]) {
    const key = `${h.o.uuid}|${h.d.toFixed(2)}`;
    if (!seen.has(key)) seen.set(key, { name: h.o.name || h.o.parent?.name || h.o.type, at: h.p.toArray().map(x => +x.toFixed(3)) as [number, number, number], distance: +h.d.toFixed(3) });
  }
  return [...seen.values()].sort((x, y) => x.distance - y.distance);
};

/** solids between the lens and a point of the subject (its head, the jar's middle); empty when the view is clear */
export function blockedView(solids: THREE.Object3D[], lens: THREE.Vector3 | [number, number, number], subject: THREE.Vector3 | [number, number, number], skip = 0.15): Hit[] {
  const v = (p: THREE.Vector3 | [number, number, number]) => (Array.isArray(p) ? new THREE.Vector3(...p) : p.clone());
  return hitsOn(solids, v(lens), v(subject), skip);
}

/** solids the camera passes through along a path of positions (two views and the frames between them): each hit with
 *  the step it happened on. Empty: the glide stays in open air; any hit: cut instead, or move the path */
export function glideHits(solids: THREE.Object3D[], path: (THREE.Vector3 | [number, number, number])[], skip = 0): (Hit & { step: number })[] {
  const pts = path.map(p => (Array.isArray(p) ? new THREE.Vector3(...p) : p.clone()));
  const out: (Hit & { step: number })[] = [];
  for (let i = 1; i < pts.length; i++) for (const h of hitsOn(solids, pts[i - 1], pts[i], skip)) out.push({ ...h, step: i });
  return out;
}
