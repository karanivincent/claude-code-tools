// Claims (spec 4.4 step 1, 12.2): one draft PR referencing every build and backend child with the
// claimed-paths block and the run label; the planner proves the claim; nothing is opened twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, fail } from '../helpers/runner-stub.mjs';
import { loadState } from '../../lib/core/state.mjs';
import { makeMarker, CLAIMS_MARKER } from '../../lib/core/markers.mjs';
import { openClaims, verifyClaims, claimsGate, queuedIssues } from '../../lib/github/claims.mjs';
import { parseClaims } from '../../lib/github/pr.mjs';
import claimsOpen from '../../lib/commands/claims-open.mjs';
import claimsVerify from '../../lib/commands/claims-verify.mjs';
import { makeRunRepo, makePlan, ctxFor, testProfile, BRANCH } from '../lifecycle/support.mjs';

function filedPlan() {
  const plan = makePlan();
  plan.units[0].issue = 102;
  plan.units[1].issue = 103;
  return plan;
}

const planner = (out, code = 0) => ({ match: 'node scripts/planner.mjs', result: code ? fail(code, out) : ok(out) });

test('claims open pushes the branch and opens one draft PR that claims every child, then writes nothing', async () => {
  const repo = await makeRunRepo({ plan: filedPlan() });
  try {
    const { ctx, gh } = await ctxFor(repo.worktree);
    const res = await openClaims(ctx);
    assert.equal(res.action, 'created');
    const pr = await gh.prGet(res.pr);
    assert.equal(pr.isDraft, true);
    assert.equal(pr.baseRefName, 'main');
    assert.equal(pr.headRefName, BRANCH);
    assert.deepEqual(pr.labels, ['delivery-run']);
    assert.match(pr.body, /^Refs #102$/m);
    assert.match(pr.body, /^Refs #103$/m);
    assert.ok(pr.body.includes(makeMarker({ feature: 'widgets', kind: 'pr' })));
    assert.ok(pr.body.includes(CLAIMS_MARKER));
    assert.deepEqual(parseClaims(pr.body, CLAIMS_MARKER), ['apps/web/src/widgets/contract.ts', 'apps/web/src/widgets/list.tsx', 'apps/web/src/widgets/shell.stub.tsx']);
    assert.ok(pr.body.indexOf('Late changes') < pr.body.indexOf('Coverage'), 'late changes come first');
    assert.match(repo.git('ls-remote', 'origin', BRANCH), new RegExp(`refs/heads/${BRANCH}`));
    assert.equal((await loadState(repo.paths.state)).pr, res.pr);
    const before = gh.db.writes.length;
    const again = await openClaims(ctx);
    assert.equal(again.pr, res.pr);
    assert.equal(again.action, 'unchanged');
    assert.equal(gh.db.writes.length, before);
  } finally { repo.cleanup(); }
});

test('claims open refuses before issues exist and outside the integration branch', async () => {
  const repo = await makeRunRepo({ plan: makePlan() });
  try {
    const { ctx } = await ctxFor(repo.worktree);
    await assert.rejects(openClaims(ctx), (e) => e.exit === 1 && /run delivery issues sync first/.test(e.message));
  } finally { repo.cleanup(); }
  const other = await makeRunRepo({ plan: filedPlan() });
  try {
    other.wtGit('checkout', '-q', '-b', 'something-else');
    const { ctx } = await ctxFor(other.worktree);
    await assert.rejects(openClaims(ctx), (e) => e.exit === 2 && /integration worktree/.test(e.message));
  } finally { other.cleanup(); }
});

test('the planner proves the claim; the gate checks refs, paths, label and queue', async () => {
  const repo = await makeRunRepo({ plan: filedPlan() });
  try {
    const { ctx, gh, stdout } = await ctxFor(repo.worktree, { rules: [planner('Direction\n  #90 ranks 1\n  queue: #150 #151\n')] });
    const opened = await openClaims(ctx);
    assert.deepEqual((await verifyClaims(ctx)).queued, []);
    assert.deepEqual((await claimsGate(ctx)).failures, []);
    assert.equal(await claimsVerify.run(ctx, []), 0);
    ctx.runner.rules.unshift(planner('queue: #103 #151\n'));
    const v = await verifyClaims(ctx);
    assert.deepEqual(v.queued, [{ unit: 'U2', issue: 103 }]);
    assert.equal(await claimsVerify.run(ctx, []), 1);
    assert.match(stdout.text(), /FAIL claims the planner still queues #103 \(U2\)/);
    const pr = await gh.prGet(opened.pr);
    await gh.prEdit(opened.pr, { body: pr.body.replace('Refs #102', 'See #102') });
    const g = await claimsGate(ctx);
    assert.ok(g.failures.some((f) => /does not reference #102/.test(f.message)));
    assert.ok(g.failures.some((f) => /still queues #103/.test(f.message)));
  } finally { repo.cleanup(); }
});

test('a failing planner is red, a hung one is a wait; claims mode none skips everything', async () => {
  const repo = await makeRunRepo({ plan: filedPlan() });
  try {
    const { ctx } = await ctxFor(repo.worktree, { rules: [planner('boom', 1)] });
    await assert.rejects(verifyClaims(ctx), (e) => e.exit === 1 && /planner/.test(e.message));
    ctx.runner.rules.unshift(planner('slow', 124));
    await assert.rejects(verifyClaims(ctx), (e) => e.exit === 4);
    const off = await ctxFor(repo.worktree, { profile: testProfile({ claims: { mode: 'none', verify: 'none', pathClaims: 'none', runLabel: '' } }) });
    assert.equal((await verifyClaims(off.ctx)).skipped, true);
    assert.equal(await claimsOpen.run(off.ctx, []), 0);
    assert.equal(off.gh.db.writes.length, 0);
    assert.equal((await claimsGate(off.ctx)).ok, true);
  } finally { repo.cleanup(); }
});

test('queuedIssues reads #N tokens only', () => {
  assert.deepEqual([...queuedIssues('#12 ranks 1\nissue 13\n#14.')], [12, 14]);
});
