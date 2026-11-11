// The voice timeline and the film's segments: when each word is said, which shot plays when, where its camera is and
// what its clock reads. Pure (no Three.js, no React), so the tests run in Node and the sound script can share it.
// Learned on the jungle holdout (Epiclings, 10 November 2026), whose own copies of these helpers had two bugs:
//  - a word lookup took the first match, so the 1972 card keyed to "by" landed on the "by" of "one by one", 1.8 s early.
//    `W` here throws when a word occurs more than once in its line and no occurrence is given.
//  - one shot split into three camera moves restarted its acting at every split (the list's tick never landed).
//    `resolveClocks` gives consecutive segments of the same shot one shared clock unless one says `clock: 'own'`.

// ---- the voice timeline -------------------------------------------------------------------------------------------

export interface Word { w: string; s: number; e: number }
export interface Line { id: string; who?: string; text?: string; start: number; end: number; words: Word[]; env?: number[] }
export interface Data { fps: number; duration: number; lines: Line[]; references?: string }
export interface TimelineOptions {
  /** picture beats land this many seconds before their word (default 0.06, about two frames) */
  lead?: number;
  /** a segment that starts on a line starts this many seconds before the line (default 0.05) */
  lineLead?: number;
}

/** a word as compared: lower case, letters, digits and apostrophes only ("1972," and "1972" match; "Onoda's" keeps 's) */
export const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export function makeTimeline(data: Data, opts: TimelineOptions = {}) {
  const lead = opts.lead ?? 0.06, lineLead = opts.lineLead ?? 0.05;
  const byId = new Map(data.lines.map(l => [l.id, l]));
  const has = (id: string) => byId.has(id);
  const L = (id: string): Line => {
    const l = byId.get(id);
    if (!l) throw new Error(`no line "${id}"`);
    return l;
  };
  /** every time `word` is said in line `id` */
  const all = (id: string, word: string) => L(id).words.filter(w => norm(w.w) === norm(word));
  /** when `word` is said in line `id`. If the word occurs more than once, `nth` (from 0) is required: a guess on the
   *  first match is how the 1972 card landed on the wrong "by". An `nth` past the last occurrence throws too. */
  const W = (id: string, word: string, nth?: number): number => {
    const hits = all(id, word);
    if (!hits.length) throw new Error(`no word "${word}" in line "${id}": ${L(id).words.map(w => w.w).join(' ')}`);
    if (nth === undefined) {
      if (hits.length > 1) throw new Error(`"${word}" is said ${hits.length} times in line "${id}" (at ${hits.map(h => h.s.toFixed(2)).join(', ')} s): pass which one (0..${hits.length - 1})`);
      return hits[0].s;
    }
    const hit = hits[nth];
    if (!hit) throw new Error(`"${word}" is said ${hits.length} times in line "${id}", there is no occurrence ${nth}`);
    return hit.s;
  };
  /** a picture beat on a word: `lead` seconds before it */
  const onWord = (id: string, word: string, nth?: number) => W(id, word, nth) - lead;
  /** a segment that starts with a line: `lineLead` seconds before it */
  const onLine = (id: string) => L(id).start - lineLead;
  /** the start of the line after this one (or the end of the voice) */
  const next = (id: string) => { const i = data.lines.findIndex(l => l.id === id); return data.lines[i + 1]?.start ?? data.duration; };
  /** how open a speaker's mouth is at t (from the line's loudness envelope), 0 when nobody of that voice speaks */
  const talk = (who: string, t: number) => {
    for (const l of data.lines) {
      if (l.who !== who || !l.env || t < l.start - 0.05 || t > l.end + 0.15) continue;
      const i = Math.floor((t - l.start + 0.05) * data.fps);
      return ((l.env[Math.max(0, i)] ?? 0) + (l.env[Math.max(0, i + 1)] ?? 0)) / 2;
    }
    return 0;
  };
  const words = () => data.lines.flatMap(l => l.words);
  return { data, lines: data.lines, duration: data.duration, fps: data.fps, has, L, W, all, onWord, onLine, next, talk, words };
}
export type Timeline = ReturnType<typeof makeTimeline>;

// ---- easing and views -------------------------------------------------------------------------------------------

