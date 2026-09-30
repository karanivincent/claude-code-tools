// W2 of the 2026-09-30 improvement plan: the page loads before we photograph it. delivery smoke
// opens each distinct map route, signed in, at each width, and stops at the first broken page;
// the shoot runs it first, and a server that breaks during a shoot throws that round away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pageProblem, runSmoke, skeletonSelector, smokeTargets, smokeFailureLine, SKELETON_DEFAULT } from '../../lib/picture/smoke.mjs';
import { selectStates } from '../../lib/picture/shoot.mjs';
import { discardRound, listRounds, nextRound, roundDir } from '../../lib/picture/rounds.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeTempDir, makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';

function map(over = {}) {
  return {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop', 'phone'], pageArea: { left: 0, designLeft: 0 },
    worlds: [
      { id: 'design', users: [{ role: 'admin', email: 'delivery+st-design-admin@example.invalid' }, { role: 'member', email: 'delivery+st-design-member@example.invalid' }] },
      { id: 'empty', users: [{ role: 'admin', email: 'delivery+st-empty-admin@example.invalid' }] },
    ],
    states: [
      { id: 'WL-01', screen: 'Widgets', name: 'list', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } },
      { id: 'WL-02', screen: 'Widgets', name: 'one', buttons: [], reach: { world: 'design', role: 'member', steps: [{ goto: '/dashboard/widgets/w1?tab=info' }] } },
      { id: 'WL-03', screen: 'Widgets', name: 'one, other tab', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets/w1?tab=log' }] } },
      { id: 'WL-04', screen: 'Widgets', name: 'empty', buttons: [], reach: { world: 'empty', role: 'admin', steps: [{ goto: '/dashboard/widgets/settings' }] } },
    ],
    ...over,
  };
}

test('smoke opens each distinct route once per width, with the first user who reaches it, grouped by user', () => {
  const t = smokeTargets(map());
  const seen = t.map((x) => `${x.world}/${x.role} ${x.width} ${x.route}`);
  assert.deepEqual(seen, [
    'design/admin desktop /dashboard/widgets',
    'design/admin phone /dashboard/widgets',
    'design/member desktop /dashboard/widgets/w1?tab=info',
    'design/member phone /dashboard/widgets/w1?tab=info',
    'empty/admin desktop /dashboard/widgets/settings',
    'empty/admin phone /dashboard/widgets/settings',
  ], 'the second tab of the same path is the same route');
  const { items } = selectStates(map(), ['WL-04@phone']);
  assert.deepEqual(smokeTargets(map(), items).map((x) => `${x.width} ${x.route}`), ['phone /dashboard/widgets', 'phone /dashboard/widgets/settings'], 'the landing route, then the items\' own');
});

test('a broken page: 500 and up, a replaced build output, the error overlay, a placeholder that stays', () => {
  assert.equal(pageProblem({ status: 200 }), null);
  assert.equal(pageProblem({ status: 404 }), null, 'a missing page is the review\'s business, not a server fault');
  assert.equal(pageProblem({ status: 500 }), 'it answers 500');
  assert.match(pageProblem({ status: 500, body: "Error: Cannot find module './vendor-chunks/x.js'" }), /answers 500: its build output is missing files/);
  assert.match(pageProblem({ status: 404, body: "Cannot find module './chunks/1.js'" }), /^its build output is missing files/);
  assert.equal(pageProblem({ status: 200, overlay: 'Unhandled Runtime Error' }), 'it shows the Next.js error overlay: Unhandled Runtime Error');
  assert.equal(pageProblem({ status: 200, skeletons: 3, selector: '[data-skeleton]', waitMs: 10000 }), 'it still shows 3 loading placeholder(s) ([data-skeleton]) after 10 s');
  assert.equal(skeletonSelector(null), '[aria-busy=true], [data-skeleton]');
  assert.equal(skeletonSelector({ smoke: { skeleton: ['.animate-pulse'] } }), '.animate-pulse');
  assert.deepEqual([...SKELETON_DEFAULT], ['[aria-busy=true]', '[data-skeleton]']);
  const profile = makeProfile();
  profile.smoke = { skeleton: ['.animate-pulse', '[aria-busy=true]'] };
  assert.deepEqual(validateAgainst('profile', profile).errors, []);
  assert.match(smokeFailureLine({ route: '/x', width: 'phone', user: 'design/admin', why: 'it answers 500' }, 'http://localhost:3000'), /^\/x at phone \(as design\/admin\) on http:\/\/localhost:3000 is broken: it answers 500\. /);
});

/**
 * A Playwright-shaped stub for smoke and the shoot: each route answers the status `status(path)`
 * gives, the page shows `skeletons(path)` placeholders, and every call is recorded.
 */
