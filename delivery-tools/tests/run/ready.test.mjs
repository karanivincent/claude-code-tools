// ready (spec 4.6 step 8, 11.4, 11.6): `ready --pr N` recomputes and writes ready.json for the PR
// head SHA; `ready --check` proves, fast and without recomputing, that it is authentic, green, for
// the current head, and that nothing it read changed since.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import readyCommand from '../../lib/commands/ready.mjs';
import { checkReady, captureRunIdOf, sameSha } from '../../lib/run/ready.mjs';
import { computeReady, isStateRow, loopTestEvidence, readyCounts } from '../../lib/run/ready-compute.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { loadState, parseEvent } from '../../lib/core/state.mjs';
import { sha256File } from '../../lib/core/hash.mjs';
import { notImplementedError } from '../../lib/core/exit.mjs';
import { PASS } from '../../lib/core/gate.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { commitAll, ctxFor, gitIn, makeRunRepo, planWith, startRun, writeFiles } from './support.mjs';
import { sampleMap } from '../picture/map.test.mjs';

function greenDeps(head, over = {}) {
  return {
    ciStatus: async () => ({ state: 'green', headSha: head, detail: 'all required checks passed' }),
    resolvePreview: async () => ({ url: 'https://preview.example.invalid', pending: false, detail: '' }),
    probeServedSha: async () => head,
    findDupes: async () => [],
    latestCaptureRun: async (_c, { mode }) => (mode === 'full' ? 'c-full-1' : null),
    validateCaptureItems: async () => [{ state: 'WL-01', status: 'reached' }, { state: 'WL-02', status: 'reached' }],
    runChecks: async (_c, ids) => ({ findings: [], failures: [], ids }),
    spotRecapture: async () => PASS,
    readyBlockers: () => [],
    lateChanges: async () => [],
    refreshBaseline: async () => ({ added: [], unclassed: [] }),
    ...over,
  };
}

/** A run at phase pr in its integration worktree, with its draft PR at the worktree's HEAD and a full capture of it. */
async function fixture({ deps = {}, changed = {} } = {}) {
  const { repo, dir } = makeRunRepo({ worktree: true });
  writeFiles(dir, { 'docs/delivery/widgets/plan.json': planWith(), ...changed });
  const head = commitAll(dir, 'the feature');
  const paths = await startRun(dir, { phase: 'pr', wave: 2 });
  const t = await ctxFor(dir, { deps: greenDeps(head, deps) });
  const pr = await t.gh.prCreate({ title: 'Widgets', body: makeMarker({ feature: 'widgets', kind: 'pr' }), base: 'main', head: 'epic/101-widgets' });
  t.gh.setHead(pr.number, head);
  const capture = { ...validExample('capture'), runId: 'c-full-1', mode: 'full', expectedSha: head };
  await writeArtefact(paths, 'capture', capture, { key: 'c-full-1' });
  return { repo, dir, paths, head, pr: pr.number, ...t };
}

async function runReady(ctx, argv) {
  try {
    return ctx.out.finish(await readyCommand.run(ctx, argv));
  } catch (err) {
    if (typeof err.exit !== 'number') throw err;
    for (const f of err.failures) ctx.out.fail(f.code, f.message);
    return ctx.out.finish(err.exit);
  }
}

