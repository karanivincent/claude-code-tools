// The acting audit: what a critic used to find only after a full render (jungle holdout, cuts 1-5, 10 November 2026),
// checked from numbers sampled over the film, no video needed. The story samples each frame (or every few frames) from
// its own shot code: who is on screen, a signature of each person's pose, where their head and feet land in the frame,
// where held props and the hands holding them land; and lists its cards and its picture events. These checks read
// those numbers. Screen points are shares of the frame: x 0..1 left to right, y 0..1 top to bottom.

export type XY = [number, number];
export interface PersonSample {
  key: string;
  /** anything that changes when the person visibly acts: the pose options, the expression, the hand targets, where
   *  they stand rounded to a few cm. The blink is left out: a blink alone is not acting. */
  sig: string;
  head?: XY; feet?: XY;
  /** the person's height on screen, as a share of the frame height */
  height?: number;
  /** a named person must stay whole in frame; extras may be cut */
  named?: boolean;
}
export interface PropSample { name: string; at: XY; holder?: string; hand?: XY }
/** the camera this frame (world metres, degrees), when the film logs it: the opening's motion and the camera checks */
export interface CamSample { pos: [number, number, number]; look: [number, number, number]; fov: number }
export interface Sample { t: number; shot: string; people: PersonSample[]; props?: PropSample[]; cam?: CamSample }
export interface Issue { check: string; from: number; to: number; shot: string; who?: string; what: string }

/** stretches longer than `maxStill` seconds where nobody on screen changes pose (default 1 s). Camera moves do not
 *  count: the critics scored a locked pose under a moving camera as frozen (2 of 5). */
export function actingStills(samples: Sample[], opts: { maxStill?: number } = {}): Issue[] {
  const maxStill = opts.maxStill ?? 1.0, out: Issue[] = [];
  let runStart: Sample | null = null, last: Sample | null = null, prevSig = '';
  const close = (end: Sample) => {
    if (runStart && end.t - runStart.t > maxStill)
      out.push({ check: 'acting-still', from: runStart.t, to: end.t, shot: runStart.shot, what: `nobody on screen changes pose for ${(end.t - runStart.t).toFixed(1)} s` });
  };
  for (const s of samples) {
    const sig = s.people.length ? s.people.map(p => `${p.key}:${p.sig}`).sort().join('|') : '';
    const sameShot = last && last.shot === s.shot;
    if (!s.people.length) { if (runStart && last) close(last); runStart = null; prevSig = ''; last = s; continue; }
    if (!sameShot || sig !== prevSig) { if (runStart && last) close(last); runStart = s; }
    prevSig = sig; last = s;
  }
  if (runStart && last) close(last);
  return out;
}

/** heads cut by the frame's edge (named people at any edge, everyone at the bottom), and named people too small to
 *  read on a phone (under `minHeight` of the frame, default 0.08). Runs of frames are merged. */
export function checkFraming(samples: Sample[], opts: { edge?: number; minHeight?: number } = {}): Issue[] {
  const edge = opts.edge ?? 0.02, minH = opts.minHeight ?? 0.08, raw: Issue[] = [];
  const out = (q?: XY) => !!q && (q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1);
  for (const s of samples) for (const p of s.people) {
    if (out(p.head) && out(p.feet)) continue;   // wholly off screen (or behind the lens): not a cut head
    if (p.head && p.named !== false) {
      const [x, y] = p.head, cut = y < edge ? 'top' : x < edge ? 'left' : x > 1 - edge ? 'right' : y > 1 - edge ? 'bottom' : '';
      if (cut) raw.push({ check: 'head-cut', from: s.t, to: s.t, shot: s.shot, who: p.key, what: `head cut by the ${cut} edge` });
    }
    if (p.named && p.height !== undefined && p.height < minH && p.head && p.head[1] > 0 && p.head[1] < 1)
      raw.push({ check: 'too-small', from: s.t, to: s.t, shot: s.shot, who: p.key, what: `only ${(p.height * 100).toFixed(0)}% of the frame high` });
  }
  return merge(raw);
}

/** props that should be in a hand but are not: the prop's point further than `maxGap` (share of the frame height,
 *  default 0.05) from its holder's hand. The leaflet on the rifle's end, the floating pencil, the sword held by nobody. */
