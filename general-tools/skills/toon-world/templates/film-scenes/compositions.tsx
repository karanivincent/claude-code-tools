// __SLUG__: every composition of the film, in one folder. Register once in src/Root.tsx:
//   import { __FILM__Compositions } from './stories/__SLUG__/compositions';   ...   <__FILM__Compositions />
// It gives: __FILM__ (the whole film), __FILM__-<scene> (one scene with its slice of the mix),
// __FILM__-<scene>-poses (every pose of the scene at full size on one still) and __FILM__-cast (the cast sheet).
import React from 'react';
import { Composition, Folder } from 'remotion';
import { Film } from './Film';
import { SCENE_LIST } from './scenes';
import { FPS, WIDTH, HEIGHT, TOTAL, sceneFrames } from './plan';
import { SHEET_W, sheetHeight } from './poses';
import { CastSheet, CAST_POSES } from './CastSheet';

export const __FILM__Compositions: React.FC = () => (
  <Folder name="__FILM__">
    <Composition id="__FILM__" component={Film} durationInFrames={Math.max(1, TOTAL)} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ captions: true }} />
    <Composition id="__FILM__-cast" component={CastSheet} durationInFrames={1} fps={FPS} width={SHEET_W} height={sheetHeight(CAST_POSES.length)} />
    {SCENE_LIST.map(({ id, Scene, PoseSheet, poseCount }) => (
      <React.Fragment key={id}>
        <Composition id={`__FILM__-${id}`} component={Scene} durationInFrames={sceneFrames(id)} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ inFilm: false }} />
        <Composition id={`__FILM__-${id}-poses`} component={PoseSheet} durationInFrames={1} fps={FPS} width={SHEET_W} height={sheetHeight(poseCount)} />
      </React.Fragment>
    ))}
  </Folder>
);
