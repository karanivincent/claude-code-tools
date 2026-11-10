import type { Resolved, Seg } from '../../toon-kit/timing';

// What the film template needs to know about this story. new-film.mjs filled in the slug; the rest is yours.
export const STORY = {
  /** the folder under public/ that holds pictures/, models/, sound/ and the narrator's mix */
  slug: '__SLUG__',
  /** the mixed sound (the film plays it unless rendered silent with audio: '') */
  audio: '__SLUG__/laura/mix.wav',
  /** behind the canvas while a place loads */
  background: '#1d2a22',
  /** the cast who must stay whole and readable in frame (extras may be cut): their `who` keys */
  named: new Set<string>([]),
  /** a card's head centre and top above its feet in metres at scale 1 (the bean-head cards: 1.46 and 1.85) */
  headY: 1.46, topY: 1.85,
  /** the picture events the sound must match, in film time, for the audit's sync check: shots fired, hits, falls,
   *  a bell. A place exports its action times in its own clock; turn them into film time with toon-kit filmTimeOf:
   *    ...SHOTS_FIRED.map((x, i) => ({ name: `shot:hook:${i}`, t: filmTimeOf(segs, 'hook', x, HOOK_T0) }))
   *  The sound script writes the same kinds ("shot", "hit") into public/<slug>/sound/cues.json. */
  events: (segs: Resolved<Seg>[]): { name: string; t: number }[] => { void segs; return []; },
};
