// Run: node --test general-tools/skills/toon-world/kit/light.test.ts   (no Three.js needed: plain objects stand in)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeOfDay } from './light.ts';

// a stand-in for a Three.js material and object tree: the same fields the block reads
const mat = (kind: string, r: number, g: number, b: number): any => {
  const m: any = { [kind]: true, color: { r, g, b }, userData: {} };
  m.clone = () => { const c = mat(kind, m.color.r, m.color.g, m.color.b); c.userData = JSON.parse(JSON.stringify(m.userData)); return c; };
  return m;
};
const node = (material?: any, children: any[] = []): any => {
  const o: any = { material, children, parent: null };
  for (const c of children) c.parent = o;
  o.traverse = (fn: (x: any) => void) => { fn(o); for (const c of o.children) c.traverse(fn); };
  return o;
};
const NIGHT = { r: 0.5, g: 0.5, b: 0.8 };

test('time of day multiplies lit materials and leaves unlit glows alone', () => {
  const ground = mat('isMeshStandardMaterial', 0.8, 0.6, 0.4), flame = mat('isMeshBasicMaterial', 1, 0.6, 0.2);
  const scene = node(undefined, [node(ground), node(flame)]);
  assert.equal(timeOfDay(scene, NIGHT), 1);
  const g = scene.children[0].material;
  assert.deepEqual([g.color.r, g.color.g, g.color.b].map(x => +x.toFixed(3)), [0.4, 0.3, 0.32]);
  assert.equal(scene.children[1].material, flame, 'the flame keeps its own material');
  assert.deepEqual(ground.color, { r: 0.8, g: 0.6, b: 0.4 }, 'the shared original keeps its day colour');
});

test('a material shared by two meshes is cloned once, and a second call re-tints from the day colour', () => {
  const wall = mat('isMeshLambertMaterial', 1, 1, 1);
  const scene = node(undefined, [node(wall), node(wall)]);
  timeOfDay(scene, NIGHT);
  const a = scene.children[0].material, b = scene.children[1].material;
  assert.equal(a, b, 'one clone for both');
  assert.notEqual(a, wall);
  timeOfDay(scene, { r: 0.25, g: 0.25, b: 0.25 });
  assert.equal(scene.children[0].material, a, 'no new clone on the second call');
  assert.equal(a.color.r, 0.25, 'from the day colour, not compounded');
  timeOfDay(scene, { r: 1, g: 1, b: 1 });
  assert.equal(a.color.g, 1, 'a white tint gives the day back');
});

test('skip leaves out an object and everything under it', () => {
  const cardMat = mat('isMeshStandardMaterial', 0.9, 0.7, 0.6), hand = mat('isMeshStandardMaterial', 0.9, 0.7, 0.6);
  const person = node(cardMat, [node(hand)]);
  person.name = 'person';
  const scene = node(undefined, [person, node(mat('isMeshToonMaterial', 1, 1, 1))]);
  assert.equal(timeOfDay(scene, NIGHT, { skip: o => o.name === 'person' }), 1);
  assert.equal(person.material, cardMat);
  assert.equal(person.children[0].material, hand);
});
