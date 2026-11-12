// __SLUG__ scene __SCENE__: its composition. It plays alone with its slice of the film's mix (render it in about 15 s),
// and inside the Film without its own audio. The look, the place and the cast come from the story's shared files;
// everything the scene decides is in ./story.ts.
import React from 'react';
import { Stage, type SceneDef } from '../../stage';
import { assertJoins } from '../../joins';
import * as S from './story';

// refuse a scene that drifts off its join cards (camera, positions, expressions at its first and last frame)
assertJoins(S.SCENE, S.FRAMES, S.camAt, S.people);
const DEF: SceneDef = { SCENE: S.SCENE, FRAMES: S.FRAMES, PLACE: S.PLACE, camAt: S.camAt, focusAt: S.focusAt, dofAt: S.dofAt, coldAt: S.coldAt, people: S.people, SPLASHES: S.SPLASHES };

export const Scene: React.FC<{ inFilm?: boolean }> = ({ inFilm = false }) => <Stage s={DEF} audio={!inFilm} />;
export default Scene;
