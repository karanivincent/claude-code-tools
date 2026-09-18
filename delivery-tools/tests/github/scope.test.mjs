// The Scope issue (spec 10.2, 10.4): at most five lines with defaults, the snapshot that makes a
// later class change a late change, the founder's fixed-form replies, and the gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState, loadState } from '../../lib/core/state.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import {
  postScope, readScope, lateChanges, scopeGate, parseReplies, applyDecisions, renderScopeLine, classMap, snapshotHash,
  decodeSnapshot, diffClasses,
} from '../../lib/github/scope.mjs';
import scopeRead from '../../lib/commands/scope-read.mjs';
import { makePlan, FEATURE } from '../lifecycle/support.mjs';

const FOUNDER = 'founder-login';

async function setup(plan = makePlan()) {
  const dir = makeTempDir();
  const paths = featurePaths(dir.dir, FEATURE, {});
  await writeArtefact(paths, 'plan', plan);
  await createState(paths, { feature: FEATURE, runId: 'r-20260115-2000-abcd', worktree: dir.dir, branch: 'epic/101-widgets', epic: 101, at: '2026-01-15T20:00:00.000Z' });
  const clock = fakeClock('2026-01-15T21:00:00.000Z');
  const gh = createGhStub({ clock, startAt: 110, login: 'agent-login' });
  const { ctx, stdout } = await makeTestCtx({ repoRoot: dir.dir, feature: FEATURE, profile: makeProfile(), gh, clock });
  return { dir, paths, gh, ctx, stdout };
}

const block = makeMarker({ feature: FEATURE, kind: 'block', id: 'body' });

test('scope post creates the issue with its lines, label and snapshot; a second post writes nothing', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    const res = await postScope(ctx);
    assert.equal(res.number, 110);
    const issue = await gh.issueGet(110);
    assert.equal(issue.title, 'Scope for #101: widgets');
    assert.deepEqual(issue.labels, ['needs-decision']);
    assert.match(issue.body, /S1 · Cut "New widget" \(reason money\)\. Default: cut; follow-up #104\.\n\s+Applies at wave 1 start\. Reply "S1 build" to build it\./);
    const plan = await readArtefact(paths, 'plan');
    assert.equal(plan.scopeIssue, 110);
    assert.equal(plan.scopeSnapshot, snapshotHash(classMap(plan)));
    assert.deepEqual(decodeSnapshot(issue.body, block).classes, classMap(plan));
    const before = gh.db.writes.length;
    await postScope(ctx);
    assert.equal(gh.db.writes.length, before);
    assert.deepEqual((await scopeGate(ctx)).failures, []);
  } finally { dir.cleanup(); }
});

test('more than five lines is refused before anything is written', async () => {
  const plan = makePlan();
  plan.scope = [1, 2, 3, 4, 5, 6].map((n) => ({ ...plan.scope[0], line: `S${n}` }));
  const { dir, gh, ctx } = await setup(plan);
  try {
    await assert.rejects(postScope(ctx), (e) => e.exit === 1 && /at most 5/.test(e.message));
    assert.equal(gh.db.writes.length, 0);
  } finally { dir.cleanup(); }
});

test('with no line the Scope issue exists for the snapshot but is closed and unlabelled', async () => {
  const { dir, gh, ctx } = await setup(makePlan({ scope: [] }));
  try {
    const res = await postScope(ctx);
    const issue = await gh.issueGet(res.number);
    assert.equal(issue.state, 'closed');
    assert.deepEqual(issue.labels, []);
    assert.match(issue.body, /Nothing in the `widgets` delivery run \(#101\) needs your decision/);
  } finally { dir.cleanup(); }
});

test('parseReplies: fixed form per line, quotes skipped, other authors ignored, anything else unmapped', () => {
  const plan = makePlan();
  plan.scope.push({ line: 'S2', rows: ['CAP-002'], kind: 'remove', text: 'Remove the draft control.', default: 'remove', appliesAtWave: 2, reply: null });
  const comments = [
    { id: 1, author: FOUNDER, createdAt: '2026-01-15T22:00:00Z', body: '> S1 · Cut "New widget"\nS1 build' },
    { id: 2, author: 'someone-else', createdAt: '2026-01-15T22:01:00Z', body: 'S2 keep' },
    { id: 3, author: FOUNDER, createdAt: '2026-01-15T22:02:00Z', body: 'keep the draft thing please' },
    { id: 4, author: FOUNDER, createdAt: '2026-01-15T22:03:00Z', body: 'S2 maybe' },
    { id: 5, author: FOUNDER, createdAt: '2026-01-15T22:04:00Z', body: '- S2: keep\nS1 cut' },
  ];
  const { decisions, unmapped } = parseReplies(comments, FOUNDER, plan);
  assert.deepEqual(decisions.map((d) => `${d.line} ${d.word} #${d.commentId}`), ['S1 build #1', 'S2 keep #5', 'S1 cut #5']);
  assert.deepEqual(unmapped.map((u) => u.id), [3, 4]);
  const { plan: next, applied } = applyDecisions(plan, decisions);
  assert.equal(next.rows.find((r) => r.id === 'WL-03').class, 'cut', 'the latest reply wins');
  assert.equal(next.rows.find((r) => r.id === 'CAP-002').class, 'migrate', 'keep moves a removed capability, it does not delete it');
  assert.deepEqual(applied.map((a) => `${a.line}:${a.word}`), ['S1:cut', 'S2:keep']);
  assert.match(renderScopeLine({ ...plan.scope[1], reply: 'keep' }), /S2 · Remove the draft control\. Decided: keep \(your reply\)\./);
});

test('a fixed-form reply applies directly, moves the snapshot, and closes the issue once every line is decided', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    await postScope(ctx);
    await gh.addComment(110, 'S1 build', FOUNDER);
    const res = await readScope(ctx);
    assert.deepEqual(res.applied, [{ line: 'S1', word: 'build', rows: [{ id: 'WL-03', from: 'cut', to: 'new' }] }]);
    const plan = await readArtefact(paths, 'plan');
    assert.equal(plan.rows.find((r) => r.id === 'WL-03').class, 'new');
    assert.equal(plan.rows.find((r) => r.id === 'WL-03').reason.code, 'money', 'the cut reason survives so a later "cut" restores it');
    assert.equal(plan.scope[0].reply, 'build');
    assert.deepEqual(await lateChanges(ctx), [], 'the founder\'s own decision is not a late change');
    const issue = await gh.issueGet(110);
    assert.equal(issue.state, 'closed');
    assert.deepEqual(issue.labels, []);
    assert.match(issue.body, /S1 · Cut "New widget" \(reason money\)\. Decided: build \(your reply\)\./);
    const before = gh.db.writes.length;
    const again = await readScope(ctx);
    assert.deepEqual(again.applied, []);
    assert.equal(gh.db.writes.length, before, 'reading the same reply twice writes nothing');
  } finally { dir.cleanup(); }
});

