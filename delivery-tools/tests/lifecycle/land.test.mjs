// land (spec 4.7): every step recomputed for the merge SHA; the owed loop test run once; the release
// block written; the epic closed through the profile's command. `land --check` is the epic's
// evidence command: read-only, and exit 0 only when every step holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { landEvidence, landResult, landGate, judgeWorkflowRuns, nextTag, releaseBlock } from '../../lib/lifecycle/land.mjs';
import landCommand from '../../lib/commands/land.mjs';
import { landedRun, MERGE, mk } from './land-support.mjs';

test('before the merge, land --check is red and names the merge', async () => {
  const { repo, ctx, gh } = await landedRun();
  try {
    gh.db.prs.get(104).state = 'open';
    gh.db.prs.get(104).mergeCommit = null;
    const ev = await landEvidence(ctx, { epic: 101 });
    const res = landResult(ev.checks);
    assert.equal(res.exit, 1);
    assert.match(res.failures.at(-1).message, /PR #104 is not merged yet/);
  } finally { repo.cleanup(); }
});

test('land --check stays red until land has run the owed loop test and written the release block; then it is green', async () => {
  const { repo, ctx, gh, stdout, runner, calls } = await landedRun();
  try {
    const setupWrites = gh.db.writes.length;
    assert.equal(await landCommand.run(ctx, ['--epic', '101', '--check']), 1);
    const failing = stdout.lines().filter((l) => l.startsWith('FAIL')).map((l) => l.split(' ')[1]);
    assert.deepEqual(failing, ['loop-test', 'release']);
    assert.ok(!runner.texts().some((t) => t.startsWith('node scripts/loop-test.mjs')), '--check never dials');
    assert.equal(gh.db.writes.length, setupWrites, '--check writes nothing to GitHub');

    const writes = gh.db.writes.length;
    assert.equal(await landCommand.run(ctx, ['--epic', '101']), 0);
    assert.equal(runner.texts().filter((t) => t.startsWith('node scripts/loop-test.mjs')).length, 1);
    assert.equal((await gh.issueGet(101)).state, 'closed');
    assert.equal((await gh.issueGet(105)).state, 'closed', 'the Scope issue closes with the run');
    const release = (await gh.commentList(101)).find((c) => c.body.includes(mk('release')));
    assert.match(release.body, /20260115120000_add_widget_flags\.sql/);
    assert.match(release.body, /No tag required/);
    assert.match(release.body, /Title the release PR with `prod:` and merge it with a merge commit, never a squash\./);
    assert.match(release.body, /Loop test: passed on staging after the merge\./);
    const handover = readFileSync(join(repo.worktree, 'docs/handovers/2026-01-16-widgets-handover.md'), 'utf8');
    assert.ok(handover.includes(mk('block', 'release')));
    assert.ok(gh.db.writes.length > writes);
    assert.ok(calls.checks.some(([ids, run, record]) => ids === 'M3,M7,M10' && run === 'c-20260116-0800-staging' && record === false));

    const before = gh.db.writes.length;
    assert.equal(await landCommand.run(ctx, ['--epic', '101', '--check']), 0, 'the epic\'s evidence command passes');
    assert.equal(gh.db.writes.length, before, '--check writes nothing to GitHub');
    assert.equal(runner.texts().filter((t) => t.startsWith('node scripts/loop-test.mjs')).length, 1, 'the loop test is never dialled twice');
    assert.deepEqual((await landGate(ctx, { epic: 101 })).failures, []);
    await gh.issueEdit(101, { state: 'open' });
    assert.deepEqual((await landGate(ctx, { epic: 101 })).failures, [], 'the closed epic is the phase-7 gate\'s own part, not a land step');
  } finally { repo.cleanup(); }
});

test('pure helpers', () => {
  assert.equal(judgeWorkflowRuns([{ name: 'A', status: 'completed', conclusion: 'skipped' }], MERGE).state, 'green');
  assert.equal(nextTag('v{n}-{slug}', 'widgets', ['v1-a', 'v7-b', 'release-3']), 'v8-widgets');
  assert.equal(nextTag('v{n}-{slug}', 'widgets', []), 'v1-widgets');
  const block = releaseBlock({ feature: 'widgets', base: 'main', pr: 4, mergeSha: MERGE, pending: { ok: false, lines: [], detail: 'exit 1: boom' }, tag: 'v1-widgets', tagRequired: false, tagWhy: 'x', profile: { release: { prodTitlePrefix: 'prod:' } }, loopTest: 'not owed' });
  assert.match(block, /the pending-production check failed \(exit 1: boom\)/);
});
