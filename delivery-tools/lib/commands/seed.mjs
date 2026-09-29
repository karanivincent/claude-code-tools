// delivery seed: plan, check, write, scan, refresh and tear down fixture worlds.
// Owner: slice B2 (docs/ARCHITECTURE.md). The only writer of fixture rows (spec 7, 16).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { ConfigError, EXIT, UsageError } from '../core/exit.mjs';
import { gateResult, combineGates } from '../core/gate.mjs';
import { loadState, newRunId } from '../core/state.mjs';
import { assertFileId } from '../core/paths.mjs';
import { buildSeedPlan, readWorldFile } from '../seed/plan.mjs';
import { readMap } from '../picture/map.mjs';
import { seedCheck } from '../seed/safety.mjs';
import { seedScan, refreshWorldReport, teardownSeed } from '../seed/scan.mjs';
import { applyRows } from '../seed/apply.mjs';
import { parseDatabaseTypes } from '../plan/verify.mjs';
import { columnConstraints } from '../seed/db.mjs';
import { columnConstraintViolations, describeWhere, stateDataGaps, tablesWithoutGuard } from '../seed/data.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedNow } from '../seed/evaluate.mjs';
import { contractGaps, readContract } from '../picture/contract.mjs';
import { readGlobalHashes, readTableShapes, recordGlobals, sameNameOrgs, schemaChangeMessage, schemaChanges } from '../seed/drift.mjs';

const MODES = ['plan', 'check', 'apply', 'scan', 'refresh', 'teardown'];

export default defineCommand({
  name: 'seed',
  summary: 'Plan, check, write, scan, refresh and tear down fixture worlds',
  usage: `usage: delivery seed --plan | --check | --apply | --scan | --refresh <world|all>... | --teardown

The only writer of fixture rows. Every mode reads the test database (--plan for its CHECK
constraints and enum types only); only --apply, --refresh and --teardown write, and only to the
profile's test project, never to one the safety file lists as production.

modes:
  --plan             write seedplan.json from the plan's worlds (picture mode: the map's) and their
                     world files (docs/delivery/<feature>/worlds/<world>.json), with deterministic
                     ids. Also prints every table the worlds write that no safety guard covers (a
                     "guards to approve" list), and refuses a world value that fails a CHECK
                     constraint or enum type the database has for its column.
  --check            M13: the four safety layers over seedplan.json, plus (picture mode) A1: each
                     state's map-declared data (state.data) against the rows the worlds seed, and
                     the data contract (contract.json): every text labelled data must have a row
                     (or a fixture user's name) behind it, and every text must be labelled. Layer
                     1 derives the side-effect map afresh; layers 2 and 3 read the never-dial set,
                     the fake-range probe and the guard probes from the test database. Also refuses
                     a table the worlds write whose columns changed since --plan recorded them, and
                     a world whose organisation name another fixture organisation has. Writes nothing.
  --apply            refuse production and any project but the test project, run --check, write
                     users and rows, record a hash of each world's global dependencies (a world
                     file's "globals") in .delivery/<feature>/globals.json, then scan the database
                     as it now is
  --scan             evaluate every row in every fixture world as it is now, and every guard probe
  --refresh <world>  re-apply a world (relative dates moved to now), delete the rows its own
                     organisation holds in the tables its plan seeds that the plan does not have
                     (a row a capture's click added), then scan. Repeat it for several worlds;
                     "all" refreshes every world in the seed plan
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
        scan: { type: 'boolean' }, refresh: { type: 'string', multiple: true }, teardown: { type: 'boolean' },
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
      case 'refresh': return refreshWorlds(ctx, values.refresh);
      default: return teardownMode(ctx);
    }
  },
});

async function planMode(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  // Picture mode's map lists the worlds in the plan's shape. A run converted from full mode keeps
  // its plan.json, and the map is the file it now edits, so the map wins whenever it exists.
  const map = readMap(paths);
  const plan = map ? { worlds: map.worlds ?? [] } : await readArtefact(paths, 'plan');
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
  // Fix 9: the columns of every table the worlds write, so a migration mid-run is noticed.
  let db = null;
  try {
    const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
    db = await createDataAdapter(ctx);
    const shapes = await readTableShapes(db, seedPlan);
    if (Object.keys(shapes).length) seedPlan.schema = shapes;
  } catch (err) {
    ctx.out.line(`note: could not read the columns of the tables the worlds write (${err.message}); a schema change mid-run is not noticed`);
  }
  await writeArtefact(paths, 'seedplan', seedPlan);
  ctx.out.line(`seed plan: ${seedPlan.worlds.length} world(s), ${seedPlan.rows.length} row(s), ${seedPlan.users.length} fixture user(s) -> ${paths.seedplan}`);
  // R9: rows whose times tie are given distinct seconds, in file order (the design's order).
  for (const t of seedPlan.staggered ?? []) ctx.out.line(`distinct times: ${t.rows} ${t.table}.${t.column} row(s) of world ${t.world} shared one moment; each is now a second earlier than the row above it`);

  // A2: every table the worlds write that no guard covers, printed together so the founder
  // approves them once, at the start, rather than discovering them one seed --apply at a time.
  const uncovered = tablesWithoutGuard(seedPlan.rows, safety);
  if (uncovered.length) {
    ctx.out.line(`guards to approve (${uncovered.length} table(s) no guard in ${profile.safetyFile ?? '.claude/delivery-safety.json'} covers):`);
    for (const t of uncovered) ctx.out.line(`  - ${t}`);
  }

  // A2: CHECK constraints and enum types, read from the test database. A check --plan cannot parse
  // (not a plain IN/ANY(ARRAY[...]) list) is skipped, never enforced (lib/seed/data.mjs). When the
  // database itself cannot be read, the plan still stands: this is a second line of defence over
  // M13's own layers, not itself a safety layer, so it never refuses the plan on its own.
  let violations = [];
  try {
    if (!db) throw new Error('no database access');
    const allowed = await columnConstraints(db);
    violations = columnConstraintViolations(seedPlan.rows, allowed, await seedNow(ctx));
  } catch (err) {
    ctx.out.line(`note: could not read the database's CHECK constraints and enum types (${err.message}); world values are not checked against them`);
  }
  for (const v of violations) {
    ctx.out.fail('seed-plan-constraint', `${v.table}.${v.column} = ${JSON.stringify(v.value)} (world ${v.world}) is not one of ${v.allowed.join(', ')}`);
  }

  ctx.out.line('next: delivery seed --check');
  ctx.out.set('seedplan', { worlds: seedPlan.worlds, rows: seedPlan.rows.length, users: seedPlan.users.length, guardsToApprove: uncovered, constraintViolations: violations.length });
  const exit = violations.length ? EXIT.RED : EXIT.PASS;
  await ctx.journal({ command: 'seed --plan', exit, counts: { worlds: seedPlan.worlds.length, rows: seedPlan.rows.length, constraintViolations: violations.length }, outputs: seedPlan });
  return exit;
}

