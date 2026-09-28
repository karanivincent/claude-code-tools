// delivery shoot: the browser-driving capture. A components map's crop is a floating gallery
// element rather than a page-area rectangle (spec components-first §3), which is the part these
// tests exercise: boundingBox() only ever answers in viewport coordinates, so a state below the
// fold needs the page scrolled into account, and one item's screenshot failing must never abort
// the whole shoot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShoot, selectStates } from '../../lib/picture/shoot.mjs';
import { roundFiles } from '../../lib/picture/widths.mjs';

function componentsMap(ids) {
  return {
    schemaVersion: 1,
    feature: 'components',
    title: 'Components',
    kind: 'components',
    route: '/dashboard/components-gallery',
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+components-design-admin@example.invalid' }] }],
    states: ids.map((id) => ({
      id,
      screen: 'Components',
      name: id,
      design: false,
      reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/components-gallery' }] },
      buttons: [],
    })),
  };
}

/** A Playwright-shaped stub covering only what runShoot and shootItem touch. */
function fakeChromium({ boxes, screenshots, throwPaths = new Set(), scroll = { x: 0, y: 0 } }) {
  const page = {
    async goto(u) { page._url = u; },
    url: () => page._url,
    async unrouteAll() {},
    async route() {},
    async setViewportSize() {},
    async waitForTimeout() {},
    async waitForLoadState() {},
    locator(selector) {
      return { first: () => ({ async boundingBox() { return boxes[selector] ?? null; } }) };
    },
    async evaluate(fn) {
      const src = fn.toString();
      if (src.includes('scrollWidth') && src.includes('scrollHeight')) return { w: 4000, h: 4000 };
      if (src.includes('scrollX')) return scroll;
      return {};
    },
    async screenshot(opts) {
      screenshots.push(opts);
      if (throwPaths.has(opts.path)) throw new Error('target closed');
    },
  };
  return {
    async launch() {
      return {
        async newContext() {
          return {
            async newPage() { return page; },
            async storageState() {},
            async close() {},
          };
        },
        async newPage() { return { async close() {} }; }, // used by cropDesigns directly
        async close() {},
      };
    },
  };
}

function setupDirs() {
  const outDir = mkdtempSync(join(tmpdir(), 'delivery-shoot-'));
  return { outDir, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
}

test('a components crop below the fold is shot fullPage with the box translated into page coordinates', async () => {
  const map = componentsMap(['DP-01']);
  const { items } = selectStates(map);
  const { outDir, cleanup } = setupDirs();
  try {
    const screenshots = [];
    // boundingBox() reports viewport-relative coordinates; the page has scrolled 2000px down, so
    // an element that looks like it is at y=100 actually sits at y=2100 on the page.
    const chromium = fakeChromium({
      boxes: { '[data-delivery-state="DP-01"]': { x: 50, y: 100, width: 200, height: 150 } },
      screenshots,
      scroll: { x: 0, y: 2000 },
    });
    const report = await runShoot({
      map, items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      chromium, log: () => {},
    });
    assert.equal(report['DP-01'].reached, true);
    assert.equal(screenshots.length, 1);
    const shot = screenshots[0];
    assert.equal(shot.fullPage, true, 'clip is in page coordinates, so the screenshot must cover the whole page');
    // padding 24 around the box, translated by the 2000px scroll: x 26..274, y 2076..2274
    assert.deepEqual(shot.clip, { x: 26, y: 2076, width: 248, height: 198 });
  } finally { cleanup(); }
});

test('one item\'s screenshot failing marks it not reached and never aborts the rest of the shoot', async () => {
  const map = componentsMap(['DP-01', 'DP-02']);
  const { items } = selectStates(map);
  const { outDir, cleanup } = setupDirs();
  try {
    const screenshots = [];
    const boxes = {
      '[data-delivery-state="DP-01"]': { x: 10, y: 10, width: 100, height: 50 },
      '[data-delivery-state="DP-02"]': { x: 10, y: 200, width: 100, height: 50 },
    };
    const throwPaths = new Set([join(outDir, roundFiles('DP-01').live)]);
    const chromium = fakeChromium({ boxes, screenshots, throwPaths });
    const report = await runShoot({
      map, items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      chromium, log: () => {},
    });
    assert.equal(report['DP-01'].reached, false);
    assert.match(report['DP-01'].problems[0], /target closed/);
    assert.equal(report['DP-02'].reached, true, 'the second item must still be shot after the first one throws');
    assert.equal(screenshots.length, 2, 'both items were attempted');
  } finally { cleanup(); }
});
