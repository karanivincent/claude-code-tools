// __SLUG__: the cast sheet (stage 2, S2-3): every person standing, in the story's own style, labelled, drawn exactly
// as the film draws them. Composition <Film>-cast; render it with
//   npx remotion still src/index.ts <Film>-cast out/__SLUG__/cast.png
// Give each person a pose and face that says who they are (CAST_POSES); the default is everyone standing, neutral.
import React from 'react';
import { PoseGrid, type PoseEntry } from './poses';
import { CAST } from './cast';
import { sizeOf } from './sizes';

export const CAST_POSES: PoseEntry[] = Object.keys(CAST).map((who): PoseEntry => {
  const [, sy] = sizeOf(who);
  return [`${who}${sy !== 1 ? ` (size ${sy})` : ''}`, who, { mode: 'stand', expr: 'neutral' }];
});
export const CastSheet: React.FC = () => <PoseGrid poses={CAST_POSES} />;
export default CastSheet;
