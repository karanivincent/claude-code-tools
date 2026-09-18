// land, step by step (spec 4.7): each after-merge step turns red on its own evidence; the founder's
// organisation; a land started from another worktree; the release tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSafety, validExample } from '../helpers/fixtures.mjs';
import { writeArtefact, readArtefact } from '../../lib/core/artefacts.mjs';
import { landEvidence, landResult, runLand } from '../../lib/lifecycle/land.mjs';
import { ctxFor } from './support.mjs';
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
