// issues sync (spec 4.3 step 5, 11.3): by marker, never duplicated, nothing deleted, numbers
// written back; running it twice creates nothing (spec 20.2 row "Resume").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState, loadState } from '../../lib/core/state.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import { hasMarker, makeMarker } from '../../lib/core/markers.mjs';
import { syncIssues, findEpic, issuesSyncedGate, desiredChildren, renderEpicContent } from '../../lib/github/issues.mjs';
import issuesSync from '../../lib/commands/issues-sync.mjs';
import { makePlan, FEATURE } from '../lifecycle/support.mjs';

async function setup({ plan = makePlan(), intent = null, startAt = 101, findings = null } = {}) {
  const dir = makeTempDir();
  const paths = featurePaths(dir.dir, FEATURE, {});
  await writeArtefact(paths, 'plan', plan);
  if (intent) await writeArtefact(paths, 'intent', intent);
  if (findings) await writeArtefact(paths, 'findings', findings);
  await createState(paths, { feature: FEATURE, runId: 'r-20260115-2000-abcd', worktree: dir.dir, branch: 'epic/101-widgets', epic: null, at: '2026-01-15T20:00:00.000Z' });
  const clock = fakeClock('2026-01-15T21:00:00.000Z');
  const gh = createGhStub({ clock, startAt });
  const { ctx, stdout } = await makeTestCtx({ repoRoot: dir.dir, feature: FEATURE, profile: makeProfile(), gh, clock });
  ctx.deps = { renderSpec: (p) => `# Spec for ${p.feature}\n\n${p.rows.map((r) => `- ${r.id}: ${r.class}`).join('\n')}\n` };
  return { dir, paths, gh, ctx, stdout };
}

test('epic-only creates the epic with its marker, labels and type, and records it', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    const res = await syncIssues(ctx, { epicOnly: true, sentence: 'Redesign the widgets page.' });
    assert.equal(res.epic, 101);
    const epic = await gh.issueGet(101);
    assert.ok(hasMarker(epic.body, makeMarker({ feature: FEATURE, kind: 'epic' })));
    assert.deepEqual(epic.labels, ['epic']);
    assert.equal(gh.db.issues.get(101).type, 'Feature');
    assert.match(epic.body, /Done when: `node scripts\/delivery\.mjs land --check --epic 101` exits 0\./);
    assert.equal((await loadState(paths.state)).epic, 101);
    assert.equal((await findEpic(ctx)).number, 101);
    const again = await syncIssues(ctx, { epicOnly: true, sentence: 'Redesign the widgets page.' });
    assert.equal(again.epic, 101);
    assert.equal(gh.db.writes.filter((w) => w.op === 'issueCreate').length, 1);
  } finally { dir.cleanup(); }
});

test('issues sync creates every child, the cut follow-up, the spec comment and the Scope issue, and writes the numbers back', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    await syncIssues(ctx, { epicOnly: true, sentence: 'Redesign the widgets page.' });
    const res = await syncIssues(ctx, {});
    const plan = await readArtefact(paths, 'plan');
    assert.equal(plan.epic, 101);
    const [u1, u2] = plan.units;
    assert.ok(u1.issue && u2.issue);
    const cut = plan.rows.find((r) => r.id === 'WL-03');
    assert.ok(cut.issue);
    assert.ok(plan.scopeIssue);
    assert.ok(hasMarker((await gh.issueGet(u1.issue)).body, makeMarker({ feature: FEATURE, kind: 'unit', id: 'U1' })));
    assert.ok(hasMarker((await gh.issueGet(cut.issue)).body, makeMarker({ feature: FEATURE, kind: 'cut', id: 'WL-03' })));
    // Units are sub-issues of the epic; the cut follow-up is not (it outlives the epic).
    assert.deepEqual(gh.db.subIssues.get(101).sort(), [u1.issue, u2.issue].sort());
    const epic = await gh.issueGet(101);
    assert.match(epic.body, new RegExp(`#${cut.issue} cut WL-03`));
    const spec = (await gh.commentList(101)).find((c) => hasMarker(c.body, makeMarker({ feature: FEATURE, kind: 'spec' })));
    assert.match(spec.body, /# Spec for widgets/);
    const scope = await gh.issueGet(plan.scopeIssue);
    assert.equal(scope.title, 'Scope for #101: widgets');
    assert.deepEqual(scope.labels, ['needs-decision']);
    assert.ok(res.counts.created >= 5);
  } finally { dir.cleanup(); }
});

test('issues sync run twice creates nothing and writes nothing the second time', async () => {
  const { dir, gh, ctx } = await setup();
  try {
    await syncIssues(ctx, { epicOnly: true, sentence: 'Redesign the widgets page.' });
    await syncIssues(ctx, {});
    const before = gh.db.writes.length;
    const again = await syncIssues(ctx, {});
    assert.deepEqual(gh.db.writes.slice(before), [], 'no GitHub write at all on the second run');
    assert.equal(again.counts.created, 0);
    assert.equal(again.counts.updated, 0);
    // Even with the search index lagging, the recorded numbers stop a duplicate.
    gh.findByMarker = async () => [];
    await syncIssues(ctx, {});
    // And --epic-only (what intake runs) writes the same epic body, so it undoes nothing.
    await syncIssues(ctx, { epicOnly: true });
    assert.deepEqual(gh.db.writes.slice(before), []);
  } finally { dir.cleanup(); }
});

