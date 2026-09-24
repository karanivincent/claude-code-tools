// Seed safety, M13 (spec 7). Owner: slice B2 (docs/ARCHITECTURE.md). `seed --check` as a gate:
// the four layers over seedplan.json, with the side-effect map derived afresh and the never-dial
// set, the fake-range probe and the guard probes read from the test database. Anything that cannot
// be established (no database access, a query that does not run) refuses the seed: nothing here
// guesses in the direction of seeding.

import { gateResult } from '../core/gate.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { DeliveryError, EXIT } from '../core/exit.mjs';
import { deriveWithReport } from '../sidefx/derive.mjs';
import { evaluateSeedSafety } from './check.mjs';
import { derivedNeverDial, fakeRangeProbe, runGuards, prefetch, safetyQueries } from './db.mjs';

/**
 * Layer 1's input: the side-effect map, derived afresh, with what could not be modelled as M13-L1
 * failures. One command derives it once: a refresh's scan uses its own check's derivation, seconds
 * old, rather than reading the same worker files and the same cron table twice.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {boolean} write write sidefx.json
 * @returns {Promise<{ predicates: object[], failures: { code: string, message: string }[] }>}
 */
export async function deriveForSeed(ctx, write) {
  const l1 = (f) => ({ code: 'M13-L1', message: `side-effect map: ${f.message}` });
  try {
    const d = await deriveWithReport(ctx, { write });
    return { predicates: d.sidefx.predicates, failures: d.failures.map(l1) };
  } catch (err) {
    if (!(err instanceof DeliveryError)) throw err;
    return { predicates: [], failures: (err.failures ?? [{ message: err.message }]).map(l1) };
  }
}

/**
 * seed --check as a gate: layers 1 to 3 over seedplan.json (derived predicates, contact values
 * against the fake pattern and the derived never-dial set, guards) and the worlds' structure.
 * Called by check M13 (B1) and preflight P6 with an empty plan (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ seedPlan?: object }} [opts] a plan to check instead of seedplan.json
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function seedCheckGate(ctx, opts = {}) {
  const r = await seedCheck(ctx, opts);
  return r.gate;
}

/**
 * The same check with its full evaluation, for the seed command's report.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ seedPlan?: object, worlds?: string[] }} [opts] worlds: check only these worlds' rows
 */
export async function seedCheck(ctx, opts = {}) {
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  const failures = [];
  let seedPlan = opts.seedPlan;
  if (!seedPlan) {
    const paths = ctx.requirePaths();
    seedPlan = await readArtefact(paths, 'seedplan', { optional: true });
    if (!seedPlan) {
      return { gate: gateResult([{ code: 'M13', message: 'no seedplan.json; run delivery seed --plan first' }], EXIT.USAGE), evaluation: null };
    }
  }
  const only = opts.worlds ? new Set(opts.worlds) : null;
  const rows = only ? seedPlan.rows.filter((r) => only.has(r.world)) : seedPlan.rows;
  const users = only ? seedPlan.users.filter((u) => only.has(u.world)) : seedPlan.users;
  const worlds = only ? seedPlan.worlds.filter((w) => only.has(w.id)) : seedPlan.worlds;

  // Layer 1 inputs: derived afresh, never read back from a cache. The derivation and the database
  // reads below are independent, so they run at the same time.
  const derivation = deriveForSeed(ctx, Boolean(ctx.paths));
  const fixtureOrgs = seedPlan.worlds.map((w) => w.orgId);
  const plannedTables = new Set(seedPlan.rows.map((r) => r.table));
  const reading = (async () => {
    const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
    const db = await createDataAdapter(ctx);
    // One batch; no access fails at its first query, once, rather than query by query.
    const reader = await prefetch(db, ['select 1 as ok', ...safetyQueries(safety, { fixtureOrgs, plannedTables })]);
    await reader.query('select 1 as ok');
    return reader;
  })().then((reader) => ({ reader }), (err) => ({ err }));
  const derived = await derivation;
  failures.push(...derived.failures);
  const predicates = derived.predicates;

  // Database-backed inputs: the derived never-dial set, the fake range, the guards.
  let neverDial = [];
  let guards = (safety.guards ?? []).map((g) => ({ id: g.id, covers: g.covers, holds: false, why: 'not probed' }));
  let exit;
  try {
    const { reader: db, err: readErr } = await reading;
    if (readErr) throw readErr;
    const nd = await derivedNeverDial(db, safety);
    neverDial = nd.numbers;
    failures.push(...nd.failures.map((f) => ({ code: 'M13-L2', message: f.message })));
    const fake = await fakeRangeProbe(db, safety);
    if (!fake.ok) failures.push({ code: 'M13-L2', message: `fake numbers: ${fake.detail}` });
    guards = await runGuards(db, safety, { fixtureOrgs, plannedTables, rows: seedPlan.rows });
  } catch (err) {
    if (!(err instanceof DeliveryError)) throw err;
    exit = err.exit === EXIT.BLOCKED ? EXIT.BLOCKED : EXIT.USAGE;
    failures.push({ code: 'M13-db', message: `the test database could not be read (${err.message}); without the derived never-dial set and the guard probes the seed is refused` });
  }

  const evaluation = evaluateSeedSafety({
    rows, users, worlds, predicates, safety, neverDial, guards, now: ctx.clock.now(),
    structure: {
      project: seedPlan.project,
      testRef: profile.environments.test.projectRef,
      globalTables: await globalTables(ctx),
      robotEmails: [profile.auth?.robotAdminEmail, profile.auth?.robotMemberEmail],
    },
  });
  for (const reason of evaluation.reasons) failures.push({ code: `M13-L${reason.layer}`, message: reason.message });
  return { gate: gateResult(failures, failures.length ? exit : undefined), evaluation, seedPlan, guards, derived };
}

async function globalTables(ctx) {
  if (!ctx.paths) return [];
  const plan = await readArtefact(ctx.paths, 'plan', { optional: true }).catch(() => null);
  return (plan?.seed?.globalRows ?? []).map((g) => g.table);
}
