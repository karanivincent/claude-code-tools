// Resume (spec 11.3, 20.2 row "Resume"): on a repository killed mid-wave, status prints the right
// NEXT and never dispatches a finished unit again. Real git: an integration worktree, unit branches
// cut from it, two merged with --no-ff, one builder that died with commits, one never started.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import status from '../../lib/commands/status.mjs';
import { recordDispatch, clearDispatch } from '../../lib/run/inflight.mjs';
import { classifyUnit, mergedInJournal, redReadyHeadsSincePr, unitStatuses } from '../../lib/run/resume.mjs';
import { loadState, parseEvent } from '../../lib/core/state.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { PASS } from '../../lib/core/gate.mjs';
import { BRANCH, commitAll, ctxFor, gitIn, greenGates, makeRunRepo, nextLines, planWith, startRun, unit, unitFile, unitReport, writeFiles } from './support.mjs';

const UNITS = [unit('U1', 0), unit('U2', 1), unit('U3', 1), unit('U4', 1), unit('U5', 1), unit('U6', 1)];
const ub = (id) => `${BRANCH}-${id}`;
const rel = (id, ext = 'json') => `.delivery/widgets/units/${id}.${ext}`;

/** A unit branch cut from the integration branch with n commits, made in its own worktree, as a builder would. */
function builderBranch(dir, id, n) {
  const path = join(dir, '..', `builder-${id}-${Math.random().toString(36).slice(2, 7)}`);
  gitIn(dir, 'worktree', 'add', '-q', '-b', ub(id), path, 'HEAD');
  for (let i = 0; i < n; i++) { writeFiles(path, { [`apps/web/src/widgets/${id}-${i}.tsx`]: `export const x${i} = ${i};\n` }); commitAll(path, `${id} step ${i}`); }
  gitIn(dir, 'worktree', 'remove', '--force', path);
  return path;
}

async function killedMidWave() {
  const { repo, dir } = makeRunRepo({ worktree: true });
  const paths = await startRun(dir, { phase: 'build', wave: 1, pr: null });
  await writeArtefact(paths, 'plan', planWith(UNITS));
  commitAll(dir, 'plan');
  // Wave 0: U1 built and merged.
  builderBranch(dir, 'U1', 1);
  gitIn(dir, 'merge', '--no-ff', '-q', '-m', 'merge U1', ub('U1'));
  // Wave 1: U6 merged; U2 finished with a report; U3 died with two commits; U4 recorded, never started; U5 not dispatched.
  builderBranch(dir, 'U6', 1);
  gitIn(dir, 'merge', '--no-ff', '-q', '-m', 'merge U6', ub('U6'));
  builderBranch(dir, 'U2', 1);
  builderBranch(dir, 'U3', 2);
  for (const u of UNITS) await writeArtefact(paths, 'unit-file', unitFile(u, ub(u.id), rel(u.id, 'report.json')), { key: u.id });
  for (const id of ['U1', 'U2', 'U6']) writeFiles(dir, { [rel(id, 'report.json')]: unitReport(id, ub(id)) });
  const { ctx } = await ctxFor(dir);
  for (const id of ['U2', 'U3', 'U4', 'U6']) {
    await recordDispatch(ctx, { unit: id, agent: 'delivery-builder', branch: ub(id), brief: rel(id), report: rel(id, 'report.json') });
  }
  return { repo, dir, paths };
}

async function statusOf(cwd, deps, argv = []) {
  const t = await ctxFor(cwd, { deps });
  const code = await status.run(t.ctx, argv);
  return { code: t.ctx.out.finish(code), text: t.stdout.text() };
}

// One repository killed mid-wave serves the next four tests, which run in order: the read-only
// ones first, then the ones that move it on.
let k;
before(async () => { k = await killedMidWave(); });
after(() => k?.repo.cleanup());
const passing = () => greenGates({ unitGateStatus: async () => PASS });

test('status from another worktree finds the run and says where to work; --brief stays within 12 lines', async () => {
  const r = await statusOf(k.repo.dir, passing(), ['--brief']);
  const lines = r.text.trim().split('\n');
  assert.ok(lines.length <= 12, r.text);
  const next = nextLines(r.text);
  assert.equal(next.length, 1);
  assert.ok(next[0].startsWith(`NEXT: in ${k.dir} (the run's worktree: enter it with EnterWorktree first), dispatch builders in parallel for U3`), next[0]);
});

test('unitStatuses reads git and files only: merged by --no-ff, reported, died, dispatched, pending', async () => {
  const { ctx } = await ctxFor(k.dir);
  const state = await loadState(k.paths.state);
  const got = Object.fromEntries((await unitStatuses(ctx, state, planWith(UNITS), { gates: false })).map((u) => [u.unit, [u.status, u.ahead]]));
  assert.deepEqual(got, { U1: ['merged', 0], U2: ['reported', 1], U3: ['died', 2], U4: ['dispatched', 0], U5: ['pending', 0], U6: ['merged', 0] });
});

