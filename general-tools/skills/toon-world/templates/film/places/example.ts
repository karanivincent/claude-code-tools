import * as THREE from 'three';
import { twoTone } from '../../../look/shade';
import { sparkles } from '../detail';
import type { PlaceDef } from '../place';

// A stand-in place, so the film renders before the first real place exists: a ground and a few glints. Replace it
// with places built to the parts plan (pictures for sky and far things, code 3D near the lens, models for hero props).
const place: PlaceDef = {
  pictures: [], models: [], grade: 'day', sun: [0.4, 0.8, 0.5], background: '#9cc4e4',
  build: (scene) => {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), twoTone(new THREE.MeshLambertMaterial({ color: '#7a9a4a' })));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    const glints = sparkles([0, 1, 0], [8, 2, 8], 20, 1);
    scene.add(ground, glints);
    return { update: (_shot: string, t: number, cam: THREE.PerspectiveCamera) => (glints.userData.tick as (t: number, c: THREE.Camera) => void)(t, cam) };
  },
  shots: {
    wide: () => ({ view: { pos: [0, 1.7, 9], look: [0, 1.1, 0], fov: 40 }, people: [], line: 'stand-in', note: 'replace with the story\'s first place' }),
  },
};
export default place;
