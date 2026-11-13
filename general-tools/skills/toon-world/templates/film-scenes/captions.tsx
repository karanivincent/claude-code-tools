// __SLUG__: the captions, one word at a time, white with a black outline, timed from the voice's word times in
// full.json (the voice script writes it). On in the Film from the first render (S5-81): the cliff film's first render
// had no words on screen, and every judge's first blame was that. A word with no time takes the gap after the word
// before. Change the look here (the story's own style); keep the words the narration's.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import film from './full.json';
import { FPS } from './plan';

type W = { w: string; s: number | null; e?: number | null };
const LINES = ((film as unknown as { lines?: { words?: W[]; end: number }[] }).lines ?? []);
const RAW: [string, number, number][] = [];
for (const l of LINES) {
  const ws = l.words ?? [];
  ws.forEach((x, i) => {
    const prev = RAW[RAW.length - 1];
    const s = x.s ?? (prev ? prev[2] + 0.02 : 0);
    const next = ws.slice(i + 1).find((y) => y.s != null)?.s;
    const e = x.e ?? next ?? l.end;
    RAW.push([x.w, s, Math.max(s + 0.08, e)]);
  });
}
/** each word on screen from just before it is said until the next word (or 0.35 s after it, at a pause) */
export const CAPS = RAW.map(([w, s, e], i) => {
  const n = RAW[i + 1];
  return { text: w, s: i === 0 ? 0 : s - 0.04, e: n && n[1] - e < 0.5 ? n[1] - 0.04 : e + 0.35, size: Math.min(118, 900 / (Math.max(1, w.length) * 0.66)) };
});

export const Captions: React.FC<{ capY?: number }> = ({ capY = 1480 }) => {
  const t = useCurrentFrame() / FPS;
  const c = CAPS.find((x) => t >= x.s && t < x.e);
  return c ? (
    <div style={{ position: 'absolute', left: 90, width: 900, top: capY - 120, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif', fontWeight: 900, fontSize: c.size, lineHeight: 1, whiteSpace: 'nowrap', color: '#FFFFFF',
      textShadow: '0 5px 16px rgba(0,0,0,0.4)', WebkitTextStroke: `${Math.round(c.size * 0.17)}px #000`, paintOrder: 'stroke fill' }}>{c.text}</div>
  ) : null;
};