/**
 * A1: fold a run's state-data gaps (stateDataGaps) into a seed gate's failures, so `seed --check`
 * and `seed --apply` refuse a plan whose worlds do not yet hold what a state's map entry declares
 * it needs. A run with no map.json (full mode) or no state that declares `data` is unaffected.
 * @param {import('../core/gate.mjs').GateResult} gate
 * @param {object|null} seedPlan
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {Date} now
 */
function withDataGaps(gate, seedPlan, paths, now) {
  if (!seedPlan) return gate;
  const map = readMap(paths);
  if (!map) return gate;
  const gaps = stateDataGaps(map.states, seedPlan.rows, now);
  const failures = gaps.map((g) => ({
    code: 'M13-data',
    message: `state ${g.state}: ${g.table} where ${describeWhere(g.where)} wants at least ${g.wanted}, found ${g.found}`,
  }));
  failures.push(...contractFailures(paths, map, seedPlan, now));
  if (!failures.length) return gate;
  return combineGates([gate, gateResult(failures)]);
}

/**
 * Fix 2 of stable picture data: each value the data contract labels "data" that the worlds do not
 * hold, and the texts nobody has labelled yet, as seed gate failures. A run with no contract.json is
 * unaffected (a full-mode run, or one from before contracts).
 */
function contractFailures(paths, map, seedPlan, now) {
  let contract;
  try { contract = readContract(paths); } catch (err) {
    return [{ code: 'M13-contract', message: `contract.json does not parse (${err.message}); run delivery contract` }];
  }
  if (!contract) return [];
  const r = contractGaps(contract, map, seedPlan, now);
  const out = r.gaps.map((g) => ({ code: 'M13-contract', message: `state ${g.state} shows "${g.text}": ${g.why}` }));
  if (r.unlabelled) out.push({ code: 'M13-contract', message: `${r.unlabelled} text(s) of the contract are not labelled yet: run delivery contract and dispatch the labeller` });
  return out;
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

/**
 * Fixes 7 and 9 of stable picture data, as seed gate failures: a table the worlds write whose
 * columns changed since seed --plan, and another fixture organisation named like one of this
 * run's. When the database cannot be read for them, a note says so and nothing is refused: they are
 * not safety layers, which refuse on their own when the database is unreadable.
 */
async function driftFailures(ctx, gate, seedPlan) {
  if (!seedPlan) return gate;
  const failures = [];
  try {
    const { safety } = await ctx.safety();
    const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
    const db = await createDataAdapter(ctx);
    if (seedPlan.schema) for (const c of schemaChanges(seedPlan, await readTableShapes(db, seedPlan))) failures.push({ code: 'M13-schema', message: schemaChangeMessage(c) });
    for (const o of await sameNameOrgs(db, seedPlan, safety.fixtureOrgPrefix)) {
      failures.push({ code: 'M13-owner', message: `world ${o.world}'s organisation "${o.name}" has the same name as fixture organisation ${o.other}, which is not this run's: a lane or a test that picks by name could write to either. Give the world its own orgName` });
    }
  } catch (err) {
    ctx.out.line(`note: could not check for schema changes or fixture organisations of the same name (${String(err?.message ?? err).split('\n')[0]})`);
  }
  return failures.length ? combineGates([gate, gateResult(failures)]) : gate;
}

async function checkMode(ctx) {
  const r = await seedCheck(ctx);
  const paths = ctx.requirePaths();
  const gate = await driftFailures(ctx, withDataGaps(r.gate, r.seedPlan, paths, await seedNow(ctx)), r.seedPlan);
  const exit = report(ctx, gate, r.evaluation, 'seed check');
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
  const checkGate = await driftFailures(ctx, withDataGaps(check.gate, seedPlan, paths, await seedNow(ctx)), seedPlan);
  if (!checkGate.ok) {
    const exit = report(ctx, checkGate, check.evaluation, 'seed check');
    ctx.out.line('nothing was written');
    await ctx.journal({ command: 'seed --apply', exit, counts: { written: 0, ...layerCounts(check.evaluation) } });
    return exit;
  }
  const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
  const db = await createDataAdapter(ctx, { projectRef: seedPlan.project, write: 'seed-apply' });
  const written = await applyRows(db, seedPlan, { now: await seedNow(ctx) });
  ctx.out.line(`wrote ${written.rows} row(s) and ${written.users.created} new fixture user(s) (${written.users.existing} already there) to ${seedPlan.project}${written.deferred ? `, then set the forward references of ${written.deferred} row(s)` : ''}`);
  // R7: the worlds' global dependencies as they were when seeded; shoot warns when one changed.
  if (seedPlan.worlds.some((w) => w.globals?.length)) {
    try {
      const hashes = await readGlobalHashes(db, seedPlan);
      await recordGlobals(paths, hashes, ctx.clock.now().toISOString());
      ctx.out.line(`recorded ${Object.values(hashes).reduce((n, h) => n + Object.keys(h).length, 0)} global dependenc(ies) of the worlds; shoot warns when one changes`);
    } catch (err) {
      ctx.out.warn(`could not record the worlds' global dependencies (${String(err?.message ?? err).split('\n')[0]})`);
    }
  }
  const scan = await seedScan(ctx);
  const exit = report(ctx, scan.gate, scan.evaluation, 'scan after write');
  await ctx.journal({ command: 'seed --apply', exit, counts: { written: written.rows, deferred: written.deferred, users: written.users.created, ...layerCounts(scan.evaluation) }, inputs: seedPlan });
  return exit;
}

async function scanMode(ctx) {
  const scan = await seedScan(ctx);
  const exit = report(ctx, scan.gate, scan.evaluation, 'scan');
  await ctx.journal({ command: 'seed --scan', exit, counts: { rows: scan.rows ?? 0, ...layerCounts(scan.evaluation) } });
  return exit;
}

async function refreshWorlds(ctx, worlds) {
  let list = worlds ?? [];
  if (list.includes('all')) {
    const plan = await readArtefact(ctx.requirePaths(), 'seedplan');
    list = plan.worlds.map((w) => w.id);
  }
  let exit = EXIT.PASS;
  for (const w of list) {
    const e = await refreshMode(ctx, w);
    if (e !== EXIT.PASS && exit === EXIT.PASS) exit = e;
  }
  return exit;
}

async function refreshMode(ctx, world) {
  assertFileId(world, 'world id');
  const { gate, written, unchanged, removed } = await refreshWorldReport(ctx, world);
  for (const f of gate.failures) ctx.out.fail(f.code, f.message);
  if (written !== undefined) ctx.out.line(`rewrote ${written} row(s); ${unchanged} already as planned`);
  if (removed) {
    const tables = Object.entries(removed.tables).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`);
    ctx.out.line(`removed ${removed.rows} row(s) the plan does not have${tables.length ? ` (${tables.join(', ')})` : ''}`);
  }
  if (gate.ok) ctx.out.line(`world ${world} refreshed and scanned: safe`);
  ctx.out.set('refresh', { world, ok: gate.ok, written: written ?? 0, unchanged: unchanged ?? 0, removed: removed ?? { rows: 0, tables: {} } });
  const exit = gate.ok ? EXIT.PASS : (gate.exit ?? EXIT.RED);
  await ctx.journal({ command: `seed --refresh ${world}`, exit, counts: { failures: gate.failures.length, written: written ?? 0, removed: removed?.rows ?? 0 } });
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
