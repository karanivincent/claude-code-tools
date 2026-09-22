// The unit gate on a real temp repository: a unit branch in its own worktree, a report, a branch
// capture written as the capture spec writes it, component tests at the branch head, and a stub
// runner for the unit check (the one command the gate runs itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { runUnitGate, unitGateStatus, unitGateStatusWith, commonDir, lastLines, testedBy, capturedBy, RENDER_EMPTY_ENV } from '../../lib/gate/unit.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import { planWith, row, writeCapture } from '../checks/helpers.mjs';

const GIT_ENV = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' };
const gitIn = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
const put = (abs, text) => { mkdirSync(join(abs, '..'), { recursive: true }); writeFileSync(abs, typeof text === 'string' ? text : `${JSON.stringify(text, null, 2)}\n`); };

const prop = (id, file, markers, cls = 'prop') => row(id, {
  reach: { class: cls, world: 'design', role: 'admin', steps: [], test: { file, name: 'renders the state' }, ...(cls === 'unseedable' ? { why: 'needs-live-call' } : {}) },
  markers: { text: markers.text, testids: markers.testids ?? [], forbidden: [] },
});

async function setup({ testFiles, captureLines }) {
  const repo = makeTempRepo({ files: { 'README.md': 'x', 'src/widgets/list.tsx': 'export {}\n' } });
  const wt = repo.addWorktree('u1', 'unit/u1');
  for (const [f, text] of Object.entries(testFiles)) put(join(wt, f), text);
  gitIn(wt, 'add', '-A');
  gitIn(wt, 'commit', '-q', '-m', 'unit work');
  const head = gitIn(wt, 'rev-parse', 'HEAD');

  const profile = makeProfile();
  const plan = planWith([
    row('WL-01', { markers: { text: ['Widgets'], testids: [], forbidden: [] } }),
    prop('WL-02', 'src/widgets/empty.test.tsx', { text: ['No widgets yet'], testids: ['widgets-empty'] }),
    prop('WL-03', 'src/widgets/live.test.tsx', { text: ['In a call'] }, 'unseedable'),
    prop('WL-04', 'src/widgets/weak.test.tsx', { text: ['Loading'] }),
  ]);
  plan.units[1].files = ['src/widgets/list.tsx'];
  const paths = featurePaths(repo.dir, 'widgets', profile.paths);
  put(paths.plan, plan);
  put(paths.unitReport('U1'), { schemaVersion: 1, unit: 'U1', branch: 'unit/u1', commits: [head], statesDone: ['WL-01', 'WL-02', 'WL-03', 'WL-04'], statesNotDone: [], testsAdded: Object.keys(testFiles), unitCheck: { command: 'npm test', exit: 0 }, decisions: [], looseEnds: [] });

  const calls = [];
  const rules = [{
    match: /^node scripts\/heavy\.mjs/,
    result: (call, text) => {
      calls.push({ text, empty: call.env?.[RENDER_EMPTY_ENV] === '1', cwd: call.cwd });
      if (call.env?.[RENDER_EMPTY_ENV] === '1') return { code: /weak\.test/.test(text) ? 0 : 1 };
      return { code: 0 };
    },
  }];
  const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile, rules, passthrough: ['git'] });
  const runCapture = async (c, opts) => {
    assert.equal(opts.mode, 'branch');
    assert.equal(opts.unit, 'U1');
    assert.deepEqual(opts.states, ['WL-01']);
    const capture = writeCapture(paths, { runId: 'c-20260115-2000-branch-U1', mode: 'branch', expectedSha: opts.sha, items: [{ state: 'WL-01', lines: captureLines }] });
    return { runId: capture.runId, capture, notReached: 0 };
  };
  return { repo, wt, head, ctx, paths, calls, runCapture };
}

const GOOD = {
  'src/widgets/empty.test.tsx': "it('renders', () => { expect(screen.getByText('No widgets yet')); expect(screen.getByTestId('widgets-empty')); });\n",
  'src/widgets/live.test.tsx': "it('renders', () => { expect(screen.getByText('In a call')); });\n",
  'src/widgets/weak.test.tsx': "it('renders', () => { render(<Loading />); /* 'Loading' */ });\n",
};

