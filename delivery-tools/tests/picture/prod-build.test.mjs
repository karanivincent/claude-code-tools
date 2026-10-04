// 2026-10-04: shoot --prod built outside commands.heavy, left a partial build folder (no
// prerender-manifest.json), and its log kept only the route list. The build now runs through
// commands.heavy after its folder is removed, and the error lines survive the tail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { clearDistDir, inferDistDir, outputKeeper, shootProdServer } from '../../lib/picture/prod-server.mjs';

const NEXT_SHOOT = 'cd apps/dashboard && NEXT_DIST_DIR=.next-shoot pnpm exec next build && NEXT_DIST_DIR=.next-shoot pnpm exec next start -p {port}';
const wrap = (cmd) => `heavy -- '${cmd}'`;

function child({ exitCode = null, lines = [] } = {}) {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.pid = 2_000_000_001;
  c.kill = () => { c.emit('exit', null, 'SIGTERM'); return true; };
  if (exitCode !== null) setImmediate(() => { for (const l of lines) c.stdout.emit('data', `${l}\n`); c.emit('exit', exitCode, null); });
  return c;
}

test('outputKeeper keeps error lines that scrolled out of the tail, ahead of the tail', () => {
  const k = outputKeeper();
  k.keep('Creating an optimized production build\nType error: Property x does not exist\n');
  for (let i = 1; i <= 40; i++) k.keep(`route /page-${i}\n`);
  const lines = k.text().split('\n');
  assert.equal(lines[0], 'Type error: Property x does not exist');
  assert.equal(lines[1], '...');
  assert.equal(lines.at(-1), 'route /page-40');
  assert.equal(lines.length, 32);
  const quiet = outputKeeper();
  quiet.keep('a\nb\n');
  assert.equal(quiet.text(), 'a\nb', 'nothing scrolled out: the tail alone');
});

test('inferDistDir reads cd and NEXT_DIST_DIR; clearDistDir removes it and refuses a folder outside the repo', async () => {
  assert.equal(inferDistDir(NEXT_SHOOT), 'apps/dashboard/.next-shoot');
  assert.equal(inferDistDir('NEXT_DIST_DIR=.next-x next build'), '.next-x');
  assert.equal(inferDistDir('next build && next start'), null);
  const removed = [];
  const rmFn = async (p, o) => { removed.push([p, o]); };
  assert.equal(await clearDistDir('/repo', 'apps/dashboard/.next-shoot', rmFn), 'apps/dashboard/.next-shoot');
  assert.deepEqual(removed, [['/repo/apps/dashboard/.next-shoot', { recursive: true, force: true }]]);
  assert.equal(await clearDistDir('/repo', null, rmFn), null);
  await assert.rejects(clearDistDir('/repo', '../elsewhere', rmFn), /not inside the repo/);
  await assert.rejects(clearDistDir('/repo', '.', rmFn), /not inside the repo/);
  assert.equal(removed.length, 1);
});

test('shootProdServer without prodServerBuild: clears the folder, then runs the whole prodServer through commands.heavy', async () => {
  const spawned = [];
  const removed = [];
  const r = await shootProdServer({
    profile: { commands: { prodServer: NEXT_SHOOT } }, repoRoot: '/repo', port: 4400, timeoutMs: 60000, wrap,
    rmFn: async (p) => { removed.push(p); },
    spawnFn: (cmd, args) => { spawned.push(args[1]); return child(); },
    fetchFn: async () => ({ status: 200 }), sleep: async () => {}, now: () => 0,
  });
  assert.equal(r.baseUrl, 'http://127.0.0.1:4400');
  assert.deepEqual(removed, ['/repo/apps/dashboard/.next-shoot']);
  assert.deepEqual(spawned, [wrap(NEXT_SHOOT.replace('{port}', '4400'))]);
});

test('shootProdServer with prodServerBuild: the build runs to its end through commands.heavy, then the server alone', async () => {
  const spawned = [];
  const profile = { commands: { prodServerBuild: 'cd app && NEXT_DIST_DIR=.s next build', prodServer: 'cd app && NEXT_DIST_DIR=.s next start -p {port}' }, picture: { prodDistDir: 'app/.explicit' } };
  const removed = [];
  const r = await shootProdServer({
    profile, repoRoot: '/repo', port: 4500, timeoutMs: 60000, wrap,
    rmFn: async (p) => { removed.push(p); },
    spawnFn: (cmd, args) => { spawned.push(args[1]); return spawned.length === 1 ? child({ exitCode: 0 }) : child(); },
    fetchFn: async () => ({ status: 200 }), sleep: async () => {}, now: () => 0,
  });
  assert.equal(r.baseUrl, 'http://127.0.0.1:4500');
  assert.deepEqual(removed, ['/repo/app/.explicit'], 'picture.prodDistDir wins over the inferred folder');
  assert.deepEqual(spawned, [wrap('cd app && NEXT_DIST_DIR=.s next build'), 'cd app && NEXT_DIST_DIR=.s next start -p 4500']);
});

test('shootProdServer: a failed build stops before any server starts, with its error lines', async () => {
  const spawned = [];
  const r = await shootProdServer({
    profile: { commands: { prodServerBuild: 'next build', prodServer: 'next start -p {port}' } }, repoRoot: '/repo', port: 4600, timeoutMs: 60000, wrap,
    spawnFn: (cmd, args) => { spawned.push(args[1]); return child({ exitCode: 1, lines: ['Error: ENOENT prerender-manifest.json', ...Array.from({ length: 35 }, (_, i) => `route ${i}`)] }); },
  });
  assert.match(r.failure, /the production build failed \(1\)/);
  assert.match(r.output, /^Error: ENOENT prerender-manifest\.json/);
  assert.equal(spawned.length, 1);
});
