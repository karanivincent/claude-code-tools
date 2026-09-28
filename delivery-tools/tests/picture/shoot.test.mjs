// delivery shoot: the browser-driving capture. A components map's crop is the state's own wrapper
// element, shot with locator.screenshot() (A7) rather than a page-level fullPage clip, so a state
// that only comes into view by scrolling inside a container such as <main> is still pictured
// whole; the tests below exercise that the shoot scrolls the element into view and hands a plain
// locator screenshot no clip, and that one item's screenshot failing never aborts the whole shoot.
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
function fakeChromium({ boxes, screenshots, scrolled, throwPaths = new Set() }) {
  const page = {
    async goto(u) { page._url = u; },
    url: () => page._url,
    async unrouteAll() {},
    async route() {},
    async setViewportSize() {},
    async waitForTimeout() {},
    async waitForLoadState() {},
    locator(selector) {
      return {
        first: () => ({
          async boundingBox() { return boxes[selector] ?? null; },
          async scrollIntoViewIfNeeded() { scrolled?.push(selector); },
          async screenshot(opts) {
            screenshots.push({ selector, ...opts });
            if (throwPaths.has(opts.path)) throw new Error('target closed');
          },
        }),
      };
    },
    async evaluate() { return {}; },
    async screenshot(opts) { screenshots.push({ selector: null, ...opts }); },
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

test('a components crop is scrolled into view and shot with locator.screenshot(), no page-level clip', async () => {
  const map = componentsMap(['DP-01']);
  const { items } = selectStates(map);
  const { outDir, cleanup } = setupDirs();
  try {
    const screenshots = [];
    const scrolled = [];
    // A state below the fold, inside a container that scrolls on its own (not the document): a
    // page-level fullPage clip never reveals it, so the shoot must scroll the element itself into
    // view before picturing it (the Components run's failure).
    const chromium = fakeChromium({
      boxes: { '[data-delivery-state="DP-01"]': { x: 50, y: 100, width: 200, height: 150 } },
      screenshots,
      scrolled,
    });
    const report = await runShoot({
      map, items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      chromium, log: () => {},
    });
    assert.equal(report['DP-01'].reached, true);
    assert.deepEqual(scrolled, ['[data-delivery-state="DP-01"]'], 'the crop element is scrolled into view before the shot');
    assert.equal(screenshots.length, 1);
    const shot = screenshots[0];
    assert.equal(shot.selector, '[data-delivery-state="DP-01"]', 'the shot is a locator screenshot of the state\'s own element, not a page-level clip');
    assert.equal(shot.clip, undefined, 'locator.screenshot() has no clip: the element\'s own box is the picture');
    assert.equal(shot.fullPage, undefined);
    assert.equal(shot.path, join(outDir, roundFiles('DP-01').live));
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

function pageMap(widths) {
  return {
    schemaVersion: 1,
    feature: 'widgets',
    title: 'Widgets',
    kind: 'redesign',
    route: '/dashboard/widgets',
    widths,
    pageArea: { left: 0, designLeft: 0, phone: { left: 0, designLeft: 0 } },
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+widgets-design-admin@example.invalid' }] }],
    states: [{
      id: 'WL-01', screen: 'Widgets', name: 'writes', buttons: [],
      reach: { world: 'design', role: 'admin', writes: true, steps: [{ goto: '/dashboard/widgets' }] },
    }],
  };
}

/** A stub for the ordinary (non-components) page-area crop path: no buttons, flat measurements. */
function fakePageChromium({ screenshots, calls }) {
  const page = {
    async goto(u) { page._url = u; calls?.push(`goto ${new URL(u).pathname}`); },
    url: () => page._url,
    async unrouteAll() {},
    async route() {},
    async setViewportSize() {},
    async waitForTimeout() {},
    async waitForLoadState() {},
    locator() { return { first: () => ({ async isVisible() { return false; } }) }; },
    async evaluate(fn) {
      if (fn.name === 'documentWidth') return { scrollWidth: 390, innerWidth: 390 };
      return 0;
    },
    async screenshot(opts) { screenshots.push(opts); calls?.push(`shoot ${opts.path.split('/').pop()}`); },
  };
  return {
    async launch() {
      return {
        async newContext() {
          return { async newPage() { return page; }, async storageState() {}, async close() {} };
        },
        async newPage() { return { async close() {} }; },
        async close() {},
      };
    },
  };
}

test('a state that writes and is checked at both widths is re-seeded between the desktop and phone shot', async () => {
  const map = pageMap(['desktop', 'phone']);
  const { items } = selectStates(map);
  const { outDir, cleanup } = setupDirs();
  try {
    const screenshots = [];
    const calls = [];
    const chromium = fakePageChromium({ screenshots, calls });
    const report = await runShoot({
      map, items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      chromium, log: () => {},
      reseed: async (world) => { calls.push(`reseed ${world}`); },
    });
    assert.equal(report['WL-01'].reached, true);
    assert.equal(report['WL-01@phone'].reached, true);
    // Desktop is shot, the world is re-seeded, then the phone shot: never the other order, and
    // never a reseed with nothing shot on either side of it (one per data-changing state, not more).
    assert.deepEqual(calls, [
      'goto /dashboard/widgets', 'goto /dashboard/widgets', 'shoot WL-01.live.png',
      'reseed design',
      'goto /dashboard/widgets', 'goto /dashboard/widgets', 'shoot WL-01@phone.live.png',
    ]);
  } finally { cleanup(); }
});

test('a state shot at only one width is never re-seeded mid-shoot', async () => {
  const map = pageMap(['desktop']);
  const { items } = selectStates(map);
  const { outDir, cleanup } = setupDirs();
  try {
    const calls = [];
    const chromium = fakePageChromium({ screenshots: [], calls });
    await runShoot({
      map, items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      chromium, log: () => {},
      reseed: async (world) => { calls.push(`reseed ${world}`); },
    });
    assert.ok(!calls.some((c) => c.startsWith('reseed')), 'nothing after the only write needs fresh data');
  } finally { cleanup(); }
});

test('no element matches the crop selector: not reached, and nothing is shot', async () => {
  const map = componentsMap(['DP-01']);
  const { items } = selectStates(map);
  const { outDir, cleanup } = setupDirs();
  try {
    const screenshots = [];
    const chromium = fakeChromium({ boxes: {}, screenshots });
    const report = await runShoot({
      map, items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      chromium, log: () => {},
    });
    assert.equal(report['DP-01'].reached, false);
    assert.match(report['DP-01'].problems[0], /no element matches \[data-delivery-state="DP-01"\]/);
    assert.equal(screenshots.length, 0);
  } finally { cleanup(); }
});

test('a reach step waits for the requests it started: a slow save is pictured after it answers', async () => {
  const { trackRequests, waitForQuiet } = await import('../../lib/picture/shoot.mjs');
  const handlers = {};
  const page = { on: (ev, fn) => { handlers[ev] = fn; } };
  const net = trackRequests(page);
  let t = 0;
  const now = () => t;
  const post = { resourceType: () => 'fetch' };
  handlers.request(post);
  // The save answers 1.1 s after the click, as in the run that found this.
  const sleep = async (ms) => { t += ms; if (t >= 1100 && net.count) handlers.requestfinished(post); };
  assert.equal(await waitForQuiet(net, { now, sleep }), true);
  assert.ok(t >= 1600, `waited until 500 ms after the response (${t} ms), not a fixed second`);
});

test('a stream or a request that never ends does not hold a step past the cap', async () => {
  const { trackRequests, waitForQuiet, SETTLE_CAP_MS } = await import('../../lib/picture/shoot.mjs');
  const handlers = {};
  const net = trackRequests({ on: (ev, fn) => { handlers[ev] = fn; } });
  handlers.request({ resourceType: () => 'eventsource' });
  assert.equal(net.count, 0, 'a stream is not counted');
  handlers.request({ resourceType: () => 'fetch' });
  let t = 0;
  assert.equal(await waitForQuiet(net, { now: () => t, sleep: async (ms) => { t += ms; } }), false);
  assert.ok(t >= SETTLE_CAP_MS && t < SETTLE_CAP_MS + 100);
  assert.equal(trackRequests({}).count, 0, 'a page without events (the test fakes) never waits');
});

test('a dev server whose build output was replaced is named before the shoot, not pictured as 500 pages', async () => {
  const { probeServer } = await import('../../lib/commands/shoot.mjs');
  const ctxWith = (fetch) => ({ fetch });
  const answer = (status, body) => async () => ({ status, text: async () => body });
  assert.equal(await probeServer(ctxWith(answer(200, '')), 'http://localhost:3000'), null);
  assert.equal(await probeServer(ctxWith(answer(307, '')), 'http://localhost:3000'), null, 'a redirect to sign-in is a working server');
  assert.equal(await probeServer(ctxWith(async () => { throw new Error('ECONNREFUSED'); }), 'http://localhost:3000'), null, 'unreachable: left to the per-state report');
  assert.match(await probeServer(ctxWith(answer(500, "Error: Cannot find module './vendor-chunks/x.js'")), 'http://localhost:3000'), /build output is missing files.*never run the build/);
  assert.match(await probeServer(ctxWith(answer(404, "Cannot find module './chunks/1.js'")), 'http://localhost:3000'), /build output is missing files/);
  assert.match(await probeServer(ctxWith(answer(502, 'Bad gateway')), 'http://localhost:3000'), /answers 502/);
});
