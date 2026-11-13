// __SLUG__: the film's frame plan. One source for every scene's length and where it starts in the film's one mix.
// Each scene is 5-10 s (150-300 frames at 30 fps) and renders on its own in about 15 s; the Film composition plays them
// in order over the full mix. new-film.mjs adds a line here for each scene it makes; change `frames` freely (the
// scene's composition, its audio offset and the Film follow). Keep the order the order of the story.
export const FPS = 30, WIDTH = 1080, HEIGHT = 1920;
/** the film's one mix in public/ (scripts/<slug>-sound.mjs writes it here); scenes play their slice of it */
export const MIX = '__SLUG__/full/mix.wav';
export const SCENES: { id: string; frames: number }[] = [
  // <scenes>
  // </scenes>
];
const at = (id: string) => { const i = SCENES.findIndex((s) => s.id === id); if (i < 0) throw new Error(`plan.ts: no scene "${id}" in SCENES`); return i; };
/** the scene's first frame in the film (and in the mix) */
export const sceneFrom = (id: string) => SCENES.slice(0, at(id)).reduce((n, s) => n + s.frames, 0);
export const sceneFrames = (id: string) => SCENES[at(id)].frames;
export const TOTAL = SCENES.reduce((n, s) => n + s.frames, 0);
