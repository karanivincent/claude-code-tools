// Idempotent GitHub writes: every body carries its marker, own records come before the search,
// only the generated block is rewritten, a found issue is never retitled, nothing is written twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeMarker, hasMarker } from '../../lib/core/markers.mjs';
import { composeBody, ensureIssue, ensureComment, findIssue, sameText, blockCurrent } from '../../lib/github/write.mjs';

const marker = makeMarker({ feature: 'widgets', kind: 'unit', id: 'U2' });
const block = makeMarker({ feature: 'widgets', kind: 'block', id: 'body' });
const ctxOf = (gh) => ({ gh });

test('composeBody keeps text outside the block and carries the marker once', () => {
  const first = composeBody('', block, 'generated one', marker);
  assert.ok(hasMarker(first, marker));
  const edited = `A note the founder added.\n\n${first}`;
  const second = composeBody(edited, block, 'generated two', marker);
  assert.match(second, /^A note the founder added\./);
  assert.match(second, /generated two/);
  assert.doesNotMatch(second, /generated one/);
  assert.equal(second.split(marker).length - 1, 1);
  assert.ok(blockCurrent(second, block, 'generated two'));
  assert.ok(sameText('a\r\nb  \n', 'a\nb'));
});

test('ensureIssue creates once with the marker, then finds it and writes nothing', async () => {
  const gh = createGhStub();
  const a = await ensureIssue(ctxOf(gh), { marker, block, content: 'Unit U2', title: '[widgets] U2', labels: ['enhancement'] });
  assert.equal(a.action, 'created');
  assert.ok(hasMarker((await gh.issueGet(a.number)).body, marker));
  const before = gh.db.writes.length;
  const b = await ensureIssue(ctxOf(gh), { marker, block, content: 'Unit U2', title: 'another title', labels: ['enhancement'] });
  assert.equal(b.action, 'unchanged');
  assert.equal(b.number, a.number);
  assert.equal(gh.db.writes.length, before, 'nothing written the second time');
});

test('ensureIssue updates only the drifted block, adds missing labels, never retitles', async () => {
  const gh = createGhStub();
  const a = await ensureIssue(ctxOf(gh), { marker, block, content: 'v1', title: 'Original title', labels: [] });
  await gh.issueEdit(a.number, { title: 'Retitled by the founder', body: `His note.\n\n${(await gh.issueGet(a.number)).body}` });
  const b = await ensureIssue(ctxOf(gh), { marker, block, content: 'v2', title: 'Original title', labels: ['dashboard'] });
  assert.equal(b.action, 'updated');
  const i = await gh.issueGet(a.number);
  assert.equal(i.title, 'Retitled by the founder');
  assert.match(i.body, /^His note\./);
  assert.match(i.body, /v2/);
  assert.deepEqual(i.labels, ['dashboard']);
});

test('the run\'s own record is used before the search, which lags new issues', async () => {
  const gh = createGhStub();
  const a = await ensureIssue(ctxOf(gh), { marker, block, content: 'x', title: 't' });
  gh.findByMarker = async () => []; // the search index has not caught up yet
  const again = await ensureIssue(ctxOf(gh), { marker, block, content: 'x', title: 't', known: [a.number] });
  assert.equal(again.number, a.number);
  assert.equal(gh.db.writes.filter((w) => w.op === 'issueCreate').length, 1);
  const found = await findIssue(ctxOf(gh), { marker, known: [null, 999, a.number] });
  assert.equal(found.via, 'record');
});

test('closed issues count, and duplicates found by search are closed as duplicates of the oldest', async () => {
  const gh = createGhStub();
  const body = composeBody('', block, 'x', marker);
  const one = await gh.issueCreate({ title: 'a', body });
  const two = await gh.issueCreate({ title: 'b', body });
  await gh.issueClose(one.number);
  const res = await ensureIssue(ctxOf(gh), { marker, block, content: 'x', title: 'c' });
  assert.equal(res.number, one.number, 'the closed original is found, not recreated');
  assert.deepEqual(res.duplicatesClosed, [two.number]);
  assert.equal((await gh.issueGet(two.number)).state, 'closed');
  assert.equal(gh.db.writes.filter((w) => w.op === 'issueCreate').length, 2);
});

test('adopt puts the marker on an existing issue; a missing one is a usage error', async () => {
  const gh = createGhStub();
  const plain = await gh.issueCreate({ title: 'The founder\'s epic', body: 'His words.' });
  const res = await ensureIssue(ctxOf(gh), { marker, block, content: 'generated', title: 'x', adopt: plain.number });
  assert.equal(res.action, 'adopted');
  const i = await gh.issueGet(plain.number);
  assert.match(i.body, /^His words\./);
  assert.ok(hasMarker(i.body, marker));
  await assert.rejects(ensureIssue(ctxOf(gh), { marker, block, content: 'g', title: 'x', adopt: 999 }), (e) => e.exit === 2);
});

test('ensureIssue on create links a sub-issue only when asked, and fills the number in', async () => {
  const gh = createGhStub();
  const epic = await gh.issueCreate({ title: 'epic', body: '' });
  const res = await ensureIssue(ctxOf(gh), { marker, block, content: (n) => `I am #${n ?? '?'}`, title: 't', parent: epic.number, subIssues: true });
  assert.match((await gh.issueGet(res.number)).body, new RegExp(`I am #${res.number}`));
  assert.deepEqual(gh.db.subIssues.get(epic.number), [res.number]);
});

test('ensureComment creates once, edits in place when drifted, and leaves a current one alone', async () => {
  const gh = createGhStub();
  const issue = await gh.issueCreate({ title: 't', body: '' });
  const m = makeMarker({ feature: 'widgets', kind: 'spec' });
  assert.equal((await ensureComment(ctxOf(gh), { issue: issue.number, marker: m, body: 'spec v1' })).action, 'created');
  assert.equal((await ensureComment(ctxOf(gh), { issue: issue.number, marker: m, body: 'spec v1' })).action, 'unchanged');
  assert.equal((await ensureComment(ctxOf(gh), { issue: issue.number, marker: m, body: 'spec v2' })).action, 'updated');
  const comments = await gh.commentList(issue.number);
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /spec v2/);
});
