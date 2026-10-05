// delivery seed: plan, check, write, scan, refresh and tear down fixture worlds.
// Owner: slice B2 (docs/ARCHITECTURE.md). The only writer of fixture rows (spec 7, 16).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { ConfigError, EXIT, UsageError } from '../core/exit.mjs';
import { gateResult, combineGates } from '../core/gate.mjs';
import { loadState, newRunId } from '../core/state.mjs';
import { assertFileId } from '../core/paths.mjs';
import { buildSeedPlan, readWorldFile, worldFilePath } from '../seed/plan.mjs';
import { mapPath, readMap } from '../picture/map.mjs';
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
import { addNeed, answerNeed, closeNeeds, readSwaps, traceWorld, writeSwaps } from '../seed/trace.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';
import { readGlobalHashes, readTableShapes, recordGlobals, sameNameOrgs, schemaChangeMessage, schemaChanges } from '../seed/drift.mjs';

const MODES = ['plan', 'check', 'apply', 'scan', 'refresh', 'teardown', 'from-trace', 'need', 'need-done'];

export default defineCommand({
  name: 'seed',
  summary: 'Plan, check, write, scan, refresh and tear down fixture worlds',
  usage: `usage: delivery seed --plan | --check | --apply | --scan | --refresh <world|all>... | --teardown
       delivery seed --from-trace [<world>...] | --need "<STATE>: <what>" | --need-done <n|all>

The only writer of fixture rows. Every mode reads the test database (--plan for its CHECK
constraints and enum types only); only --apply, --refresh and --teardown write, and only to the
profile's test project, never to one the safety file lists as production.

modes:
  --plan             write seedplan.json from the plan's worlds (picture mode: the map's) and their
                     world files (docs/delivery/<feature>/worlds/<world>.json), with deterministic
                     ids. Also prints every table the worlds write that no safety guard covers (a
                     "guards to approve" list), and refuses a world value that fails a CHECK
                     constraint or enum type the database has for its column. It also refuses a
                     value the generated database types (paths.databaseTypes) cannot take: a column
                     the table lacks, a value of the wrong kind, a null or an enum value not allowed.
                     When the profile has commands.validateSeedJson, it is given every Json column
                     the worlds fill and may refuse those values too.
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
  --from-trace       (picture mode) build world rows from the data contract: every data value with
                     a row key becomes a column of that row (key "t-<row>"), with the world's
                     organisation, relative times ("2 min ago" is now-2m), enum literals and numbers
                     read from the database types. A row describing a fixture user is that user; a
                     row the world file already holds is left alone; hand-written rows are never
                     touched. The world file records a hash of each t- row it writes ("traced"): a
                     t- row edited by hand since is kept and reported, and a t- row the contract no
                     longer produces is reported as dropped. A row in a table the safety file's
                     probes say no fixture organisation may hold is never written: it is listed,
                     and its state needs an intercept. Emails become fixture addresses and the organisation's name the
                     world's, and each swap is written to docs/delivery/<feature>/swaps.json so
                     seed --check and datacheck look for the seeded value. A fixture user with no
                     name gets the design's (map.json). Prints what it could not infer, for the
                     seed-writer. Writes files only, never the database. Default: every world.
  --need "<STATE>: <what>"
                     answer whether the state's world holds a value, in one line: "held" when a
                     contract value of the state matches and the seed plan holds it, otherwise
                     queued in docs/delivery/<feature>/needs.json for the seed-writer (NEXT sends it)
  --need-done <n|all>  close needs the seed-writer has met

exit: 0 safe; 1 refused by a safety layer; 2 wrong project, no database access or no seed plan;
      3 no safety file

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: {
        plan: { type: 'boolean' }, check: { type: 'boolean' }, apply: { type: 'boolean' },
        scan: { type: 'boolean' }, refresh: { type: 'string', multiple: true }, teardown: { type: 'boolean' },
        'from-trace': { type: 'boolean' }, need: { type: 'string' }, 'need-done': { type: 'string' },
      },
      positionals: { max: -1 },
    });
    const chosen = MODES.filter((m) => values[m] !== undefined && values[m] !== false);
    if (chosen.length !== 1) throw new UsageError(`choose exactly one mode: ${MODES.map((m) => `--${m}`).join(', ')}`);
    const mode = chosen[0];
    if (positionals.length && mode !== 'from-trace') throw new UsageError(`unexpected argument(s): ${positionals.join(' ')}`);
    ctx.requirePaths();
    switch (mode) {
      case 'plan': return planMode(ctx);
      case 'check': return checkMode(ctx);
      case 'apply': return applyMode(ctx);
      case 'scan': return scanMode(ctx);
      case 'refresh': return refreshWorlds(ctx, values.refresh);
      case 'from-trace': return fromTraceMode(ctx, positionals);
      case 'need': return needMode(ctx, values.need);
      case 'need-done': return needDoneMode(ctx, values['need-done']);
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
  // The plan this one replaces: each world carries forward the tables it has ever seeded, so a
  // refresh can clean a table the world no longer seeds. An unreadable old plan is just no history.
  const previous = await readArtefact(paths, 'seedplan', { optional: true }).catch(() => null);
  const seedPlan = buildSeedPlan({
    feature: paths.feature,
    runId: state?.runId ?? newRunId(ctx.clock),
    project: profile.environments.test.projectRef,
    plan, worldFiles, safety,
    tablesWithoutId: await tablesWithoutId(paths, profile),
    previous,
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

  // W3: every world value against the generated database types (a column that is not there, a value
  // of the wrong kind, a null where none is allowed, an enum value the enum lacks), then the Json
  // values against the repo's own validator when the profile has one. Types that cannot be read
  // give a note and skip both; a validator that is broken gives a note and never refuses.
  const { columnTypeProblems, jsonColumns, parseColumnTypes, runValidateSeedJson } = await import('../seed/validate.mjs');
  let typeProblems = [];
  let jsonProblems = [];
  let columnTypes = null;
  const typesPath = profile.paths?.databaseTypes;
  try {
    if (!typesPath) throw new Error('the profile has no paths.databaseTypes');
    columnTypes = parseColumnTypes(await readFile(join(paths.repoRoot, typesPath), 'utf8'));
  } catch (err) {
    ctx.out.line(`note: could not read the database types (${String(err?.message ?? err).split('\n')[0]}); world values are not checked against column types`);
  }
  if (columnTypes) {
    typeProblems = columnTypeProblems(seedPlan.rows, columnTypes);
    for (const p of typeProblems) ctx.out.fail('seed-plan-type', `world ${p.world}: ${p.why}`);
    const command = profile.commands?.validateSeedJson;
    if (command) {
      const r = await runValidateSeedJson(command, jsonColumns(seedPlan.rows, columnTypes), { cwd: paths.repoRoot });
      if (r.note) ctx.out.line(`note: ${r.note}`);
      jsonProblems = r.problems;
      for (const p of jsonProblems) ctx.out.fail('seed-plan-json', `${p.table}.${p.column} (world ${p.world}${p.row ? `, row ${p.row}` : ''}): ${p.message}`);
    }
  }

  ctx.out.line('next: delivery seed --check');
  ctx.out.set('seedplan', { worlds: seedPlan.worlds, rows: seedPlan.rows.length, users: seedPlan.users.length, guardsToApprove: uncovered, constraintViolations: violations.length, typeProblems: typeProblems.length, jsonProblems: jsonProblems.length });
  const exit = violations.length || typeProblems.length || jsonProblems.length ? EXIT.RED : EXIT.PASS;
  await ctx.journal({ command: 'seed --plan', exit, counts: { worlds: seedPlan.worlds.length, rows: seedPlan.rows.length, constraintViolations: violations.length, typeProblems: typeProblems.length, jsonProblems: jsonProblems.length }, outputs: seedPlan });
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
  const r = contractGaps(contract, map, seedPlan, now, readSwaps(paths));
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

/**
 * W3 and D13: world rows from the data contract. Writes the world files, swaps.json and any fixture
 * user name the map lacks; never the database. The seed-writer handles only what it lists.
 */
async function fromTraceMode(ctx, worlds) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  const map = readMap(paths);
  if (!map) throw new UsageError('no map.json: seed --from-trace builds the map\'s worlds');
  const contract = readContract(paths);
  if (!contract) throw new UsageError('no contract.json: run delivery contract and the labeller first');
  const ids = worlds.length ? worlds : (map.worlds ?? []).map((w) => w.id);
  let types = null;
  if (profile?.paths?.databaseTypes) {
    try {
      const { parseColumnTypes } = await import('../seed/validate.mjs');
      types = parseColumnTypes(await readFile(join(paths.repoRoot, profile.paths.databaseTypes), 'utf8'));
    } catch (err) {
      ctx.out.line(`note: the database types could not be read (${err.message}); numbers, enum literals and organisation columns are guessed`);
    }
  }
  const now = await seedNow(ctx);
  let mapChanged = false;
  const summary = [];
  for (const id of ids) {
    assertFileId(id, 'world id');
    let file = null;
    try { file = await readWorldFile(paths, id); } catch { file = null; }
    const r = traceWorld({ contract, map, worldId: id, worldFile: file, safety, types, now });
    await writeJsonAtomic(worldFilePath(paths, id), { schemaVersion: 1, world: id, ...(file?.globals ? { globals: file.globals } : {}), ...(Object.keys(r.traced).length ? { traced: r.traced } : {}), rows: r.rows });
    await writeSwaps(paths, id, r.swaps);
    const w = map.worlds.find((x) => x.id === id);
    for (const [role, name] of Object.entries(r.userNames)) {
      const u = w.users.find((x) => x.role === role);
      if (u && !u.name) { u.name = name; mapChanged = true; ctx.out.line(`world ${id}: the ${role} fixture user is now named "${name}", as the design shows`); }
    }
    ctx.out.line(`world ${id}: ${r.added} row(s) added, ${r.replaced} rebuilt, ${r.kept} kept; ${Object.keys(r.swaps).length} value(s) swapped for safe ones`);
    for (const x of r.skipped) ctx.out.line(`  skipped ${x}`);
    for (const k of r.handEdited) ctx.out.line(`  kept ${k}: it was edited by hand since --from-trace wrote it; delete the row to have it rebuilt`);
    for (const k of r.dropped) ctx.out.line(`  dropped ${k}: the contract no longer produces it`);
    for (const n of r.needs) ctx.out.line(`  for the seed-writer: ${n}`);
    summary.push({ world: id, added: r.added, replaced: r.replaced, kept: r.kept, swaps: Object.keys(r.swaps).length, needs: r.needs, handEdited: r.handEdited, dropped: r.dropped, forbidden: r.forbidden.length });
  }
  if (mapChanged) await writeJsonAtomic(mapPath(paths), map);
  const needs = summary.reduce((n, x) => n + x.needs.length, 0);
  ctx.out.line(needs ? `next: dispatch the seed-writer with the ${needs} line(s) above, then delivery seed --plan and --check` : 'next: delivery seed --plan, then --check');
  ctx.out.set('fromTrace', summary);
  await ctx.journal({ command: 'seed --from-trace', exit: EXIT.PASS, counts: { worlds: ids.length, added: summary.reduce((n, x) => n + x.added, 0), needs } });
  return EXIT.PASS;
}

/** D13: one line for an agent asking for data. */
async function needMode(ctx, text) {
  const paths = ctx.requirePaths();
  const m = /^\s*([^:]+?)\s*:\s*(.+)$/.exec(String(text ?? ''));
  if (!m) throw new UsageError('--need takes "<STATE>: <what>", e.g. "KC-05: 3 failed calls"');
  const [, state, need] = m;
  const map = readMap(paths);
  if (!map) throw new UsageError('no map.json');
  const seedPlan = await readArtefact(paths, 'seedplan', { optional: true }).catch(() => null);
  const a = answerNeed({ contract: readContract(paths), map, seedPlan, state, need, now: await seedNow(ctx), swaps: readSwaps(paths) });
  if (a.held) {
    ctx.out.line(`held: world ${a.world} has it for ${state} (${a.matched.map((x) => `"${x.text}"`).join(', ')})`);
    ctx.out.set('need', { state, world: a.world, held: true });
    await ctx.journal({ command: 'seed --need', exit: EXIT.PASS, counts: { held: 1 } });
    return EXIT.PASS;
  }
  const n = await addNeed(paths, { state, world: a.world, need, at: ctx.clock.now().toISOString(), ...(a.matched.length ? { why: a.matched.filter((x) => !x.ok).map((x) => x.why) } : {}) });
  ctx.out.line(`queued: need #${n} for world ${a.world} (${state}: ${need}) is in needs.json; the seed-writer adds it, and the shoot re-seeds the world itself`);
  ctx.out.set('need', { state, world: a.world, held: false, n });
  await ctx.journal({ command: 'seed --need', exit: EXIT.PASS, counts: { queued: 1 } });
  return EXIT.PASS;
}

async function needDoneMode(ctx, which) {
  const paths = ctx.requirePaths();
  const list = which === 'all' ? 'all' : String(which).split(',').map((x) => Number(x.trim())).filter(Number.isInteger);
  if (list !== 'all' && !list.length) throw new UsageError('--need-done takes need numbers (1,3) or all');
  const n = await closeNeeds(paths, list);
  ctx.out.line(`closed ${n} need(s)`);
  await ctx.journal({ command: 'seed --need-done', exit: EXIT.PASS, counts: { closed: n } });
  return EXIT.PASS;
}
