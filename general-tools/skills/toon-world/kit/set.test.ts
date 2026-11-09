// Run: node --test general-tools/skills/toon-world/kit/set.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimSpans, type Opening } from './set.ts';

const door: Opening = { x0: 1.03, x1: 1.98, y0: 0, y1: 2.3, name: 'street door' };
const window: Opening = { x0: -1.5, x1: -0.5, y0: 1.0, y1: 2.2, name: 'window' };

test('a lower band, a rail and a skirting stop at the door, and only where they cross an opening', () => {
  const wall = [-2.1, 2.1] as const;
  // the lower band (0 to 1.15 m): cut at the door, and at the window, whose sill (1.0) is below the band's top
  assert.deepEqual(trimSpans(wall[0], wall[1], [door, window], 0, 1.15), [[-2.1, -1.5], [-0.5, 1.03], [1.98, 2.1]]);
  // the skirting (0 to 0.14 m): cut at the door only
  assert.deepEqual(trimSpans(wall[0], wall[1], [door, window], 0, 0.14), [[-2.1, 1.03], [1.98, 2.1]]);
  // a picture rail at 2.6 m, above both openings, runs the whole wall
  assert.deepEqual(trimSpans(wall[0], wall[1], [door, window], 2.55, 2.6), [[-2.1, 2.1]]);
});

test('openings at the wall ends, overlapping openings and slivers', () => {
  const atEnd: Opening = { x0: 1.5, x1: 2.5, y0: 0, y1: 2.2 };
  assert.deepEqual(trimSpans(0, 2, [atEnd], 0, 1), [[0, 1.5]]);
  const a: Opening = { x0: 0.5, x1: 1.2, y0: 0, y1: 2 }, b: Opening = { x0: 1.0, x1: 1.6, y0: 0, y1: 2 };
  assert.deepEqual(trimSpans(0, 3, [b, a], 0, 1), [[0, 0.5], [1.6, 3]]);
  // a 1 cm sliver between a door and the wall's end is dropped, not drawn as a stray post
  assert.deepEqual(trimSpans(0, 2, [{ x0: 0.01, x1: 1, y0: 0, y1: 2 }], 0, 1), [[1, 2]]);
});
