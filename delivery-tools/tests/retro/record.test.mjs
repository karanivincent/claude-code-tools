// C1: one record per run, one line per feature in docs/delivery/runs.jsonl, written by `delivery retro`,
// called at the end of land, and named by NEXT once ready is green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { phaseOfCommand, phasesFromJournal, parseImprovements, ciFailuresFromJournal, buildRecord } from '../../lib/retro/record.mjs';
import { readLedger, writeRecord, ledgerPath } from '../../lib/retro/ledger.mjs';
import { updateState, formatEvent } from '../../lib/core/state.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import retroCommand from '../../lib/commands/retro.mjs';
import landCommand from '../../lib/commands/land.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { makeRunRepo, ctxFor } from '../lifecycle/support.mjs';
import { landedRun } from '../lifecycle/land-support.mjs';

const at = (min) => new Date(Date.parse('2026-01-15T20:00:00.000Z') + min * 60000).toISOString();
const ev = (min, command, exit = 0, counts = {}) => ({ at: at(min), event: formatEvent({ command, exit, counts }) });

test('a command belongs to one phase, or to none', () => {
  const want = { intake: 'intake', 'design render --width phone': 'render', map: 'map', 'rules': 'map', 'seed --apply': 'seed', 'wave start': 'build', 'shoot --round 2': 'shoot', 'review --plan --round 1': 'review', 'ci --pr 4': 'ci', prepush: 'ci', land: 'ci' };
  for (const [c, p] of Object.entries(want)) assert.equal(phaseOfCommand(c), p, c);
  for (const c of ['status', 'advance', 'waive', 'genesis', 'retro', 'hook pre-bash']) assert.equal(phaseOfCommand(c), null, c);
});

test('phase minutes are the gaps up to each phase\'s commands; a phase never reached is null', () => {
  const r = phasesFromJournal([ev(0, 'genesis'), ev(5, 'intake'), ev(25, 'design render'), ev(30, 'shoot --round 1'), ev(40, 'review --round 1'), ev(41, 'status')]);
  assert.deepEqual(r.phases, { intake: 5, render: 20, map: null, seed: null, build: null, shoot: 5, review: 10, ci: null });
  assert.equal(r.founder, null, 'no question or answer was recorded');
});

test('founder waiting comes out of the phases, and the questions are counted', () => {
  const r = phasesFromJournal([ev(0, 'genesis'), ev(10, 'intake'), ev(12, 'scope post'), ev(52, 'scope read'), ev(60, 'map')]);
  assert.deepEqual(r.founder, { waitMinutes: 40, questions: 1 });
  assert.equal(r.phases.map, 8, 'the 40 minutes of waiting are not the map phase');
  assert.equal(r.phases.intake, 10);
  const q = phasesFromJournal([ev(0, 'genesis'), ev(3, 'question'), ev(9, 'answer'), ev(10, 'question')]);
  assert.deepEqual(q.founder, { waitMinutes: 6, questions: 2 });
});

test('CI failures after the PR come from the journal\'s ci events', () => {
  const j = [ev(0, 'ci --pr 4', 0, { state: 'green' }), ev(1, 'ci --pr 4', 1, { state: 'e2e_failed' }), ev(2, 'status', 1)];
  assert.deepEqual(ciFailuresFromJournal(j), [{ check: 'ci', cause: 'e2e failed' }]);
  assert.deepEqual(ciFailuresFromJournal([]), []);
});

test('workflow-improvements.md becomes short one-line entries', () => {
  const md = '# Improvements\n\nSome intro.\n\n- **Shoot** the empty state\n  before the filled one\n* `seed` needs a second world\n1. ' + 'x'.repeat(200) + '\n\nnot a bullet\n';
  const out = parseImprovements(md);
  assert.equal(out[0], 'Shoot the empty state before the filled one');
  assert.equal(out[1], 'seed needs a second world');
  assert.equal(out[2].length, 160);
  assert.ok(out[2].endsWith('...'));
  assert.deepEqual(parseImprovements(''), []);
});

