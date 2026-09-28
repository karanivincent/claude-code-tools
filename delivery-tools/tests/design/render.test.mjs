// Design render's pure helpers (no browser needed). previewViewport is what a browser render's
// context viewport is built from at each width; the browser-driving behaviour itself is in
// render.browser.test.mjs, which needs Playwright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewViewport } from '../../lib/design/render.mjs';

test('previewViewport keeps a component\'s own preview size untouched at desktop', () => {
  assert.deepEqual(previewViewport({ width: 900, height: 500 }, 'desktop'), { width: 900, height: 500 });
  // Wider than the desktop width the map declares: still untouched, only a narrower width clamps.
  assert.deepEqual(previewViewport({ width: 2000, height: 500 }, 'desktop'), { width: 2000, height: 500 });
});

// Fix round (I10): a component's own $preview is a desktop-sized default, so at a narrower width
// it must never come out wider than that width allows, or it renders at its desktop size on a
// phone-width shoot and never matches.
test('previewViewport clamps to the target width\'s own maximum at a non-desktop width', () => {
  assert.deepEqual(previewViewport({ width: 900, height: 500 }, 'phone'), { width: 390, height: 500 });
  // Already narrower than the width's cap: the component's own size wins.
  assert.deepEqual(previewViewport({ width: 300, height: 500 }, 'phone'), { width: 300, height: 500 });
});

test('previewViewport defaults height to 600 when the preview does not declare one', () => {
  assert.deepEqual(previewViewport({ width: 900, height: null }, 'desktop'), { width: 900, height: 600 });
});
