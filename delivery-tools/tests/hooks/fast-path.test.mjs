// The hooks as shipped (spec 11.4, 15.2): hooks.json exactly as specified, POSIX scripts, and with
// no run each hook is silent, exits 0 and stays under 50 ms, never starting Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeRunRepo, startRun } from '../run/support.mjs';
import { HOOKS, bashPayload, browserPayload, hook, startPayload, timed } from './support.mjs';

const BUDGET_MS = 50;

test('hooks.json is spec 15.2 exactly', () => {
  const cmd = (name) => [{ type: 'command', command: `"\${CLAUDE_PLUGIN_ROOT}/hooks/${name}.sh"` }];
  assert.deepEqual(JSON.parse(readFileSync(join(HOOKS, 'hooks.json'), 'utf8')), {
    hooks: {
      SessionStart: [{ matcher: 'startup|resume|compact|clear', hooks: cmd('session-start') }],
      PreToolUse: [
        { matcher: 'Bash', hooks: cmd('pre-bash') },
        { matcher: 'mcp__Claude_Browser__.*|mcp__claude-in-chrome__.*|mcp__computer-use__.*', hooks: cmd('pre-browser') },
      ],
    },
  });
});

test('the three scripts are executable POSIX sh that source common.sh', () => {
  for (const name of ['session-start', 'pre-bash', 'pre-browser']) {
    const path = join(HOOKS, `${name}.sh`);
    assert.ok(statSync(path).mode & 0o111, `${name}.sh is not executable`);
    assert.match(readFileSync(path, 'utf8'), /^#!\/bin\/sh\n/);
    const r = spawnSync('/bin/sh', ['-n', path], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
  assert.equal(spawnSync('/bin/sh', ['-n', join(HOOKS, 'common.sh')]).status, 0);
});

test('no run: every hook is silent, exits 0 and takes under 50 ms (median of 7)', () => {
  const { repo, dir } = makeRunRepo({ worktree: true });
  try {
    const cases = [
      ['session-start', startPayload(dir)],
      ['pre-bash', bashPayload(dir, 'ls -la')],
      ['pre-bash', bashPayload(dir, 'gh pr ready 12')],
      ['pre-bash', bashPayload(dir, 'node scripts/fixtures/seed-widgets.mjs')],
      ['pre-browser', browserPayload(dir)],
      ['pre-browser', browserPayload(dir, 'agent-7f3a')],
    ];
    for (const [name, payload] of cases) {
      const { median, last } = timed(7, () => hook(name, payload, { cwd: dir }));
      assert.equal(last.code, 0, `${name}: ${last.stderr}`);
      assert.equal(last.stdout + last.stderr, '', `${name} is not silent`);
      assert.ok(median < BUDGET_MS, `${name} (${payload.tool_input?.command ?? payload.agent_id ?? ''}) took ${median.toFixed(1)} ms`);
    }
  } finally { repo.cleanup(); }
});

test('a closed run counts as no run for the fast path too', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    await startRun(dir, { phase: 'closed' });
    const r = hook('pre-browser', browserPayload(dir, 'agent-1'), { cwd: dir });
    assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', '']);
  } finally { repo.cleanup(); }
});

test('the fast path never exits non-zero: empty, garbage and odd payloads, a cwd outside git', () => {
  const t = makeTempDir();
  try {
    for (const name of ['session-start', 'pre-bash', 'pre-browser']) {
      for (const payload of ['', 'not json', '{"cwd": 5}', JSON.stringify(bashPayload(t.dir, 'gh pr ready 3')), JSON.stringify(browserPayload('/nonexistent/dir', 'agent-2'))]) {
        const r = hook(name, payload, { cwd: t.dir });
        assert.equal(r.code, 0, `${name} with ${payload.slice(0, 40)}: ${r.stderr}`);
        assert.equal(r.stdout, '');
      }
    }
  } finally { t.cleanup(); }
});

test('the worktree scan finds a run in a linked worktree from the main checkout and from a subdirectory', async () => {
  const { repo, dir } = makeRunRepo({ worktree: true });
  try {
    await startRun(dir, { phase: 'build' });
    mkdirSync(join(repo.dir, 'apps', 'web'), { recursive: true });
    const script = `. "${join(HOOKS, 'common.sh')}"; delivery_active_run "$1"`;
    for (const from of [repo.dir, join(repo.dir, 'apps', 'web'), dir]) {
      const r = spawnSync('/bin/sh', ['-c', script, 'sh', from], { encoding: 'utf8' });
      assert.equal(r.stdout.trim(), join(dir, '.delivery', 'widgets', 'state.json'), `from ${from}`);
    }
    const listed = spawnSync('/bin/sh', ['-c', `. "${join(HOOKS, 'common.sh')}"; delivery_worktrees "$1"`, 'sh', dir], { encoding: 'utf8' }).stdout.trim().split('\n').sort();
    const git = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9)).sort();
    assert.deepEqual([...new Set(listed)], git);
  } finally { repo.cleanup(); }
});

test('a profile with another runRoot moves where the scan looks', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const profile = JSON.parse(readFileSync(join(dir, '.claude', 'delivery-profile.json'), 'utf8'));
    profile.paths.runRoot = '.runs';
    writeFileSync(join(dir, '.claude', 'delivery-profile.json'), JSON.stringify(profile, null, 2) + '\n');
    mkdirSync(join(dir, '.runs', 'widgets'), { recursive: true });
    writeFileSync(join(dir, '.runs', 'widgets', 'state.json'), '{ "phase": "build" }\n');
    const r = spawnSync('/bin/sh', ['-c', `. "${join(HOOKS, 'common.sh')}"; delivery_active_run "$1"`, 'sh', dir], { encoding: 'utf8' });
    assert.equal(r.stdout.trim(), join(dir, '.runs', 'widgets', 'state.json'));
  } finally { repo.cleanup(); }
});