test('ready writes ready.json for the head SHA, records its hash, and --check then passes', async () => {
  const f = await fixture();
  try {
    const { ready, exit, digest } = await computeReady(f.ctx, { pr: f.pr });
    assert.equal(exit, 0, JSON.stringify(ready.checks.filter((c) => !c.ok)));
    assert.equal(ready.ok, true);
    assert.equal(ready.headSha, f.head);
    assert.deepEqual(validateAgainst('ready', JSON.parse(readFileSync(f.paths.ready, 'utf8'))).errors, []);
    assert.deepEqual(ready.checks.map((c) => c.id), ['baseline-refresh', 'head', 'ci', 'preview', 'served-sha', 'dupes', 'scope', 'loop-test', 'capture', 'checks', 'spot', 'severity']);
    assert.equal(captureRunIdOf(ready), 'c-full-1');
    assert.equal(digest, await sha256File(f.paths.ready));
    const state = await loadState(f.paths.state);
    assert.deepEqual(state.readyRecords.map((r) => [r.sha, r.ok, r.readySha256]), [[f.head, true, digest]]);
    assert.equal(state.pr, f.pr);
    const last = state.journal.at(-1);
    assert.deepEqual(parseEvent(last.event), { command: 'ready', exit: 0, counts: { sha: f.head, ok: 'true', red: '0' } });
    assert.equal(last.outputs, digest);
    assert.deepEqual(await checkReady(f.ctx, { pr: f.pr }), { ok: true, failures: [], headSha: f.head });
    assert.equal(await runReady(f.ctx, ['--check', '--pr', String(f.pr)]), 0);
    assert.match(f.stdout.text(), /ready\.json is green for PR #\d+ at [0-9a-f]{12}, and nothing changed since/);
  } finally { f.repo.cleanup(); }
});

test('ready --check refuses a missing, stale-head, changed-input or red ready.json', async () => {
  const f = await fixture();
  try {
    const missing = await checkReady(f.ctx, { pr: f.pr });
    assert.deepEqual(missing.failures.map((x) => x.code), ['ready-missing']);
    assert.equal(missing.exit, 1);

    await computeReady(f.ctx, { pr: f.pr });
    f.gh.setHead(f.pr, 'f'.repeat(40));
    const stale = await checkReady(f.ctx, { pr: f.pr });
    assert.equal(stale.ok, false);
    assert.match(stale.failures[0].message, /^ready\.json is for [0-9a-f]{12}, but PR #\d+ is at ffffffffffff; run delivery ready --pr \d+$/);
    f.gh.setHead(f.pr, f.head);

    const plan = planWith();
    plan.rows[0].invariants.push('one more invariant written after ready');
    writeFileSync(f.paths.plan, JSON.stringify(plan, null, 2) + '\n');
    const changed = await checkReady(f.ctx, { pr: f.pr });
    assert.deepEqual(changed.failures.map((x) => x.code), ['ready-stale']);
    assert.match(changed.failures[0].message, /^plan changed since ready\.json was written/);
    writeFileSync(f.paths.plan, JSON.stringify(planWith(), null, 2) + '\n');
    assert.equal((await checkReady(f.ctx, { pr: f.pr })).ok, true);

    const capturePath = join(f.paths.captures, 'c-full-1', 'capture.json');
    const cap = JSON.parse(readFileSync(capturePath, 'utf8'));
    cap.items[0].why = 'edited to add a marker';
    writeFileSync(capturePath, JSON.stringify(cap, null, 2) + '\n');
    assert.match((await checkReady(f.ctx, { pr: f.pr })).failures[0].message, /^capture changed since ready\.json/);
  } finally { f.repo.cleanup(); }
});

test('a red ready.json is refused, and says which checks are red', async () => {
  const f = await fixture({ deps: { ciStatus: async () => ({ state: 'red', headSha: null, detail: 'lint failed' }) } });
  try {
    const { ready, exit } = await computeReady(f.ctx, { pr: f.pr });
    assert.equal(ready.ok, false);
    assert.equal(exit, 1);
    const r = await checkReady(f.ctx, { pr: f.pr });
    assert.deepEqual(r.failures.map((x) => x.code), ['ready-red']);
    assert.match(r.failures[0].message, /ci \(CI is red on [0-9a-f]{12}: lint failed\)/);
    assert.equal((await loadState(f.paths.state)).readyRecords.at(-1).ok, false);
  } finally { f.repo.cleanup(); }
});

test('a hand-written ready.json has no effect: its hash is in no journal entry (exit 5)', async () => {
  const f = await fixture();
  try {
    await computeReady(f.ctx, { pr: f.pr });
    const forged = JSON.parse(readFileSync(f.paths.ready, 'utf8'));
    forged.generatedAt = '2026-01-16T09:00:00.000Z';
    writeFileSync(f.paths.ready, JSON.stringify(forged, null, 2) + '\n');
    const r = await checkReady(f.ctx, { pr: f.pr });
    assert.equal(r.exit, 5);
    assert.deepEqual(r.failures.map((x) => x.code), ['ready-unrecorded']);
    writeFileSync(f.paths.ready, '{ not json');
    assert.equal((await checkReady(f.ctx, { pr: f.pr })).exit, 5);
    writeFileSync(f.paths.ready, JSON.stringify({ schemaVersion: 1, ok: true }));
    assert.deepEqual((await checkReady(f.ctx, { pr: f.pr })).failures.map((x) => x.code), ['ready-invalid']);
  } finally { f.repo.cleanup(); }
});

test('after the merge the input hashes are history: --check compares authenticity, green and head only', async () => {
  const f = await fixture();
  try {
    await computeReady(f.ctx, { pr: f.pr });
    f.gh.merge(f.pr);
    writeFileSync(f.paths.findings, JSON.stringify(validExample('findings'), null, 2) + '\n');
    assert.deepEqual(await checkReady(f.ctx, { pr: f.pr }), { ok: true, failures: [], headSha: f.head });
    assert.equal(await runReady(f.ctx, ['--pr', String(f.pr)]), 2);
    assert.match(f.stdout.text(), /is merged; ready applies before the merge/);
  } finally { f.repo.cleanup(); }
});

test('pending CI or preview is exit 4; a slice that cannot answer is exit 2; neither is ever green', async () => {
  const f = await fixture({ deps: { ciStatus: async (_c, { wait }) => { assert.equal(wait, false); return { state: 'pending', headSha: null, detail: '2 running' }; } } });
  try {
    const { ready, exit } = await computeReady(f.ctx, { pr: f.pr });
    assert.equal(exit, 4);
    assert.equal(ready.checks.find((c) => c.id === 'ci').ok, false);
  } finally { f.repo.cleanup(); }
  const g = await fixture({ deps: { runChecks: async () => { throw notImplementedError('B1', 'runChecks'); }, spotRecapture: async () => { throw new TypeError('boom'); } } });
  try {
    const { ready, exit } = await computeReady(g.ctx, { pr: g.pr });
    assert.equal(exit, 2);
    assert.equal(ready.ok, false);
    assert.equal(ready.checks.find((c) => c.id === 'checks').detail, 'not implemented (slice B1): runChecks');
    assert.equal(ready.checks.find((c) => c.id === 'spot').detail, 'internal: boom');
  } finally { g.repo.cleanup(); }
});

test('runChecks asking for exit 3 is blocked on the founder and 5 an inconsistency; neither is ever green', async () => {
  const blocked = { findings: [], failures: [{ code: 'M13', message: 'P2: the safety file is missing' }], hints: [], notes: ['M13 refused the seed plan'], exit: 3 };
  const f = await fixture({ deps: { runChecks: async () => blocked } });
  try {
    const { ready, exit, notes } = await computeReady(f.ctx, { pr: f.pr });
    assert.equal(exit, 3);
    assert.equal(ready.ok, false);
    assert.equal(ready.checks.find((c) => c.id === 'checks').detail, '1 check failure(s): M13 P2: the safety file is missing; exit 3, blocked on the founder');
    assert.deepEqual(notes, ['M13 refused the seed plan']);
    assert.deepEqual((await checkReady(f.ctx, { pr: f.pr })).failures.map((x) => x.code), ['ready-red']);
    assert.equal(await runReady(f.ctx, ['--pr', String(f.pr)]), 3);
    assert.match(f.stdout.text(), /^FAIL checks 1 check failure\(s\): M13 P2: the safety file is missing; exit 3, blocked on the founder$/m);
    assert.match(f.stdout.text(), /^note: M13 refused the seed plan$/m);
  } finally { f.repo.cleanup(); }
  const g = await fixture({ deps: { runChecks: async () => ({ findings: [], failures: [], hints: [], notes: [], exit: 5 }) } });
  try {
    const { ready, exit } = await computeReady(g.ctx, { pr: g.pr });
    assert.equal(exit, 5, 'an exit with no failure line still counts');
    assert.equal(ready.ok, false);
    assert.equal(ready.checks.find((c) => c.id === 'checks').detail, 'no failure line; exit 5, inconsistency');
  } finally { g.repo.cleanup(); }
  const h = await fixture({ deps: { runChecks: async () => ({ findings: [], failures: [], hints: [{ id: 'x' }], notes: [], exit: 0 }), spotRecapture: async () => ({ ok: true, failures: [], exit: 5 }) } });
  try {
    const { ready, exit } = await computeReady(h.ctx, { pr: h.pr });
    assert.equal(ready.checks.find((c) => c.id === 'checks').detail, '17 checks ran; 0 finding(s) recorded; 1 advisory hint(s)');
    assert.equal(ready.checks.find((c) => c.id === 'spot').ok, false, 'a spot result that says ok with exit 5 is not green');
    assert.equal(exit, 5);
  } finally { h.repo.cleanup(); }
});

test('a version route that answers only a signed-in session is proven by the full capture, which signed in', async () => {
  // A version route behind sign-in redirects a signed-out caller to /login, so ready's own probe could never
  // answer and ready could never be green. The full capture of the head read the served SHA on every
  // item after signing in; that is the proof, provided no item saw another build.
  const f = await fixture({ deps: {
    probeServedSha: async () => null,
    validateCaptureItems: async () => [{ state: 'WL-01', status: 'reached', servedSha: 'x' }, { state: 'WL-02', status: 'reached', servedSha: 'x' }],
  } });
  try {
    f.ctx.deps.validateCaptureItems = async () => [{ state: 'WL-01', status: 'reached', servedSha: f.head }, { state: 'WL-02', status: 'reached', servedSha: f.head }];
    const { ready } = await computeReady(f.ctx, { pr: f.pr });
    const served = ready.checks.find((c) => c.id === 'served-sha');
    assert.equal(served.ok, true, served.detail);
    assert.match(served.detail, /c-full-1 signed in and saw the head .* on 2 item/);

    f.ctx.deps.validateCaptureItems = async () => [{ state: 'WL-01', status: 'reached', servedSha: f.head }, { state: 'WL-02', status: 'reached', servedSha: 'b'.repeat(40) }];
    const mixed = (await computeReady(f.ctx, { pr: f.pr })).ready.checks.find((c) => c.id === 'served-sha');
    assert.equal(mixed.ok, false, 'one item served by another build proves nothing');

    f.ctx.deps.validateCaptureItems = async () => [{ state: 'WL-01', status: 'reached', servedSha: null }];
    const none = (await computeReady(f.ctx, { pr: f.pr })).ready.checks.find((c) => c.id === 'served-sha');
    assert.equal(none.ok, false);
    assert.match(none.detail, /unproven/);
  } finally { f.repo.cleanup(); }
});

test('ready is red when the capture is of another SHA, a state is not reached, or HEAD is not the PR head', async () => {
  const f = await fixture({ deps: { validateCaptureItems: async () => [{ state: 'WL-01', status: 'not-reached', why: 'forbidden marker present' }] } });
  try {
    const { ready } = await computeReady(f.ctx, { pr: f.pr });
    assert.match(ready.checks.find((c) => c.id === 'capture').detail, /^1 of 1 item\(s\) re-validate as not reached: WL-01 \(forbidden marker present\)/);
    assert.equal(ready.counts.notReached, 1);
    writeFiles(f.dir, { 'README.md': 'changed and not committed\n' });
    const dirty = await computeReady(f.ctx, { pr: f.pr });
    assert.match(dirty.ready.checks.find((c) => c.id === 'head').detail, /^tracked files are changed and not committed/);
    gitIn(f.dir, 'checkout', '--', 'README.md');
    f.gh.setHead(f.pr, 'a'.repeat(40));
    const other = await computeReady(f.ctx, { pr: f.pr });
    assert.match(other.ready.checks.find((c) => c.id === 'capture').detail, /^capture c-full-1 is of [0-9a-f]{12}, not the head aaaaaaaaaaaa/);
    assert.match(other.ready.checks.find((c) => c.id === 'head').detail, /is not the PR head aaaaaaaaaaaa; push/);
  } finally { f.repo.cleanup(); }
});

test('the loop test runs once per head when a changed path matches loopTest.when; exit 6 is owed after the merge', async () => {
  const f = await fixture({ changed: { 'apps/server/src/call.ts': 'export const call = 1;\n' } });
  try {
    let code = 0;
    f.runner.rules.push({ match: /^node scripts\/loop-test\.mjs --issue 101 --pr \d+$/, result: () => ({ code }) });
    const first = await computeReady(f.ctx, { pr: f.pr });
    assert.equal(first.ready.checks.find((c) => c.id === 'loop-test').ok, true);
    const runs = () => f.runner.texts().filter((t) => t.startsWith('node scripts/loop-test.mjs')).length;
    assert.equal(runs(), 1);
    await computeReady(f.ctx, { pr: f.pr });
    assert.equal(runs(), 1, 'a pass for this head is not dialled again');
    assert.deepEqual(loopTestEvidence((await loadState(f.paths.state)).journal, f.head), { exit: 0, at: '2026-01-15T20:00:00.000Z' });
  } finally { f.repo.cleanup(); }
  const g = await fixture({ changed: { 'apps/server/src/call.ts': 'export const call = 1;\n' } });
  try {
    g.runner.rules.push({ match: /^node scripts\/loop-test\.mjs/, result: { code: 6 } });
    const { ready } = await computeReady(g.ctx, { pr: g.pr });
    assert.equal(ready.checks.find((c) => c.id === 'loop-test').ok, true);
    assert.deepEqual(ready.owedAfterMerge, ['loop test: the preview cannot be dialled while the inbound leg routes to staging; land runs it on staging (node scripts/loop-test.mjs --issue 101)']);
    g.runner.rules.unshift({ match: /^node scripts\/loop-test\.mjs/, result: { code: 4 } });
    g.gh.setHead(g.pr, 'b'.repeat(40));
    assert.equal((await computeReady(g.ctx, { pr: g.pr })).ready.checks.find((c) => c.id === 'loop-test').ok, false);
  } finally { g.repo.cleanup(); }
});

test('a changed file in an out-of-scope page is red; an in-scope page and a shared component are not', async () => {
  const intent = {
    ...validExample('intent'),
    inScope: [{ screen: 'Calls', routes: ['/dashboard/calls'], designScreens: ['calls'] }],
    outOfScope: [{ screen: 'Scripts', why: 'in the export for context only', designScreens: ['scripts'], routes: ['/dashboard/scripts', '/dashboard/scripts/[id]'] }],
  };
  const f = await fixture({ changed: {
    'docs/delivery/widgets/intent.json': JSON.stringify(intent),
    'apps/web/src/app/[locale]/dashboard/calls/page.tsx': 'export default function P() { return null; }\n',
    'apps/web/src/components/shared/sidebar.tsx': 'export const s = 1;\n',
    'apps/web/src/app/[locale]/dashboard/scripts/[id]/_parts/tabs.tsx': 'export const t = 1;\n',
  } });
  try {
    const { ready } = await computeReady(f.ctx, { pr: f.pr });
    const scope = ready.checks.find((c) => c.id === 'scope');
    assert.equal(scope.ok, false);
    assert.match(scope.detail, /^1 changed file\(s\) belong to out-of-scope pages; revert them, or put the screen in scope and plan it: apps\/web\/src\/app\/\[locale\]\/dashboard\/scripts\/\[id\]\/_parts\/tabs\.tsx \(Scripts\)$/);
  } finally { f.repo.cleanup(); }
  const g = await fixture({ changed: {
    'docs/delivery/widgets/intent.json': JSON.stringify(intent),
    'apps/web/src/app/[locale]/dashboard/calls/page.tsx': 'export default function P() { return null; }\n',
  } });
  try {
    const scope = (await computeReady(g.ctx, { pr: g.pr })).ready.checks.find((c) => c.id === 'scope');
    assert.equal(scope.ok, true, scope.detail);
    assert.match(scope.detail, /no changed file belongs to an out-of-scope page \(Scripts\)/);
  } finally { g.repo.cleanup(); }
});

test('ready --check is fast: one GitHub read, no other slice called, nothing recomputed', async () => {
  const f = await fixture();
  try {
    await computeReady(f.ctx, { pr: f.pr });
    const trap = Object.fromEntries(Object.keys(greenDeps(f.head)).map((k) => [k, () => { throw new Error(`${k} called by --check`); }]));
    f.ctx.deps = trap;
    let reads = 0;
    const prGet = f.gh.prGet;
    f.gh.prGet = async (n) => { reads++; return prGet(n); };
    const before = f.runner.calls.length;
    const t0 = performance.now();
    assert.equal((await checkReady(f.ctx, { pr: f.pr })).ok, true);
    assert.ok(performance.now() - t0 < 500);
    assert.equal(reads, 1);
    assert.equal(f.runner.calls.length, before, 'no process started');
  } finally { f.repo.cleanup(); }
});

test('counts come from the plan, the findings and the capture verdicts', () => {
  const counts = readyCounts(planWith(), validExample('findings'), [{ status: 'reached' }, { status: 'not-reached' }]);
  assert.deepEqual(counts, { statesBuilt: 2, cut: 1, adapted: 0, invented: 0, removed: 0, acceptedP2: 1, p3Filed: 0, notReached: 1, propOrUnseedable: 1, reAudits: validExample('findings').findings.reduce((n, x) => n + x.reAudits, 0) });
  assert.equal(isStateRow({ id: 'CAP-001' }), false);
  assert.equal(isStateRow({ id: 'WL-01' }), true);
  assert.equal(sameSha('abcdef1', 'abcdef1234'), true);
  assert.equal(sameSha('abc', 'abc'), false);
});

/** Picture-mode rounds: { n: { STATE: verdict } }, each pictured, with a compiled review.json. */
function writeRounds(paths, rounds) {
  for (const [n, states] of Object.entries(rounds)) {
    const dir = join(paths.runDir, 'rounds', n);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'shoot.json'), JSON.stringify({ states: {} }));
    const doc = { states: Object.fromEntries(Object.entries(states).map(([id, verdict]) => [id, { verdict }])) };
    writeFileSync(join(dir, 'review.json'), JSON.stringify(doc));
  }
}

