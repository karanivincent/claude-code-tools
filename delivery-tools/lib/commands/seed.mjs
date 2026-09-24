// delivery seed: plan, check, write, scan, refresh and tear down fixture worlds.
// Owner: slice B2 (docs/ARCHITECTURE.md). The only writer of fixture rows (spec 7, 16).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { ConfigError, EXIT, UsageError } from '../core/exit.mjs';
import { loadState, newRunId } from '../core/state.mjs';
import { assertFileId } from '../core/paths.mjs';
import { buildSeedPlan, readWorldFile } from '../seed/plan.mjs';
import { seedCheck } from '../seed/safety.mjs';
import { seedScan, refreshWorldReport, teardownSeed } from '../seed/scan.mjs';
import { applyRows } from '../seed/apply.mjs';
import { parseDatabaseTypes } from '../plan/verify.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MODES = ['plan', 'check', 'apply', 'scan', 'refresh', 'teardown'];

export default defineCommand({
  name: 'seed',
  summary: 'Plan, check, write, scan, refresh and tear down fixture worlds',
  usage: `usage: delivery seed --plan | --check | --apply | --scan | --refresh <world> | --teardown

The only writer of fixture rows. Every mode but --plan reads the test database; only --apply,
--refresh and --teardown write, and only to the profile's test project, never to one the safety
file lists as production.

modes:
  --plan             write seedplan.json from the plan's worlds and their world files
                     (docs/delivery/<feature>/worlds/<world>.json), with deterministic ids
  --check            M13: the four safety layers over seedplan.json. Layer 1 derives the side-effect
                     map afresh; layers 2 and 3 read the never-dial set, the fake-range probe and
                     the guard probes from the test database. Writes nothing.
  --apply            refuse production and any project but the test project, run --check, write
                     users and rows, then scan the database as it now is
  --scan             evaluate every row in every fixture world as it is now, and every guard probe
  --refresh <world>  re-apply one world (relative dates moved to now), then scan
  --teardown         delete the run's rows and fixture users by id, then scan

exit: 0 safe; 1 refused by a safety layer; 2 wrong project, no database access or no seed plan;
      3 no safety file

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: {
        plan: { type: 'boolean' }, check: { type: 'boolean' }, apply: { type: 'boolean' },
        scan: { type: 'boolean' }, refresh: { type: 'string' }, teardown: { type: 'boolean' },
      },
    });
    const chosen = MODES.filter((m) => values[m] !== undefined && values[m] !== false);
    if (chosen.length !== 1) throw new UsageError(`choose exactly one mode: ${MODES.map((m) => `--${m}`).join(', ')}`);
    const mode = chosen[0];
    ctx.requirePaths();
    switch (mode) {
      case 'plan': return planMode(ctx);
      case 'check': return checkMode(ctx);
      case 'apply': return applyMode(ctx);
      case 'scan': return scanMode(ctx);
      case 'refresh': return refreshMode(ctx, values.refresh);
      default: return teardownMode(ctx);
    }
  },
});

async function planMode(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  const plan = await readArtefact(paths, 'plan');
  const worldFiles = {};
  for (const w of plan.worlds) worldFiles[w.id] = await readWorldFile(paths, w.id);
  const state = await loadState(paths.state, { optional: true });
  const seedPlan = buildSeedPlan({
    feature: paths.feature,
    runId: state?.runId ?? newRunId(ctx.clock),
    project: profile.environments.test.projectRef,
    plan, worldFiles, safety,
    tablesWithoutId: await tablesWithoutId(paths, profile),
  });
  await writeArtefact(paths, 'seedplan', seedPlan);
  ctx.out.line(`seed plan: ${seedPlan.worlds.length} world(s), ${seedPlan.rows.length} row(s), ${seedPlan.users.length} fixture user(s) -> ${paths.seedplan}`);
  ctx.out.line('next: delivery seed --check');
  ctx.out.set('seedplan', { worlds: seedPlan.worlds, rows: seedPlan.rows.length, users: seedPlan.users.length });
  await ctx.journal({ command: 'seed --plan', exit: 0, counts: { worlds: seedPlan.worlds.length, rows: seedPlan.rows.length }, outputs: seedPlan });
  return EXIT.PASS;
}

/**
 * The tables the generated database types show with no `id` column: a join table, whose key is the
 * pair of columns it joins. Those rows are written without a derived id. Types that cannot be read
 * give an empty set, which is the behaviour every run had before this existed.
 */
async function tablesWithoutId(paths, profile) {
  const path = profile?.paths?.databaseTypes;
  if (!path) return new Set();
  let types;
  try { types = parseDatabaseTypes(await readFile(join(paths.repoRoot, path), 'utf8')); } catch { return new Set(); }
  return new Set([...types.entries()].filter(([, cols]) => !cols.has('id')).map(([t]) => t));
}

function report(ctx, gate, evaluation, label) {
  for (const f of gate.failures) ctx.out.fail(f.code, f.message);
  for (const a of evaluation?.accepted ?? []) ctx.out.line(`accepted: ${a.rows} row(s) matching ${a.predicate} under guard ${a.guard}`);
  const c = evaluation?.counts;
  if (c) ctx.out.line(`${label}: ${c.rows} row(s), ${c.predicates} predicate(s); ${gate.ok ? 'safe' : `${gate.failures.length} reason(s) to refuse`}`);
  ctx.out.set('seed', {
    ok: gate.ok,
    counts: c ?? null,
    accepted: evaluation?.accepted ?? [],
    reasons: (evaluation?.reasons ?? []).map((r) => ({
      layer: r.layer, code: r.code, table: r.table ?? null, column: r.column ?? null, when: r.when ?? null,
      predicate: r.predicate ? { id: r.predicate.id, origin: r.predicate.origin, source: r.predicate.source } : null,
      rows: r.rows.length, sample: r.rows.slice(0, 5).map((x) => x.id),
    })),
  });
  return gate.ok ? EXIT.PASS : (gate.exit ?? EXIT.RED);
}

async function checkMode(ctx) {
  const r = await seedCheck(ctx);
  const exit = report(ctx, r.gate, r.evaluation, 'seed check');
  await ctx.journal({ command: 'seed --check', exit, counts: layerCounts(r.evaluation), inputs: r.seedPlan ?? null });
  return exit;
}

async function applyMode(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  const seedPlan = await readArtefact(paths, 'seedplan', { optional: true });
  if (!seedPlan) throw new UsageError('no seedplan.json; run delivery seed --plan first');
  if ((safety.productionRefs ?? []).includes(seedPlan.project)) throw new ConfigError(`refusing to seed ${seedPlan.project}: the safety file lists it as production`, { code: 'production' });
  if (seedPlan.project !== profile.environments.test.projectRef) {
    throw new ConfigError(`refusing to seed ${seedPlan.project}: the profile's test project is ${profile.environments.test.projectRef}`, { code: 'project' });
  }
  const check = await seedCheck(ctx, { seedPlan });
  if (!check.gate.ok) {
    const exit = report(ctx, check.gate, check.evaluation, 'seed check');
    ctx.out.line('nothing was written');
    await ctx.journal({ command: 'seed --apply', exit, counts: { written: 0, ...layerCounts(check.evaluation) } });
    return exit;
  }
  const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
  const db = await createDataAdapter(ctx, { projectRef: seedPlan.project, write: 'seed-apply' });
  const written = await applyRows(db, seedPlan, { now: ctx.clock.now() });
  ctx.out.line(`wrote ${written.rows} row(s) and ${written.users.created} new fixture user(s) (${written.users.existing} already there) to ${seedPlan.project}`);
  const scan = await seedScan(ctx);
  const exit = report(ctx, scan.gate, scan.evaluation, 'scan after write');
  await ctx.journal({ command: 'seed --apply', exit, counts: { written: written.rows, users: written.users.created, ...layerCounts(scan.evaluation) }, inputs: seedPlan });
  return exit;
}

