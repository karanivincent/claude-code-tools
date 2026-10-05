// delivery serve: the run's dev server lives outside any tool call. A dev server started with
// run_in_background died at the tool's two-hour limit mid-run, and the fixer's `shoot --round work`
// had no --base-url to give. serve --ensure starts it detached and records it; shoot uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import serveCommand from '../../lib/commands/serve.mjs';
import { ensureServer, leadingAssignments, pidAlive, readServer, spawnDevServer } from '../../lib/picture/serve.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';

const SERVER = `const http = require('http'); const fs = require('fs');
const broken = () => { try { return fs.readFileSync(__dirname + '/broken', 'utf8') === String(process.pid); } catch { return false; } };
http.createServer((q, s) => { s.statusCode = broken() ? 500 : 200; s.end(String(process.env.GREETING || '')); })
  .listen(Number(process.argv[2]), '127.0.0.1');
`;

async function serveRepo() {
  const repo = makeTempRepo({ files: { 'server.cjs': SERVER, 'docs/delivery/widgets/.keep': '' } });
  const profile = makeProfile();
  profile.commands = { ...profile.commands, devServer: 'node server.cjs {port}', serverEnv: { GREETING: 'hello from serverEnv' } };
  const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile, fetch: globalThis.fetch, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50))) });
  const paths = featurePaths(repo.dir, 'widgets');
  const cleanup = () => {
    const rec = readServer(paths);
    if (rec?.pid && pidAlive(rec.pid)) { try { process.kill(-rec.pid, 'SIGKILL'); } catch { /* gone */ } }
    repo.cleanup();
  };
  return { repo, ctx, stdout, paths, profile, cleanup };
}

test('leadingAssignments reads the VAR=value words a command starts with, after an optional cd', () => {
  assert.deepEqual(leadingAssignments('VERCEL_ENV=development pnpm --filter dashboard exec next dev --port {port}'), { VERCEL_ENV: 'development' });
  assert.deepEqual(leadingAssignments('cd app && A=1 B="two words" pnpm dev'), { A: '1', B: 'two words' });
  assert.deepEqual(leadingAssignments('pnpm dev -- --port {port}'), {});
  assert.deepEqual(leadingAssignments(''), {});
});

test('spawnDevServer starts the dev server detached, stdin closed, output to the log, with serverEnv', () => {
  const calls = [];
  const fake = { pid: 4242, unref() { calls.push('unref'); }, on() {} };
  const dir = makeTempRepo({ files: {} });
  try {
    const log = join(dir.dir, '.delivery/widgets/server.log');
    const r = spawnDevServer({ profile: { commands: { devServer: 'VERCEL_ENV=development next dev -p {port}', serverEnv: { VERCEL_ENV: 'development' } } }, port: 4100, cwd: dir.dir, logFile: log, spawnFn: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return fake; } });
    assert.equal(r.command, 'VERCEL_ENV=development next dev -p 4100');
    const [{ args, opts }] = calls;
    assert.deepEqual(args, ['-c', 'VERCEL_ENV=development next dev -p 4100']);
    assert.equal(opts.detached, true, 'its own process group and session: the tool call can end without it');
    assert.equal(opts.stdio[0], 'ignore');
    assert.equal(typeof opts.stdio[1], 'number', 'output goes to the log file, not a pipe the tool call holds');
    assert.equal(opts.env.VERCEL_ENV, 'development');
    assert.equal(opts.env.PORT, '4100');
    assert.ok(calls.includes('unref'));
    assert.ok(existsSync(log));
  } finally { dir.cleanup(); }
});