test('a unit that leaves the plan has its issue closed with a comment, never deleted', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    await syncIssues(ctx, { epicOnly: true, sentence: 'Redesign the widgets page.' });
    await syncIssues(ctx, {});
    const plan = await readArtefact(paths, 'plan');
    const gone = plan.units[1];
    await writeArtefact(paths, 'plan', { ...plan, units: [plan.units[0]], rows: plan.rows.map((r) => (r.owner === gone.id ? { ...r, owner: plan.units[0].id } : r)) });
    await syncIssues(ctx, {});
    const issue = await gh.issueGet(gone.issue);
    assert.equal(issue.state, 'closed');
    assert.ok(gh.db.issues.has(gone.issue));
    assert.match((await gh.commentList(gone.issue)).at(-1).body, /no longer in the `widgets` plan/);
  } finally { dir.cleanup(); }
});

test('a changed plan updates only the drifted body, and the gate says so until sync runs', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    await syncIssues(ctx, { epicOnly: true, sentence: 'Redesign the widgets page.' });
    await syncIssues(ctx, {});
    assert.deepEqual((await issuesSyncedGate(ctx)).failures, []);
    const plan = await readArtefact(paths, 'plan');
    plan.units[1].files.push('apps/web/src/widgets/row.tsx');
    await writeArtefact(paths, 'plan', plan);
    const red = await issuesSyncedGate(ctx);
    assert.equal(red.ok, false);
    assert.match(red.failures[0].message, /unit U2 #\d+: its generated section differs from the plan/);
    const before = gh.db.writes.length;
    await syncIssues(ctx, {});
    assert.deepEqual(gh.db.writes.slice(before).map((w) => w.op), ['issueEdit'], 'one edit: the drifted unit body, nothing created');
    assert.equal((await issuesSyncedGate(ctx)).ok, true);
  } finally { dir.cleanup(); }
});

test('the gate reports a missing child and a stale spec comment without writing', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    await syncIssues(ctx, { epicOnly: true, sentence: 'x' });
    await syncIssues(ctx, {});
    const plan = await readArtefact(paths, 'plan');
    plan.units.push({ ...plan.units[1], id: 'U3', title: 'Widget detail', issue: null, states: [], capabilities: [], files: ['apps/web/src/widgets/detail.tsx'] });
    plan.rows[0].class = 'new';
    await writeArtefact(paths, 'plan', plan);
    const before = gh.db.writes.length;
    const res = await issuesSyncedGate(ctx);
    assert.equal(gh.db.writes.length, before, 'the gate never writes');
    assert.ok(res.failures.some((f) => /unit U3 has no issue/.test(f.message)));
    assert.ok(res.failures.some((f) => /spec comment .* older than the plan/.test(f.message)));
  } finally { dir.cleanup(); }
});

test('P3 findings get one polish issue under a follow-up link, and are marked filed', async () => {
  const findings = validExample('findings');
  findings.findings = findings.findings.map((f, i) => ({ ...f, id: `F-00000000000${i}`, severity: 'P3', status: 'open' }));
  const { dir, paths, gh, ctx } = await setup({ findings });
  try {
    await syncIssues(ctx, { epicOnly: true, sentence: 'x' });
    await syncIssues(ctx, {});
    const polish = [...gh.db.issues.values()].find((i) => hasMarker(i.body, makeMarker({ feature: FEATURE, kind: 'polish' })));
    assert.ok(polish);
    assert.match(polish.title, /Polish: \d+ small design difference/);
    const doc = await readArtefact(paths, 'findings');
    assert.ok(doc.findings.every((f) => f.status === 'filed'));
    assert.match(polish.body, /\(#101\), filed rather than fixed/);
    assert.equal(gh.db.subIssues.get(101).includes(polish.number), false, 'the polish issue outlives the epic, so it is not a sub-issue');
  } finally { dir.cleanup(); }
});

test('dry run writes nothing and says what it would do', async () => {
  const { dir, paths, gh, ctx } = await setup();
  try {
    const res = await syncIssues(ctx, { dryRun: true });
    assert.equal(gh.db.writes.length, 0);
    assert.ok(res.lines.some((l) => /would create/.test(l)));
    assert.equal((await readArtefact(paths, 'plan')).units[0].issue, null);
  } finally { dir.cleanup(); }
});

test('the command journals its counts and exits 0; without a plan it is a usage error', async () => {
  const { dir, paths, ctx, stdout } = await setup();
  try {
    assert.equal(await issuesSync.run(ctx, ['--epic-only']), 0);
    assert.equal(await issuesSync.run(ctx, []), 0);
    assert.match(stdout.text(), /unit U1 #\d+: created/);
    const state = await loadState(paths.state);
    assert.ok(state.journal.some((e) => /^issues sync \| exit=0 \| created=\d+/.test(e.event)));
  } finally { dir.cleanup(); }
  const empty = await setup();
  try {
    const { rmSync } = await import('node:fs');
    rmSync(empty.paths.plan);
    await assert.rejects(issuesSync.run(empty.ctx, []), (e) => e.exit === 2 && /no plan/.test(e.message));
  } finally { empty.dir.cleanup(); }
});

test('pure helpers: desired children and the epic body', () => {
  const plan = makePlan();
  const want = desiredChildren({ plan, profile: makeProfile(), feature: FEATURE });
  assert.deepEqual(want.map((w) => w.key), ['unit U1', 'unit U2', 'cut WL-03']);
  assert.equal(want[0].parent, plan.epic);
  assert.equal(want[2].parent, null);
  const body = renderEpicContent({ feature: FEATURE, sentence: 'Do it.' })(7);
  assert.match(body, /Delivery run `widgets`\.\*\* Do it\./);
  assert.match(body, /--epic 7`/);
});
