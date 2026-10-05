// A2: the shoot's production environment. A stray NODE_ENV that .env loading put into
// process.env broke three production builds, and a production server without the dev server's
// VERCEL_ENV=development put a shoot on a public rate limit. The build and the server now always
// run with NODE_ENV=production, commands.serverEnv reaches both servers, init drafts it, and
// shoot --prod names what the production server lacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prodEnvWarning, shootProdServer } from '../../lib/picture/prod-server.mjs';
import { leadingAssignments } from '../../lib/picture/serve.mjs';
import { draftProfile, draftIssues } from '../../lib/lifecycle/init.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';

function child({ exitCode = null } = {}) {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.pid = 2_000_000_002;
  c.kill = () => { c.emit('exit', null, 'SIGTERM'); return true; };
  if (exitCode !== null) setImmediate(() => c.emit('exit', exitCode, null));
  return c;
}

test('the production build and server run with NODE_ENV=production over process.env, and with commands.serverEnv', async () => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const envs = [];
    const profile = { commands: { prodServerBuild: 'next build', prodServer: 'next start -p {port}', serverEnv: { VERCEL_ENV: 'development', NODE_ENV: 'test' } } };
    const r = await shootProdServer({
      profile, repoRoot: '/repo', port: 4600, timeoutMs: 60000, wrap: (c) => c,
      rmFn: async () => {},
      spawnFn: (cmd, args, opts) => { envs.push(opts.env); return envs.length === 1 ? child({ exitCode: 0 }) : child(); },
      fetchFn: async () => ({ status: 200 }), sleep: async () => {}, now: () => 0,
    });
    assert.equal(r.baseUrl, 'http://127.0.0.1:4600');
    assert.equal(envs.length, 2, 'the build, then the server');
    for (const env of envs) {
      assert.equal(env.NODE_ENV, 'production', 'NODE_ENV=production wins over process.env and serverEnv');
      assert.equal(env.VERCEL_ENV, 'development', 'commands.serverEnv reaches the build and the server');
    }
    assert.equal(envs[1].PORT, '4600');
  } finally {
    if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before;
  }
});

test('prodEnvWarning names the dev server\'s variables the production server lacks, once, and only without serverEnv', () => {
  const dev = 'VERCEL_ENV=development pnpm --filter dashboard exec next dev --port {port}';
  const w = prodEnvWarning({ commands: { devServer: dev, prodServer: 'cd app && NEXT_DIST_DIR=.s next build && next start -p {port}' } }, leadingAssignments);
  assert.match(w, /sets VERCEL_ENV=development, and the production server does not: add it to the profile's commands\.serverEnv/);
  assert.equal(prodEnvWarning({ commands: { devServer: dev, prodServer: 'x', serverEnv: { VERCEL_ENV: 'development' } } }, leadingAssignments), null);
  assert.equal(prodEnvWarning({ commands: { devServer: dev, prodServer: 'VERCEL_ENV=development next start -p {port}' } }, leadingAssignments), null);
  assert.equal(prodEnvWarning({ commands: { devServer: 'pnpm dev', prodServer: 'x' } }, leadingAssignments), null);
});

test('the profile schema takes commands.serverEnv as an object of strings, and commands.security as a string', () => {
  const p = makeProfile();
  p.commands = { ...p.commands, serverEnv: { VERCEL_ENV: 'development' }, security: 'pnpm security' };
  assert.deepEqual(validateAgainst('profile', p).errors, []);
  p.commands.serverEnv = { VERCEL_ENV: 1 };
  assert.ok(validateAgainst('profile', p).errors.length > 0);
  p.commands.serverEnv = {};
  p.commands.security = 5;
  assert.ok(validateAgainst('profile', p).errors.length > 0);
});

test('init drafts commands.serverEnv from the dev script\'s leading assignments, and leaves it out when there are none', () => {
  const facts = {
    packageJson: { scripts: { dev: 'VERCEL_ENV=development next dev', build: 'next build' } },
    claudeMd: '', lockfiles: ['pnpm-lock.yaml'], files: [], remoteUrl: 'git@github.com:example-org/example-repo.git', defaultBranch: 'main',
  };
  const p = draftProfile(facts);
  assert.deepEqual(p.commands.serverEnv, { VERCEL_ENV: 'development' });
  assert.deepEqual(draftIssues(p), []);
  const plain = draftProfile({ ...facts, packageJson: { scripts: { dev: 'next dev' } } });
  assert.equal('serverEnv' in plain.commands, false);
});

test('shoot --prod warns once when the dev server sets a variable the production server lacks', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const map = {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+st-design-admin@example.invalid' }] }],
    states: [{ id: 'WL-01', screen: 'Widgets', name: 'list', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } }],
  };
  const repo = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': map, '.delivery/widgets/design/WL-01.png': 'png' } });
  const pkg = join(repo.dir, 'node_modules', '@playwright', 'test');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@playwright/test', version: '9.9.9', main: 'index.js' }));
  writeFileSync(join(pkg, 'index.js'), 'exports.chromium = { launch: async () => { throw new Error("no browser in this test"); } };');
  const profile = makeProfile();
  profile.commands = { ...profile.commands, heavy: "sh -c '{cmd}'", devServer: 'VERCEL_ENV=development next dev --port {port}', prodServer: 'exit 1' };
  const { ctx, stdout, stderr } = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile, safety: makeSafety({ fixtureUserPattern: '^delivery\\+' }),
    env: { DELIVERY_SLOTS_FILE: join(repo.dir, 'slots.json') },
    fetch: async () => ({ status: 200, text: async () => '' }),
  });
  ctx.dataBackend = { signInHash: async () => 'hash' };
  try {
    assert.equal(await shootCommand.run(ctx, ['--prod', '--no-reset']), 1);
    const text = stdout.text() + stderr.text();
    assert.equal(text.match(/sets VERCEL_ENV=development, and the production server does not/g)?.length, 1, text);
  } finally { repo.cleanup(); }
});