test('the gate: a leak in the capture, a test missing a marker, and a test that asserts nothing are all red', async () => {
  const s = await setup({ testFiles: { ...GOOD, 'src/widgets/live.test.tsx': "it('renders', () => {});\n" }, captureLines: ['Widgets', 'No orders yet on .'] });
  try {
    const r = await runUnitGate(s.ctx, 'U1', { runCapture: s.runCapture });
    const codes = r.failures.map((f) => f.code).sort();
    assert.deepEqual(codes, ['gate-component-test', 'gate-component-test', 'gate-finding']);
    assert.ok(r.failures.some((f) => /live\.test\.tsx does not assert "In a call"/.test(f.message)));
    assert.ok(r.failures.some((f) => /weak\.test\.tsx still passes when the component renders nothing/.test(f.message)));
    assert.ok(r.failures.some((f) => /P1 .* WL-01 .*leak-preposition-punctuation/.test(f.message)));
    assert.equal(r.head, s.head);
    const gateFile = JSON.parse(readFileSync(r.file, 'utf8'));
    assert.equal(gateFile.ok, false);
    assert.equal(gateFile.captureRunId, 'c-20260115-2000-branch-U1');
    // One unit check over the tests' directory, in the unit's worktree; one empty run per complete test.
    assert.equal(s.calls.filter((c) => !c.empty).length, 1);
    assert.match(s.calls[0].text, /vitest run src\/widgets/);
    assert.equal(s.calls[0].cwd, s.wt);
    assert.deepEqual(s.calls.filter((c) => c.empty).map((c) => /(\w+)\.test/.exec(c.text)[1]).sort(), ['empty', 'weak']);

    // The status, from files only: the same capture found by head SHA, the open finding, the missing marker.
    const st = await unitGateStatus(s.ctx, 'U1');
    assert.equal(st.ok, false);
    assert.deepEqual(st.failures.map((f) => f.code).sort(), ['gate-component-test', 'gate-finding']);
  } finally { s.repo.cleanup(); }
});

test('a clean unit is green, then red again once its branch moves past its gate capture', async () => {
  const s = await setup({ testFiles: GOOD, captureLines: ['Widgets', 'Two widgets'] });
  try {
    // The stub runner lets weak.test.tsx pass with an empty component: the only red line left.
    const r = await runUnitGate(s.ctx, 'U1', { runCapture: s.runCapture });
    assert.deepEqual(r.failures.map((f) => f.code), ['gate-component-test']);
    assert.match(r.failures[0].message, /weak\.test\.tsx/);
    const st = await unitGateStatus(s.ctx, 'U1');
    assert.deepEqual(st, { ok: true, failures: [] });

    put(join(s.wt, 'src/widgets/list.tsx'), 'export const x = 1;\n');
    gitIn(s.wt, 'commit', '-q', '-am', 'more work');
    const moved = await unitGateStatus(s.ctx, 'U1');
    assert.deepEqual(moved.failures.map((f) => f.code), ['gate-no-capture']);
  } finally { s.repo.cleanup(); }
});

test('no report, states not done, a failed unit check: red before anything runs', async () => {
  const s = await setup({ testFiles: GOOD, captureLines: ['Widgets'] });
  try {
    const report = JSON.parse(readFileSync(s.paths.unitReport('U1'), 'utf8'));
    put(s.paths.unitReport('U1'), { ...report, statesDone: ['WL-01'], statesNotDone: [{ id: 'WL-02', why: 'ran out of time' }], unitCheck: { command: 'npm test', exit: 1 } });
    const st = await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    const codes = st.failures.map((f) => f.code);
    assert.ok(codes.includes('gate-not-done'));
    assert.ok(codes.includes('gate-unit-check'));
    assert.ok(st.failures.some((f) => /WL-03 is owned by U1 but the report does not say it is done/.test(f.message)));
    await assert.rejects(unitGateStatus(s.ctx, 'U9'), /unit U9 is not in the plan/);
  } finally { s.repo.cleanup(); }
});