function fakeChromium({ status = () => 200, skeletons = () => 0, overlay = () => null, calls = [] } = {}) {
  const page = {
    _url: 'about:blank',
    async goto(u) {
      page._url = u;
      const path = new URL(u).pathname;
      calls.push(`goto ${path}${new URL(u).search}`);
      return { status: () => status(path), text: async () => '' };
    },
    url: () => page._url,
    async unrouteAll() {}, async route() {}, async setViewportSize() {}, async waitForTimeout() {}, async waitForLoadState() {},
    locator() { return { count: async () => 0, first: () => ({ async isVisible() { return false; } }) }; },
    async evaluate(fn) {
      const path = new URL(page._url).pathname;
      if (fn.name === 'nextErrorOverlay') return overlay(path);
      if (fn.name === 'countVisible') return skeletons(path);
      if (fn.name === 'pageExtract') return { dom: { elements: [] } };
      return 0;
    },
    async screenshot(o) { calls.push(`shoot ${o.path.split('/').pop()}`); writeFileSync(o.path, 'png'); },
  };
  return {
    calls,
    async launch() {
      calls.push('launch');
      return {
        async newContext(opts) {
          calls.push(`context ${opts.viewport.width}`);
          return { async newPage() { return page; }, async storageState() {}, async close() {} };
        },
        async newPage() { return { async setContent() {}, async evaluate() { return { w: 1, h: 1 }; }, async setViewportSize() {}, async screenshot(o) { writeFileSync(o.path, 'png'); }, async close() {} }; },
        async close() {},
      };
    },
  };
}

const smokeOpts = (o) => ({
  baseUrl: 'http://localhost:3000', magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' }, ...o,
});

test('smoke stops at the first route that answers 500 and names it', async () => {
  const d = makeTempDir();
  try {
    const calls = [];
    const chromium = fakeChromium({ calls, status: (p) => (p === '/dashboard/widgets/w1' ? 500 : 200) });
    const r = await runSmoke(smokeOpts({ map: map(), chromium, sessionsDir: join(d.dir, 's') }));
    assert.deepEqual(r.failure, { route: '/dashboard/widgets/w1?tab=info', width: 'desktop', user: 'design/member', why: 'it answers 500' });
    assert.equal(r.checked.length, 3);
    assert.ok(!calls.includes('goto /dashboard/widgets/settings'), 'nothing after the first broken page');
    assert.equal(calls.filter((c) => c === 'launch').length, 1);

    const ok = await runSmoke(smokeOpts({ map: map(), chromium: fakeChromium(), sessionsDir: join(d.dir, 's') }));
    assert.equal(ok.failure, null);
    assert.equal(ok.checked.length, 6);
  } finally { d.cleanup(); }
});

test('smoke waits out loading placeholders, and fails a page that still shows one after the wait', async () => {
  const d = makeTempDir();
  try {
    let t = 0;
    let left = 3; // the list shows placeholders for three polls, then its rows
    const chromium = fakeChromium({ skeletons: (p) => (p === '/dashboard/widgets/settings' ? 2 : p === '/dashboard/widgets' && left > 0 ? left-- : 0) });
    const r = await runSmoke(smokeOpts({ map: map(), chromium, sessionsDir: join(d.dir, 's'), now: () => t, sleep: async (ms) => { t += ms; }, selector: '[data-skeleton]' }));
    assert.equal(r.failure.route, '/dashboard/widgets/settings');
    assert.match(r.failure.why, /still shows 2 loading placeholder\(s\) \(\[data-skeleton\]\) after 10 s/);
    assert.ok(t >= 10000, 'it waited the full ten seconds before failing');

    const over = await runSmoke(smokeOpts({ map: map(), chromium: fakeChromium({ overlay: (p) => (p === '/dashboard/widgets' ? 'Build Error Failed to compile' : null) }), sessionsDir: join(d.dir, 's') }));
    assert.equal(over.failure.why, 'it shows the Next.js error overlay: Build Error Failed to compile');
    assert.equal(over.failure.route, '/dashboard/widgets');
  } finally { d.cleanup(); }
});

test('a discarded round gives its number back; work is never discarded', () => {
  const d = makeTempDir();
  try {
    const paths = { runDir: d.dir };
    mkdirSync(roundDir(paths, 1), { recursive: true });
    mkdirSync(roundDir(paths, 2), { recursive: true });
    mkdirSync(roundDir(paths, 'work'), { recursive: true });
    assert.equal(nextRound(paths), 3);
    assert.equal(discardRound(paths, 2), true);
    assert.deepEqual(listRounds(paths), [1]);
    assert.equal(nextRound(paths), 2);
    assert.equal(discardRound(paths, 'work'), false);
    assert.ok(existsSync(roundDir(paths, 'work')));
    assert.equal(discardRound(paths, 7), false);
  } finally { d.cleanup(); }
});

