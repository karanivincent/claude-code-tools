// Replay against the real repository of the private set (refs.json "repo"), which has dozens of
// worktrees and no delivery run: the hooks stay silent, exit 0 and under 50 ms, and status says
// there is no run. Read-only: the fast path reads git's worktree files; status runs
// `git rev-parse` and `git worktree list`, and nothing else is allowed to start.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayTest } from '../helpers/replay.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { createStubRunner } from '../helpers/runner-stub.mjs';
import status from '../../lib/commands/status.mjs';
import { findRuns } from '../../lib/run/context.mjs';
import { bashPayload, browserPayload, hook, startPayload, timed } from './support.mjs';

function realRepo(dir) {
  const repo = JSON.parse(readFileSync(join(dir, 'refs.json'), 'utf8')).repo;
  return existsSync(join(repo, '.git')) ? repo : null;
}

/** git read-only subcommands only; anything else is refused by the stub. */
function readOnlyGit() {
  return createStubRunner([], { passthrough: ['git'] });
}

replayTest('hooks on the real repository: silent, exit 0, under 50 ms with no run', { needs: ['refs.json'] }, async (t, dir) => {
  const repo = realRepo(dir);
  if (!repo) return t.skip('the repository refs.json names is not on this machine');
  const probe = await makeTestCtx({ repoRoot: repo, runner: readOnlyGit() });
  if ((await findRuns(probe.ctx)).length) return t.skip('the real repository has an active run; this replay needs none');
  for (const [name, payload] of [
    ['session-start', startPayload(repo)],
    ['pre-bash', bashPayload(repo, 'gh pr ready 12')],
    ['pre-bash', bashPayload(repo, 'node scripts/fixtures/seed-widgets.mjs')],
    ['pre-bash', bashPayload(repo, 'pnpm typecheck')],
    ['pre-browser', browserPayload(repo, 'agent-1')],
    ['pre-browser', browserPayload(repo)],
  ]) {
    const { median, last } = timed(7, () => hook(name, payload, { cwd: repo }));
    assert.deepEqual([last.code, last.stdout, last.stderr], [0, '', ''], name);
    assert.ok(median < 50, `${name} took ${median.toFixed(1)} ms on the real repository`);
  }
});

replayTest('status on the real repository finds no run and prints one NEXT line', { needs: ['refs.json'] }, async (t, dir) => {
  const repo = realRepo(dir);
  if (!repo) return t.skip('the repository refs.json names is not on this machine');
  const runner = readOnlyGit();
  const { ctx, stdout } = await makeTestCtx({ repoRoot: repo, runner });
  if ((await findRuns(ctx)).length) return t.skip('the real repository has an active run');
  assert.equal(await status.run(ctx, []), 0);
  assert.deepEqual(stdout.text().trim().split('\n').filter((l) => l.startsWith('NEXT:')), ['NEXT: no active delivery run in this repository; start one with /deliver-from-design <archive> "<one sentence of intent>" (skill: deliver-from-design)']);
  for (const call of runner.texts()) assert.match(call, /^git (rev-parse|worktree list)/, `status ran ${call}`);
});
