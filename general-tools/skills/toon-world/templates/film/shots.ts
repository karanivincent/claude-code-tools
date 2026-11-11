import full from './full.json';
import { makeTimeline, resolveClocks, type Data, type Seg } from '../../toon-kit/timing';
import type { PlaceName } from './places';
import type { Person } from './cast';
import { captionsOf, type CardDef, type PaperDef, type ThoughtDef } from './overlays';

// The story told shot by shot on the approved board. Every segment is a board shot played for a stretch of the voice
// (a and b from word times): its camera eases from the shot's framing towards `to` (another shot of the same place,
// or a move: push, side, rise, fov, aim), its place's clock runs, and `act` changes the people by time. Picture beats
// land a couple of frames before their word (TL.onWord). Defaults, each from a round lost on the jungle holdout:
//  - W throws when a word is said twice in its line and you did not say which (the 1972 card on "one by one").
//  - consecutive segments of the same shot share one clock (the list's tick restarted at every camera move).
//  - segments over 1.8 s punch in at their middle (no hold reads as a still); punch: false where the subject would
//    leave the frame or leaves sit close to the lens.
//  - the same place joins by a swing; a new place, or a change of time, by a hard cut with its reason (`why`), at most
//    3 plus the loop (decision 4; toon-kit checkJoins fails the rest). No whip pans (motion blur is banned).
//  - the film opens on a big subject that moves from frame 1, with the hook card up at 0.0 s (checkOpening).

export const TL = makeTimeline(full as unknown as Data);
const W = TL.onWord, S = TL.onLine;
void W; void S;

/** the film ends 0.5 s after the last word, on the music's closing chord (the sound script uses the same tail). Why:
 *  Elijah's 1.4 s tail played in silence after the music ended: dead air on a looping Short (levels.mjs fails over
 *  0.6 s of silence at the end) */
export const END = TL.duration + 0.5;
export type Act = (t: number, base: Person[]) => Person[];

export const SEGS = resolveClocks<Seg<PlaceName, Act>>([
  // the opening: a big subject, the camera already pushing in on frame 0, the hook card up (CARDS)
  { place: 'example', shot: 'medium', a: 0, b: Math.min(2.4, END / 2), to: { push: 0.12 }, punch: false },
  { place: 'example', shot: 'wide', a: Math.min(2.4, END / 2), b: END, to: { push: 0.2 } },
]);

/** the hook card is first, at a = 0: drawn whole on frame 0 (replace the text with the hook's words) */
export const CARDS: CardDef[] = [{ text: 'HOOK', a: 0, b: Math.min(1.6, END) }];
export const PAPERS: PaperDef[] = [];
export const THOUGHTS: ThoughtDef[] = [];
/** the running captions: one word at a time from the voice (never remove; the audit fails a film without them) */
export const CAPTIONS = captionsOf(full as unknown as Parameters<typeof captionsOf>[0]);
export const DURATION = END;
