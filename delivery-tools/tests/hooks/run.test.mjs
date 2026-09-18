// The hooks bind during a run (spec 11.4, 20.2 row "Hooks"), end to end through the shipped
// scripts and bin/delivery.mjs: gh pr ready refused with no ready.json, a stale head SHA or a red
// check, allowed when green; a raw seed refused; a subagent's browser call refused. External
// commands go through DELIVERY_RUNNER_STUB: real git on the temp repository, a JSON GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeReady } from '../../lib/run/ready-compute.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import { PASS } from '../../lib/core/gate.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { BRANCH, commitAll, ctxFor, makeRunRepo, planWith, startRun, writeFiles } from '../run/support.mjs';
import { STUB, bashPayload, browserPayload, hook, startPayload } from './support.mjs';

const greenDeps = (head, over = {}) => ({
  ciStatus: async () => ({ state: 'green', headSha: head, detail: '' }),
  resolvePreview: async () => ({ url: 'https://preview.example.invalid', pending: false, detail: '' }),
  probeServedSha: async () => head,
  findDupes: async () => [],
  latestCaptureRun: async () => 'c-full-1',
  validateCaptureItems: async () => [{ state: 'WL-01', status: 'reached' }],
  runChecks: async () => ({ findings: [], failures: [] }),
  spotRecapture: async () => PASS,
  readyBlockers: () => [],
  lateChanges: async () => [],
  ...over,
});

/** A run at phase pr with PR #1 at the integration head, the JSON GitHub the scripts will see. */
async function runWithPr() {
  const { repo, dir } = makeRunRepo({ worktree: true });
  writeFiles(dir, { 'docs/delivery/widgets/plan.json': planWith() });
  const head = commitAll(dir, 'the feature');
  const paths = await startRun(dir, { phase: 'pr', wave: 2, pr: 1 });
  await writeArtefact(paths, 'capture', { ...validExample('capture'), runId: 'c-full-1', mode: 'full', expectedSha: head }, { key: 'c-full-1' });
  const ghFile = join(dir, '..', `gh-world-${Math.random().toString(36).slice(2, 8)}.json`);
  const setWorld = (headSha) => writeFileSync(ghFile, JSON.stringify({
    prs: {
      1: {
        number: 1, title: 'Widgets', body: makeMarker({ feature: 'widgets', kind: 'pr' }), state: 'OPEN', isDraft: true,
        headRefName: BRANCH, headRefOid: headSha, baseRefName: 'main', mergeable: 'MERGEABLE', labels: [],
        url: 'https://github.invalid/example-org/example-repo/pull/1', mergedAt: null, mergeCommit: null,
      },
    },
  }));
  setWorld(head);
  const env = { DELIVERY_RUNNER_STUB: STUB, DELIVERY_TEST_GH: ghFile };
  /** ready.json from the real writer, in-process, against an in-memory GitHub with the same PR. */
  const writeReady = async (over = {}) => {
    const t = await ctxFor(dir, { deps: greenDeps(head, over) });
    const pr = await t.gh.prCreate({ title: 'Widgets', body: makeMarker({ feature: 'widgets', kind: 'pr' }), base: 'main', head: BRANCH });
    t.gh.setHead(pr.number, head);
    return computeReady(t.ctx, { pr: pr.number });
  };
  return { repo, dir, head, env, setWorld, writeReady };
}

test('gh pr ready for the run PR: refused with no ready.json, allowed when green, refused on a stale head', async () => {
  const r = await runWithPr();
  try {
    const none = hook('pre-bash', bashPayload(r.dir, 'gh pr ready 1'), { cwd: r.dir, env: r.env });
    assert.equal(none.code, 2, none.stderr);
    assert.match(none.stderr, /^delivery: refused "gh pr ready 1"\.$/m);
    assert.match(none.stderr, /ready-missing: no ready\.json for PR #1/);

    const { ready } = await r.writeReady();
    assert.equal(ready.ok, true, JSON.stringify(ready.checks));
    const green = hook('pre-bash', bashPayload(r.dir, 'gh pr ready 1'), { cwd: r.dir, env: r.env });
    assert.equal(green.code, 0, green.stderr);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'git push origin HEAD && gh pr ready'), { cwd: r.dir, env: r.env }).code, 0);

    r.setWorld('f'.repeat(40));
    const stale = hook('pre-bash', bashPayload(r.dir, `gh pr ready https://github.invalid/example-org/example-repo/pull/1`), { cwd: r.dir, env: r.env });
    assert.equal(stale.code, 2);
    assert.match(stale.stderr, /ready-stale: ready\.json is for [0-9a-f]{12}, but PR #1 is at ffffffffffff/);
    const api = hook('pre-bash', bashPayload(r.dir, `gh api graphql -f query='mutation { markPullRequestReadyForReview(input: {pullRequestId: "PR_x"}) { clientMutationId } }'`), { cwd: r.dir, env: r.env });
    assert.equal(api.code, 2, 'the raw API form is checked against the run PR too');
  } finally { r.repo.cleanup(); }
});

