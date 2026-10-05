// W6 of the 2026-09-30 improvement plan: faster shoots. Worlds are pictured side by side with
// identical results to a serial run, the waits are tunables, and --prod shoots a production build
// that the shoot builds, serves and stops itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShoot, selectStates, PARALLEL_WORLDS, CLICK_TIMEOUT_MS, STEP_PAUSE_MS, SETTLE_PAUSE_MS, RESIZE_PAUSE_MS, SETTLE_QUIET_MS, SETTLE_CAP_MS } from '../../lib/picture/shoot.mjs';
import { startProdServer } from '../../lib/picture/prod-server.mjs';
import { pictureFacts, pictureNext } from '../../lib/picture/next.mjs';
import { loadTunables, tunable } from '../../lib/retro/tunables.mjs';
import { freePort } from '../../lib/capture/run.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';

const SEEDED = new Date('2026-01-15T12:00:00.000Z');
const WORLDS = ['design', 'messy', 'third'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Three worlds, each with one read state and one state that writes (so each is reset twice). */
function threeWorldMap() {
  const states = [];
  WORLDS.forEach((w, i) => {
    states.push({ id: `T-${i}1`, screen: 'Widgets', name: `${w} list`, buttons: [], reach: { world: w, role: 'admin', steps: [{ goto: `/w/${w}` }] } });
    states.push({ id: `T-${i}2`, screen: 'Widgets', name: `${w} saved`, buttons: [], reach: { world: w, role: 'admin', writes: true, steps: [{ goto: `/w/${w}` }] } });
  });
  // A state whose page never loads: its problem must be the same either way.
  states.push({ id: 'T-99', screen: 'Widgets', name: 'no user', buttons: [], reach: { world: 'third', role: 'ghost', steps: [{ goto: '/w/third' }] } });
  return {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: WORLDS.map((w) => ({ id: w, users: [{ role: 'admin', email: `delivery+w-${w}-admin@example.invalid` }] })),
    states,
  };
}

/**
 * A browser whose contexts remember which world they picture (the world in the path of their first
 * goto after the landing page) and whose calls really yield, so parallel worlds really interleave.
 * `log` gets every context open, world tag, reset check and close.
 */
function instrumentedChromium(state) {
  return {
    async launch() {
      return {
        async newContext() {
          const ctx = { world: null, open: true };
          state.contexts.push(ctx);
          state.open.add(ctx);
          state.maxOpen = Math.max(state.maxOpen, state.open.size);
          await wait(2);
          const page = {
            _url: 'about:blank',
            async goto(u) {
              await wait(3);
              page._url = u;
              const m = /\/w\/([a-z]+)/.exec(u);
              if (m && !ctx.world) {
                ctx.world = m[1];
                for (const other of state.open) if (other !== ctx && other.world === ctx.world) state.violations.push(`two contexts open for ${ctx.world}`);
              }
            },
            url: () => page._url,
            async unrouteAll() {}, async route() {}, async setViewportSize() {}, async waitForTimeout() {}, async waitForLoadState() {},
            locator() { return { first: () => ({ async isVisible() { return false; } }) }; },
            async evaluate(fn) { return fn.name === 'pageExtract' ? { dom: { elements: [] } } : 0; },
            async screenshot(o) { await wait(3); writeFileSync(o.path, 'png'); },
          };
          return {
            clock: { async setFixedTime() {} },
            async newPage() { return page; },
            async storageState() {},
            async close() { await wait(1); ctx.open = false; state.open.delete(ctx); },
          };
        },
        async newPage() { return { async setContent() {}, async evaluate() { return { w: 1, h: 1 }; }, async setViewportSize() {}, async screenshot(o) { writeFileSync(o.path, 'png'); }, async close() {} }; },
        async close() {},
      };
    },
  };
}

const newState = () => ({ contexts: [], open: new Set(), maxOpen: 0, violations: [], resets: [] });

function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'faster-shoots-'));
  const outDir = join(root, 'round');
  const designDir = join(root, 'design');
  mkdirSync(designDir, { recursive: true });
  return { root, outDir, designDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function shootWith(parallel, { log = [] } = {}) {
  const m = threeWorldMap();
  const { items } = selectStates(m);
  const d = dirs();
  const state = newState();
  try {
    const report = await runShoot({
      map: m, items, outDir: d.outDir, designDir: d.designDir, baseUrl: 'http://localhost:3000', sessionsDir: join(d.outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' }, diffPictures: async () => 0,
      chromium: instrumentedChromium(state), timeZone: 'Africa/Nairobi', parallel,
      log: (l) => log.push(l),
      reset: async (world) => {
        // A world is reset only while none of its contexts is open.
        for (const c of state.open) if (c.world === world) state.violations.push(`${world} reset while a context of it was open`);
        state.resets.push(world);
        await wait(4);
        // ... and none may open on it during the reset either: check again after the wait.
        for (const c of state.open) if (c.world === world) state.violations.push(`${world} context opened during its reset`);
        return { at: SEEDED, rows: [], users: [] };
      },
    });
    return { report, state };
  } finally { d.cleanup(); }
}

const essence = (report) => Object.fromEntries(Object.entries(report).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, r]) => [k, { reached: r.reached, problems: r.problems }]));