test('serve --ensure starts the dev server once, records it, and reuses it while it serves', async () => {
  const { ctx, stdout, paths, cleanup } = await serveRepo();
  try {
    assert.equal(await serveCommand.run(ctx, ['--ensure']), 0, stdout.text());
    const rec = readServer(paths);
    assert.ok(Number.isInteger(rec.pid) && pidAlive(rec.pid));
    assert.equal(rec.url, `http://127.0.0.1:${rec.port}`);
    assert.match(rec.startedAt, /^\d{4}-\d\d-\d\dT/);
    assert.equal(await (await fetch(rec.url)).text(), 'hello from serverEnv', 'commands.serverEnv reaches the dev server');
    assert.match(stdout.text(), /started the dev server on http:\/\/127\.0\.0\.1:\d+/);
    assert.equal(await serveCommand.run(ctx, ['--ensure']), 0);
    assert.equal(readServer(paths).pid, rec.pid, 'a serving server is reused, not restarted');
    assert.equal(await serveCommand.run(ctx, ['--status']), 0);
    assert.match(stdout.text(), /serving on http:\/\/127\.0\.0\.1:\d+ \(pid \d+/);
  } finally { cleanup(); }
});

test('serve --ensure restarts a dead server on the same port, and one that answers 500', async () => {
  const { repo, ctx, paths, profile, cleanup } = await serveRepo();
  try {
    const first = await ensureServer(ctx, { paths, profile, timeoutMs: 15000 });
    assert.equal(first.started, true, first.failure);
    process.kill(-first.pid, 'SIGKILL');
    for (let i = 0; i < 50 && pidAlive(first.pid); i++) await new Promise((r) => setTimeout(r, 20));
    const second = await ensureServer(ctx, { paths, profile, timeoutMs: 15000 });
    assert.equal(second.started, true, second.failure);
    assert.notEqual(second.pid, first.pid);
    assert.equal(second.port, first.port, 'the port is chosen once, then reused');
    assert.match(second.why, /process \d+ is gone|nothing answers/);

    writeFileSync(join(repo.dir, 'broken'), String(second.pid));
    const third = await ensureServer(ctx, { paths, profile, timeoutMs: 15000 });
    assert.equal(third.started, true, third.failure ?? 'a 500 is not serving');
    assert.match(third.why, /answers 500/);
    assert.equal(pidAlive(second.pid), false, 'the broken server was stopped first');
  } finally { cleanup(); }
});

test('serve --stop stops the whole group and keeps the port; --status then says it is not running', async () => {
  const { ctx, stdout, paths, cleanup } = await serveRepo();
  try {
    assert.equal(await serveCommand.run(ctx, ['--ensure']), 0);
    const rec = readServer(paths);
    assert.equal(await serveCommand.run(ctx, ['--stop']), 0);
    assert.equal(pidAlive(rec.pid), false);
    const after = JSON.parse(readFileSync(join(paths.runDir, 'server.json'), 'utf8'));
    assert.equal(after.pid, null);
    assert.equal(after.port, rec.port);
    assert.equal(await serveCommand.run(ctx, ['--status']), 1);
    assert.match(stdout.text(), /not running \(stopped; it starts again on port \d+\)/);
  } finally { cleanup(); }
});

test('serve takes exactly one of --ensure, --stop and --status', async () => {
  const { ctx, cleanup } = await serveRepo();
  try {
    await assert.rejects(serveCommand.run(ctx, []), /exactly one of/);
    await assert.rejects(serveCommand.run(ctx, ['--ensure', '--stop']), /exactly one of/);
  } finally { cleanup(); }
});

// ---- shoot with no --base-url ----

function fakePlaywrightPackage(dir) {
  const pkg = join(dir, 'node_modules', '@playwright', 'test');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@playwright/test', version: '9.9.9', main: 'index.js' }));
  writeFileSync(join(pkg, 'index.js'), 'exports.chromium = { launch: (...a) => globalThis.__deliveryFakeChromium.launch(...a) };');
}

function fakeChromium() {
  const page = {
    _url: 'about:blank',
    async goto(u) { page._url = u; return { status: () => 200, text: async () => '' }; },
    url: () => page._url,
    async unrouteAll() {}, async route() {}, async setViewportSize() {}, async waitForTimeout() {}, async waitForLoadState() {},
    locator() { return { count: async () => 0, first: () => ({ async isVisible() { return false; } }) }; },
    async evaluate(fn) { return fn.name === 'pageExtract' ? { dom: { elements: [] } } : 0; },
    async screenshot(o) { writeFileSync(o.path, 'png'); },
  };
  return {
    async launch() {
      return {
        async newContext() { return { async newPage() { return page; }, async storageState() {}, async close() {} }; },
        async newPage() { return { async setContent() {}, async evaluate() { return { w: 1, h: 1 }; }, async setViewportSize() {}, async screenshot(o) { writeFileSync(o.path, 'png'); }, async close() {} }; },
        async close() {},
      };
    },
  };
}

test('shoot --round work <ID> with no --base-url pictures the run\'s served dev server (the fixer brief\'s command)', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const map = {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+st-design-admin@example.invalid' }] }],
    states: [{ id: 'WL-01', screen: 'Widgets', name: 'list', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } }],
  };
  const served = 'http://127.0.0.1:4999';
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': map, '.delivery/widgets/design/WL-01.png': 'png',
    // A dev server delivery serve started earlier, still alive (this process stands in for it).
    '.delivery/widgets/server.json': { schemaVersion: 1, pid: process.pid, port: 4999, url: served, startedAt: '2026-01-15T12:00:00.000Z' },
  } });
  fakePlaywrightPackage(repo.dir);
  const asked = [];
  const { ctx, stdout } = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ fixtureUserPattern: '^delivery\\+' }),
    env: { DELIVERY_SLOTS_FILE: join(repo.dir, 'slots.json') },
    fetch: async (u) => { asked.push(String(u)); return { status: 200, text: async () => '' }; },
  });
  ctx.dataBackend = { signInHash: async () => 'hash' };
  globalThis.__deliveryFakeChromium = fakeChromium();
  try {
    assert.equal(await shootCommand.run(ctx, ['--round', 'work', '--no-reset', 'WL-01']), 0, stdout.text());
    const doc = JSON.parse(readFileSync(join(repo.dir, '.delivery/widgets/rounds/work/shoot.json'), 'utf8'));
    assert.equal(doc.baseUrl, served);
    assert.match(stdout.text(), /the run's dev server serves on http:\/\/127\.0\.0\.1:4999 \(delivery serve\)/);
    assert.ok(asked.some((u) => u.startsWith(served)), 'the served address was asked before the shoot');
  } finally { delete globalThis.__deliveryFakeChromium; repo.cleanup(); }
});

