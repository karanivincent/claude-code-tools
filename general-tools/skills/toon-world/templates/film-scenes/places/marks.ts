// __SLUG__: where things stand in each place, shared by the place files (the world pass) and the scenes (people and
// motion passes). No three.js here: the scene tools load it in node.
export const SHORE = {
  /** the shelf's top (m above the water); its edge runs along z at x = 0, the water is at +x */
  top: 2.2,
  hero: [-0.5, 2.2, 0.0] as [number, number, number],
  friend: [-1.0, 2.2, -2.6] as [number, number, number],
};
