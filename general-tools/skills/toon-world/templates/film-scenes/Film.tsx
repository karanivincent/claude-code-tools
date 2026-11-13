// __SLUG__: the film. The scene compositions in order (Remotion Series) over the film's one mix, with the captions on
// from the first render (S5-81). Each scene keeps its own composition for the loop (render one scene in about 15 s);
// this only strings them together. A cut between two scenes is a join card in stories/__SLUG__/joins.json: the scene
// before ends on it and the scene after starts on it. A card with "dip": n fades the scene before out and the scene
// after in over n frames each, through black: a jump in time (the party to the night, the night to a dream).
import React from 'react';
import { AbsoluteFill, Audio, Series, getStaticFiles, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { SCENE_LIST } from './scenes';
import { MIX, sceneFrames } from './plan';
import data from '../../../stories/__SLUG__/joins.json';
import { Captions } from './captions';

const JOINS = ((data as unknown as { joins?: { after: string; before: string; dip?: number }[] }).joins ?? []);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const Dip: React.FC<{ frames: number; dipIn: number; dipOut: number }> = ({ frames, dipIn, dipOut }) => {
  const f = useCurrentFrame();
  const a = Math.max(dipIn ? interpolate(f, [0, dipIn], [1, 0], clamp) : 0, dipOut ? interpolate(f, [frames - dipOut, frames - 1], [0, 1], clamp) : 0);
  return a > 0 ? <AbsoluteFill style={{ background: '#000', opacity: a }} /> : null;
};

export const Film: React.FC<{ captions?: boolean }> = ({ captions = true }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Series>
      {SCENE_LIST.map(({ id, Scene }) => {
        const n = sceneFrames(id), dipIn = JOINS.find((j) => j.before === id)?.dip ?? 0, dipOut = JOINS.find((j) => j.after === id)?.dip ?? 0;
        return (
          <Series.Sequence key={id} durationInFrames={n} name={id}>
            <Scene inFilm />
            <Dip frames={n} dipIn={dipIn} dipOut={dipOut} />
          </Series.Sequence>
        );
      })}
    </Series>
    {captions && <Captions />}
    {getStaticFiles().some((x) => x.name === MIX) && <Audio src={staticFile(MIX)} />}
  </AbsoluteFill>
);
export default Film;