const PICTURE_RUN = { 'docs/delivery/widgets/map.json': JSON.stringify(sampleMap({ feature: 'widgets' })) };

test('picture mode: ready proves the page with its rounds, not a full capture or an audit', async () => {
  const f = await fixture({ changed: PICTURE_RUN });
  try {
    // Round 3 re-shoots two states; KC-06 keeps round 2's verdict. One state is still open after
    // the fix rounds are spent, which is the founder's list, not a red ready.
    writeRounds(f.paths, {
      1: { 'KC-05': 'must', 'KC-06': 'must', 'KC-07': 'match' },
      2: { 'KC-05': 'must', 'KC-06': 'small', 'KC-07': 'match' },
      3: { 'KC-05': 'must', 'KC-06': 'not-shot', 'KC-07': 'match' },
    });
    const { ready, exit } = await computeReady(f.ctx, { pr: f.pr });
    assert.equal(exit, 0, JSON.stringify(ready.checks.filter((c) => !c.ok)));
    assert.deepEqual(ready.checks.map((c) => c.id), ['baseline-refresh', 'head', 'ci', 'preview', 'dupes', 'scope', 'loop-test', 'pictures']);
    const pictures = ready.checks.find((c) => c.id === 'pictures');
    assert.match(pictures.detail, /3 state\(s\): 1 match, 1 small differences, every pictured state reached; 1 still open after 3 rounds/);
  } finally { f.repo.cleanup(); }
});

