// land, step by step (spec 4.7): each after-merge step turns red on its own evidence; the founder's
// organisation; a land started from another worktree; the release tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSafety, validExample } from '../helpers/fixtures.mjs';
import { writeArtefact, readArtefact } from '../../lib/core/artefacts.mjs';
import { judgeStatuses, landEvidence, landResult, runLand } from '../../lib/lifecycle/land.mjs';
import { ctxFor, testProfile } from './support.mjs';
import { loadState, parseEvent } from '../../lib/core/state.mjs';
import { fail, ok } from '../helpers/runner-stub.mjs';
import { landedRun, MERGE, mk } from './land-support.mjs';

test('each after-merge step turns red on its own evidence', async () => {
  const { repo, ctx, gh, setRuns, deps } = await landedRun({ voice: false });
  try {
    await runLand(ctx, { epic: 101 });
    const failuresOf = async () => landResult((await landEvidence(ctx, { epic: 101 })).checks);
    assert.equal((await failuresOf()).exit, 0);

    setRuns([{ name: 'Apply migrations', status: 'completed', conclusion: 'failure' }]);
    assert.match((await failuresOf()).failures[0].message, /Apply migrations failure on eeeeeee/);
    setRuns([{ name: 'E2E (staging)', status: 'in_progress', conclusion: null }]);
    assert.equal((await failuresOf()).exit, 4, 'a running workflow is a wait');
    setRuns([]);
    assert.match((await failuresOf()).failures[0].message, /no workflow run registered/);
    setRuns([{ name: 'CI', status: 'completed', conclusion: 'success' }]);

    await gh.issueEdit(102, { state: 'open' });
    assert.match((await failuresOf()).failures[0].message, /still open after the merge: #102 \(U1\)/);
    await gh.issueClose(102);

    await gh.issueCreate({ title: 'Staging health guard: errors after eeeeeee', body: 'The guard saw 500s.' });
    assert.match((await failuresOf()).failures[0].message, /names the merge commit eeeeeee/);
    for (const i of gh.db.issues.values()) if (/health guard/.test(i.title)) i.state = 'closed';

    ctx.deps = { ...deps, validateCaptureItems: async () => [{ state: 'WL-01', status: 'not-reached', why: 'marker missing' }] };
    assert.match((await failuresOf()).failures[0].message, /1 of 1 states not reached/);
    ctx.deps = { ...deps, runChecks: async (_c, ids) => ({ findings: ids.includes('M14') ? [{ where: 'widgets row 7' }] : [], failures: [] }) };
    assert.match((await failuresOf()).failures[0].message, /1 leftover row group/);
    ctx.deps = { ...deps, checkReady: async () => ({ ok: false, failures: [{ message: 'no ready record for aaaaaaa' }] }) };
    assert.match((await failuresOf()).failures[0].message, /no ready record/);
    ctx.deps = deps;

    repo.git('commit', '-q', '--allow-empty', '-m', `Revert "Widgets"\n\nThis reverts commit ${MERGE}.`);
    repo.git('push', '-q', 'origin', 'main');
    assert.match((await failuresOf()).failures[0].message, /the merge was reverted on main/);
  } finally { repo.cleanup(); }
});

test('the founder\'s organisation must be captured too when the safety file names it', async () => {
  const { repo, gh, clock, deps, runner } = await landedRun({ voice: false });
  try {
    const withOrg = (await ctxFor(repo.worktree, { gh, clock, rules: runner.rules, deps, safety: makeSafety() })).ctx;
    const ev = await landEvidence(withOrg, { epic: 101 });
    assert.match(ev.checks.find((c) => c.id === 'real-org-audit').detail, /no real-org capture of eeeeeee/);
    const cap = { ...validExample('capture'), runId: 'c-20260116-0801-real-org', mode: 'real-org', expectedSha: MERGE };
    await writeArtefact(repo.paths, 'capture', cap, { key: cap.runId });
    assert.equal((await landEvidence(withOrg, { epic: 101 })).checks.find((c) => c.id === 'real-org-audit').ok, true);
  } finally { repo.cleanup(); }
});

test('land --epic works from another worktree: the feature comes from the epic\'s marker', async () => {
  const { repo, gh, clock, deps, runner } = await landedRun({ voice: false });
  try {
    const { ctx } = await ctxFor(repo.primary, { gh, clock, rules: runner.rules, deps, feature: null });
    const ev = await landEvidence(ctx, { epic: 101 });
    assert.equal(ev.paths.state, repo.paths.state);
    assert.equal(ev.checks.find((c) => c.id === 'merge').ok, true);
  } finally { repo.cleanup(); }
});

test('a removed capability makes the tag required, numbered after every existing tag', async () => {
  const { repo, ctx, gh } = await landedRun({ removeRow: true, voice: false });
  try {
    repo.git('tag', 'v2-older-feature');
    await runLand(ctx, { epic: 101 });
    const release = (await gh.commentList(101)).find((c) => c.body.includes(mk('release')));
    assert.match(release.body, /Tag required \(the plan removes CAP-003\): create `v3-widgets` on the production branch before merging `main` into it/);
    assert.equal((await readArtefact(repo.paths, 'plan')).rows.at(-1).class, 'remove');
  } finally { repo.cleanup(); }
});

test('W8 judgeStatuses: failure and error are red, pending waits, none or all success is green', () => {
  assert.equal(judgeStatuses([]).state, 'green');
  assert.equal(judgeStatuses(undefined).state, 'green');
  assert.equal(judgeStatuses([{ context: 'Vercel', state: 'success' }]).state, 'green');
  const red = judgeStatuses([{ context: 'Vercel', state: 'failure', description: 'Build failed' }, { context: 'ci/x', state: 'success' }]);
  assert.equal(red.state, 'red');
  assert.match(red.detail, /Vercel is failure \(Build failed\)/);
  assert.equal(judgeStatuses([{ context: 'a', state: 'error' }]).state, 'red');
  assert.equal(judgeStatuses([{ context: 'a', state: 'pending' }, { context: 'b', state: 'success' }]).state, 'pending');
  assert.equal(judgeStatuses([{ context: 'a', state: 'pending' }, { context: 'b', state: 'failure' }]).state, 'red', 'red outranks pending');
});

test('W8: a failing Vercel commit status turns the statuses check red, a pending one waits, and it clears when it passes', async () => {
  const { repo, ctx, setStatuses } = await landedRun({ voice: false });
  try {
    const check = async () => (await landEvidence(ctx, { epic: 101 })).checks.find((c) => c.id === 'statuses');
    assert.equal((await check()).ok, true);
    setStatuses([{ context: 'Vercel', state: 'failure', description: 'Deployment failed' }]);
    const bad = await check();
    assert.equal(bad.ok, false);
    assert.match(bad.detail, /Vercel is failure \(Deployment failed\)/);
    assert.equal(landResult((await landEvidence(ctx, { epic: 101 })).checks).exit, 1);
    setStatuses([{ context: 'Vercel', state: 'pending' }]);
    assert.equal(landResult((await landEvidence(ctx, { epic: 101 })).checks).exit, 4, 'a pending status is a wait');
    setStatuses([{ context: 'Vercel', state: 'success' }]);
    assert.equal((await check()).ok, true);
  } finally { repo.cleanup(); }
});

const E2E = 'node scripts/staging-e2e.mjs --sha {sha} --pr {pr}';
const E2E_TEXT = `node scripts/staging-e2e.mjs --sha ${MERGE} --pr 104`;
/** The land run again on a profile that names commands.stagingE2e (or not), sharing the run's rules. */
async function withStagingE2e(env, e2e) {
  const base = testProfile();
  const profile = e2e === null ? base : { ...base, commands: { ...base.commands, stagingE2e: e2e } };
  const t = await ctxFor(env.repo.worktree, { gh: env.gh, clock: env.clock, rules: env.runner.rules, deps: env.deps, profile });
  env.runner = t.runner; // the new ctx's runner: the rules added before this call are copied into it
  return t.ctx;
}
const e2eRuns = (runner) => runner.texts().filter((t) => t.startsWith('node scripts/staging-e2e.mjs'));

test('W8 staging-e2e: without commands.stagingE2e the check is ok and nothing runs', async () => {
  const env = await landedRun({ voice: false });
  try {
    const ctx = await withStagingE2e(env, null);
    const c = (await landEvidence(ctx, { epic: 101 })).checks.find((x) => x.id === 'staging-e2e');
    assert.equal(c.ok, true);
    assert.match(c.detail, /names no commands\.stagingE2e/);
    assert.equal(e2eRuns(env.runner).length, 0);
  } finally { env.repo.cleanup(); }
});

test('W8 staging-e2e: land runs the profile command once per merge SHA and journals it; --check is red until then and never runs it', async () => {
  const env = await landedRun({ voice: false });
  try {
    env.runner.rules.unshift({ match: 'node scripts/staging-e2e.mjs', result: ok('all 12 passed') });
    const ctx = await withStagingE2e(env, E2E);
    const stagingE2e = async (mode) => (await landEvidence(ctx, { epic: 101, mode })).checks.find((x) => x.id === 'staging-e2e');

    const before = await stagingE2e('check');
    assert.equal(before.ok, false);
    assert.match(before.detail, /has not passed for eeeeeee \(run delivery land\)/);
    assert.equal(e2eRuns(env.runner).length, 0, '--check never runs the staging E2E');

    const ran = await stagingE2e('land');
    assert.equal(ran.ok, true);
    assert.deepEqual(e2eRuns(env.runner), [E2E_TEXT], '{sha} and {pr} are filled in');
    const journal = (await loadState(env.repo.paths.state)).journal.map((e) => parseEvent(e.event));
    const entry = journal.find((e) => e.command === 'land staging-e2e');
    assert.ok(entry, 'journalled as land staging-e2e');
    assert.equal(entry.exit, 0);
    assert.equal(entry.counts.sha, MERGE.slice(0, 12));

    assert.equal((await stagingE2e('land')).ok, true);
    assert.equal((await stagingE2e('check')).ok, true, '--check is green once it has passed');
    assert.equal(e2eRuns(env.runner).length, 1, 'never run twice for one merge SHA');
  } finally { env.repo.cleanup(); }
});

test('W8 staging-e2e: a failing run is red and is not counted as passed, so land runs it again', async () => {
  const env = await landedRun({ voice: false });
  try {
    let code = 1;
    env.runner.rules.unshift({ match: 'node scripts/staging-e2e.mjs', result: () => (code === 0 ? ok('fine') : fail(1, '3 failed')) });
    const ctx = await withStagingE2e(env, E2E);
    const c = async () => (await landEvidence(ctx, { epic: 101, mode: 'land' })).checks.find((x) => x.id === 'staging-e2e');
    const first = await c();
    assert.equal(first.ok, false);
    assert.match(first.detail, /staging E2E exited 1: 3 failed/);
    code = 0;
    assert.equal((await c()).ok, true);
    assert.equal(e2eRuns(env.runner).length, 2);
  } finally { env.repo.cleanup(); }
});

test('W8 staging-e2e: waits (exit 4), and does not run, while the deploy check is red', async () => {
  const env = await landedRun({ voice: false });
  try {
    env.runner.rules.unshift({ match: `DEPLOY_SHA=${MERGE} node scripts/wait-for-deploy.mjs`, result: fail(4, 'not live yet') });
    env.runner.rules.unshift({ match: 'node scripts/staging-e2e.mjs', result: ok('would pass') });
    const ctx = await withStagingE2e(env, E2E);
    const checks = (await landEvidence(ctx, { epic: 101, mode: 'land' })).checks;
    assert.equal(checks.find((x) => x.id === 'deploy').ok, false);
    const c = checks.find((x) => x.id === 'staging-e2e');
    assert.equal(c.ok, false);
    assert.match(c.detail, /waits for the deploy of eeeeeee to be live/);
    assert.equal(e2eRuns(env.runner).length, 0);
    assert.equal(landResult([c]).exit, 4);
  } finally { env.repo.cleanup(); }
});
