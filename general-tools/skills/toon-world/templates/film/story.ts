import type { Resolved, Seg } from '../../toon-kit/timing';

// What the film template needs to know about this story. new-film.mjs filled in the slug; the rest is yours.
// tools/audit.mjs, tools/look.mjs and tools/gate.mjs read it (the gate refuses a render while any check fails).
export const STORY = {
  /** the folder under public/ that holds pictures/, models/, sound/ and the narrator's mix */
  slug: '__SLUG__',
  /** the mixed sound (the film plays it unless rendered silent with audio: ''). The sound script writes voice.wav and
   *  bed.wav beside it; the gate measures them (levels.mjs). Laura is the default narrator (decision 8). */
  audio: '__SLUG__/laura/mix.wav',
  /** behind the canvas while a place loads */
  background: '#1d2a22',
  /** the cast who must stay whole and readable in frame (extras may be cut): their `who` keys */
  named: new Set<string>(['a']),   // the template cast's stand-in; the story's own keys
  /** a card's head centre and top above its feet in metres at scale 1 (the bean-head cards: 1.46 and 1.85) */
  headY: 1.46, topY: 1.85,
  /** the picture events the sound must match, in film time, for the audit's sync check: shots fired, hits, falls,
   *  a bell. A place exports its action times in its own clock; turn them into film time with toon-kit filmTimeOf:
   *    ...SHOTS_FIRED.map((x, i) => ({ name: `shot:hook:${i}`, t: filmTimeOf(segs, 'hook', x, HOOK_T0) }))
   *  The sound script writes the same kinds ("shot", "hit") into public/<slug>/sound/cues.json. */
  events: (segs: Resolved<Seg>[]): { name: string; t: number }[] => { void segs; return []; },
  /** what each line promises the viewer sees, from the meaning sheet (stories/<slug>/meaning.md): on the word's time,
   *  these subjects are in frame and big enough (toon-kit checkMustSee). A subject is a person's key or a thing named
   *  in `subjects` below. `at` in film seconds (TL.W('line', 'word') in shots.ts). Every verb of the meaning sheet
   *  needs one; the audit fails a story with none. */
  mustSee: [{ word: '(the first line)', at: 0.5, subjects: ['a'] }] as { word: string; at: number; subjects: string[]; size?: number; hold?: number; words?: boolean; whole?: boolean }[],
  /** things a line names that are not people (a jar, a gate): world centre and radius in metres, and their place */
  subjects: {} as Record<string, { place: string; at: [number, number, number]; r: number }>,
  /** a look into the sky on purpose (the sun the line names), film seconds [from, to] */
  skyPlanned: [] as [number, number][],
  /** a blocker filling the lens on purpose (a push past a lamp), film seconds, with the reason (toon-kit checkLens) */
  framed: [] as { from: number; to: number; why: string }[],
  /** silent pauses the script plans (a held breath before the reveal), film seconds: levels.mjs's dead-air check
   *  allows silence inside them */
  pauses: [] as [number, number][],
  /** the reference video the look is measured against (measure_sharp.py), a path under the project; '' measures
   *  against the absolute targets only */
  reference: '',
  /** an issue the gate lets through, each with its reason (said to the owner at hand-back). Matched by the check's
   *  name and, when given, a time inside the issue, its shot and its person. No reason, no pass. A measured miss the
   *  owner accepts after seeing the frames is `{ check: 'measure-<name>', reason }` (measure-sharpness ...). */
  acknowledged: [] as { check: string; at?: number; shot?: string; who?: string; reason: string }[],
};