test('two worlds shot in parallel give the same report as a serial run: the same keys, reached and problems', async () => {
  const serial = await shootWith(1);
  const parallel = await shootWith(2);
  assert.deepEqual(Object.keys(parallel.report).sort(), Object.keys(serial.report).sort());
  assert.deepEqual(essence(parallel.report), essence(serial.report));
  assert.equal(Object.keys(serial.report).length, 7);
  assert.equal(serial.report['T-01'].reached, true);
  assert.equal(serial.report['T-99'].reached, false, 'the state with no user is a problem in both');
  assert.match(serial.report['T-99'].problems[0], /world third has no ghost user/);
  assert.equal(serial.state.maxOpen, 1, 'a serial run has one context open at a time');
  assert.equal(parallel.state.maxOpen, 2, 'parallel 2 runs two worlds at once, never more');
  assert.deepEqual([...parallel.state.resets].sort(), [...serial.state.resets].sort(), 'each world is reset as often as in the serial run');
});

test('a world is never reset while another context of the same world is open, at any parallelism', async () => {
  for (const parallel of [1, 2, 3]) {
    const { state, report } = await shootWith(parallel);
    assert.deepEqual(state.violations, [], `parallel ${parallel}`);
    // Every world is reset before its first shot.
    for (const w of WORLDS) assert.ok(state.resets.filter((r) => r === w).length >= 1, `${w} was reset`);
    assert.ok(Object.values(report).filter((r) => r.reached).length >= 6);
    // Every world was pictured in a context of its own (the violations list holds any overlap).
    for (const w of WORLDS) assert.ok(state.contexts.some((c) => c.world === w), `${w} was pictured`);
  }
});

test('the shooting line appears only when more than one world is shot at once', async () => {
  const one = []; const two = []; const three = [];
  await shootWith(1, { log: one });
  await shootWith(2, { log: two });
  await shootWith(3, { log: three });
  assert.ok(!one.some((l) => /^shooting \d+ world/.test(l)), 'parallel 1 says nothing');
  assert.ok(two.includes('shooting 3 world(s), 2 at a time'), two.join('\n'));
  assert.ok(three.includes('shooting 3 world(s), 3 at a time'));
  const capped = []; // a request for more than there are worlds is cut to the worlds there are
  const m = threeWorldMap();
  const { items } = selectStates(m, ['T-01']);
  const d = dirs();
  try {
    await runShoot({
      map: m, items, outDir: d.outDir, designDir: d.designDir, baseUrl: 'http://localhost:3000', sessionsDir: join(d.outDir, 'sessions'),
      magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' }, diffPictures: async () => 0,
      chromium: instrumentedChromium(newState()), parallel: 4, log: (l) => capped.push(l),
    });
  } finally { d.cleanup(); }
  assert.ok(!capped.some((l) => /^shooting \d+ world/.test(l)), 'one world: nothing to run side by side');
});

// ---- startProdServer ----

/** A fake child process: stdout and stderr emitters, a pid nothing can have, and a kill that ends it. */
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 2_000_000_000;
  child.killed = [];
  child.kill = (sig) => { child.killed.push(sig); child.emit('exit', null, sig); return true; };
  return child;
}

/** A fake clock: sleeping moves it, so a 60 s timeout takes no time. */
function fakeTime() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms) => { t += ms; }, slept: () => t - 1_000_000 };
}

