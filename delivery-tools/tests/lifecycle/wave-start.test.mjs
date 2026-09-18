// wave start (spec 4.5): the base merge never completes while a new capability is unclassed; a
// modify/delete on a replaced file is settled only after that; unit files and dispatch records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ok } from '../helpers/runner-stub.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import { loadState } from '../../lib/core/state.mjs';
import { waveStart, waveSyncGate, commonDir, unmergedEntries } from '../../lib/lifecycle/wave.mjs';
import waveStartCommand from '../../lib/commands/wave-start.mjs';
import { makeRunRepo, ctxFor, write, BRANCH, OLD, readyRun, moveBase } from './support.mjs';

test('wave start refuses to finish while a capability is unclassed, then settles the modify/delete and dispatches', async () => {
  let refresh = { added: ['CAP-010'], unclassed: ['CAP-010 control:button "Rehearse by text"'] };
  // Like the real refresh, classing writes the new row into plan.json, mid-merge.
  const refreshFn = async (c) => {
    if (refresh.unclassed.length) return refresh;
    const paths = c.requirePaths();
    const plan = await readArtefact(paths, 'plan');
    if (!plan.rows.some((r) => r.id === 'CAP-010')) {
      plan.rows.push({ ...plan.rows.find((r) => r.id === 'CAP-002'), id: 'CAP-010' });
      await writeArtefact(paths, 'plan', plan);
    }
    return refresh;
  };
  const { repo, ctx, calls } = await readyRun({ refresh: refreshFn });
  try {
    moveBase(repo, { [OLD]: 'export const tab = 2; // text rehearsal\n' });
    const red = await waveStart(ctx);
    assert.equal(red.exit, 1);
    assert.ok(red.failures.some((f) => f.code === 'unclassed' && /CAP-010/.test(f.message)));
    assert.ok(red.failures.some((f) => f.code === 'modify-delete' && f.message.startsWith(OLD)));
    assert.ok(existsSync(join(repo.primary, '.git', 'worktrees', 'delivery-widgets', 'MERGE_HEAD')), 'the merge is left open, never committed');
    assert.deepEqual(calls.dispatched, []);
    assert.equal((await waveSyncGate(ctx)).ok, false);

    refresh = { added: ['CAP-010'], unclassed: [] };
    const green = await waveStart(ctx);
    assert.deepEqual(green.failures, []);
    assert.equal(green.exit, 0);
    assert.ok(green.lines.some((l) => l.includes(`kept this branch's deletion of ${OLD}`)));
    assert.equal(repo.wtGit('log', '-1', '--format=%s'), `Merge origin/main into ${BRANCH} at the start of wave 0`);
    assert.match(repo.wtGit('show', 'HEAD:docs/delivery/widgets/plan.json'), /CAP-010/, 'the row that classes the new capability is part of the merge');
    assert.equal(repo.wtGit('status', '--porcelain'), '');
    assert.equal(existsSync(join(repo.worktree, OLD)), false);
    assert.deepEqual(calls.dispatched.map((d) => d.unit), ['U1']);
    const unit = await readArtefact(repo.paths, 'unit-file', { key: 'U1' });
    assert.equal(unit.branch, `${BRANCH}--U1`);
    assert.equal(unit.baseRef, `origin/${BRANCH}`);
    assert.equal(unit.reportPath, repo.paths.unitReport('U1'));
    assert.equal(unit.commands.bootstrap, 'node scripts/bootstrap.mjs --dir . --port 4100');
    assert.equal(unit.flight, 'nothing else in flight');
    assert.deepEqual(unit.contracts, ['shell']);
    const state = await loadState(repo.paths.state);
    assert.equal(state.wave, 0);
    assert.match(state.journal.at(-1).event, /^wave start \| exit=0 \| wave=0 \| units=1/);
    assert.deepEqual((await waveSyncGate(ctx)).failures, []);
  } finally { repo.cleanup(); }
});

test('a content conflict is left for the main session, and a finished merge is continued on the next run', async () => {
  const { repo, ctx } = await readyRun();
  try {
    write(repo.worktree, { 'shared.md': 'ours\n' });
    repo.wtGit('add', '-A');
    repo.wtGit('commit', '-q', '-m', 'ours');
    moveBase(repo, { 'shared.md': 'theirs\n' });
    const red = await waveStart(ctx);
    assert.deepEqual(red.failures.map((f) => f.code), ['conflict']);
    assert.match(red.failures[0].message, /^shared\.md \(AA\) conflicts with origin\/main/);
    write(repo.worktree, { 'shared.md': 'both\n' });
    repo.wtGit('add', 'shared.md');
    const green = await waveStart(ctx);
    assert.equal(green.exit, 0);
    assert.ok(green.lines.some((l) => /continuing the merge/.test(l)));
  } finally { repo.cleanup(); }
});

test('wave start is red on a claim the planner still queues, a duplicate PR, or an unmapped Scope reply', async () => {
  const { repo, ctx, gh } = await readyRun();
  try {
    write(repo.worktree, { 'notes.txt': 'half-done work of the main session\n' });
    await assert.rejects(waveStart(ctx), (e) => e.exit === 1 && e.code === 'dirty' && /first notes\.txt/.test(e.message));
    rmSync(join(repo.worktree, 'notes.txt'));
    const plan = await readArtefact(repo.paths, 'plan');
    await writeArtefact(repo.paths, 'plan', { ...plan, units: plan.units.map((u) => ({ ...u, title: `${u.title}.` })) });
    ctx.runner.rules.unshift({ match: 'node scripts/planner.mjs', result: ok('queue: #103') });
    const other = await gh.prCreate({ title: 'Pool', body: 'Closes #102', base: 'main', head: 'night/102-x' });
    await gh.addComment((await readArtefact(repo.paths, 'plan')).scopeIssue, 'please keep it', 'founder-login');
    const res = await waveStart(ctx);
    assert.equal(res.exit, 1);
    const codes = res.failures.map((f) => f.code).sort();
    assert.deepEqual(codes, ['claims', 'dupe', 'scope-reply']);
    assert.ok(res.failures.some((f) => f.message.includes(`#${other.number}`)));
    assert.ok(res.lines.some((l) => /committed the run's own file changes/.test(l)), 'the CLI commits its own plan.json changes');
    assert.equal(repo.wtGit('status', '--porcelain'), '');
    assert.equal(await waveStartCommand.run(ctx, ['x']).catch((e) => e.exit), 2);
  } finally { repo.cleanup(); }
});

test('wave start from anywhere but the integration worktree is a usage error', async () => {
  const repo = await makeRunRepo();
  try {
    const { ctx } = await ctxFor(repo.primary);
    await assert.rejects(waveStart(ctx), (e) => e.exit === 2 && /no run state/.test(e.message));
    repo.wtGit('checkout', '-q', '-b', 'elsewhere');
    const wt = await ctxFor(repo.worktree);
    await assert.rejects(waveStart(wt.ctx), (e) => e.exit === 2 && /integration worktree/.test(e.message));
  } finally { repo.cleanup(); }
});

test('pure helpers', () => {
  assert.equal(commonDir(['a/b/c.ts', 'a/b/d/e.ts']), 'a/b');
  assert.equal(commonDir(['a/x.ts']), 'a/x.ts');
  assert.equal(commonDir(['a/x.ts', 'b/y.ts']), '.');
  assert.deepEqual(unmergedEntries('DU a.ts\nUU b.ts\n M c.ts\n'), [{ code: 'DU', path: 'a.ts' }, { code: 'UU', path: 'b.ts' }]);
});