test('a unit check the unit file has since changed is named as stale, with the command to run now', async () => {
  const s = await setup({ testFiles: GOOD, captureLines: ['Widgets'] });
  try {
    const report = JSON.parse(readFileSync(s.paths.unitReport('U1'), 'utf8'));
    put(s.paths.unitReport('U1'), { ...report, unitCheck: { command: 'npx vitest run src/x.ts', exit: 1 } });

    // No unit file yet: the old wording, because there is nothing to compare against.
    let st = await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    let hit = st.failures.find((f) => f.code === 'gate-unit-check');
    assert.match(hit.message, /exited 1 \(npx vitest run src\/x\.ts\)/);

    // A unit file holding the SAME command: still the old wording.
    const unitFile = { schemaVersion: 1, unit: { id: 'U1', title: 'U1', issue: null, kind: 'screen', wave: 0, files: [], states: [], capabilities: [], risk: 'normal', model: 'sonnet' },
      rows: [], contracts: [], commands: { bootstrap: 'npm ci', unitCheck: 'npx vitest run src/x.ts' },
      baseRef: 'origin/main', branch: 'unit/u1', reportPath: s.paths.unitReport('U1'), flight: '', tried: '' };
    put(s.paths.unitFile('U1'), unitFile);
    st = await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    hit = st.failures.find((f) => f.code === 'gate-unit-check');
    assert.doesNotMatch(hit.message, /not the unit check any more/);

    // The unit file corrected since the builder ran: say so, and name what to run.
    put(s.paths.unitFile('U1'), { ...unitFile, commands: { ...unitFile.commands, unitCheck: 'cd app && npx vitest run x' } });
    st = await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    hit = st.failures.find((f) => f.code === 'gate-unit-check');
    assert.match(hit.message, /not the unit check any more/);
    assert.match(hit.message, /re-read your unit file and run "cd app && npx vitest run x"/);
  } finally { s.repo.cleanup(); }
});

test('a report the builder left in its own worktree is adopted, not treated as no report', async () => {
  const s = await setup({ testFiles: GOOD, captureLines: ['Widgets'] });
  try {
    const canonical = s.paths.unitReport('U1');
    const report = JSON.parse(readFileSync(canonical, 'utf8'));
    rmSync(canonical);
    assert.deepEqual((await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] })).failures.map((f) => f.code), ['gate-no-report']);

    // The same relative path, but inside the builder's own worktree.
    const wt = (await s.ctx.git.worktrees()).find((w) => w.path && w.path !== s.paths.repoRoot);
    assert.ok(wt, 'the fixture has a unit worktree');
    const stranded = join(wt.path, relative(s.paths.repoRoot, canonical));
    mkdirSync(dirname(stranded), { recursive: true });
    writeFileSync(stranded, JSON.stringify(report));

    const st = await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    assert.ok(!st.failures.some((f) => f.code === 'gate-no-report'), JSON.stringify(st.failures));
    assert.ok(existsSync(canonical), 'it is copied into place');
    assert.deepEqual(JSON.parse(readFileSync(canonical, 'utf8')).unit, 'U1');

    // A stale copy here and a further-along one there: the further-along one wins, because it
    // carries every commit this one does and more. A builder put an old report back exactly so.
    writeFileSync(canonical, JSON.stringify({ ...report, commits: report.commits.slice(0, 1), unitCheck: { command: 'x', exit: 1 } }));
    writeFileSync(stranded, JSON.stringify({ ...report, commits: [...report.commits, 'f'.repeat(40)] }));
    await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    assert.equal(JSON.parse(readFileSync(canonical, 'utf8')).commits.length, report.commits.length + 1);

    // Divergent rather than further along: left alone, so the gate fails on what is really here.
    writeFileSync(canonical, JSON.stringify({ ...report, commits: ['a'.repeat(40)] }));
    writeFileSync(stranded, JSON.stringify({ ...report, commits: ['b'.repeat(40), 'c'.repeat(40)] }));
    await unitGateStatusWith(s.ctx, 'U1', { validateCaptureItems: async () => [] });
    assert.deepEqual(JSON.parse(readFileSync(canonical, 'utf8')).commits, ['a'.repeat(40)]);
  } finally { s.repo.cleanup(); }
});