// The shoot command, end to end on a fake Playwright package the repo "installs".
function fakePlaywrightPackage(dir) {
  const pkg = join(dir, 'node_modules', '@playwright', 'test');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@playwright/test', version: '9.9.9', main: 'index.js' }));
  writeFileSync(join(pkg, 'index.js'), 'exports.chromium = { launch: (...a) => globalThis.__deliveryFakeChromium.launch(...a) };');
}

async function shootRepo() {
  const m = map({ widths: ['desktop'], states: map().states.slice(0, 1) });
  const repo = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': m, '.delivery/widgets/design/WL-01.png': 'png' } });
  fakePlaywrightPackage(repo.dir);
  const { ctx, stdout } = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ fixtureUserPattern: '^delivery\\+' }),
    env: { DELIVERY_SLOTS_FILE: join(repo.dir, 'slots.json') },
    fetch: async () => ({ status: 200, text: async () => '' }),
  });
  ctx.dataBackend = { signInHash: async () => 'hash' };
  return { repo, ctx, stdout, rounds: join(repo.dir, '.delivery/widgets/rounds') };
}

test('shoot runs smoke first: a broken page pictures nothing and uses no round', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const { repo, ctx, stdout, rounds } = await shootRepo();
  try {
    const calls = [];
    globalThis.__deliveryFakeChromium = fakeChromium({ calls, status: () => 500 });
    assert.equal(await shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--no-reset']), 1);
    assert.match(stdout.text(), /FAIL page-broken \/dashboard\/widgets at desktop \(as design\/admin\) on http:\/\/localhost:3000 is broken: it answers 500/);
    assert.match(stdout.text(), /nothing was pictured, and no round was used/);
    assert.ok(!calls.some((c) => c.startsWith('shoot ')));
    assert.ok(!existsSync(join(rounds, '1')));
  } finally { delete globalThis.__deliveryFakeChromium; repo.cleanup(); }
});

test('a server that breaks during the shoot throws the new round away, so the next shoot reuses its number', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const { repo, ctx, stdout, rounds } = await shootRepo();
  try {
    let broken = false;
    const calls = [];
    const fake = fakeChromium({ calls, status: () => (broken ? 500 : 200) });
    const page = fake.launch;
    fake.launch = async () => {
      const b = await page();
      const close = b.close;
      b.close = async () => { if (calls.some((c) => c.startsWith('shoot '))) broken = true; return close(); }; // the shoot's own browser closing
      return b;
    };
    globalThis.__deliveryFakeChromium = fake;
    assert.equal(await shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--no-reset']), 1);
    assert.ok(calls.some((c) => c === 'shoot WL-01.live.png'), 'the shoot ran');
    assert.match(stdout.text(), /FAIL server-broken \/dashboard\/widgets at desktop is broken: it answers 500\. It broke during the shoot.*round 1 was deleted, and the next shoot takes its number again/);
    assert.ok(!existsSync(join(rounds, '1')), 'no round folder is left');

    broken = false;
    calls.length = 0;
    fake.launch = page;
    assert.equal(await shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--no-reset']), 0, stdout.text());
    assert.ok(existsSync(join(rounds, '1', 'shoot.json')), 'the next shoot is round 1 again');
  } finally { delete globalThis.__deliveryFakeChromium; repo.cleanup(); }
});

// In a real browser: needs Playwright and Chromium (DELIVERY_PLAYWRIGHT_ROOT), skipped otherwise.
const PW = process.env.DELIVERY_PLAYWRIGHT_ROOT;
test('smoke in a real browser: a fixture server that answers 500 on one route fails and names it', { skip: PW ? false : 'DELIVERY_PLAYWRIGHT_ROOT not set', timeout: 60_000 }, async () => {
  const { resolvePlaywright } = await import('../../lib/core/playwright.mjs');
  const { chromium } = await resolvePlaywright({ repoRoot: PW });
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/dashboard/widgets/settings') { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<h1>Internal Server Error</h1>'); return; }
    if (path === '/dashboard/widgets/w1') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<main><div data-skeleton style="height:20px">loading</div></main><script>setTimeout(() => document.querySelector("[data-skeleton]").remove(), 300)</script>'); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<main>Widgets</main>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const d = makeTempDir();
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const r = await runSmoke(smokeOpts({ map: map({ widths: ['desktop'] }), baseUrl, chromium, sessionsDir: join(d.dir, 's') }));
    assert.deepEqual(r.failure, { route: '/dashboard/widgets/settings', width: 'desktop', user: 'empty/admin', why: 'it answers 500' });
    assert.deepEqual(r.checked.map((c) => c.status), [200, 200, 500], 'the placeholder that went away passed');
  } finally { server.close(); d.cleanup(); }
});