test('startProdServer: serves after a few polls that fail, filling {port} into the command', async () => {
  const child = fakeChild();
  const spawned = [];
  const time = fakeTime();
  const answers = [() => { throw new Error('ECONNREFUSED'); }, () => { throw new Error('ECONNREFUSED'); }, () => ({ status: 503 }), () => ({ status: 200 })];
  const urls = [];
  const r = await startProdServer({
    command: 'build-and-serve --port {port}', port: 4321, cwd: '/repo', timeoutMs: 60000,
    spawnFn: (cmd, args, opts) => { spawned.push({ cmd, args, opts }); return child; },
    fetchFn: async (u) => { urls.push(u); return answers.shift()(); },
    sleep: time.sleep, now: time.now,
  });
  assert.equal(r.failure, undefined);
  assert.equal(r.baseUrl, 'http://127.0.0.1:4321');
  assert.deepEqual(urls, Array(4).fill('http://127.0.0.1:4321'));
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].cmd, 'sh');
  assert.deepEqual(spawned[0].args, ['-c', 'build-and-serve --port 4321'], 'the {port} placeholder is filled');
  assert.equal(spawned[0].opts.cwd, '/repo');
  assert.equal(spawned[0].opts.detached, true);
  assert.equal(spawned[0].opts.env.PORT, '4321');
  assert.equal(time.slept(), 3000, 'it slept between the failed polls only');
  child.stdout.emit('data', 'ready\n');
  assert.equal(r.output(), 'ready');
  await r.stop();
  assert.ok(child.killed.length <= 1);
});

test('startProdServer: a build that exits before it serves is a failure with the output tail', async () => {
  const child = fakeChild();
  const time = fakeTime();
  let polls = 0;
  const r = await startProdServer({
    command: 'npm run build && npm start -- -p {port}', port: 5000, cwd: '/repo', timeoutMs: 60000,
    spawnFn: () => child,
    fetchFn: async () => {
      polls++;
      if (polls === 2) {
        for (let i = 1; i <= 40; i++) child.stderr.emit('data', `build line ${i}\n`);
        child.stdout.emit('data', 'Type error: nope\n');
        child.emit('exit', 1, null);
      }
      throw new Error('ECONNREFUSED');
    },
    sleep: time.sleep, now: time.now,
  });
  assert.match(r.failure, /exited \(1\) before it served: npm run build && npm start -- -p 5000/);
  assert.equal(r.baseUrl, undefined);
  const lines = r.output.split('\n');
  assert.equal(lines.length, 30, 'only the last 30 lines are kept');
  assert.equal(lines.at(-1), 'Type error: nope');
  assert.equal(lines[0], 'build line 12');
  assert.equal(polls, 2, 'it stopped polling as soon as the process was gone');
});

test('startProdServer: a server that never answers times out, fails, and the process is stopped', async () => {
  const child = fakeChild();
  const time = fakeTime();
  const r = await startProdServer({
    command: 'serve {port}', port: 5100, cwd: '/repo', timeoutMs: 5000,
    spawnFn: () => child,
    fetchFn: async () => { throw new Error('ECONNREFUSED'); },
    sleep: time.sleep, now: time.now,
  });
  assert.match(r.failure, /did not answer on http:\/\/127\.0\.0\.1:5100 within 5 s: serve 5100/);
  assert.equal(child.killed.length, 1, 'the timeout stopped the process');
  assert.ok(time.slept() >= 5000);
  assert.equal(typeof r.output, 'string');
});

test('startProdServer: a real server on a free port serves, and stop() ends it', async (t) => {
  const port = await freePort();
  const started = Date.now();
  const r = await startProdServer({
    command: `node -e "require('http').createServer((q,s)=>s.end('ok')).listen({port},'127.0.0.1')"`,
    port, cwd: tmpdir(), timeoutMs: 10000,
  });
  if (r.failure && Date.now() - started > 10000) { t.skip('the real server took longer than 10 s to start'); return; }
  try {
    assert.equal(r.failure, undefined, r.failure);
    assert.equal(r.baseUrl, `http://127.0.0.1:${port}`);
    const res = await fetch(r.baseUrl);
    assert.equal(await res.text(), 'ok');
  } finally { await r.stop?.(); }
  await assert.rejects(fetch(`http://127.0.0.1:${port}`), 'nothing answers once it is stopped');
});

// ---- the shoot command ----

function fakePlaywrightPackage(dir) {
  const pkg = join(dir, 'node_modules', '@playwright', 'test');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@playwright/test', version: '9.9.9', main: 'index.js' }));
  writeFileSync(join(pkg, 'index.js'), 'exports.chromium = { launch: (...a) => globalThis.__deliveryFakeChromium.launch(...a) };');
}

