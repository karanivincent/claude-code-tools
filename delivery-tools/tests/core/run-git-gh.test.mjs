// The runner, the git and gh wrappers, and the helper stubs that stand in for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, describeCall } from '../../lib/core/run.mjs';
import { createGit, parseWorktreePorcelain } from '../../lib/core/git.mjs';
import { createGh } from '../../lib/core/gh.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import { createStubRunner, ok, fail } from '../helpers/runner-stub.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';

test('real runner: exit codes, stdout, stdin, missing binary, timeout, buffers', async () => {
  const r = createRunner();
  const a = await r.run(process.execPath, ['-e', 'process.stdin.pipe(process.stdout); process.stderr.write("e"); process.exitCode = 3'], { input: 'piped' });
  assert.deepEqual([a.code, a.stdout, a.stderr], [3, 'piped', 'e']);
  assert.equal((await r.run('definitely-not-a-binary-xyz')).code, 127);
  const slow = await r.run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 100 });
  assert.equal(slow.code, 124); assert.equal(slow.timedOut, true);
  const sh = await r.sh('printf "%s" "$X"', { env: { X: 'from-env' } });
  assert.equal(sh.stdout, 'from-env');
  const buf = await r.run(process.execPath, ['-e', 'process.stdout.write(Buffer.from([0,255]))'], { encoding: 'buffer' });
  assert.ok(Buffer.isBuffer(buf.stdout)); assert.equal(buf.stdout.length, 2);
  assert.equal(r.calls.length, 5);
});

test('stub runner answers by rule, counts uses, and refuses anything unmatched', async () => {
  const r = createStubRunner([
    { match: 'gh pr view', result: ok({ number: 5 }), times: 1 },
    { match: /^node scripts\/wait/, result: (call) => fail(1, `no ${call.args.at(-1)}`) },
  ]);
  assert.equal((await r.run('gh', ['pr', 'view', '5'])).stdout, '{"number":5}');
  await assert.rejects(r.run('gh', ['pr', 'view', '5']), /runner stub has no answer for: gh pr view 5/);
  assert.equal((await r.sh('node scripts/wait-for-checks.mjs 7')).code, 0 + 1);
  await assert.rejects(r.run('git', ['status']), /no answer/);
  assert.deepEqual(r.texts(), ['gh pr view 5', 'gh pr view 5', 'node scripts/wait-for-checks.mjs 7', 'git status']);
  assert.equal(describeCall({ cmd: 'git', args: ['commit', '-m', 'two words'] }), 'git commit -m "two words"');
});

test('git wrapper on a real temp repo: rev-parse, show, merge-base, diff, worktrees', async () => {
  const repo = makeTempRepo({ files: { 'a.txt': 'one\n', '.claude/delivery-safety.json': '{"x":1}\n' } });
  try {
    const git = createGit(createStubRunner([], { passthrough: ['git'] }), { cwd: repo.dir });
    const base = await git.revParse('HEAD');
    assert.match(base, /^[0-9a-f]{40}$/);
    assert.equal(await git.revParse('no-such-ref'), null);
    assert.equal(await git.currentBranch(), 'main');
    assert.equal((await git.show('HEAD', '.claude/delivery-safety.json')).toString(), '{"x":1}\n');
    assert.equal(await git.show('HEAD', 'missing.txt'), null);
    repo.write({ 'b.txt': 'two\n' });
    const head = repo.commit('add b');
    assert.equal(await git.mergeBase(base, head), base);
    assert.deepEqual(await git.diffNames(base, head), ['b.txt']);
    assert.equal(await git.isClean(), true);
    const wt = repo.addWorktree('wt', 'epic/1-widgets');
    const list = await git.worktrees();
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((w) => w.branch), ['main', 'epic/1-widgets']);
    assert.equal(list[1].path, wt);
    await assert.rejects(git.ok(['checkout', 'no-such-branch']), (e) => e.exit === 1 && /git checkout no-such-branch failed/.test(e.message));
  } finally { repo.cleanup(); }
});

test('parseWorktreePorcelain handles bare, detached, locked and prunable entries', () => {
  const text = 'worktree /r\nbare\n\nworktree /r/a\nHEAD abc\nbranch refs/heads/epic/2-x\n\nworktree /r/b\nHEAD def\ndetached\nlocked reason\n\nworktree /r/c\nHEAD 123\ndetached\nprunable gitdir file points to non-existent location\n';
  const w = parseWorktreePorcelain(text);
  assert.deepEqual(w.map((x) => [x.path, x.branch, x.bare, x.detached, x.locked, x.prunable]), [
    ['/r', null, true, false, false, false], ['/r/a', 'epic/2-x', false, false, false, false],
    ['/r/b', null, false, true, true, false], ['/r/c', null, false, true, false, true],
  ]);
});