export type V3 = [number, number, number];
export interface View { pos: V3; look: V3; fov: number; roll?: number }
/** a camera move relative to a view: `push` a share of the way to the look point (negative pulls back), `side` and
 *  `rise` in metres, `fov` in degrees added, `aim` moves the look point and the camera up (+) or down (-) together, so
 *  a push can re-centre lower on a held page */
export interface Move { push?: number; side?: number; rise?: number; fov?: number; aim?: number }

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const sm = (x: number) => { const c = clamp(x); return c * c * (3 - 2 * c); };
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const L3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const lerpView = (p: View, q: View, k: number): View =>
  ({ pos: L3(p.pos, q.pos, k), look: L3(p.look, q.look, k), fov: lerp(p.fov, q.fov, k), roll: lerp(p.roll ?? 0, q.roll ?? 0, k) });

/** a view moved by `m` (see Move) */
export function pushed(v: View, m: Move): View {
  const d: V3 = [v.look[0] - v.pos[0], v.look[1] - v.pos[1], v.look[2] - v.pos[2]];
  const len = Math.hypot(d[0], d[2]) || 1, sx = -d[2] / len, sz = d[0] / len;   // sideways, level
  const k = m.push ?? 0, s = m.side ?? 0, r = m.rise ?? 0, aim = m.aim ?? 0;
  return { ...v, pos: [v.pos[0] + d[0] * k + sx * s, v.pos[1] + d[1] * k + r + aim, v.pos[2] + d[2] * k + sz * s],
    look: [v.look[0], v.look[1] + aim, v.look[2]], fov: v.fov + (m.fov ?? 0) };
}

// ---- segments -----------------------------------------------------------------------------------------------------

/** how a segment joins the one before: the camera swings from the last framing (same place: the default), or a hard
 *  cut (the default between places; inside a place only for a change of time). Decision 4 (Vincent, 11 November 2026):
 *  joins by default, a hard cut only for a change of place or time, at most 3 plus the loop, each with its reason
 *  (`why`). 'whip' is kept only so older stories still type-check: a whip pan is drawn with motion blur, which is
 *  banned (decision 6), so the film draws it as a cut and checkJoins fails it. */
export type Into = 'swing' | 'whip' | 'cut';
export interface Seg<P extends string = string, A = unknown> {
  place: P; shot: string;
  /** film seconds: from a to b */
  a: number; b: number;
  /** where the camera ends: another shot's framing in the same place, or a move from the shot's own view */
  to?: string | Move;
  /** where the camera starts, as a move from the shot's own view (default: the view itself) */
  from?: Move;
  /** default: swing inside a place, cut between places */
  into?: Into;
  /** why this segment opens on a hard cut (a change of place or of time): checkJoins asks for it on every cut */
  why?: string;
  /** film time the shot's clock starts from. Default: a segment of the same place and shot as the one before it
   *  continues that one's clock (one shot split into several camera moves keeps acting); any other segment starts
   *  its own at `a`. 'own' restarts it here; a number shares a clock with other shots (three angles on one standoff). */
  clock?: number | 'own';
  /** the shot's clock starts this many seconds before its own starting `t` (a shot started early); continued segments
   *  inherit it */
  lead?: number;
  /** the mid-shot punch in: on by default for segments over 1.8 s. false for a flat shot, one with leaves close to the
   *  lens, or one whose subject would leave the frame */
  punch?: boolean;
  /** the far blur in px at 1080 wide (0 = sharp), overriding the shot's */
  blur?: number;
  /** story-specific acting on top of the shot's own (the template passes `(t, people) => people`) */
  act?: A;
}
export type Resolved<S extends Seg<string, unknown>> = Omit<S, 'clock' | 'lead'> & { clock: number; lead: number };

/** fills every segment's clock and lead (see Seg.clock) */
export function resolveClocks<S extends Seg<string, unknown>>(segs: S[]): Resolved<S>[] {
  const out: Resolved<S>[] = [];
  segs.forEach((s, i) => {
    const prev = out[i - 1], cont = prev && prev.place === s.place && prev.shot === s.shot && s.clock === undefined;
    const clock = typeof s.clock === 'number' ? s.clock : cont ? prev.clock : s.a;
    const lead = s.lead ?? (cont ? prev.lead : 0);
    out.push({ ...s, clock, lead });
  });
  return out;
}