export function checkHeld(samples: Sample[], opts: { maxGap?: number } = {}): Issue[] {
  const maxGap = opts.maxGap ?? 0.05, raw: Issue[] = [];
  for (const s of samples) for (const pr of s.props ?? []) {
    if (!pr.holder) continue;
    if (!pr.hand) { raw.push({ check: 'not-held', from: s.t, to: s.t, shot: s.shot, who: pr.holder, what: `${pr.name} has no hand on it` }); continue; }
    const d = Math.hypot(pr.at[0] - pr.hand[0], pr.at[1] - pr.hand[1]);
    if (d > maxGap) raw.push({ check: 'not-held', from: s.t, to: s.t, shot: s.shot, who: pr.holder, what: `${pr.name} ${(d * 100).toFixed(0)}% of the frame from the hand` });
  }
  return merge(raw);
}

export interface Word { w: string; s: number }
export interface Cue { text: string; at: number; until?: number }
const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** cards and cues on their words: a card whose text (or any word of it) is spoken must arrive between `lead` before
 *  (default 0.4 s) and `late` after (default 0.2 s) the nearest time that word is said. The 1972 card keyed to the "by"
 *  of "one by one" instead of "By 1972" arrived 1.8 s early. Cards whose text is never spoken are not judged. */
export function checkCues(cues: Cue[], words: Word[], opts: { lead?: number; late?: number } = {}): Issue[] {
  const lead = opts.lead ?? 0.4, late = opts.late ?? 0.2, out: Issue[] = [];
  for (const c of cues) {
    // the hook card is up from frame 0 by rule (checkOpening), before any word can be said: not judged against words
    // (Elijah and the widow 2D: the opening card at 0.0 s was flagged "0.65 s before 'one'")
    if (c.at <= OPENING_CARD) continue;
    const parts = c.text.split(/\s+/).map(norm).filter(p => p.length > 2 || /\d/.test(p));
    const hits = words.filter(w => parts.includes(norm(w.w)));
    if (!hits.length) continue;
    const near = hits.reduce((a, b) => (Math.abs(b.s - c.at) < Math.abs(a.s - c.at) ? b : a));
    const dt = c.at - near.s;
    if (dt < -lead || dt > late)
      out.push({ check: 'cue-off-word', from: c.at, to: c.until ?? c.at, shot: '', what: `"${c.text}" at ${c.at.toFixed(2)} s, ${Math.abs(dt).toFixed(2)} s ${dt < 0 ? 'before' : 'after'} "${near.w}" (${near.s.toFixed(2)} s)` });
  }
  return out;
}

/** running captions: the film must caption the narration, every spoken word on screen while it is said (up by
 *  `tol` s after its start, default 0.15). Why: the jungle holdout went out with none (10 November 2026); the film was
 *  built fresh from the board and nothing checked for them. */
export function checkCaptions(captions: { text: string; s: number; e: number }[], words: (Word & { e: number })[], opts: { tol?: number } = {}): Issue[] {
  if (!captions.length) return [{ check: 'no-captions', from: 0, to: 0, shot: '', what: 'the film has no running captions (overlays.tsx captionsOf, drawn by Film.tsx)' }];
  const tol = opts.tol ?? 0.15, out: Issue[] = [];
  for (const w of words) if (/\w/.test(w.w) && !captions.some(c => c.s <= w.s + tol && c.e > w.s))
    out.push({ check: 'uncaptioned', from: w.s, to: w.e, shot: '', what: `"${w.w}" at ${w.s.toFixed(2)} s has no caption on screen` });
  return out;
}

/** picture events and their sounds: every event (a shot fired, a fall, a bell) needs a sound of the same kind within
 *  `tol` seconds (default 0.1), and every such sound an event. Kinds are the part of the name before a colon
 *  ("shot:hook-b:1" pairs with "shot"). */
