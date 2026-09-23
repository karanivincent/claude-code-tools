// deriveSideEffects end to end on a real (temporary) git repo, the sidefx command, and the replay
// against the private set's base branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { replayTest } from '../helpers/replay.mjs';
import { readArtefact } from '../../lib/core/artefacts.mjs';
import { deriveWithReport, deriveSideEffects } from '../../lib/sidefx/derive.mjs';
import sidefxCommand from '../../lib/commands/sidefx.mjs';
import { WORKER_FILES } from './fixtures.mjs';

const WORKERS = { tsGlobs: ['apps/server/src/jobs/**/*.ts'], sqlGlobs: ['db/migrations/*.sql'] };

async function setup(files = WORKER_FILES, safetyOverrides = {}) {
  const repo = makeTempRepo({ files });
  const safety = makeSafety({ workers: WORKERS, ...safetyOverrides });
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety, passthrough: ['git'] });
  return { repo, ...t };
}

test('derive: ts, sql and hand predicates from HEAD, written to sidefx.json and valid', async () => {
  const { repo, ctx } = await setup();
  try {
    const { sidefx, failures, notes } = await deriveWithReport(ctx, { refs: ['HEAD'], cron: 'skip' });
    assert.deepEqual(failures, []);
    assert.deepEqual(notes.rpcs, ['claim_outbound_calls']);
    const byId = new Map(sidefx.predicates.map((p) => [p.id, p]));
    assert.deepEqual(byId.get('ts:jobs.sweep.ts#resumeRuns').filters, [
      { column: 'status', op: 'eq', value: 'queued' }, { column: 'deferred_at', op: 'not-null', value: null },
    ]);
    assert.match(byId.get('ts:jobs.sweep.ts#resumeRuns').source, /^apps\/server\/src\/jobs\/sweep\.ts:5 resumeRuns/);
    const due = sidefx.predicates.find((p) => p.origin === 'sql' && p.filters.some((f) => f.column === 'release_at'));
    assert.match(due.source, /^db\/migrations\/20260201000000_second\.sql:2 claim_outbound_calls/, 'the latest definition, cited at its create line');
    assert.equal(byId.get('hand:1').origin, 'hand');
    assert.ok(!sidefx.predicates.some((p) => p.table === 'not_a_worker'), 'files outside the worker globs are not read');
    const onDisk = await readArtefact(ctx.paths, 'sidefx');
    assert.deepEqual(onDisk, sidefx);
    assert.ok(onDisk.files.some((f) => f.path === 'apps/server/src/jobs/sweep.ts' && /^[0-9a-f]{64}$/.test(f.sha256)));
  } finally { repo.cleanup(); }
});

test('derive: two refs at one commit read once; a changed file is re-read at each ref', async () => {
  const { repo, ctx } = await setup();
  try {
    repo.git('tag', 'base');
    const one = await deriveWithReport(ctx, { refs: ['base', 'HEAD'], cron: 'skip', write: false });
    assert.equal(one.notes.refs.length, 1);
    repo.write({ 'apps/server/src/jobs/new.ts': "export async function arm(c) { await c.from('widgets').update({}).eq('state', 'new'); }\n" });
    repo.commit('a new worker on the branch');
    const two = await deriveWithReport(ctx, { refs: ['base', 'HEAD'], cron: 'skip', write: false });
    assert.equal(two.notes.refs.length, 2);
    assert.ok(two.sidefx.predicates.some((p) => p.id === 'ts:jobs.new.ts#arm'), 'the branch adds a worker the base does not have');
  } finally { repo.cleanup(); }
});