/** the segment playing at t (the last one after the end) */
export const segAt = (segs: { b: number }[], t: number) => { const i = segs.findIndex(s => t < s.b); return i < 0 ? segs.length - 1 : i; };

/** the shot's own clock at film time t, from its starting `t` (the time the board still shows) */
export const shotClock = (s: { clock: number; lead: number }, t: number, shotT0 = 0) => shotT0 + (t - s.clock) - s.lead;

/** the film time at which a shot's own clock reads `x` (its first segment): picture events exported from a place
 *  (shots fired, falls) become film times for the audit and the sound */
export function filmTimeOf(segs: Resolved<Seg>[], shot: string, x: number, shotT0 = 0) {
  const s = segs.find(z => z.shot === shot);
  if (!s) throw new Error(`no segment plays shot "${shot}"`);
  return s.clock + s.lead + (x - shotT0);
}

export interface PunchOptions { minDur?: number; push?: number; side?: number; roll?: number; glide?: number }
/** a segment's framing at time t: its view creeping towards `to` (never stalling: half linear, half eased), and on a
 *  segment longer than 1.8 s a punch in at its middle (a 0.5 s glide 16% closer, a little sideways and rolled,
 *  alternating sides by the segment's index `n`), so no hold reads as a still */
export function viewAt(s: Seg, base: View, other: (shot: string) => View, t: number, n: number, o: PunchOptions = {}): View {
  const u = clamp((t - s.a) / Math.max(0.01, s.b - s.a));
  const k = 0.5 * u + 0.5 * sm(u);
  const start = s.from ? pushed(base, s.from) : base;
  const end = !s.to ? base : typeof s.to === 'string' ? other(s.to) : pushed(base, s.to);
  let v = lerpView(start, end, k);
  const dur = s.b - s.a;
  if (dur > (o.minDur ?? 1.8) && s.punch !== false) {
    const mid = s.a + dur * 0.5, side = (o.side ?? 0.12) * (n % 2 ? 1 : -1), roll = (o.roll ?? 0.035) * (n % 2 ? 1 : -1);
    const close = { ...pushed(v, { push: o.push ?? 0.16, side }), roll: (v.roll ?? 0) + roll };
    v = lerpView(v, close, sm((t - mid) / (o.glide ?? 0.5)));
  }
  return v;
}

/** how segment i joins the one before it */
export const intoOf = (segs: Seg[], i: number): Into =>
  segs[i].into ?? (i > 0 && segs[i - 1].place === segs[i].place ? 'swing' : 'cut');

/** The joins against decision 4: every hard cut (after the first segment) has its reason in `why`; there are at most
 *  `max` of them (default 3; the loop back to the start is not a segment and not counted); a cut inside one place
 *  says why (a change of time); no whip pans (motion blur, decision 6). Why: the jungle holdout's whips and Elijah's
 *  eight place-to-place whips read as hard cuts, and the owner asked for joins. */
export function checkJoins(segs: Seg[], max = 3): string[] {
  const out: string[] = [], cuts: number[] = [];
  segs.forEach((s, i) => {
    if (i === 0) return;
    const into = intoOf(segs, i), name = `${i} ${s.place}/${s.shot} at ${s.a.toFixed(2)} s`;
    if (into === 'whip') out.push(`${name}: a whip pan (motion blur is banned, decision 6): join by a swing, or cut with a reason`);
    if (into === 'cut' || into === 'whip') {
      cuts.push(i);
      if (!s.why || !s.why.trim()) out.push(`${name}: a hard cut with no reason; give \`why\` (a change of place or time) or join by a swing`);
    }
  });
  if (cuts.length > max) out.push(`joins: ${cuts.length} hard cuts (at ${cuts.map(i => segs[i].a.toFixed(1)).join(', ')} s), over ${max}: join the rest by swings inside a place`);
  return out;
}