export function checkSync(events: { name: string; t: number }[], sounds: { name: string; t: number }[], opts: { tol?: number } = {}): Issue[] {
  const tol = opts.tol ?? 0.1, kind = (n: string) => n.split(':')[0], out: Issue[] = [];
  for (const e of events) if (!sounds.some(s => kind(s.name) === kind(e.name) && Math.abs(s.t - e.t) <= tol))
    out.push({ check: 'no-sound', from: e.t, to: e.t, shot: '', what: `${e.name} at ${e.t.toFixed(2)} s has no ${kind(e.name)} sound within ${tol} s` });
  for (const s of sounds) if (!events.some(e => kind(s.name) === kind(e.name) && Math.abs(s.t - e.t) <= tol))
    out.push({ check: 'no-picture', from: s.t, to: s.t, shot: '', what: `${s.name} sound at ${s.t.toFixed(2)} s has nothing on screen` });
  return out;
}

/** frame-by-frame issues of the same check, shot and person merged into runs (gaps under 0.2 s join) */
function merge(raw: Issue[]): Issue[] {
  const out: Issue[] = [];
  for (const i of raw) {
    const m = out.find(o => o.check === i.check && o.shot === i.shot && o.who === i.who && o.what.split(' ')[0] === i.what.split(' ')[0] && i.from - o.to < 0.2);
    if (m) m.to = i.to; else out.push({ ...i });
  }
  return out;
}

/** acting too small to read: a person changes pose (acts) while under `minHeight` of the frame high (default 0.25).
 *  The jungle holdout's final round: of 30 predicted raises, the acting ones missed, every one staged in a locked wide
 *  (a jump off a ramp at 20% of the frame, men sinking with faces at 5%). Frame the acting close, or move the camera in
 *  on the action word. Extras (`named: false`) are not judged. */
export function actingTooSmall(samples: Sample[], opts: { minHeight?: number } = {}): Issue[] {
  const minH = opts.minHeight ?? 0.25, raw: Issue[] = [], prev = new Map<string, string>();
  for (const s of samples) for (const p of s.people) {
    const k = `${s.shot}|${p.key}`, before = prev.get(k); prev.set(k, p.sig);
    if (before === undefined || before === p.sig || p.named === false || p.height === undefined) continue;
    if (p.height < minH) raw.push({ check: 'acting-small', from: s.t, to: s.t, shot: s.shot, who: p.key, what: `acts at ${(p.height * 100).toFixed(0)}% of the frame high` });
  }
  return merge(raw);
}

/** a cue at or before this film time (one frame at 30 fps) is the opening card */
export const OPENING_CARD = 1 / 30;
/** The opening: for a Short the first frame IS the package (the feed plays the video; no thumbnail shows there). All
 *  three are required, each its own issue:
 *  - a big subject: by `by` seconds (default 0.2) a named person at least `minHeight` of the frame high (default 0.3).
 *    Why: the jungle holdout opened on a small calm figure and all three click critics called it the weakest frame.
 *  - motion from frame 1: between the first sample and the next (within `by`), a person changes pose or the camera
 *    moves (by `minMove` metres, default 0.002, or its look point, or `fov`). A still first frame reads as a paused
 *    video (Elijah and the widow 2D: a held insert of the jar opened the film).
 *  - the word card up at 0.0 s (a cue at or before OPENING_CARD), drawn whole on frame 0 (overlays.tsx Card: a hook
 *    card with a <= 0 never pops in). Elijah's card popped in from nothing over 0.35 s, so frame 0 showed no card. */
export function checkOpening(samples: Sample[], cues: Cue[] = [], opts: { by?: number; minHeight?: number; minMove?: number } = {}): Issue[] {
  const by = opts.by ?? 0.2, minH = opts.minHeight ?? 0.3, minMove = opts.minMove ?? 0.002, out: Issue[] = [];
  const early = samples.filter(s => s.t <= by), shot = early[0]?.shot ?? '';
  if (!early.some(s => s.people.some(p => p.named !== false && (p.height ?? 0) >= minH))) {
    const best = Math.max(0, ...early.flatMap(s => s.people.map(p => p.height ?? 0)));
    out.push({ check: 'opening-small', from: 0, to: by, shot, what: `by ${by} s nobody named is over ${(minH * 100).toFixed(0)}% of the frame (biggest ${(best * 100).toFixed(0)}%): the first frame is the Short's package` });
  }
  const [a, b] = early;
  const d3 = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const camMoved = !!(a?.cam && b?.cam) && (d3(a.cam.pos, b.cam.pos) > minMove || d3(a.cam.look, b.cam.look) > minMove || Math.abs(a.cam.fov - b.cam.fov) > 0.01);
  const acted = !!(a && b) && b.people.some(p => { const q = a.people.find(x => x.key === p.key); return !q || q.sig !== p.sig; });
  if (!camMoved && !acted) out.push({ check: 'opening-still', from: 0, to: b?.t ?? 0, shot, what: b ? 'nothing moves between the first two frames sampled (no pose change, no camera move): motion from frame 1' : 'only one sample in the opening: cannot tell whether it moves' });
  if (!cues.some(c => c.at <= OPENING_CARD)) out.push({ check: 'opening-card', from: 0, to: 0, shot, what: 'no word card up at 0.0 s: the hook card starts at a = 0 (overlays.tsx draws it whole on frame 0)' });
  return out;
}