test('gh wrapper builds gh calls and normalises results', async () => {
  const runner = createStubRunner([
    { match: 'gh api -X POST repos/o/r/issues --input -', result: (call) => ok({ number: 9, title: JSON.parse(call.input).title, body: JSON.parse(call.input).body, state: 'open', labels: [{ name: 'epic' }], html_url: 'u' }) },
    { match: /^gh api -X GET "search\/issues\?q=/, result: ok([
      JSON.stringify({ number: 9, body: 'x <!-- delivery:widgets:epic -->', state: 'closed', labels: [] }),
      JSON.stringify({ number: 10, body: 'mentions delivery:widgets:epic without the comment', state: 'open', labels: [] }),
    ].join('\n')) },
    { match: 'gh pr view 12 --repo o/r --json', result: ok({ number: 12, state: 'OPEN', isDraft: true, mergeable: 'CONFLICTING', headRefOid: 'f'.repeat(40), labels: [], mergeCommit: null }) },
    { match: 'gh pr view 13', result: fail(1, 'GraphQL: Could not resolve to a PullRequest with the number of 13.') },
    { match: 'gh api -X GET repos/o/r/issues/14', result: fail(1, 'gh: Not Found (HTTP 404)') },
    { match: 'gh api -X GET repos/o/r/issues/15', result: fail(1, 'HTTP 502: Bad Gateway') },
    { match: 'gh api -X GET repos/o/r/issues/16', result: fail(1, 'HTTP 401: Bad credentials') },
  ]);
  const gh = createGh(runner, { repo: 'o/r' });
  const created = await gh.issueCreate({ title: 'Epic', body: 'b', labels: ['epic'], type: 'Feature' });
  assert.deepEqual(created, { number: 9, title: 'Epic', body: 'b', state: 'open', labels: ['epic'], url: 'u', isPr: false });
  assert.deepEqual(JSON.parse(runner.calls[0].input), { title: 'Epic', body: 'b', labels: ['epic'], type: 'Feature' });
  const found = await gh.findByMarker(makeMarker({ feature: 'widgets', kind: 'epic' }));
  assert.deepEqual(found.map((i) => [i.number, i.state]), [[9, 'closed']]);
  const pr = await gh.prGet(12);
  assert.deepEqual([pr.state, pr.isDraft, pr.mergeable], ['open', true, 'CONFLICTING']);
  assert.equal(await gh.prGet(13), null);
  assert.equal(await gh.issueGet(14), null);
  await assert.rejects(gh.issueGet(15), (e) => e.exit === 4);
  await assert.rejects(gh.issueGet(16), (e) => e.exit === 2);
});

test('gh stub: issues, comments, markers, PRs, mergeable, sub-issues', async () => {
  const gh = createGhStub({ repo: 'o/r', login: 'founder' });
  const marker = makeMarker({ feature: 'widgets', kind: 'unit', id: 'U1' });
  const epic = await gh.issueCreate({ title: 'Epic', body: '<!-- delivery:widgets:epic -->', labels: ['epic'] });
  const child = await gh.issueCreate({ title: 'U1', body: `Build it\n${marker}` });
  await gh.addSubIssue(epic.number, child.number);
  await gh.issueClose(child.number, { comment: 'row removed' });
  assert.deepEqual((await gh.findByMarker(marker)).map((i) => [i.number, i.state]), [[child.number, 'closed']]);
  assert.equal((await gh.issueList({ state: 'open' })).length, 1);
  const c = await gh.commentCreate(epic.number, `spec v1\n${makeMarker({ feature: 'widgets', kind: 'spec' })}`);
  await gh.commentEdit(c.id, `spec v2\n${makeMarker({ feature: 'widgets', kind: 'spec' })}`);
  assert.match((await gh.findCommentByMarker(epic.number, '<!-- delivery:widgets:spec -->')).body, /spec v2/);
  const pr = await gh.prCreate({ title: 'Widgets', body: `Refs #${child.number}\n<!-- delivery:widgets:pr -->`, base: 'main', head: 'epic/1-widgets', labels: ['delivery-run'] });
  assert.equal(pr.isDraft, true);
  gh.setMergeable(pr.number, 'CONFLICTING');
  assert.equal((await gh.prGet(pr.number)).mergeable, 'CONFLICTING');
  assert.equal((await gh.findByMarker('<!-- delivery:widgets:pr -->', { kind: 'pr' }))[0].isPr, true);
  assert.equal((await gh.prList({ labels: ['delivery-run'] })).length, 1);
  gh.merge(pr.number);
  assert.equal((await gh.prGet(pr.number)).state, 'merged');
  assert.deepEqual(gh.db.subIssues.get(epic.number), [child.number]);
  assert.ok(gh.db.writes.some((w) => w.op === 'prCreate'));
  await assert.rejects(gh.issueEdit(999, { body: 'x' }), (e) => e.exit === 1);
});
