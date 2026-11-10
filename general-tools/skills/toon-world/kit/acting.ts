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
export interface Sample { t: number; shot: string; people: PersonSample[]; props?: PropSample[] }
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

/** all issues as lines, sorted by time */
export const report = (issues: Issue[]) => issues.sort((a, b) => a.from - b.from)
  .map(i => `${i.from.toFixed(2)}-${i.to.toFixed(2)}  ${i.check.padEnd(13)} ${(i.shot || '').padEnd(16)} ${i.who ? i.who + ': ' : ''}${i.what}`);