/** Issues the story lets through, each with its reason: an `acknowledged` entry matches an issue by its check, and
 *  when given by a time inside it (0.05 s either side), its shot and its person. An entry without a reason passes
 *  nothing and is itself an issue ('ack-no-reason'), and one that matches nothing is reported ('ack-unused') so stale
 *  entries are dropped. Why: the gate fails on every issue (toon-video's audit used to print and pass); a fault the
 *  owner has seen and accepted needs a way through that says why, not an edit to the gate. */
export interface Ack { check: string; at?: number; shot?: string; who?: string; reason: string }
export function acknowledge(issues: Issue[], acks: Ack[]): { open: Issue[]; passed: { issue: Issue; reason: string }[] } {
  const open: Issue[] = [], passed: { issue: Issue; reason: string }[] = [], used = new Set<number>();
  const valid = acks.map(a => !!(a.reason && a.reason.trim()));
  for (const i of issues) {
    const k = acks.findIndex((a, n) => valid[n] && a.check === i.check && (a.at === undefined || (a.at >= i.from - 0.05 && a.at <= i.to + 0.05))
      && (!a.shot || a.shot === i.shot) && (!a.who || a.who === i.who));
    if (k >= 0) { used.add(k); passed.push({ issue: i, reason: acks[k].reason }); } else open.push(i);
  }
  acks.forEach((a, n) => {
    if (!valid[n]) open.push({ check: 'ack-no-reason', from: a.at ?? 0, to: a.at ?? 0, shot: a.shot ?? '', what: `acknowledged "${a.check}" has no reason: say why it may pass, or fix it` });
    else if (!used.has(n)) open.push({ check: 'ack-unused', from: a.at ?? 0, to: a.at ?? 0, shot: a.shot ?? '', what: `acknowledged "${a.check}"${a.at !== undefined ? ` at ${a.at} s` : ''} matches no issue: drop it` });
  });
  return { open, passed };
}

/** per-frame findings (a camera check's `{ f, kind, detail }`) as audit issues in seconds, consecutive frames of the
 *  same check and the same first words of detail merged into one run (frames at most `gap` apart, default 4: the audit
 *  samples every third frame) */
export function fromFrames(found: { f: number; kind: string; detail: string; layer?: string }[], fps: number, shotAt: (f: number) => string, gap = 4): Issue[] {
  const out: (Issue & { f1: number })[] = [], key = (d: string) => d.split(':')[0].split(' ').slice(0, 4).join(' ');
  for (const x of [...found].sort((a, b) => a.f - b.f)) {
    const check = 'cam-' + x.kind.replace(/ /g, '-'), last = out.find(o => o.check === check && key(o.what) === key(x.detail) && x.f - o.f1 <= gap);
    if (last) { last.f1 = x.f; last.to = x.f / fps; }
    else out.push({ check, from: x.f / fps, to: x.f / fps, f1: x.f, shot: shotAt(x.f), what: x.detail });
  }
  return out.map(({ f1: _f, ...i }) => { void _f; return i; });
}

/** all issues as lines, sorted by time */
export const report = (issues: Issue[]) => issues.sort((a, b) => a.from - b.from)
  .map(i => `${i.from.toFixed(2)}-${i.to.toFixed(2)}  ${i.check.padEnd(13)} ${(i.shot || '').padEnd(16)} ${i.who ? i.who + ': ' : ''}${i.what}`);