test('gh pr ready is refused while ready.json is red, and allowed for a PR that is not the run\'s', async () => {
  const r = await runWithPr();
  try {
    const { ready } = await r.writeReady({ readyBlockers: () => [{ code: 'P1', message: '2 open P1 findings' }] });
    assert.equal(ready.ok, false);
    const red = hook('pre-bash', bashPayload(r.dir, 'gh pr ready 1'), { cwd: r.dir, env: r.env });
    assert.equal(red.code, 2);
    assert.match(red.stderr, /ready-red: ready\.json is red for [0-9a-f]{12}: severity \(1 blocker\(s\): 2 open P1 findings\)/);
    assert.match(red.stderr, /until it is green; the hook is right until it is\./);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'gh pr ready 99'), { cwd: r.dir, env: r.env }).code, 0);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'gh pr ready --undo 1'), { cwd: r.dir, env: r.env }).code, 0);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'git commit -m "gh pr ready 1 once green"'), { cwd: r.dir, env: r.env }).code, 0);
  } finally { r.repo.cleanup(); }
});

test('a raw seed command is refused during a run; delivery seed is not', async () => {
  const r = await runWithPr();
  try {
    const raw = hook('pre-bash', bashPayload(r.dir, 'node scripts/fixtures/seed-widgets-design.mjs'), { cwd: r.dir, env: r.env });
    assert.equal(raw.code, 2);
    assert.match(raw.stderr, /refused a raw seed command while the delivery run widgets is active: node scripts\/fixtures\/seed-widgets-design\.mjs/);
    assert.match(raw.stderr, /Only delivery seed writes fixture rows/);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'pnpm --filter web run db:seed'), { cwd: r.dir, env: r.env }).code, 2);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'node scripts/delivery.mjs seed --apply'), { cwd: r.dir, env: r.env }).code, 0);
    assert.equal(hook('pre-bash', bashPayload(r.dir, 'grep -rn seed scripts/'), { cwd: r.dir, env: r.env }).code, 0);
  } finally { r.repo.cleanup(); }
});

test('a browser call carrying an agent_id is refused during a run; the main session\'s is not', async () => {
  const r = await runWithPr();
  try {
    const sub = hook('pre-browser', browserPayload(r.dir, 'agent-7f3a'), { cwd: r.dir, env: r.env });
    assert.equal(sub.code, 2);
    assert.match(sub.stderr, /mcp__claude-in-chrome__navigate refused for subagent agent-7f3a: the delivery run widgets is active/);
    assert.equal(hook('pre-browser', browserPayload(r.dir), { cwd: r.dir, env: r.env }).code, 0);
    assert.equal(hook('pre-browser', browserPayload(r.dir, null), { cwd: r.dir, env: r.env }).code, 0);
    assert.equal(hook('pre-browser', browserPayload(r.dir, ''), { cwd: r.dir, env: r.env }).code, 0);
    // From another worktree of the same repository, the run is still active.
    assert.equal(hook('pre-browser', browserPayload(r.repo.dir, 'agent-9'), { cwd: r.repo.dir, env: r.env }).code, 2);
  } finally { r.repo.cleanup(); }
});

test('SessionStart prints the run\'s brief status with exactly one NEXT line, and exits 0', async () => {
  const { repo, dir } = makeRunRepo({ worktree: true });
  try {
    await startRun(dir, { phase: 'intake' });
    const ghFile = join(dir, '..', 'gh-empty.json');
    writeFileSync(ghFile, JSON.stringify({ prs: {} }));
    const r = hook('session-start', startPayload(dir), { cwd: dir, env: { DELIVERY_RUNNER_STUB: STUB, DELIVERY_TEST_GH: ghFile } });
    assert.equal(r.code, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.match(lines[0], /^delivery: a delivery run is active in this repository\. To resume, do NEXT; if memory and NEXT disagree, NEXT wins\.$/);
    assert.match(lines[1], /^run widgets \(r-20260115-2000-ab12\) in .* on epic\/101-widgets$/);
    assert.equal(lines.filter((l) => l.startsWith('NEXT:')).length, 1, r.stdout);
    assert.ok(lines.length <= 13, r.stdout);
  } finally { repo.cleanup(); }
});
