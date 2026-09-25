// A workflow no branch can make pass (the repo runs the base's specs against the PR's preview, so
// a PR that replaces a page fails them by construction): declared with its issue, never silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { ok, fail } from '../helpers/runner-stub.mjs';
import { ciStatus, failedWorkflows } from '../../lib/github/ci.mjs';

const KNOWN = [{ workflow: 'E2E (preview)', issue: 1820, why: 'runs the base branch specs against the preview' }];

async function setup(rules, profile) {
  const dir = makeTempDir();
  const gh = createGhStub({ startAt: 12 });
  await gh.prCreate({ title: 'Widgets', body: '', base: 'main', head: 'epic/101-widgets' });
  gh.setMergeable(12, 'MERGEABLE');
  gh.setHead(12, 'c'.repeat(40));
  const { ctx, runner } = await makeTestCtx({ repoRoot: dir.dir, profile, gh, rules });
  ctx.deps = { sleep: async () => {} };
  return { dir, ctx, runner };
}

test('the waiter verdict names each failed workflow, parentheses in the name and all', () => {
  assert.deepEqual(failedWorkflows('ccccccc  FAIL — CI (failure, run 7), E2E (preview) (failure, run 9)'), ['CI', 'E2E (preview)']);
  assert.deepEqual(failedWorkflows('ccccccc  PASS — every required workflow registered'), []);
});

test('known red: green only when the declared workflows are the only failures and the rest finished clean', async () => {
  const waiter = { match: 'node scripts/wait-for-checks.mjs 12', result: fail(1, 'ccccccc  FAIL — E2E (preview) (failure, run 9)') };
  const runs = (extra) => ({ match: 'gh run list', result: ok([
    { workflowName: 'E2E (preview)', status: 'completed', conclusion: 'failure', databaseId: 9 },
    { workflowName: 'CI', status: 'completed', conclusion: 'failure', databaseId: 7 },
    { workflowName: 'CI', status: 'completed', conclusion: 'success', databaseId: 8 },
    ...extra,
  ]) });
  const cases = [
    [[], 'green', /except known red: E2E \(preview\) \(#1820/],
    [[{ workflowName: 'Docs', status: 'completed', conclusion: 'failure', databaseId: 10 }], 'red', /Docs failed/],
    [[{ workflowName: 'Docs', status: 'in_progress', conclusion: null, databaseId: 10 }], 'pending', /still running: Docs/],
  ];
  for (const [extra, state, said] of cases) {
    const { dir, ctx } = await setup([waiter, runs(extra)], makeProfile({ ci: { knownRed: KNOWN } }));
    try {
      const res = await ciStatus(ctx, { pr: 12, wait: false });
      assert.equal(res.state, state, JSON.stringify(extra));
      assert.match(res.detail, said);
    } finally { dir.cleanup(); }
  }
});

test('known red never covers a failure it does not name, and nothing changes without the profile block', async () => {
  const both = { match: 'node scripts/wait-for-checks.mjs 12', result: fail(1, 'ccccccc  FAIL — CI (failure, run 7), E2E (preview) (failure, run 9)') };
  const first = await setup([both], makeProfile({ ci: { knownRed: KNOWN } }));
  try {
    assert.equal((await ciStatus(first.ctx, { pr: 12 })).state, 'red');
    assert.ok(!first.runner.texts().some((t) => t.startsWith('gh run list')), 'CI failing too is plain red');
  } finally { first.dir.cleanup(); }
  const only = { match: 'node scripts/wait-for-checks.mjs 12', result: fail(1, 'ccccccc  FAIL — E2E (preview) (failure, run 9)') };
  const second = await setup([only], makeProfile());
  try {
    assert.equal((await ciStatus(second.ctx, { pr: 12 })).state, 'red', 'no ci.knownRed, no exception');
  } finally { second.dir.cleanup(); }
});
