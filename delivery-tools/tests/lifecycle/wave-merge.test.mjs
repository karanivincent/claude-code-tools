// wave merge and wave end (spec 4.5): a green gate and --no-ff; mergeable first, the preview by SHA;
// and the phase-5 wave-sync gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ok, fail } from '../helpers/runner-stub.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { loadState } from '../../lib/core/state.mjs';
import { waveMerge, waveEnd, waveSyncGate } from '../../lib/lifecycle/wave.mjs';
import { write, gitIn, BRANCH, readyRun, moveBase } from './support.mjs';

test('wave merge: refuses a red gate, merges --no-ff and pushes on green, then is a no-op; a conflict aborts', async () => {
  let gate = { ok: false, failures: [{ code: 'M3', message: 'WL-01 not reached' }] };
  const { repo, ctx, calls } = await readyRun({ extraDeps: { unitGateStatus: async () => gate } });
  try {
    const unitWt = join(repo.root, 'u1');
    repo.git('worktree', 'add', '-q', '-b', `${BRANCH}--U1`, unitWt, BRANCH);
    const u = gitIn(unitWt);
    write(unitWt, { 'apps/web/src/widgets/contract.ts': 'export type Shell = {};\n' });
    u('add', '-A');
    u('commit', '-q', '-m', 'U1 contracts');

    const red = await waveMerge(ctx, { unit: 'U1' });
    assert.equal(red.merged, false);
    assert.match(red.failures[0].message, /^U1: WL-01 not reached/);

    gate = { ok: true, failures: [] };
    const res = await waveMerge(ctx, { unit: 'U1' });
    assert.equal(res.merged, true);
    assert.equal(repo.wtGit('log', '-1', '--format=%s'), 'Merge unit U1: Contracts and stubs');
    assert.equal(repo.wtGit('rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3, 'a merge commit, never a fast-forward');
    assert.equal(repo.git('ls-remote', 'origin', BRANCH).split('\t')[0], repo.wtGit('rev-parse', 'HEAD'));
    assert.deepEqual(calls.cleared, ['U1']);
    const again = await waveMerge(ctx, { unit: 'U1' });
    assert.equal(again.already, true);
    const merges = (await loadState(repo.paths.state)).journal.map((e) => e.event).filter((e) => e.startsWith('wave merge'));
    assert.match(merges[0], /^wave merge U1 \| exit=0 \| sha=[0-9a-f]{12}$/, 'the shape status reads to know U1 is merged');
    assert.equal(merges.length, 2);

    const u2Wt = join(repo.root, 'u2');
    repo.git('worktree', 'add', '-q', '-b', `${BRANCH}--U2`, u2Wt, `${BRANCH}~1`);
    const u2 = gitIn(u2Wt);
    write(u2Wt, { 'apps/web/src/widgets/contract.ts': 'export type Shell = { other: true };\n' });
    u2('add', '-A');
    u2('commit', '-q', '-m', 'U2 touches the contract');
    const clash = await waveMerge(ctx, { unit: 'U2' });
    assert.equal(clash.merged, false);
    assert.match(clash.failures[0].message, /conflicts with .* in apps\/web\/src\/widgets\/contract\.ts/);
    assert.equal(repo.wtGit('status', '--porcelain'), '', 'the conflicted merge was aborted');
    await assert.rejects(waveMerge(ctx, { unit: 'U9' }), (e) => e.exit === 2);
  } finally { repo.cleanup(); }
});

test('wave end: pushes, checks mergeable and CI, resolves the preview by SHA; pending is a wait; --final runs the local chain first', async () => {
  const { repo, ctx, gh } = await readyRun();
  try {
    const state = await loadState(repo.paths.state);
    const head = repo.wtGit('rev-parse', 'HEAD');
    gh.setHead(state.pr, head);
    ctx.runner.rules.unshift(
      { match: `node scripts/wait-for-checks.mjs ${state.pr}`, result: ok(`${head.slice(0, 7)}  pass`) },
      { match: new RegExp(`^PREVIEW_SHA=${head}`), result: ok('Looking for the preview.\nPreview deployment is live at https://preview.example.invalid/w.') },
    );
    const res = await waveEnd(ctx);
    assert.deepEqual(res.failures, []);
    assert.equal(res.exit, 0);
    assert.equal(res.url, 'https://preview.example.invalid/w');
    assert.ok(res.lines.some((l) => /^NEXT: capture --mode wave/.test(l)));

    ctx.runner.rules.unshift({ match: `node scripts/wait-for-checks.mjs ${state.pr}`, result: fail(2, 'still pending'), times: 1 });
    assert.equal((await waveEnd(ctx)).exit, 4);
    gh.setMergeable(state.pr, 'CONFLICTING');
    const conflicting = await waveEnd(ctx);
    assert.equal(conflicting.exit, 1);
    assert.equal(conflicting.failures[0].code, 'mergeable');
    ctx.runner.rules.unshift({ match: /^node scripts\/heavy\.mjs -- 'npm run typecheck/, result: fail(1, 'lint failed') });
    const final = await waveEnd(ctx, { final: true });
    assert.equal(final.exit, 1);
    assert.equal(final.failures[0].code, 'local-ci');
  } finally { repo.cleanup(); }
});

test('the wave-sync gate: base changes to claimed paths and refreshed capabilities without a row', async () => {
  const { repo, ctx } = await readyRun();
  try {
    assert.deepEqual((await waveSyncGate(ctx)).failures, []);
    moveBase(repo, { 'apps/web/src/widgets/list.tsx': 'changed on main\n' });
    repo.wtGit('fetch', '-q', 'origin');
    const g = await waveSyncGate(ctx);
    assert.match(g.failures[0].message, /origin\/main changed 1 claimed path since the last merge \(first apps\/web\/src\/widgets\/list\.tsx\)/);
    const baseline = validExample('baseline');
    baseline.refreshes = [{ sha: 'a'.repeat(40), at: '2026-01-15T22:00:00.000Z', added: ['CAP-044'] }];
    write(repo.worktree, { 'docs/delivery/widgets/baseline.json': baseline });
    assert.ok((await waveSyncGate(ctx)).failures.some((f) => /CAP-044 landed on the base since the run began and has no plan row/.test(f.message)));
  } finally { repo.cleanup(); }
});
