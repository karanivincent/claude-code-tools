// 2026-10-04: a page that answered HTTP 429 (a rate-limit JSON body) was reported as "not reached:
// click timeout", which reads as a broken page. The shoot now says it was the rate limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { looksRateLimited, rateLimitProblem, runShoot, selectStates, trackRequests } from '../../lib/picture/shoot.mjs';

function map() {
  return {
    schemaVersion: 1, feature: 'components', title: 'Components', kind: 'components', route: '/g',
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+components-design-admin@example.invalid' }] }],
    states: [{ id: 'DP-01', screen: 'C', name: 'one', design: false, buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/g' }] } }],
  };
}

function chromium({ goto, body = '' }) {
  const page = {
    goto,
    url: () => 'http://localhost:3000/g',
    async unrouteAll() {}, async route() {}, async setViewportSize() {}, async waitForTimeout() {}, async waitForLoadState() {},
    locator() { return { first: () => ({ async boundingBox() { return null; }, async scrollIntoViewIfNeeded() {}, async screenshot() {} }) }; },
    async evaluate(fn) { return fn.name === 'bodyText' ? body : {}; },
    async screenshot() {},
  };
  return {
    async launch() {
      return {
        async newContext() { return { async newPage() { return page; }, async storageState() {}, async close() {} }; },
        async newPage() { return { async close() {} }; },
        async close() {},
      };
    },
  };
}

async function shoot(fake) {
  const m = map();
  const outDir = mkdtempSync(join(tmpdir(), 'delivery-429-'));
  try {
    return await runShoot({
      map: m, items: selectStates(m).items, baseUrl: 'http://localhost:3000', outDir,
      designDir: join(outDir, 'design'), sessionsDir: join(outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' }, chromium: fake, log: () => {},
    });
  } finally { rmSync(outDir, { recursive: true, force: true }); }
}

test('a goto answered with HTTP 429 is not reached, and the problem says rate limited', async () => {
  let n = 0;
  const report = await shoot(chromium({ goto: async () => { n++; return { status: () => (n > 1 ? 429 : 200) }; } }));
  assert.equal(report['DP-01'].reached, false);
  assert.equal(report['DP-01'].rateLimited, true);
  assert.match(report['DP-01'].problems[0], /^rate limited: \/g answered HTTP 429/);
});

test('a step that times out on a rate-limit body is reported as the rate limit, with the timeout after it', async () => {
  let n = 0;
  const report = await shoot(chromium({
    goto: async () => { n++; if (n > 1) throw new Error('page.goto: Timeout 15000ms exceeded.\nmore'); return null; },
    body: '{"error":"Too many requests","status":429}',
  }));
  assert.equal(report['DP-01'].rateLimited, true);
  assert.match(report['DP-01'].problems[0], /^rate limited: the page answered a rate limit \(\{"error":"Too many requests"/);
  assert.match(report['DP-01'].problems[0], /\(then: page\.goto: Timeout 15000ms exceeded\.\)$/);
});

test('a timeout on an ordinary page is reported as it was', async () => {
  let n = 0;
  const report = await shoot(chromium({ goto: async () => { n++; if (n > 1) throw new Error('click timeout'); return null; }, body: 'Home\nCalls today' }));
  assert.equal(report['DP-01'].rateLimited, undefined);
  assert.equal(report['DP-01'].problems[0], 'click timeout');
});

test('looksRateLimited and trackRequests: 429 bodies and responses are recognised, ordinary text is not', () => {
  assert.equal(looksRateLimited('{"message":"Rate limit exceeded"}'), true);
  assert.equal(looksRateLimited('Too Many Requests'), true);
  assert.equal(looksRateLimited('Calls today: 429 made'), false);
  assert.equal(looksRateLimited(''), false);
  assert.match(rateLimitProblem({ url: '/api/x' }), /\/api\/x answered HTTP 429/);
  const handlers = {};
  const net = trackRequests({ on: (ev, fn) => { handlers[ev] = fn; } });
  assert.equal(net.limited, null);
  handlers.response({ status: () => 200, url: () => 'http://h/ok' });
  handlers.response({ status: () => 429, url: () => 'http://h/api/calls?x=1' });
  assert.equal(net.limited, '/api/calls');
  net.clearLimited();
  assert.equal(net.limited, null);
});
