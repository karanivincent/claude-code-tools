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
//  - a new place joins by a whip pan, the same place by a swing; into: 'cut' when a swing would pass through a prop.

export const TL = makeTimeline(full as unknown as Data);
const W = TL.onWord, S = TL.onLine;
void W; void S;

/** a last held beat and the music's closing chord after the final word (the sound script uses the same tail) */
export const END = TL.duration + 1.4;
export type Act = (t: number, base: Person[]) => Person[];

export const SEGS = resolveClocks<Seg<PlaceName, Act>>([
  { place: 'example', shot: 'wide', a: 0, b: END, to: { push: 0.2 } },
]);

export const CARDS: CardDef[] = [];
export const PAPERS: PaperDef[] = [];
export const THOUGHTS: ThoughtDef[] = [];
/** the running captions: one word at a time from the voice (never remove; the audit fails a film without them) */
export const CAPTIONS = captionsOf(full as unknown as Parameters<typeof captionsOf>[0]);
export const DURATION = END;
