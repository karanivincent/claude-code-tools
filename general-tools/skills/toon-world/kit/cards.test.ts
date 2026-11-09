// Run: node --test general-tools/skills/toon-world/kit/cards.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeTouches, checkCanvases, type Pixels } from './cards.ts';

/** a w x h canvas with an opaque disc of radius r at (cx, cy) */
const disc = (w: number, h: number, cx: number, cy: number, r: number): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([255, 255, 255, 255], (y * w + x) * 4);
  return { data, width: w, height: h };
};

test('a drawing inside its canvas passes; one bigger than its canvas is cut at the sides it touches', () => {
  assert.deepEqual(edgeTouches(disc(100, 80, 50, 40, 30)), []);
  // a cloud drawn too big and too far up and right: cut at the top and the right, like Gibeon's thought cloud
  const cloud = edgeTouches(disc(100, 80, 70, 30, 40));
  assert.ok(cloud.some(t => t.side === 'top') && cloud.some(t => t.side === 'right') && !cloud.some(t => t.side === 'left'));
});

test('a faint fringe below the alpha threshold is not a cut; an allowed side is not checked', () => {
  const px = disc(60, 60, 30, 30, 20);
  for (let x = 0; x < 60; x++) (px.data as Uint8ClampedArray)[x * 4 + 3] = 5;   // a 2% haze along the top row
  assert.deepEqual(edgeTouches(px), []);
  const card = disc(60, 60, 30, 50, 20);   // a figure running off the bottom of its card
  assert.deepEqual(edgeTouches(card).map(t => t.side), ['bottom']);
  assert.deepEqual(edgeTouches(card, { allow: ['bottom'] }), []);
  const lines = checkCanvases([{ name: 'envoy card', px: card }, { name: 'cloud', px: disc(60, 60, 30, 30, 10) }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^envoy card: the drawing touches its canvas at the bottom/);
});
