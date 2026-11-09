// toon-kit props: props whose state has a name (a scale on FULL, a door OPEN, a jar HALF full), read from one place.
//
// Generic, no look: it never draws a prop. Each video draws its own scale, door or jar, and places the drawing's marks
// with the same numbers the animation reads, so the two cannot disagree. The train heist v2 needle was set to "FULL"
// with an angle typed separately from the painted FULL mark, half a turn off; on a phone the scale read as empty just
// as the story said it was full (critique, 9 November 2026).
//
// Pure maths, no Three.js import. Synced into projects by `toon-world/scripts/sync-kit.mjs`.

const RAD = Math.PI / 180;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (k: number) => { const c = clamp(k); return c * c * (3 - 2 * c); };

/** A change of state: from frame f the prop moves to state `to`, taking `over` frames (default 8). Put f on a word. */
export interface Step<N extends string> { f: number; to: N; over?: number }

/** A prop with named states, each a number (a dial's reading 0 to 1, a door's opening 0 to 1, a fill level). */
export function states<N extends string>(marks: Record<N, number>, start: N) {
  if (!(start in marks)) throw new Error(`no state named ${start}`);
  const names = Object.keys(marks) as N[];
  return {
    marks,
    /** the number for a named state */
    of(name: N): number {
      if (!(name in marks)) throw new Error(`no state named ${name}`);
      return marks[name];
    },
    /** the prop's number at any frame, moving between named states on their frames */
    track(steps: Step<N>[]): (f: number) => number {
      for (const s of steps) if (!(s.to in marks)) throw new Error(`no state named ${s.to}`);
      const sorted = [...steps].sort((a, b) => a.f - b.f);
      return (f: number) => {
        let v = marks[start];
        for (const s of sorted) {
          if (f < s.f) break;
          v = v + (marks[s.to] - v) * ease((f - s.f) / Math.max(1, s.over ?? 8));
        }
        return v;
      };
    },
    /** the named state a number is at (within `tol`), or null between states */
    nameOf(v: number, tol = 0.02): N | null {
      let best: N | null = null, gap = Infinity;
      for (const n of names) { const g = Math.abs(marks[n] - v); if (g < gap) { gap = g; best = n; } }
      return gap <= tol ? best : null;
    },
  };
}

/** A dial: a needle sweeping from `start` to `end` degrees (0 = straight up, clockwise positive), reading 0 to 1.
 *  Draw the dial's marks with `pointAt` and turn the needle with `needleZ`: both come from `angle`, so a mark and the
 *  needle on that mark always agree. */
export function dial(start: number, end: number) {
  const angle = (reading: number) => start + (end - start) * reading;
  return {
    /** degrees, 0 up, clockwise positive */
    angle,
    /** where a mark at `reading` sits on a dial face of radius r, as [x, y] (y up), for drawing ticks and labels */
    pointAt(reading: number, r: number): [number, number] {
      const a = angle(reading) * RAD;
      return [r * Math.sin(a), r * Math.cos(a)];
    },
    /** rotation.z (radians) for a needle drawn pointing straight up (+y) */
    needleZ(reading: number): number {
      return -angle(reading) * RAD;
    },
  };
}

/** Check a prop's state on given frames (each on a word): returns one line per frame where it is not as the story
 *  says. Use it in the same no-render check as the camera's. */
export function checkStates<N extends string>(prop: ReturnType<typeof states<N>>, valueAt: (f: number) => number, expect: { f: number; is: N; word?: string }[], tol = 0.02) {
  const out: { f: number; kind: 'state'; detail: string }[] = [];
  for (const e of expect) {
    const v = valueAt(e.f), n = prop.nameOf(v, tol);
    if (n !== e.is) out.push({ f: e.f, kind: 'state', detail: `${e.word ? `"${e.word}": ` : ''}expected ${e.is}, found ${n ?? v.toFixed(2)}` });
  }
  return out;
}
