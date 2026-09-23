// Duplicate PRs (spec 12.3): any PR not the run's, open or merged since the run began, that
// references a claimed child (body or branch name) or touches a claimed path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState } from '../../lib/core/state.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import { findDupes, branchIssues, undecided } from '../../lib/github/dupes.mjs';
import dupesCommand from '../../lib/commands/dupes.mjs';
import { makePlan, FEATURE } from '../lifecycle/support.mjs';

test('dupes finds references and path overlaps since the run began, and nothing else', async () => {
  const dir = makeTempDir();
  try {
    const paths = featurePaths(dir.dir, FEATURE, {});
    const plan = makePlan();
    plan.units[0].issue = 102;
    plan.units[1].issue = 103;
    await writeArtefact(paths, 'plan', plan);
    await createState(paths, { feature: FEATURE, runId: 'r-20260115-2000-abcd', worktree: dir.dir, branch: 'epic/101-widgets', epic: 101, at: '2026-01-15T20:00:00.000Z' });
    const clock = fakeClock('2026-01-15T19:00:00.000Z');
    const gh = createGhStub({ clock, startAt: 200 });
    const early = await gh.prCreate({ title: 'Old list tweak', body: '', base: 'main', head: 'feature/old' });
    gh.setFiles(early.number, ['apps/web/src/widgets/list.tsx']);
    gh.merge(early.number); // merged before the run began: not a duplicate
    clock.set('2026-01-15T22:00:00.000Z');
    const mine = await gh.prCreate({ title: 'Widgets', body: `Refs #102\n${makeMarker({ feature: FEATURE, kind: 'pr' })}`, base: 'main', head: 'epic/101-widgets' });
    gh.setFiles(mine.number, ['apps/web/src/widgets/list.tsx']);
    const byBody = await gh.prCreate({ title: 'Fix widgets', body: 'Closes #103', base: 'main', head: 'feature/x' });
    const byBranch = await gh.prCreate({ title: 'Pool work', body: 'no refs', base: 'main', head: 'night/102-make-the-list' });
    const byPath = await gh.prCreate({ title: 'Touch the stub', body: '', base: 'main', head: 'feature/y' });
    gh.setFiles(byPath.number, ['apps/web/src/widgets/shell.stub.tsx', 'README.md']);
    const unrelated = await gh.prCreate({ title: 'Docs', body: 'Refs #5', base: 'main', head: 'night/5-docs' });
    gh.setFiles(unrelated.number, ['docs/other.md']);
    const lateMerge = await gh.prCreate({ title: 'Merged overnight', body: '', base: 'main', head: 'feature/z' });
    gh.setFiles(lateMerge.number, ['apps/web/src/widgets/contract.ts']);
    gh.merge(lateMerge.number);

    const { ctx, stdout } = await makeTestCtx({ repoRoot: dir.dir, feature: FEATURE, profile: makeProfile(), gh, clock });
    const hits = await findDupes(ctx);
    assert.deepEqual(hits.map((h) => h.pr), [byBody.number, byBranch.number, byPath.number, lateMerge.number]);
    assert.match(hits[0].reason, /references #103, which the run claims for U2/);
    assert.match(hits[1].reason, /references #102/);
    assert.match(hits[2].reason, /touches 1 claimed path, first apps\/web\/src\/widgets\/shell\.stub\.tsx/);
    assert.match(hits[3].reason, /^merged PR/);
    assert.equal(await dupesCommand.run(ctx, []), 1);
    assert.equal(stdout.lines().filter((l) => l.startsWith('FAIL dupe')).length, 4);
  } finally { dir.cleanup(); }
});

test('branchIssues reads the pool\'s branch names', () => {
  assert.deepEqual([...branchIssues('night/1733-make-the-list')], [1733]);
  assert.deepEqual([...branchIssues('feature/add-12-things')], []);
});

test('a decision at the PR\'s head SHA lets the run past the hit, and a new commit on it re-reds', async () => {
  const dir = makeTempDir();
  try {
    const paths = featurePaths(dir.dir, FEATURE, {});
    const plan = makePlan();
    await writeArtefact(paths, 'plan', plan);
    await createState(paths, { feature: FEATURE, runId: 'r-20260115-2000-abcd', worktree: dir.dir, branch: 'epic/101-widgets', epic: 101, at: '2026-01-15T20:00:00.000Z' });
    const clock = fakeClock('2026-01-15T22:00:00.000Z');
    const gh = createGhStub({ clock, startAt: 200 });
    const other = await gh.prCreate({ title: 'Another feature adding copy', body: '', base: 'main', head: 'night/500-other' });
    gh.setFiles(other.number, ['apps/web/src/widgets/shell.stub.tsx']);
    const { ctx, stdout } = await makeTestCtx({ repoRoot: dir.dir, feature: FEATURE, profile: makeProfile(), gh, clock });

    // Red before the decision, and the hit names the unit that claims the file.
    let hits = await findDupes(ctx);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].decided, false);
    assert.deepEqual(hits[0].units, ['U2'], 'the stub is the contract\'s, so its consumer is the unit affected');
    assert.equal(await dupesCommand.run(ctx, []), 1);

    // --decide needs a note, and refuses a PR that is not a hit.
    await assert.rejects(() => dupesCommand.run(ctx, ['--decide', String(other.number)]), /--note/);
    await assert.rejects(() => dupesCommand.run(ctx, ['--decide', '9999', '--note', 'x']), /not a duplicate/);

    assert.equal(await dupesCommand.run(ctx, ['--decide', String(other.number), '--note', 'a shared registry file; the overlap is a text merge']), 0);
    hits = await findDupes(ctx);
    assert.equal(hits.length, 1, 'the hit is still found, never silenced');
    assert.equal(hits[0].decided, true);
    assert.equal(undecided(hits).length, 0);
    assert.equal(await dupesCommand.run(ctx, []), 0);
    assert.match(stdout.lines().join('\n'), /decided #\d+ \([0-9a-f]{7}\): a shared registry file/);

    // A new commit on that PR expires the decision.
    gh.setHead(other.number, 'f'.repeat(40));
    hits = await findDupes(ctx);
    assert.equal(hits[0].decided, false, 'a new head SHA is a fresh decision');
    assert.equal(await dupesCommand.run(ctx, []), 1);
  } finally { dir.cleanup(); }
});