test('a class the agent changes after the snapshot is a late change, with its Scope line once it has one', async () => {
  const { dir, paths, ctx } = await setup();
  try {
    await postScope(ctx);
    let plan = await readArtefact(paths, 'plan');
    plan.rows.find((r) => r.id === 'WL-01').class = 'cut';
    plan.rows.push({ ...plan.rows[1], id: 'WL-09', class: 'cut', owner: null });
    await writeArtefact(paths, 'plan', plan);
    assert.deepEqual(await lateChanges(ctx), [
      { row: 'WL-01', from: 'change', to: 'cut', scopeLine: null },
      { row: 'WL-09', from: 'absent', to: 'cut', scopeLine: null },
    ]);
    plan = await readArtefact(paths, 'plan');
    plan.scope.push({ line: 'S2', rows: ['WL-01', 'WL-09'], kind: 'cut-requested', text: 'Cut the list at 03:00.', default: 'cut', appliesAtWave: 2, reply: null });
    await writeArtefact(paths, 'plan', plan);
    assert.deepEqual((await lateChanges(ctx)).map((c) => c.scopeLine), ['S2', 'S2']);
    assert.equal((await scopeGate(ctx)).ok, false, 'the new line is not on the issue yet');
    await postScope(ctx);
    assert.equal((await scopeGate(ctx)).ok, true);
    assert.equal((await lateChanges(ctx)).length, 2, 'posting a new line never re-snapshots');
  } finally { dir.cleanup(); }
});

test('an edited snapshot is an inconsistency (exit 5), and --resnapshot is the only way past it', async () => {
  const { dir, gh, ctx } = await setup();
  try {
    await postScope(ctx);
    const issue = await gh.issueGet(110);
    const forged = Buffer.from(JSON.stringify({ v: 1, classes: { 'WL-03': 'new' }, handled: [] })).toString('base64url');
    await gh.issueEdit(110, { body: issue.body.replace(/snapshot:[A-Za-z0-9_-]+/, `snapshot:${forged}`) });
    await assert.rejects(lateChanges(ctx), (e) => e.exit === 5);
    const g = await scopeGate(ctx);
    assert.equal(g.ok, false);
    assert.equal(g.exit, 5);
    await assert.rejects(postScope(ctx), (e) => e.exit === 5 && /--resnapshot/.test(e.message));
    await postScope(ctx, { resnapshot: true });
    assert.deepEqual(await lateChanges(ctx), []);
  } finally { dir.cleanup(); }
});

test('a free-text reply is listed for the extractor, then applied with --apply or set aside with --ignore', async () => {
  const { dir, paths, gh, ctx, stdout } = await setup();
  try {
    await postScope(ctx);
    const c = await gh.addComment(110, 'Actually I would like that widget button after all', FOUNDER);
    assert.equal(await scopeRead.run(ctx, []), 1);
    assert.match(stdout.text(), new RegExp(`FAIL scope-reply comment ${c.id} is not in the fixed form`));
    assert.equal(await scopeRead.run(ctx, ['--apply', 'S1 build', '--comment', String(c.id)]), 0);
    assert.equal((await readArtefact(paths, 'plan')).rows.find((r) => r.id === 'WL-03').class, 'new');
    assert.equal(await scopeRead.run(ctx, []), 0, 'the mapped comment is handled for good');
    const other = await gh.addComment(110, 'hmm', FOUNDER);
    assert.equal(await scopeRead.run(ctx, ['--ignore', String(other.id)]), 0);
    assert.equal(await scopeRead.run(ctx, []), 0);
    const events = (await loadState(paths.state)).journal.map((e) => e.event);
    assert.ok(events.some((e) => e.includes(`notUnderstood=${other.id}`)), 'the report reads the set-aside reply from the journal');
    await assert.rejects(scopeRead.run(ctx, ['--apply', 'S9 build', '--comment', '1']), (e) => e.exit === 2);
    await assert.rejects(scopeRead.run(ctx, ['--apply', 'S1 build']), (e) => e.exit === 2);
  } finally { dir.cleanup(); }
});

test('diffClasses: a row that left the plan counts; a new migrate row does not', () => {
  const plan = makePlan();
  const classes = { ...classMap(plan), 'WL-99': 'new' };
  plan.rows.push({ ...plan.rows[2], id: 'CAP-009', class: 'migrate' });
  assert.deepEqual(diffClasses(classes, plan), [{ row: 'WL-99', from: 'new', to: 'absent', scopeLine: null }]);
});
