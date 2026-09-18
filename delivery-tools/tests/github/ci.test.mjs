// ci (spec 4.5, 4.6, 20.2 row "ci"): mergeable is checked and said first; a conflicting PR never
// reaches the waiter; the waiter's exit codes map to green, red and pending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { createStubRunner, ok, fail } from '../helpers/runner-stub.mjs';
import { createGh } from '../../lib/core/gh.mjs';
import { replayTest } from '../helpers/replay.mjs';
import { ciStatus, waiterState } from '../../lib/github/ci.mjs';
import ciCommand from '../../lib/commands/ci.mjs';

async function setup({ mergeable = 'MERGEABLE', rules = [], json = false } = {}) {
  const dir = makeTempDir();
  const gh = createGhStub({ startAt: 12 });
  await gh.prCreate({ title: 'Widgets', body: '', base: 'main', head: 'epic/101-widgets' });
  gh.setMergeable(12, mergeable);
  gh.setHead(12, 'c'.repeat(40));
  const { ctx, stdout, runner } = await makeTestCtx({ repoRoot: dir.dir, profile: makeProfile(), gh, rules, json });
  ctx.deps = { sleep: async () => {} };
  return { dir, gh, ctx, stdout, runner };
}

test('a conflicting PR is named on the first line and the waiter never runs', async () => {
  const { dir, ctx, stdout, runner } = await setup({ mergeable: 'CONFLICTING' });
  try {
    const code = await ciCommand.run(ctx, ['--pr', '12']);
    assert.equal(code, 1);
    assert.match(stdout.lines()[0], /mergeable: CONFLICTING/);
    assert.match(stdout.lines()[0], /no Actions runs/);
    assert.ok(!runner.texts().some((t) => t.includes('wait-for-checks')), 'no CI waiting on a conflicting PR');
  } finally { dir.cleanup(); }
});

test('mergeable first, then the waiter: exit 0 green, 1 red, 2 pending', async () => {
  for (const [code, state, exit] of [[0, 'green', 0], [1, 'red', 1], [2, 'pending', 4], [124, 'pending', 4], [3, 'pending', 4]]) {
    const { dir, ctx, stdout, runner } = await setup({ rules: [{ match: 'node scripts/wait-for-checks.mjs 12', result: code ? fail(code, 'cccccc  some check') : ok('ccccccc  CI pass') }] });
    try {
      assert.equal(await ciCommand.run(ctx, ['--pr', '12']), exit, `waiter exit ${code}`);
      assert.equal(stdout.lines()[0], `mergeable: MERGEABLE (PR #12, head ccccccc)`);
      assert.equal(runner.calls.at(-1).timeoutMs > 60_000, true);
      assert.equal(waiterState(code), state);
    } finally { dir.cleanup(); }
  }
});

test('--look is one short look; UNKNOWN is asked again before anything else', async () => {
  const { dir, gh, ctx, runner } = await setup({ mergeable: 'UNKNOWN', rules: [{ match: 'node scripts/wait-for-checks.mjs 12', result: ok('pass') }] });
  try {
    ctx.deps = { sleep: async () => gh.setMergeable(12, 'MERGEABLE') };
    const res = await ciStatus(ctx, { pr: 12, wait: false });
    assert.equal(res.state, 'green');
    assert.equal(runner.calls.at(-1).timeoutMs, 90_000);
    gh.setMergeable(12, 'UNKNOWN');
    ctx.deps = { sleep: async () => {} };
    const still = await ciStatus(ctx, { pr: 12 });
    assert.equal(still.state, 'pending');
    assert.match(still.detail, /mergeable: UNKNOWN/);
  } finally { dir.cleanup(); }
});

test('the head SHA is read again after waiting, and a missing PR is a usage error', async () => {
  const { dir, gh, ctx } = await setup({ rules: [{ match: 'node scripts/wait-for-checks.mjs 12', result: () => { gh.setHead(12, 'd'.repeat(40)); return ok('pass'); } }] });
  try {
    const res = await ciStatus(ctx, { pr: 12, wait: true });
    assert.equal(res.headSha, 'd'.repeat(40));
    assert.match(res.detail, /the head moved to ddddddd/);
    await assert.rejects(ciStatus(ctx, { pr: 99 }), (e) => e.exit === 2);
  } finally { dir.cleanup(); }
});

replayTest('ci says mergeable: CONFLICTING first on the recorded conflicting PR, through the real gh wrapper', { needs: ['expected/ci.json'] }, async (t, set) => {
  const expected = JSON.parse(readFileSync(join(set, 'expected/ci.json'), 'utf8'));
  for (const [sample, conflicting] of [[expected.fixture, true], [expected.contrast, false]]) {
    const n = expected.fixture.pr.number;
    const runner = createStubRunner([
      { match: `gh pr view ${n} --repo example-org/example-repo --json`, result: ok(sample.stdout) },
      { match: `node scripts/wait-for-checks.mjs ${n}`, result: ok('pass') },
    ]);
    const gh = createGh(runner, { repo: 'example-org/example-repo' });
    const dir = makeTempDir();
    try {
      const { ctx, stdout } = await makeTestCtx({ repoRoot: dir.dir, profile: makeProfile(), gh, runner });
      ctx.deps = { sleep: async () => {} };
      const code = await ciCommand.run(ctx, ['--pr', String(n)]);
      const first = stdout.lines()[0];
      if (conflicting) {
        assert.equal(sample.parsed.mergeable, 'CONFLICTING');
        assert.match(first, /mergeable: CONFLICTING/);
        assert.equal(code, 1);
        assert.ok(!runner.texts().some((x) => x.startsWith('node scripts/wait-for-checks')), 'no waiting on a PR that gets no runs');
      } else {
        assert.match(first, /^mergeable: MERGEABLE/);
        assert.ok(runner.texts().some((x) => x.startsWith('node scripts/wait-for-checks')));
      }
    } finally { dir.cleanup(); }
  }
});