async function scanMode(ctx) {
  const scan = await seedScan(ctx);
  const exit = report(ctx, scan.gate, scan.evaluation, 'scan');
  await ctx.journal({ command: 'seed --scan', exit, counts: { rows: scan.rows ?? 0, ...layerCounts(scan.evaluation) } });
  return exit;
}

async function refreshMode(ctx, world) {
  assertFileId(world, 'world id');
  const { gate, written, unchanged } = await refreshWorldReport(ctx, world);
  for (const f of gate.failures) ctx.out.fail(f.code, f.message);
  if (written !== undefined) ctx.out.line(`rewrote ${written} row(s); ${unchanged} already as planned`);
  if (gate.ok) ctx.out.line(`world ${world} refreshed and scanned: safe`);
  const exit = gate.ok ? EXIT.PASS : (gate.exit ?? EXIT.RED);
  await ctx.journal({ command: `seed --refresh ${world}`, exit, counts: { failures: gate.failures.length, written: written ?? 0 } });
  return exit;
}

async function teardownMode(ctx) {
  const r = await teardownSeed(ctx);
  ctx.out.line(`deleted ${r.deleted} row(s) and ${r.users} fixture user(s)`);
  for (const f of r.scan.failures) ctx.out.fail(f.code, f.message);
  const exit = r.scan.ok ? EXIT.PASS : (r.scan.exit ?? EXIT.RED);
  await ctx.journal({ command: 'seed --teardown', exit, counts: { deleted: r.deleted, users: r.users } });
  return exit;
}

function layerCounts(evaluation) {
  if (!evaluation) return {};
  const n = (l) => evaluation.reasons.filter((r) => r.layer === l).length;
  return { layer1: n(1), layer2: n(2), layer4: n(4) };
}
