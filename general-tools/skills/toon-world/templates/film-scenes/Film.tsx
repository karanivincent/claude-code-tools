// __SLUG__: the film. The scene compositions in order (Remotion Series) over the film's one mix. Each scene keeps its
// own composition for the loop (render one scene in about 15 s); this only strings them together. A cut between two
// scenes is a join card in stories/__SLUG__/joins.json: the scene before ends on it and the scene after starts on it.
import React from 'react';
import { AbsoluteFill, Audio, Series, getStaticFiles, staticFile } from 'remotion';
import { SCENE_LIST } from './scenes';
import { MIX, sceneFrames } from './plan';

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Series>
      {SCENE_LIST.map(({ id, Scene }) => (
        <Series.Sequence key={id} durationInFrames={sceneFrames(id)} name={id}>
          <Scene inFilm />
        </Series.Sequence>
      ))}
    </Series>
    {getStaticFiles().some((x) => x.name === MIX) && <Audio src={staticFile(MIX)} />}
  </AbsoluteFill>
);
export default Film;
