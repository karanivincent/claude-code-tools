// M13 on the private replay set (spec 20.2): the real design seed's dry run is refused on each of
// the counts expected/m13.json names, and the synthetic practice-run row on its three. Every
// project value comes from the set at run time; nothing specific lives in this file.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayTest } from '../helpers/replay.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { refReader, readGlobs } from '../../lib/sidefx/source.mjs';
import { deriveFromSources } from '../../lib/sidefx/derive.mjs';
import { evaluateSeedSafety } from '../../lib/seed/check.mjs';

const NEEDS = ['seed-dry-run.json', 'expected/m13.json', 'expected/sidefx.json', 'refs.json'];

async function inputs(dir, t) {
  const read = (rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  const refs = read('refs.json');
  const exS = read('expected/sidefx.json');
  const exM = read('expected/m13.json');
  const dry = read('seed-dry-run.json');
  if (!existsSync(refs.repo)) { t.skip('the target repository is not on this machine'); return null; }
  const { ctx } = await makeTestCtx({ repoRoot: refs.repo, profile: makeProfile(), safety: makeSafety(), passthrough: ['git'] });
  const reader = await refReader(ctx.git, exS.sha);
  const fx = exM.safetyFixture;
  const predicates = deriveFromSources({
    tsFiles: await readGlobs(reader, exS.workerGlobs.ts),
    sqlFiles: await readGlobs(reader, exS.workerGlobs.sql),
    cronJobs: [], forbiddenStates: fx.forbiddenStates, derivedAt: exM.evaluateAt.now,
  }).sidefx.predicates;
  const base = makeSafety();
  const safety = { ...base, neverDial: fx.neverDial, fakeNumbers: { ...base.fakeNumbers, ...fx.fakeNumbers }, forbiddenStates: fx.forbiddenStates, guards: fx.guards };
  const rows = [];
  for (const [table, list] of Object.entries(dry.tables)) for (const values of list) rows.push({ world: 'dry-run', table, id: values.id, values });
  return { exM, predicates, safety, rows, now: new Date(exM.evaluateAt.now) };
}

const citedAt = (source) => String(source).split(' (')[0];
const startsAtCite = (source, cite) => source === cite || source.startsWith(`${cite} `);
const sameFilters = (a, b) => JSON.stringify(a) === JSON.stringify(b);

replayTest('M13 refuses the design seed dry run on each named count', { needs: NEEDS }, async (t, dir) => {
  const inp = await inputs(dir, t);
  if (!inp) return;
  const r = evaluateSeedSafety({ rows: inp.rows, predicates: inp.predicates, safety: inp.safety, neverDial: [], now: inp.now });
  assert.equal(r.ok, false);
  for (const count of inp.exM.x01.counts) {
    if (count.layer === 1) {
      const hits = r.reasons.filter((x) => x.layer === 1 && x.when === 'now' && x.table === count.predicate.table && sameFilters(x.predicate.filters, count.predicate.filters));
      assert.ok(hits.length, `${count.id}: no refusal on ${count.predicate.table} ${JSON.stringify(count.predicate.filters)}`);
      assert.ok(hits.some((x) => startsAtCite(x.predicate.source, citedAt(count.predicate.source))), `${count.id}: no refusal cites ${citedAt(count.predicate.source)}`);
      for (const x of hits) assert.deepEqual(x.rows.map((row) => row.id).sort(), [...count.rowIds].sort(), `${count.id}: the rows that match at the dry run's own clock`);
    } else {
      const [table, column] = count.column.split('.');
      const hit = r.reasons.find((x) => x.layer === 2 && x.code === 'not-fake' && x.table === table && x.column === column);
      assert.ok(hit, `${count.id}: no layer-2 refusal on ${count.column}`);
      const flagged = new Set(hit.rows.map((row) => row.id));
      for (const id of count.rowIds) assert.ok(flagged.has(id), `${count.id}: row ${id} not refused`);
    }
  }
  const masked = new Set(inp.rows.filter((row) => JSON.stringify(row.values).includes('•')).map((row) => row.id));
  assert.ok(masked.size > 0, 'the dry run carries masked numbers');
  for (const x of r.reasons.filter((y) => y.layer === 2)) {
    for (const row of x.rows) assert.ok(!masked.has(row.id) || x.column !== 'to_number' && x.column !== 'phone_number', `masked number refused: ${row.table}/${row.id}`);
  }
});

replayTest('M13 refuses the synthetic practice-run row on its three counts', { needs: NEEDS }, async (t, dir) => {
  const inp = await inputs(dir, t);
  if (!inp) return;
  const syn = inp.exM.syntheticTestRun;
  const r = evaluateSeedSafety({ rows: [{ world: 'dry-run', table: syn.row.table, id: syn.row.values.id, values: syn.row.values }], predicates: inp.predicates, safety: inp.safety, neverDial: [], now: inp.now });
  for (const count of syn.counts) {
    if (count.id === 'derived-predicate') {
      assert.ok(r.reasons.some((x) => x.layer === 1 && x.code === 'predicate' && startsAtCite(x.predicate.source, citedAt(count.source))), `no derived predicate at ${citedAt(count.source)}`);
    } else if (count.id === 'forbidden-state') {
      assert.ok(r.reasons.some((x) => x.layer === 1 && x.code === 'forbidden-state'), 'no forbidden-state refusal');
    } else if (count.id === 'never-dial') {
      const [, column] = count.column.split('.');
      assert.ok(r.reasons.some((x) => x.layer === 2 && x.code === 'never-dial' && x.column === column), 'no never-dial refusal');
    } else {
      assert.fail(`unknown count ${count.id}`);
    }
  }
});