export interface FilmTiming { swing?: number; whip?: number }
/** the camera at film time t: the segment's framing, swung from the last segment's final framing for the first
 *  `swing` seconds (default 0.45) when it joins by a swing; plus the shot's clock. The swing is a straight blend of the
 *  two framings, so it never rises above the higher of them into empty sky (there is no lift; the old 14 m swingAt
 *  lift is gone). `whip` is always 0 now: a whip join is drawn as a cut (see Into). */
export function frameAt(segs: Resolved<Seg>[], t: number, base: (shot: string) => View, shotT0: (shot: string) => number, o: FilmTiming = {}) {
  const SWING = o.swing ?? 0.45, WHIP = o.whip ?? 0.16;
  const i = segAt(segs, t), s = segs[i], prev = segs[i - 1];
  let view = viewAt(s, base(s.shot), base, t, i);
  const into = intoOf(segs, i);
  if (into === 'swing' && prev && t - s.a < SWING) view = lerpView(viewAt(prev, base(prev.shot), base, prev.b, i - 1), view, sm((t - s.a) / SWING));
  void WHIP;
  return { i, seg: s, view, clock: shotClock(s, t, shotT0(s.shot)), whip: 0 };
}

/** how strong a whip pan's motion blur would be at t (0..1), on both sides of a whip join. Deprecated: motion blur is
 *  banned (decision 6) and the film template no longer draws it; kept so older stories still build. */
export function whipAt(segs: Seg[], t: number, whip = 0.16) {
  const i = segAt(segs, t), s = segs[i], next = segs[i + 1];
  const wIn = intoOf(segs, i) === 'whip' && Math.abs(t - s.a) < whip ? 1 - Math.abs(t - s.a) / whip : 0;
  const wOut = next && intoOf(segs, i + 1) === 'whip' && s.b - t < whip ? 1 - (s.b - t) / whip : 0;
  return clamp(Math.max(wIn, wOut));
}

/** problems in a segment list: gaps or overlaps between segments, empty or backwards segments, a `to` naming a shot
 *  the place does not have (pass `shots`) */
export function checkSegs(segs: Seg[], shots?: (place: string) => string[]): string[] {
  const out: string[] = [];
  segs.forEach((s, i) => {
    const name = `${i} ${s.place}/${s.shot}`;
    if (!(s.b > s.a)) out.push(`${name}: ends at ${s.b.toFixed(2)} s, not after its start ${s.a.toFixed(2)} s`);
    const p = segs[i - 1];
    if (p && Math.abs(p.b - s.a) > 1e-6) out.push(`${name}: starts at ${s.a.toFixed(2)} s but the one before ends at ${p.b.toFixed(2)} s`);
    if (shots) {
      const have = shots(s.place);
      if (!have.includes(s.shot)) out.push(`${name}: the place has no shot "${s.shot}"`);
      if (typeof s.to === 'string' && !have.includes(s.to)) out.push(`${name}: to "${s.to}" is not a shot of ${s.place}`);
    }
  });
  return out;
}

/** the planned pace, from the segment list alone (no render): every segment start is a picture change, and so is the
 *  mid-shot punch-in of a segment over 1.8 s that has not turned it off. Ricks Clips runs about 60 a minute; the
 *  jungle holdout planned one board shot per line and stayed at 22-24 through six cuts, because no fix round can add
 *  shots the board did not plan. Plan 2 to 3 framings per line on the board. */
export function planPace(segs: { a: number; b: number; punch?: boolean }[], duration: number): { changes: number; perMinute: number } {
  const changes = segs.length + segs.filter(s => s.b - s.a > 1.8 && s.punch !== false).length;
  return { changes, perMinute: +(changes / Math.max(1, duration) * 60).toFixed(1) };
}
/** a line for the audit when the planned pace is under `min` changes a minute. Default 25: the dynamics profile's
 *  floor (toon-video, the pace a story's profile asks for at least); 40 was the jungle holdout's own target and failed
 *  calmer stories the profile allows. */
export function checkPace(segs: { a: number; b: number; punch?: boolean }[], duration: number, min = 25): string[] {
  const { changes, perMinute } = planPace(segs, duration);
  return perMinute < min ? [`pace: ${perMinute} picture changes a minute planned (${changes} in ${duration.toFixed(1)} s), under ${min}: plan more framings per line on the board`] : [];
}
