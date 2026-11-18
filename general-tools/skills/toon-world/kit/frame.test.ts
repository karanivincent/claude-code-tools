// Run: node --test general-tools/skills/toon-world/kit/frame.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionsFromLines, captionBox, captionAt, faceBox, checkCaptionFrame, covered, runsOf } from './frame.ts';

test('caption times follow captions.tsx: from just before the word to the next word', () => {
  const caps = captionsFromLines([{ end: 2, words: [{ w: 'he', s: 0.5, e: 0.7 }, { w: 'fell', s: 0.8, e: 1.1 }] }]);
  assert.equal(caps[0].s, 0); assert.ok(Math.abs(caps[0].e - 0.76) < 1e-9);
  assert.ok(Math.abs(caps[1].e - 1.45) < 1e-9, 'the last word stays 0.35 s');
  assert.equal(captionAt(caps, 0.9)?.text, 'fell'); assert.equal(captionAt(caps, 1.5), null);
});

test('S3-147: a caption over a face fails, a face clear of it passes', () => {
  const cap = { text: 'water', size: 118 }, box = captionBox(cap);
  assert.ok(box.y0 < 1480 && box.y1 > 1480 && box.x0 > 90 && box.x1 < 990);
  // a face centred on the caption line
  const onIt = faceBox(540, 1480, 200);
  assert.ok(covered(onIt, box) > 0.5);
  const bad = checkCaptionFrame(12, cap, [{ who: 'hero', box: onIt }]);
  assert.equal(bad.length, 1); assert.equal(bad[0].kind, 'caption over face'); assert.equal(bad[0].f, 12);
  // the same face higher up, and a face beside a short word
  assert.deepEqual(checkCaptionFrame(12, cap, [{ who: 'hero', box: faceBox(540, 900, 200) }]), []);
  assert.deepEqual(checkCaptionFrame(12, { text: 'a', size: 118 }, [{ who: 'hero', box: faceBox(900, 1480, 160) }]), []);
  assert.deepEqual(checkCaptionFrame(12, null, [{ who: 'hero', box: onIt }]), [], 'no caption on screen');
});

test('S3-147: a caption reaching below 82% of the height fails', () => {
  assert.deepEqual(checkCaptionFrame(0, { text: 'the', size: 118 }, []), [], 'the template caption line (1480) sits at 81%');
  const low = checkCaptionFrame(0, { text: 'the', size: 118 }, [], { capY: 1620 });
  assert.equal(low[0].kind, 'caption too low');
});

test('faults over neighbouring frames join into one run per person and kind', () => {
  const f = (n: number, who = 'hero') => ({ f: n, who, kind: 'caption over face', what: 'x' });
  const runs = runsOf([f(3), f(4), f(5), f(9), f(4, 'friend')]);
  assert.deepEqual(runs.map((r) => [r.who, r.from, r.to]), [['hero', 3, 5], ['friend', 4, 4], ['hero', 9, 9]]);
});