test('picture mode: no round, open states with fix rounds left, an unreached newest picture, or an uncompiled round are red', async () => {
  const f = await fixture({ changed: PICTURE_RUN });
  try {
    const pictures = async () => {
      const { ready, exit } = await computeReady(f.ctx, { pr: f.pr });
      assert.equal(exit, 1);
      return ready.checks.find((c) => c.id === 'pictures');
    };
    assert.match((await pictures()).detail, /no picture round yet/);
    writeRounds(f.paths, { 1: { 'KC-05': 'must', 'KC-07': 'match' } });
    assert.match((await pictures()).detail, /1 state\(s\) still to fix and 2 fix round\(s\) left: KC-05 \(round 1\)/);
    writeRounds(f.paths, { 2: { 'KC-05': 'not-reached', 'KC-07': 'match' } });
    assert.match((await pictures()).detail, /newest picture was not reached: KC-05 \(round 2\)/);
    const three = join(f.paths.runDir, 'rounds', '3');
    mkdirSync(three, { recursive: true });
    writeFileSync(join(three, 'shoot.json'), '{}');
    writeFileSync(join(three, 'review-to-check.md'), 'KC-05 matches');
    assert.match((await pictures()).detail, /round 3 is pictured but its reviews are not compiled: delivery review --round 3/);
  } finally { f.repo.cleanup(); }
});