test('killed mid-wave: status continues the dead builder, dispatches the rest, never a finished unit', async () => {
  const r = await statusOf(k.dir, passing());
  assert.equal(r.code, 0, r.text);
  const next = nextLines(r.text);
  assert.equal(next.length, 1, r.text);
  assert.equal(next[0], `NEXT: dispatch builders in parallel for U3 (Unit U3) to continue on branch ${ub('U3')}; brief ${rel('U3')}; U4 (Unit U4); brief ${rel('U4')}; U5 (Unit U5); brief ${rel('U5')} (skill: epic-build)`);
  for (const done of ['U1', 'U2', 'U6']) assert.doesNotMatch(next[0], new RegExp(`\\b${done}\\b`));
  assert.match(r.text, /units: U1 merged; U2 reported \(gate green\); U3 stopped with 2 commit\(s\) on epic\/101-widgets-U3 and no report; U4 dispatched, no work on a branch yet; U5 not dispatched; U6 merged/);

  // The three builders finish: U2's gate is green, so it merges first; nothing is dispatched again.
  for (const id of ['U3', 'U4', 'U5']) writeFiles(k.dir, { [rel(id, 'report.json')]: unitReport(id, ub(id)) });
  const after = nextLines((await statusOf(k.dir, passing())).text);
  assert.equal(after.length, 1);
  assert.match(after[0], /^NEXT: node \S*delivery\.mjs wave merge U2 \(skill: epic-build\)$/);
  const red = nextLines((await statusOf(k.dir, greenGates({ unitGateStatus: async () => ({ ok: false, failures: [{ code: 'M3', message: 'LIST-02 not reached' }], exit: 1 }) }))).text);
  assert.match(red[0], /^NEXT: .* gate U2 \(skill: epic-build\)$/);
});

test('a merged unit whose branch was deleted stays merged through the journal\'s wave merge event', async () => {
  const { ctx } = await ctxFor(k.dir);
  const state = await loadState(k.paths.state);
  gitIn(k.dir, 'branch', '-D', ub('U6'));
  rmSync(join(k.dir, rel('U6', 'report.json')));
  const plan = planWith(UNITS);
  assert.equal((await unitStatuses(ctx, state, plan, { gates: false })).find((u) => u.unit === 'U6').status, 'dispatched');
  const journalled = { ...state, journal: [...state.journal, { ...state.journal[0], event: 'wave merge U6 | exit=0' }] };
  assert.equal((await unitStatuses(ctx, journalled, plan, { gates: false })).find((u) => u.unit === 'U6').status, 'merged');
});

test('classifyUnit: merged, then report, then own commits, then a record, else pending', () => {
  assert.equal(classifyUnit({ merged: true, hasReport: false, hasRecord: true, ahead: 3 }), 'merged');
  assert.equal(classifyUnit({ merged: false, hasReport: true, hasRecord: true, ahead: 3 }), 'reported');
  assert.equal(classifyUnit({ merged: false, hasReport: false, hasRecord: false, ahead: 1 }), 'died');
  assert.equal(classifyUnit({ merged: false, hasReport: false, hasRecord: true, ahead: 0 }), 'dispatched');
  assert.equal(classifyUnit({ merged: false, hasReport: false, hasRecord: false, ahead: 0 }), 'pending');
});

test('journal readers: merged units, and red ready heads since the run entered pr', () => {
  const j = (event) => ({ event });
  assert.deepEqual([...mergedInJournal([j('wave merge U2 | exit=0'), j('wave merge U3 | exit=1'), j('dispatch U4')])], ['U2']);
  const log = [j('advance pr | exit=0 | from=build'), j('ready | exit=1 | sha=aaa'), j('ready | exit=1 | sha=aaa'), j('ready | exit=0 | sha=bbb'), j('ready | exit=1 | sha=ccc')];
  assert.deepEqual(redReadyHeadsSincePr(log), ['aaa', 'ccc']);
  assert.deepEqual(redReadyHeadsSincePr([j('ready | exit=1 | sha=old'), ...log]), ['aaa', 'ccc']);
});

test('recordDispatch and clearDispatch journal each change; a second record replaces the first', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, { phase: 'build', wave: 1 });
    const { ctx } = await ctxFor(dir);
    const rec = { unit: 'U3', agent: 'delivery-builder', branch: ub('U3'), brief: rel('U3'), report: rel('U3', 'report.json') };
    await recordDispatch(ctx, rec);
    await recordDispatch(ctx, { ...rec, agent: 'delivery-builder-opus' });
    let s = await loadState(paths.state);
    assert.deepEqual(s.inFlight.map((r) => [r.unit, r.agent]), [['U3', 'delivery-builder-opus']]);
    assert.deepEqual(s.journal.slice(-2).map((e) => parseEvent(e.event).command), ['dispatch U3', 'dispatch U3']);
    await clearDispatch(ctx, 'U3');
    const n = (await loadState(paths.state)).journal.length;
    await clearDispatch(ctx, 'U3');
    s = await loadState(paths.state);
    assert.deepEqual(s.inFlight, []);
    assert.equal(s.journal.length, n, 'clearing a unit with no record journals nothing');
    assert.equal(parseEvent(s.journal.at(-1).event).command, 'undispatch U3');
    await assert.rejects(recordDispatch(ctx, { ...rec, unit: '../x' }), (e) => e.exit === 2);
    await assert.rejects(recordDispatch(ctx, { ...rec, brief: '' }), (e) => e.exit === 2);
  } finally { repo.cleanup(); }
});
