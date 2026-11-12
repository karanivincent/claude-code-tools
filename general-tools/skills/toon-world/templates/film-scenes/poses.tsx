// __SLUG__: the pose sheet every scene's PoseSheet draws: every pose the scene's words need, at full size, on one
// still, drawn exactly as the film draws it (cast.ts drawCard, hands kept in the card). A cell whose drawing touches
// its card's edge gets a red border and a "CUT" label. Check it before round 1 and after every new pose: a front card
// shows a pose only through what clears the torso and head (cliff spike 6 caught four hidden limbs here before a render).
import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill } from 'remotion';
import { Pen, type FrontOpts } from '../../look/toon';
import { edgeTouches } from '../../toon-kit/cards';
import { cardOpts, drawCard, CW } from './cast';

/** one pose: a label (who, the beat, the frame), who, the drawing */
export type PoseEntry = [label: string, who: string, opts: FrontOpts];
const COLS = 4, CELL_W = CW / 2, CELL_H = 500;
export const SHEET_W = COLS * CELL_W;
export const sheetHeight = (n: number) => Math.max(1, Math.ceil(n / COLS)) * CELL_H;

const Cell: React.FC<{ e: PoseEntry }> = ({ e }) => {
  const ref = useRef<HTMLCanvasElement>(null), lab = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d', { willReadFrequently: true })!; g.clearRect(0, 0, cv.width, cv.height);
    const [, who, opts] = e;
    drawCard(new Pen(g), who, cardOpts(opts, -2.1));
    g.setTransform(1, 0, 0, 1, 0, 0);
    const cut = edgeTouches(g.getImageData(0, 0, cv.width, cv.height), { allow: ['bottom'] });
    if (cut.length) { cv.style.outline = '6px solid #e01'; lab.current!.textContent += `  CUT ${cut.map((c) => c.side).join(',')}`; }
  }, [e]);
  return (
    <div style={{ position: 'relative', width: CELL_W, height: CELL_H, background: '#e8dcc6', border: '1px solid #333', boxSizing: 'border-box' }}>
      <canvas ref={ref} width={CW} height={1000} style={{ width: CELL_W - 2, height: CELL_H - 2 }} />
      <div ref={lab} style={{ position: 'absolute', left: 8, top: 6, font: 'bold 22px Arial', color: '#000' }}>{e[0]}</div>
    </div>
  );
};
export const PoseGrid: React.FC<{ poses: PoseEntry[] }> = ({ poses }) => (
  <AbsoluteFill style={{ background: '#fff', flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' }}>
    {poses.map((e, i) => <Cell key={i} e={e} />)}
  </AbsoluteFill>
);
