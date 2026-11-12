// __SLUG__ scene __SCENE__: every pose of the scene at full size on one still (composition <Film>-__SCENE__-poses).
// The poses come from ./story.ts POSES: the people at POSE_FRAMES plus any you add by hand.
import React from 'react';
import { PoseGrid } from '../../poses';
import { POSES } from './story';

export const poseCount = POSES.length;
export const PoseSheet: React.FC = () => <PoseGrid poses={POSES} />;
export default PoseSheet;