function cmdChromium(calls) {
  const page = {
    _url: 'about:blank',
    async goto(u) { page._url = u; calls.push(`goto ${new URL(u).pathname}`); return { status: () => 200, text: async () => '' }; },
    url: () => page._url,
    async unrouteAll() {}, async route() {}, async setViewportSize() {}, async waitForTimeout() {}, async waitForLoadState() {},
    locator() { return { count: async () => 0, first: () => ({ async isVisible() { return false; } }) }; },
    async evaluate(fn) { return fn.name === 'pageExtract' ? { dom: { elements: [] } } : 0; },
    async screenshot(o) { calls.push(`shoot ${o.path.split('/').pop()}`); writeFileSync(o.path, 'png'); },
  };
  return {
    async launch() {
      calls.push('launch');
      return {
        async newContext() { return { async newPage() { return page; }, async storageState() {}, async close() {} }; },
        async newPage() { return { async setContent() {}, async evaluate() { return { w: 1, h: 1 }; }, async setViewportSize() {}, async screenshot(o) { writeFileSync(o.path, 'png'); }, async close() {} }; },
        async close() {},
      };
    },
  };
}

async function shootRepo(profile) {
  const m = {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+st-design-admin@example.invalid' }] }],
    states: [{ id: 'WL-01', screen: 'Widgets', name: 'list', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } }],
  };
  const repo = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': m, '.delivery/widgets/design/WL-01.png': 'png' } });
  fakePlaywrightPackage(repo.dir);
  const { ctx, stdout } = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile, safety: makeSafety({ fixtureUserPattern: '^delivery\\+' }),
    env: { DELIVERY_SLOTS_FILE: join(repo.dir, 'slots.json') },
    fetch: async () => ({ status: 200, text: async () => '' }),
  });
  ctx.dataBackend = { signInHash: async () => 'hash' };
  return { repo, ctx, stdout, rounds: join(repo.dir, '.delivery/widgets/rounds') };
}

function withProd(prodServer) {
  const p = makeProfile();
  // The shoot runs the build through commands.heavy; here that is a plain shell.
  p.commands = { ...p.commands, heavy: "sh -c '{cmd}'" };
  if (prodServer) p.commands.prodServer = prodServer; else delete p.commands.prodServer;
  return p;
}

test('shoot: --prod together with --base-url is a usage error', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const { repo, ctx } = await shootRepo(withProd('serve {port}'));
  try {
    await assert.rejects(shootCommand.run(ctx, ['--prod', '--base-url', 'http://localhost:3000']), (e) => e.name === 'UsageError' && /--prod or --base-url, not both/.test(e.message));
  } finally { repo.cleanup(); }
});

test('shoot: --prod without commands.prodServer in the profile is a usage error naming the field', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const profile = withProd(null);
  assert.equal(profile.commands.prodServer, undefined);
  const { repo, ctx, rounds } = await shootRepo(profile);
  const calls = [];
  globalThis.__deliveryFakeChromium = cmdChromium(calls);
  try {
    await assert.rejects(shootCommand.run(ctx, ['--prod']), (e) => e.name === 'UsageError' && /--prod needs the profile's commands\.prodServer/.test(e.message));
    assert.deepEqual(calls, [], 'nothing was launched');
    assert.ok(!existsSync(rounds));
  } finally { delete globalThis.__deliveryFakeChromium; repo.cleanup(); }
});

test('shoot --prod: a build that exits 1 fails the command with build-failed, shows its last lines, and uses no round', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const { repo, ctx, stdout, rounds } = await shootRepo(withProd('echo compile-error-here >&2; exit 1'));
  const calls = [];
  globalThis.__deliveryFakeChromium = cmdChromium(calls);
  try {
    assert.equal(await shootCommand.run(ctx, ['--prod', '--no-reset']), 1);
    assert.match(stdout.text(), /FAIL build-failed .*exited \(1\) before it served.*nothing was pictured, and no round was used/);
    assert.match(stdout.text(), /compile-error-here/);
    assert.ok(!existsSync(rounds), 'no round folder was created');
    assert.ok(!calls.some((c) => c === 'launch'), 'no browser was launched');
  } finally { delete globalThis.__deliveryFakeChromium; repo.cleanup(); }
});

test('shoot --prod: builds and serves, shoots the served address, and stops the server afterwards', async (t) => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const server = `node -e "require('http').createServer((q,s)=>s.end('ok')).listen({port},'127.0.0.1')"`;
  const { repo, ctx, stdout, rounds } = await shootRepo(withProd(server));
  const calls = [];
  globalThis.__deliveryFakeChromium = cmdChromium(calls);
  try {
    const started = Date.now();
    const code = await shootCommand.run(ctx, ['--prod', '--no-reset']);
    if (code !== 0 && Date.now() - started > 10000) { t.skip('the real server took longer than 10 s to start'); return; }
    assert.equal(code, 0, stdout.text());
    const doc = JSON.parse(readFileSync(join(rounds, '1', 'shoot.json'), 'utf8'));
    const m = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(doc.baseUrl);
    assert.ok(m, `the shoot pictured the served address (${doc.baseUrl})`);
    assert.match(stdout.text(), /production server up on http:\/\/127\.0\.0\.1:\d+/);
    await assert.rejects(fetch(doc.baseUrl), 'the server was stopped when the shoot ended');
  } finally { delete globalThis.__deliveryFakeChromium; repo.cleanup(); }
});