test('derive: a database function with no definition refuses until the safety file hand-lists it', async () => {
  const files = { ...WORKER_FILES, 'apps/server/src/jobs/other.ts': "export async function f(c) { await c.rpc('mystery_fn'); }\n" };
  const { repo, ctx } = await setup(files);
  try {
    const r = await deriveWithReport(ctx, { refs: ['HEAD'], cron: 'skip', write: false });
    assert.deepEqual(r.failures.map((f) => f.code), ['rpc-undefined']);
    await assert.rejects(deriveSideEffects(ctx, { refs: ['HEAD'], cron: 'skip', write: false }), (err) => err.exit === 1 && err.failures[0].code === 'rpc-undefined');
  } finally { repo.cleanup(); }
  const listed = makeSafety().forbiddenStates.concat([{ table: 'widgets', filters: [], source: 'rpc:mystery_fn touches every widget' }]);
  const again = await setup(files, { forbiddenStates: listed });
  try {
    const r = await deriveWithReport(again.ctx, { refs: ['HEAD'], cron: 'skip', write: false });
    assert.deepEqual(r.failures, []);
    assert.ok(r.sidefx.predicates.some((p) => p.origin === 'hand' && p.table === 'widgets' && p.filters.length === 0));
  } finally { again.repo.cleanup(); }
});

test('derive: scheduled jobs come from the test database; one that cannot be parsed refuses', async () => {
  const { repo, ctx } = await setup();
  const queries = [];
  ctx.dataBackend = {
    async query(sql) {
      queries.push(sql);
      if (/pg_extension/.test(sql)) return [{ n: 1 }];
      if (/cron\.job/.test(sql)) return [
        { jobname: 'nightly-cleanup', command: 'select cleanup_runs()' },
        { jobname: 'ping-hook', command: "select net.http_post(url := 'https://hooks.example.invalid')" },
      ];
      return [];
    },
  };
  try {
    const r = await deriveWithReport(ctx, { refs: ['HEAD'], write: false });
    assert.ok(r.sidefx.predicates.some((p) => p.id.startsWith('cron:nightly-cleanup') && p.table === 'practice_runs'));
    assert.deepEqual(r.failures.map((f) => f.code), ['cron-unparsed']);
    assert.match(r.failures[0].message, /ping-hook/);
    assert.ok(queries.every((q) => /^select /.test(q)), 'reads only');
  } finally { repo.cleanup(); }
});

test('derive: cron.job unreadable (no database access) is a failure, never a silent pass', async () => {
  const { repo, ctx } = await setup();
  try {
    const r = await deriveWithReport(ctx, { refs: ['HEAD'], write: false });
    assert.deepEqual(r.failures.map((f) => f.code), ['cron-unread']);
  } finally { repo.cleanup(); }
});

test('sidefx command: lists predicates, warns with --no-db, journals nothing without a run', async () => {
  const { repo, ctx, stdout, stderr } = await setup();
  try {
    const exit = await sidefxCommand.run(ctx, ['--ref', 'HEAD', '--no-db', '--list']);
    assert.equal(exit, 0);
    assert.match(stdout.text(), /side-effect map: \d+ predicate\(s\)/);
    assert.match(stdout.text(), /ts:jobs\.sweep\.ts#resumeRuns {2}practice_runs: status = queued AND deferred_at IS NOT NULL/);
    assert.match(stderr.text(), /WARN cron\.job was not read/);
  } finally { repo.cleanup(); }
});

replayTest('sidefx on the base branch derives the resume and claim predicates', { needs: ['expected/sidefx.json', 'refs.json'] }, async (t, dir) => {
  const refs = JSON.parse(readFileSync(join(dir, 'refs.json'), 'utf8'));
  const ex = JSON.parse(readFileSync(join(dir, 'expected/sidefx.json'), 'utf8'));
  if (!existsSync(refs.repo)) { t.skip('the target repository is not on this machine'); return; }
  const safety = makeSafety({ workers: { tsGlobs: ex.workerGlobs.ts, sqlGlobs: ex.workerGlobs.sql }, forbiddenStates: [] });
  const { ctx } = await makeTestCtx({ repoRoot: refs.repo, profile: makeProfile(), safety, passthrough: ['git'] });
  const { sidefx } = await deriveWithReport(ctx, { refs: [ex.sha], cron: 'skip', write: false });
  for (const m of ex.mustFind) {
    const hit = sidefx.predicates.find((p) => p.table === m.predicate.table
      && JSON.stringify(p.filters) === JSON.stringify(m.predicate.filters)
      && (p.source === m.predicate.source || p.source.startsWith(`${m.predicate.source} `)));
    assert.ok(hit, `${m.id}: no derived predicate ${m.asWritten} at ${m.predicate.source}`);
    assert.equal(hit.origin, m.origin);
  }
});
