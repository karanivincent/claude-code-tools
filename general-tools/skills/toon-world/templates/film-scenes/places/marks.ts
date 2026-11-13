// __SLUG__: where things stand in each place, shared by the place files (the world stage) and the scenes (the shots
// stage and the scene builders). No three.js here: the scene tools load it in node.
// The stand-in's numbers are not the story's: a story's cliff, room or field has its own heights, and every camera is
// set from them, so change these first (the cliff film's shelf went from 2.2 m to 7.6 m and every camera moved).
export type Box = { name: string; min: [number, number, number]; max: [number, number, number] };

export const SHORE = {
  /** the shelf's top (m above the water); its edge runs along z at x = 0, the water is at +x */
  top: 2.2,
  hero: [-0.5, 2.2, 0.0] as [number, number, number],
  friend: [-1.0, 2.2, -2.6] as [number, number, number],
};

/** Each place's far picture: the way it faces (x, z) and its arc in radians (parts/blend.ts farPicture `toward` and
 *  `arc`). tools/shots-check.mjs checks that every shot looks into it (S5-72): in the cliff film the camera looked
 *  away from the far picture, and the sky behind the jump was a flat gradient with an empty horizon. */
export const FAR: Record<string, { toward: [number, number]; arc: number }> = {
  shore: { toward: [-0.6, -0.8], arc: 1.9 },
};

/** Solid things that can hide a person: walls, posts, trunks, rocks (world boxes). tools/path-check.mjs checks the
 *  hero is not behind one on screen (S5-80); a figure is checked against the other figures without this list. */
export const BLOCKERS: Record<string, Box[]> = {
  shore: [],
};

/** Screen direction per place (S5-79): from the side the cameras film it, which way is screen right. In the cliff
 *  film one round was lost to a walk the wrong way. Name the side and keep every scene on it unless a shot says why. */
export const SCREEN: Record<string, string> = {
  shore: 'cameras on the water side (+x) look toward -x: screen right is -z, screen left is +z',
};