async function runWithHistory() {
  const repo = await makeRunRepo();
  const { paths } = repo;
  let t = 0;
  for (const [cmd, exit, counts] of [['intake', 0], ['design render', 0], ['map', 0], ['shoot --round 1', 0], ['review --round 1', 1], ['ci --pr 3', 1, { state: 'red' }]]) {
    t += 10;
    await updateState(paths, (s) => s, { at: at(t), event: formatEvent({ command: cmd, exit, counts: counts ?? {} }) });
  }
  const r1 = join(paths.runDir, 'rounds', '1');
  mkdirSync(r1, { recursive: true });
  writeFileSync(join(r1, 'review.json'), JSON.stringify({ schemaVersion: 1, round: 1, before: null, at: at(50), counts: { match: 5, small: 2, must: 3, notReached: 1, testOnly: 0, backToDesign: 0, dataGap: 1 }, states: { A: { verdict: 'match', carried: { from: 0 } }, B: { verdict: 'must' } } }));
  writeFileSync(join(r1, 'batches.json'), JSON.stringify({ schemaVersion: 1, round: 1, batches: [{ id: 1, tokens: 9000, minutes: 7 }, { id: 2 }] }));
  mkdirSync(paths.deliveryDir, { recursive: true });
  writeFileSync(join(paths.deliveryDir, 'workflow-improvements.md'), '- Shoot the empty state first\n- Seed a second world\n');
  return repo;
}

test('buildRecord reads the journal, rounds, batches and improvements, and validates', async () => {
  const repo = await runWithHistory();
  try {
    const { ctx } = await ctxFor(repo.worktree);
    const rec = await buildRecord(ctx, repo.paths);
    assert.equal(rec.feature, 'widgets');
    assert.equal(rec.pluginVersion, '0.0.0-test');
    assert.equal(rec.phases.intake, 10);
    assert.equal(rec.phases.ci, 10);
    assert.equal(rec.phases.seed, null);
    assert.deepEqual(rec.rounds, [{ round: 1, match: 5, small: 2, toFix: 3, notReached: 1, dataGap: 1, dataFault: 0, carried: 1, masked: 0 }]);
    assert.deepEqual(rec.reviewers, [{ round: 1, batch: 1, tokens: 9000, minutes: 7 }], 'a batch that recorded nothing is left out');
    assert.deepEqual(rec.ciAfterPr, [{ check: 'ci', cause: 'red' }]);
    assert.deepEqual(rec.improvements, ['Shoot the empty state first', 'Seed a second world']);
    assert.deepEqual(rec.autoChanges, []);
    assert.equal(validateAgainst('run-record', rec).ok, true);
  } finally { repo.cleanup(); }
});

test('a run with no rounds and no improvements still gives a valid record', async () => {
  const repo = await makeRunRepo();
  try {
    const { ctx } = await ctxFor(repo.worktree);
    const rec = await buildRecord(ctx, repo.paths);
    assert.deepEqual([rec.rounds, rec.reviewers, rec.ciAfterPr, rec.improvements], [[], [], [], []]);
    assert.equal(rec.founder, null);
    assert.equal(validateAgainst('run-record', rec).ok, true);
  } finally { repo.cleanup(); }
});

test('the ledger replaces a feature\'s line in place and appends a new feature', async () => {
  const repo = await makeRunRepo();
  try {
    const file = ledgerPath(repo.paths);
    assert.ok(file.endsWith('docs/delivery/runs.jsonl'));
    assert.deepEqual(await readLedger(file), []);
    const a = { ...validExample('run-record'), feature: 'alpha' };
    const b = { ...validExample('run-record'), feature: 'beta' };
    await writeRecord(file, a);
    await writeRecord(file, b);
    await writeRecord(file, { ...a, pluginVersion: '9.9.9' });
    const all = await readLedger(file);
    assert.deepEqual(all.map((r) => [r.feature, r.pluginVersion]), [['alpha', '9.9.9'], ['beta', '0.14.0']]);
    assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2, 'one JSON line per run');
    writeFileSync(file, 'not json\n');
    await assert.rejects(readLedger(file), /not JSON/);
    await assert.rejects(writeRecord(file, { ...a, phases: {} }), /run record/);
  } finally { repo.cleanup(); }
});

