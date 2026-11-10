import type { PlaceDef } from '../place';

// Every place of the story, loaded only when a shot of it is rendered. Each file default-exports a PlaceDef.
export const PLACES = {
  example: () => import('./example').then(m => m.default),
} satisfies Record<string, () => Promise<PlaceDef>>;
export type PlaceName = keyof typeof PLACES;