// ---- NEXT ----

const FACTS = { designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [] };
const nextOf = (f) => pictureNext({ ...FACTS, ...f }, { cli: 'delivery' });
const OPEN = { round: 1, shot: true, reviews: 4, compiled: true, counts: { must: 3, notReached: 1 } };

test('NEXT names --prod in every shoot line when facts.shootArgs is --prod, and the served dev server (no URL) without it', () => {
  const lines = (shootArgs) => {
    const f = shootArgs === undefined ? {} : { shootArgs };
    return {
      build: nextOf({ ...f }),
      update: nextOf({ ...f, update: 'a page that exists' }),
      shoot: nextOf({ ...f, rounds: [{ round: 1, shot: false }] }),
      dataFaults: nextOf({ ...f, rounds: [{ round: 1, shot: true, dataFaults: 2, dataFixPasses: 0, reviews: 0, planned: null }] }),
      fix: nextOf({ ...f, rounds: [OPEN] }),
      dataOnly: nextOf({ ...f, rounds: [{ ...OPEN, counts: { match: 3, must: 0, notReached: 0, dataFault: 1, dataGap: 0 } }], open: { must: 0, notReached: 0, data: 1 } }),
    };
  };
  const prod = lines('--prod');
  for (const [name, n] of Object.entries(prod)) {
    assert.match(n.text, /delivery shoot --prod/, name);
    assert.doesNotMatch(n.text, /--base-url/, name);
  }
  assert.equal(prod.fix.step, 'fix');
  assert.equal(prod.dataOnly.step, 'data-faults');
  for (const shootArgs of ['', undefined]) {
    for (const [name, n] of Object.entries(lines(shootArgs))) {
      assert.match(n.text, /delivery shoot( --|\s\(|$)/, name);
      assert.doesNotMatch(n.text, /--prod|--base-url|shoot {2}/, name);
    }
  }
});

test('pictureFacts: shootArgs is --prod when the profile has commands.prodServer, else nothing (the served dev server)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'faster-facts-'));
  try {
    const paths = featurePaths(dir, 'widgets');
    assert.equal((await pictureFacts(paths, { profile: withProd('serve {port}') })).shootArgs, '--prod');
    assert.equal((await pictureFacts(paths, { profile: withProd(null) })).shootArgs, '');
    assert.equal((await pictureFacts(paths)).shootArgs, '', 'no profile: the run\'s dev server');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the profile schema accepts commands.prodServer as an optional string', () => {
  assert.deepEqual(validateAgainst('profile', withProd('npm run build && npm start -- -p {port}')).errors, []);
  assert.deepEqual(validateAgainst('profile', withProd(null)).errors, []);
  const bad = withProd('x');
  bad.commands.prodServer = 5;
  assert.ok(validateAgainst('profile', bad).errors.length > 0);
});

// ---- tunables ----

test('every shoot tunable exists, sits inside its own bounds, and is what the code reads', () => {
  const all = loadTunables();
  const keys = ['clickTimeoutMs', 'stepPauseMs', 'settlePauseMs', 'resizePauseMs', 'settleQuietMs', 'settleCapMs', 'parallelWorlds', 'commandTimeoutMs'].map((k) => `shoot.${k}`);
  for (const k of keys) {
    const t = all[k];
    assert.ok(t, `${k} is in tunables.json`);
    assert.ok(t.min <= t.value && t.value <= t.max, `${k}: ${t.min} <= ${t.value} <= ${t.max}`);
    assert.ok(Number.isFinite(t.step) && t.step > 0, `${k} has a step`);
  }
  for (const k of Object.keys(all)) if (k.startsWith('shoot.')) assert.ok(keys.includes(k), `${k} is not covered above`);
  assert.deepEqual([PARALLEL_WORLDS, CLICK_TIMEOUT_MS, STEP_PAUSE_MS, SETTLE_PAUSE_MS, RESIZE_PAUSE_MS, SETTLE_QUIET_MS, SETTLE_CAP_MS],
    ['parallelWorlds', 'clickTimeoutMs', 'stepPauseMs', 'settlePauseMs', 'resizePauseMs', 'settleQuietMs', 'settleCapMs'].map((k) => tunable(`shoot.${k}`)));
  assert.equal(tunable('shoot.parallelWorlds'), 2);
  assert.equal(tunable('shoot.clickTimeoutMs'), 3000);
});