test('delivery retro writes the run\'s line, is idempotent, and --dry-run writes nothing', async () => {
  const repo = await runWithHistory();
  try {
    const { ctx, stdout } = await ctxFor(repo.worktree);
    const file = ledgerPath(repo.paths);
    assert.equal(await retroCommand.run(ctx, ['--dry-run']), 0);
    assert.ok(!existsSync(file));
    assert.equal(await retroCommand.run(ctx, []), 0);
    assert.equal(await retroCommand.run(ctx, []), 0);
    const all = await readLedger(file);
    assert.equal(all.length, 1, 'a re-run replaces the line');
    assert.equal(all[0].feature, 'widgets');
    const text = stdout.text();
    assert.match(text, /recorded in docs\/delivery\/runs\.jsonl/);
    assert.match(text, /Changed automatically:\n {2}none/);
    assert.match(text, /Reverted:\n {2}none/);
    assert.match(text, /Needs you:\n {2}nothing/);
  } finally { repo.cleanup(); }
});

test('delivery land ends by running the retro, and closes the epic once the run\'s line is committed', async () => {
  const env = await landedRun();
  try {
    assert.equal(await landCommand.run(env.ctx, ['--epic', '101']), 0);
    const all = await readLedger(ledgerPath(env.repo.paths));
    assert.equal(all.length, 1);
    assert.equal(all[0].schemaVersion, 2);
    assert.match(env.stdout.text(), /retro widgets: recorded/);
    assert.match(env.stdout.text(), /ok ledger: .*committed \(HEAD\)/);
    assert.equal(env.gh.db.issues.get(101).state, 'closed');
  } finally { env.repo.cleanup(); }
});

test('land refuses to finish while the run\'s line is written but not committed, and finishes once it is', async () => {
  const env = await landedRun({ ledger: false });
  try {
    assert.equal(await landCommand.run(env.ctx, ['--epic', '101']), 1);
    const file = ledgerPath(env.repo.paths);
    assert.ok(existsSync(file), 'the retro wrote the line');
    assert.equal((await readLedger(file))[0].feature, 'widgets');
    assert.match(JSON.stringify(env.ctx.out.failures()), /ledger.*written to docs\/delivery\/runs\.jsonl but not committed/);
    assert.equal(env.gh.db.issues.get(101).state, 'open', 'the epic stays open');
    env.repo.wtGit('add', 'docs/delivery/runs.jsonl');
    env.repo.wtGit('commit', '-q', '-m', 'runs ledger');
    env.repo.wtGit('push', '-q', 'origin', 'HEAD:main');
    assert.equal(await landCommand.run(env.ctx, ['--epic', '101']), 0);
    assert.match(env.stdout.text(), /ok ledger: .*committed \(origin\/main\)/);
    assert.equal(env.gh.db.issues.get(101).state, 'closed');
  } finally { env.repo.cleanup(); }
});

test('a retro that fails is a red land: no line, the epic stays open', async () => {
  const bad = await landedRun({ ledger: false });
  try {
    mkdirSync(join(bad.repo.paths.deliveryDir, '..'), { recursive: true });
    writeFileSync(ledgerPath(bad.repo.paths), 'not json\n');
    assert.equal(await landCommand.run(bad.ctx, ['--epic', '101']), 1);
    assert.match(JSON.stringify(bad.ctx.out.failures()), /the retro failed, so the run has no line/);
    assert.equal(bad.gh.db.issues.get(101).state, 'open');
  } finally { bad.repo.cleanup(); }
});

test('land --check never runs the retro', async () => {
  const env = await landedRun({ ledger: false });
  try {
    await landCommand.run(env.ctx, ['--epic', '101', '--check']);
    assert.ok(!existsSync(ledgerPath(env.repo.paths)));
  } finally { env.repo.cleanup(); }
});

test('NEXT names delivery retro once ready is green', () => {
  const f = { rounds: [{ round: 1, shot: true, reviews: 1, compiled: true, counts: { must: 0, notReached: 0 } }], designed: 3, hasMap: true };
  const n = pictureNext(f, { cli: 'delivery', readyOk: true, epic: 7 });
  assert.equal(n.step, 'land');
  assert.match(n.text, /delivery retro/);
  assert.match(n.text, /delivery land --epic 7/);
});
