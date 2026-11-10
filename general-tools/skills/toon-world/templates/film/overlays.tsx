import React from 'react';
import { staticFile } from 'remotion';

// HTML drawn over the picture, in a 1080 x 1920 design frame (Film.tsx scales it to the render). Each lands on its
// word: the audit checks it (toon-kit checkCues) from cuesOf below.
//  - Card: a year or a number, with an optional small label above ("THE WAR ENDED" / "1945"). grey: a date in the past.
//  - Paper: a typed paper for orders or a list; each line types on as it is said.
//  - Thought: a bubble with a picture for any word the viewer may not picture (an animal, a creature, a machine).

const INK = '#241726';
export interface CardDef { text: string; a: number; b: number; label?: string; grey?: boolean }
export interface PaperDef { title: string; a: number; b: number; lines: { text: string; at: number }[]; bullet?: string }
export interface ThoughtDef {
  /** the picture, under public/ */
  img: string; a: number; b: number;
  /** the bubble's centre in the design frame, and which side its trail of small bubbles leans (-1 left, 1 right) */
  x: number; y: number; side: number;
  /** fill the bubble (a photo) instead of fitting the picture inside it (a cut-out) */
  cover?: boolean;
  /** the spoken word it pictures, for the cue check */
  says?: string;
  /** where the trail of small bubbles points (the thinker's head), default the frame's centre line under the bubble */
  to?: [number, number];
}

const popIn = (k: number, over = 0.08) => (k < 1 ? 0.6 + 0.4 * (1 - Math.pow(1 - k, 3)) + over * Math.sin(k * Math.PI) : 1);

export const Card: React.FC<{ c: CardDef; t: number; top?: number }> = ({ c, t, top = 110 }) => {
  const k = Math.min(1, (t - c.a) / 0.35), out = Math.max(0, 1 - (c.b - t) / 0.12);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center', opacity: Math.min(k * 4, 1) }}>
      <div style={{ transform: `scale(${popIn(k) * (1 - out)}) rotate(-3deg)`, background: '#f4ead2', border: `10px solid ${INK}`, borderRadius: 26, padding: '10px 46px',
        boxShadow: `0 14px 0 ${INK}`, fontFamily: '"Arial Black", "Helvetica Neue", sans-serif', fontWeight: 900, fontSize: 150, color: c.grey ? '#5a5560' : '#c8362e',
        letterSpacing: 4, textAlign: 'center', lineHeight: 1.05 }}>
        {c.label && <div style={{ fontSize: 44, letterSpacing: 3, color: INK }}>{c.label}</div>}{c.text}
      </div>
    </div>
  );
};

export const Paper: React.FC<{ p: PaperDef; t: number; top?: number; cps?: number }> = ({ p, t, top = 100, cps = 28 }) => {
  const k = Math.min(1, (t - p.a) / 0.3), out = Math.max(0, 1 - (p.b - t) / 0.15);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${(0.7 + 0.3 * (1 - Math.pow(1 - k, 3))) * (1 - out)}) rotate(2deg)`, background: '#f6eedb', border: `8px solid ${INK}`, borderRadius: 10,
        boxShadow: `0 12px 0 ${INK}`, padding: '22px 36px 26px', width: 900, fontFamily: '"Courier New", monospace', color: INK }}>
        <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: 6, textAlign: 'center', borderBottom: '4px solid #c8362e', paddingBottom: 8, marginBottom: 14 }}>{p.title}</div>
        {p.lines.map(l => {
          const n = Math.max(0, Math.min(l.text.length, Math.floor((t - l.at) * cps)));
          return <div key={l.text} style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.2, minHeight: 70 }}>{t >= l.at ? (p.bullet ?? '• ') + l.text.slice(0, n) : ''}</div>;
        })}
      </div>
    </div>
  );
};

export const Thought: React.FC<{ h: ThoughtDef; t: number }> = ({ h, t }) => {
  const k = Math.min(1, (t - h.a) / 0.3);
  const pop = k < 1 ? 1 - Math.pow(1 - k, 3) + 0.15 * Math.sin(k * Math.PI) : 1, bob = 8 * Math.sin(t * 2.2 + h.side);
  const R = 205, [tx, ty] = h.to ?? [540, h.y + R + 150];
  const dots = [[0.62, 26], [0.8, 18], [0.95, 11]].map(([f, r]) => [h.x + (tx - h.x) * f, h.y + R + 30 + (ty - h.y - R - 30) * f, r]);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, pointerEvents: 'none' }}>
      {dots.map(([dx, dy, r], i) => k > 0.15 * i && <div key={i} style={{ position: 'absolute', left: dx - r, top: dy - r, width: 2 * r, height: 2 * r, borderRadius: '50%', background: '#fffdf6', border: `6px solid ${INK}` }} />)}
      <div style={{ position: 'absolute', left: h.x - R, top: h.y - R + bob, width: 2 * R, height: 2 * R, transform: `scale(${pop})`, borderRadius: '50%', background: '#fffdf6',
        border: `9px solid ${INK}`, boxShadow: `0 10px 0 ${INK}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={staticFile(h.img)} style={h.cover ? { width: '100%', height: '100%', objectFit: 'cover' } : { width: '88%', height: '88%', objectFit: 'contain' }} />
      </div>
    </div>
  );
};

/** every overlay as a cue for the audit's checkCues: a card's text, each paper line, each thought's word */
export const cuesOf = (cards: CardDef[], papers: PaperDef[], thoughts: ThoughtDef[]) => [
  ...cards.map(c => ({ text: c.text, at: c.a, until: c.b })),
  ...papers.flatMap(p => p.lines.map(l => ({ text: l.text, at: l.at }))),
  ...thoughts.filter(h => h.says).map(h => ({ text: h.says!, at: h.a, until: h.b })),
];