test('a failed command carries the last of what it printed into the failure', () => {
  assert.match(lastLines({ code: 1, stdout: '', stderr: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'scripts/delivery/unit-check.mjs'" }),
    /it ended with: Error \[ERR_MODULE_NOT_FOUND\]/);
  assert.equal(lastLines({ code: 1, stdout: '   \n\n', stderr: '' }), ' (it printed nothing)');
  assert.match(lastLines({ code: 1, stdout: 'a\nb\nc\nd\ne\n', stderr: '' }), /c \/ d \/ e$/);
});

test('helpers: common directory, which rows a capture or a component test verifies', () => {
  assert.equal(commonDir(['src/a/b/x.test.tsx', 'src/a/c/y.test.tsx']), 'src/a');
  assert.equal(commonDir(['x.ts']), '.');
  assert.equal(commonDir([]), '.');
  const rows = [row('WL-01'), row('WL-02', { reach: { class: 'action', world: 'design', role: 'admin', steps: [{ goto: '/w' }], intercept: { method: 'POST', url: '/api/w', status: 200, body: '{}' } } }), row('WL-03', { reach: { class: 'action', world: 'design', role: 'admin', steps: [] } })];
  assert.deepEqual(capturedBy(rows).map((r) => r.id), ['WL-01', 'WL-02']);
  assert.deepEqual(testedBy(rows).map((r) => r.id), ['WL-03']);
});

test('a screen unit whose registry still imports its stub is named as such, not left as four mystery P1s', async () => {
  const s = await setup({ testFiles: GOOD, captureLines: ['Widgets'] });
  try {
    // The registry the contract owns still points at the stub this unit replaces, so the capture
    // rendered the stub. The plan says so: the contract names the stub and this unit as a consumer.
    const plan = JSON.parse(readFileSync(s.paths.plan, 'utf8'));
    plan.contracts = [{ id: 'C-registry', file: 'src/widgets/registry.ts', stub: 'src/widgets/list.stub.tsx', consumers: ['U1', 'U2'] }];
    put(s.paths.plan, plan);
    put(join(s.wt, 'src/widgets/registry.ts'), "import { ListStub } from './list.stub';\nexport const List = ListStub;\n");
    put(join(s.wt, 'src/widgets/list.stub.tsx'), 'export const ListStub = () => null;\n');
    gitIn(s.wt, 'add', '-A');
    gitIn(s.wt, 'commit', '-q', '-m', 'registry');
    const head = gitIn(s.wt, 'rev-parse', 'HEAD');
    const report = JSON.parse(readFileSync(s.paths.unitReport('U1'), 'utf8'));
    put(s.paths.unitReport('U1'), { ...report, commits: [head] });

    const r = await runUnitGate(s.ctx, 'U1', { runCapture: async (c, o) => s.runCapture(c, { ...o, sha: head }) });
    const stub = r.failures.filter((f) => f.code === 'gate-stub-registered');
    assert.equal(stub.length, 1, JSON.stringify(r.failures, null, 1));
    assert.match(stub[0].message, /registry\.ts still imports src\/widgets\/list\.stub\.tsx/);
    assert.match(stub[0].message, /the capture rendered the stub/);
  } finally { s.repo.cleanup(); }
});

test('a unit branch behind its base is refused before the capture runs, not graded without its siblings', async () => {
  const s = await setup({ testFiles: GOOD, captureLines: ['Widgets'] });
  try {
    // The integration branch moves on (another unit of the wave merged); this unit's branch does
    // not. Its capture would serve a tree with neither that unit's words nor its routes.
    const plan = JSON.parse(readFileSync(s.paths.plan, 'utf8'));
    const unitFile = validExample('unit-file');
    put(s.paths.unitFile('U1'), { ...unitFile, unit: plan.units[1], rows: [], baseRef: 'main', branch: 'unit/u1' });
    put(join(s.repo.dir, 'sibling.txt'), 'merged by another unit\n');
    gitIn(s.repo.dir, 'add', '-A');
    gitIn(s.repo.dir, 'commit', '-q', '-m', 'sibling unit');

    let captured = false;
    const r = await runUnitGate(s.ctx, 'U1', { runCapture: async (...a) => { captured = true; return s.runCapture(...a); } });
    const behind = r.failures.filter((f) => f.code === 'gate-behind-base');
    assert.equal(behind.length, 1, JSON.stringify(r.failures, null, 1));
    assert.match(behind[0].message, /is behind main by 1 commit/);
    assert.match(behind[0].message, /Merge main into your branch/);
    assert.equal(captured, false, 'nothing is captured against a stale branch');

    // Once the unit has merged, its branch is behind by definition and never catches up. Saying so
    // every time would leave every merged unit of the run red for the rest of it.
    gitIn(s.repo.dir, 'merge', '--no-ff', '-m', 'merge U1', 'unit/u1');
    const after = await runUnitGate(s.ctx, 'U1', { runCapture: s.runCapture });
    assert.deepEqual(after.failures.filter((f) => f.code === 'gate-behind-base'), []);
  } finally { s.repo.cleanup(); }
});
