// bin/delivery.mjs: help, dispatch, usage errors, --json, stubs, manifest refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main } from '../../bin/delivery.mjs';
import { COMMAND_ORDER } from '../../lib/core/command.mjs';
import { defaultRunner } from '../../lib/core/run.mjs';
import { sink } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { createStubRunner } from '../helpers/runner-stub.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(ROOT, 'bin', 'delivery.mjs');
const cli = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: opts.cwd ?? ROOT, env: { ...process.env, ...(opts.env ?? {}) } });

test('--help lists every command of spec 16 with a summary, exit 0', () => {
  const r = cli(['--help']);
  assert.equal(r.status, 0, r.stderr);
  for (const name of COMMAND_ORDER) assert.match(r.stdout, new RegExp(`^  ${name.replace(/ /g, ' ')}\\s{2,}\\S`, 'm'), name);
});

test('<command> --help prints that command\'s usage, exit 0, wherever --help sits', () => {
  const r = cli(['status', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^usage: delivery status/);
  assert.match(r.stdout, /--feature <slug>/);
  const s = cli(['plan', '--help', 'check']);
  assert.equal(s.status, 0);
  assert.match(s.stdout, /^usage: delivery plan check/);
});

test('unknown commands, missing subcommands and no command are usage errors (exit 2)', () => {
  const a = cli(['bogus']);
  assert.equal(a.status, 2);
  assert.equal(a.stdout.trim(), 'FAIL usage unknown command "bogus"; run "delivery --help"');
  const b = cli(['wave']);
  assert.equal(b.status, 2);
  assert.match(b.stdout, /"delivery wave" needs a subcommand: end, merge, start/);
  const c = cli(['wave', 'sideways']);
  assert.equal(c.status, 2);
  assert.match(c.stdout, /unknown subcommand "wave sideways"/);
  assert.equal(cli([]).status, 2);
  const j = cli(['bogus', '--json']);
  assert.deepEqual(JSON.parse(j.stdout), { ok: false, exit: 2, failures: [{ code: 'usage', message: 'unknown command "bogus"; run "delivery --help"' }], lines: [], data: {} });
});

function tempCommands(files) {
  const t = makeTempDir();
  const core = pathToFileURL(join(ROOT, 'lib', 'core', 'command.mjs')).href;
  for (const [file, body] of Object.entries(files)) writeFileSync(join(t.dir, file), body.replaceAll('CORE', core));
  return t;
}

test('a stub command exits 2 with "not implemented (slice X)", in text and --json', async () => {
  const t = tempCommands({
    'demo.mjs': `import { defineCommand, notImplementedRun } from 'CORE';
export default defineCommand({ name: 'demo', summary: 'a demo', usage: 'usage: delivery demo', run: notImplementedRun('B2') });`,
  });
  try {
    const out = sink();
    const code = await main(['demo'], { stdout: out, stderr: sink(), commandsDir: t.dir, runner: createStubRunner([], { passthrough: ['git'] }), cwd: t.dir });
    assert.equal(code, 2);
    assert.equal(out.text(), 'FAIL not-implemented not implemented (slice B2)\n');
    const j = sink();
    assert.equal(await main(['demo', '--json'], { stdout: j, stderr: sink(), commandsDir: t.dir, runner: createStubRunner([], { passthrough: ['git'] }), cwd: t.dir }), 2);
    assert.deepEqual(JSON.parse(j.text()).failures, [{ code: 'not-implemented', message: 'not implemented (slice B2)' }]);
  } finally { t.cleanup(); }
});

test('run() gets its own args and a ctx; thrown errors map to exit codes; crashes are exit 1', async () => {
  const t = tempCommands({
    'echo.mjs': `import { defineCommand } from 'CORE';
export default defineCommand({ name: 'echo', summary: 's', usage: 'u', async run(ctx, argv) { ctx.out.line(argv.join(',') + ' ' + (ctx.feature ?? 'none')); return argv.length ? 0 : 1; } });`,
    'wait.mjs': `import { defineCommand } from 'CORE'; import { WaitError } from '${pathToFileURL(join(ROOT, 'lib', 'core', 'exit.mjs')).href}';
export default defineCommand({ name: 'wait', summary: 's', usage: 'u', async run() { throw new WaitError('CI pending on #12'); } });`,
    'boom.mjs': `import { defineCommand } from 'CORE';
export default defineCommand({ name: 'boom', summary: 's', usage: 'u', async run() { throw new TypeError('oops'); } });`,
  });
  const io = (out) => ({ stdout: out, stderr: sink(), commandsDir: t.dir, runner: createStubRunner([], { passthrough: ['git'] }), cwd: t.dir });
  try {
    let out = sink();
    assert.equal(await main(['echo', 'a', '--feature', 'widgets', 'b'], io(out)), 0);
    assert.equal(out.text(), 'a,b widgets\n');
    out = sink();
    assert.equal(await main(['wait'], io(out)), 4);
    assert.equal(out.text(), 'FAIL wait CI pending on #12\n');
    out = sink();
    assert.equal(await main(['boom'], io(out)), 1);
    assert.equal(out.text(), 'FAIL internal oops\n');
  } finally { t.cleanup(); }
});

test('a MANIFEST.sha256 mismatch refuses every command with exit 5', async () => {
  const t = makeTempDir();
  try {
    mkdirSync(join(t.dir, 'lib'));
    writeFileSync(join(t.dir, 'lib', 'x.mjs'), 'changed');
    writeFileSync(join(t.dir, 'MANIFEST.sha256'), `${'0'.repeat(64)}  lib/x.mjs\n`);
    const out = sink();
    assert.equal(await main(['--help'], { stdout: out, stderr: sink(), pluginRoot: t.dir }), 5);
    assert.deepEqual(out.text().trim().split('\n'), ['FAIL manifest lib/x.mjs: changed', 'FAIL manifest plugin files differ from MANIFEST.sha256; reinstall the plugin']);
  } finally { t.cleanup(); }
});

test('DELIVERY_RUNNER_STUB swaps the real runner for a stub module', async () => {
  const t = makeTempDir();
  try {
    const stub = join(t.dir, 'stub.mjs');
    writeFileSync(stub, 'export default (call) => (call.cmd === "gh" ? { code: 0, stdout: "stubbed" } : undefined);');
    const warnings = [];
    const r = await defaultRunner({ env: { DELIVERY_RUNNER_STUB: stub }, warn: (m) => warnings.push(m) });
    assert.equal((await r.run('gh', ['api', 'user'])).stdout, 'stubbed');
    await assert.rejects(r.run('git', ['push']), /no answer/);
    assert.match(warnings[0], /stubbed by/);
  } finally { t.cleanup(); }
});

test('the CLI never needs Playwright or a profile to print help', () => {
  const t = makeTempDir();
  try {
    const out = execFileSync(process.execPath, [BIN, 'seed', '--help'], { cwd: t.dir, encoding: 'utf8' });
    assert.match(out, /^usage: delivery seed/);
  } finally { t.cleanup(); }
});
