// One colour written in two notations is one colour.
//
// `parseColor` read `rgb()` and `rgba()` alone, while the products it measures ship `oklch()`. A
// token written oklch in the design and reported as rgb by the browser came back `Infinity` apart,
// so M5 reported a colour difference on every marker it paired and none of them could be trusted.
// This is the same mistake `foldTypography` already refuses to make for text: comparing two
// spellings of one value instead of the value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleDiffs, COLOR_TOLERANCE, parseColor, colorDistance } from '../../lib/checks/m5-m6.mjs';

/** A pair of marker elements identical but for the notation their colour is written in. */
const pairOf = (designColor, liveColor) => [{
  label: 'Start calls',
  design: { style: { fontClass: 'sans', fontSize: 14, fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: designColor } },
  live: { style: { fontClass: 'sans', fontSize: 14, fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: liveColor } },
}];

test('the same colour in oklch and in rgb is not a style difference', () => {
  // oklch(0.5 0 0) is a neutral grey; a browser reports it as rgb(99, 99, 99).
  assert.deepEqual(styleDiffs(pairOf('oklch(0.5 0 0)', 'rgb(99, 99, 99)')), []);
});

test('a real colour difference is still reported, whatever notation each side uses', () => {
  const [diff] = styleDiffs(pairOf('oklch(0.5 0 0)', 'rgb(220, 30, 30)'));
  assert.ok(diff, 'a grey design against a red live must differ');
  assert.match(diff.diffs.join('; '), /colour/);
});

test('oklch, oklab, hex, short hex and hsl all read as sRGB bytes', () => {
  assert.deepEqual(parseColor('oklch(0 0 0)'), [0, 0, 0]);
  assert.deepEqual(parseColor('oklch(1 0 0)'), [255, 255, 255]);
  assert.deepEqual(parseColor('oklch(100% 0 0)'), [255, 255, 255]);
  assert.deepEqual(parseColor('oklab(0.5 0 0)'), [99, 99, 99]);
  assert.deepEqual(parseColor('#7ee787'), [126, 231, 135]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('hsl(120, 100%, 50%)'), [0, 255, 0]);
  assert.deepEqual(parseColor('rgba(12, 34, 56, 0.5)'), [12, 34, 56]);
});

test('a notation nothing can read is still not silently equal', () => {
  // Two unreadable strings are equal only when they are the same string; otherwise the distance
  // stays Infinity, which is what keeps an unknown notation loud rather than wrong.
  assert.equal(colorDistance('color(display-p3 1 0 0)', 'color(display-p3 1 0 0)'), 0);
  assert.equal(colorDistance('color(display-p3 1 0 0)', 'rgb(255, 0, 0)'), Infinity);
  assert.equal(parseColor('not a colour'), null);
});

test('the tolerance is a distance in sRGB bytes, so it means the same for every notation', () => {
  assert.equal(COLOR_TOLERANCE, 24);
  assert.ok(colorDistance('#646464', 'rgb(100, 100, 100)') < COLOR_TOLERANCE);
});
