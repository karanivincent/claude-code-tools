// __SLUG__: each person's size, set once for the whole film by the shots stage and locked with the cameras (S5-74).
// [width, height] factors on the card (1 = the rig's own size): a friend a couple of years older and taller might be
// [1.04, 1.1]. Scenes never change it: a scene's sx/sy is squash and stretch on top, eased across joins (joins.ts
// holdCards). In the cliff film each builder scaled Josh in their own scenes, and his height jumped at a join.
// No three.js here: the scene tools (path-check, shots-check) load it in node.
export const SCALE: Record<string, [number, number]> = {
  hero: [1, 1],
  friend: [1, 1],
};
/** a person's size factors (1, 1 for anyone not listed) */
export const sizeOf = (who: string): [number, number] => SCALE[who] ?? [1, 1];