// ---- NEXT ----

test('NEXT starts the dev server with delivery serve --ensure, shoots it with no URL, and stops it before shipping', async () => {
  const { pictureNext } = await import('../../lib/picture/next.mjs');
  const base = { designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [], shootArgs: '' };
  const build = pictureNext(base, { cli: 'delivery' });
  assert.equal(build.step, 'build');
  assert.match(build.text, /^delivery serve --ensure \(the dev server, on its own; never run_in_background\), then dispatch/);
  assert.match(build.text, /when it reports, run delivery shoot \(round 1\)/);
  assert.doesNotMatch(build.text, /start the dev server|--base-url/);
  const update = pictureNext({ ...base, update: 'widgets' }, { cli: 'delivery' });
  assert.match(update.text, /delivery serve --ensure .*then delivery shoot \(round 1\)/);
  const ship = pictureNext({ ...base, rounds: [{ round: 2, shot: true, reviews: 2, compiled: true, counts: { must: 0, notReached: 0 } }], open: { must: 0, notReached: 0, data: 0 }, decision: { decision: 'ship', why: 'nothing to fix' } }, { cli: 'delivery' });
  assert.equal(ship.step, 'ship');
  assert.match(ship.text, /^ship: delivery serve --stop, the full CI chain/);
});

test('the builder and fixer briefs run delivery serve --ensure and picture their own items into rounds/work', () => {
  const read = (rel) => readFileSync(join(import.meta.dirname, '..', '..', rel), 'utf8');
  for (const f of ['agents/picture-fixer.md', 'agents/picture-builder.md', 'agents/picture-builder-medium.md', 'briefs/builder-picture.md']) {
    const text = read(f);
    assert.match(text, /delivery\.mjs serve --ensure/, f);
    assert.match(text, /shoot --round work <ID>/, f);
    assert.doesNotMatch(text, /shoot --base-url <url> --round work/, f);
  }
  assert.match(read('briefs/builder-picture.md'), /after each fix/i);
  const skill = read('skills/picture-build/SKILL.md');
  assert.match(skill, /delivery serve --ensure/);
  assert.match(skill, /delivery serve --stop/);
  assert.match(skill, /every shoot runs with `run_in_background`/i);
});
