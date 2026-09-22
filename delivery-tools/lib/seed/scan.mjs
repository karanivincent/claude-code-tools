// Post-write scan, refresh and teardown (spec 7.4). Owner: slice B2 (docs/ARCHITECTURE.md).
// The scan reads the database as it is now, not the plan: whatever put a row into a fixture world
// (the seed, a raw insert, a builder's script, a capture that clicked "Add"), it is caught here, and
// the scan runs before every capture.

import { gateResult, combineGates } from '../core/gate.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { DeliveryError, EXIT, UsageError } from '../core/exit.mjs';
import { deriveWithReport } from '../sidefx/derive.mjs';
import { evaluateSeedSafety, ORG_COLUMNS } from './check.mjs';
import { derivedNeverDial, fakeRangeProbe, runGuards, liveWorldRows, idArrayLiteral } from './db.mjs';
import { seedCheck } from './safety.mjs';
import { applyRows } from './apply.mjs';

async function adapter(ctx, write) {
  const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
  return createDataAdapter(ctx, write ? { write } : {});
}

async function requireSeedPlan(ctx) {
  const plan = await readArtefact(ctx.requirePaths(), 'seedplan', { optional: true });
  if (!plan) throw new UsageError('no seedplan.json; run delivery seed --plan first');
  return plan;
}

/**
 * Layers 1 and 2 over every row in every fixture world as the database is now, plus every guard's
 * probes. Red refuses the capture that asked. Called by the phase-4 gate (A1) and before every
 * capture (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function seedScanGate(ctx) {
  return (await seedScan(ctx)).gate;
}

/** The scan with its evaluation, for the seed command's report. */
export async function seedScan(ctx) {
  const { safety } = await ctx.safety();
  const failures = [];
  let seedPlan;
  try { seedPlan = await requireSeedPlan(ctx); } catch (err) {
    return { gate: gateResult([{ code: 'M13-scan', message: err.message }], EXIT.USAGE), evaluation: null };
  }
  let predicates = [];
  try {
    const d = await deriveWithReport(ctx, { write: true });
    predicates = d.sidefx.predicates;
    for (const f of d.failures) failures.push({ code: 'M13-L1', message: `side-effect map: ${f.message}` });
  } catch (err) {
    if (!(err instanceof DeliveryError)) throw err;
    failures.push(...err.failures.map((f) => ({ code: 'M13-L1', message: `side-effect map: ${f.message}` })));
  }
  let rows = [];
  let neverDial = [];
  let guards = [];
  try {
    const db = await adapter(ctx, null);
    await db.query('select 1 as ok');
    rows = await liveWorldRows(db, seedPlan);
    const nd = await derivedNeverDial(db, safety);
    neverDial = nd.numbers;
    failures.push(...nd.failures.map((f) => ({ code: 'M13-L2', message: f.message })));
    const fake = await fakeRangeProbe(db, safety);
    if (!fake.ok) failures.push({ code: 'M13-L2', message: `fake numbers: ${fake.detail}` });
    guards = await runGuards(db, safety, { fixtureOrgs: seedPlan.worlds.map((w) => w.orgId) });
    for (const g of guards) if (!g.holds) failures.push({ code: 'M13-L3', message: `guard ${g.id} does not hold: ${g.why}` });
  } catch (err) {
    if (!(err instanceof DeliveryError)) throw err;
    return { gate: gateResult([...failures, { code: 'M13-db', message: `the fixture worlds could not be read (${err.message}); the scan cannot pass unread` }], EXIT.USAGE), evaluation: null };
  }
  const evaluation = evaluateSeedSafety({
    rows, users: seedPlan.users, worlds: seedPlan.worlds, predicates, safety, neverDial, guards, now: ctx.clock.now(), structure: null,
  });
  for (const reason of evaluation.reasons) failures.push({ code: `M13-L${reason.layer}`, message: `live: ${reason.message}` });
  return { gate: gateResult(failures), evaluation, rows: rows.length };
}

/**
 * Re-apply one world from seedplan.json (relative dates refreshed), then scan it.
 * Called by capture (C) before each world's captures.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} worldId
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function refreshWorld(ctx, worldId) {
  const seedPlan = await requireSeedPlan(ctx);
  if (!seedPlan.worlds.some((w) => w.id === worldId)) {
    return gateResult([{ code: 'M13-refresh', message: `the seed plan has no world "${worldId}"` }], EXIT.USAGE);
  }
  const check = await seedCheck(ctx, { seedPlan, worlds: [worldId] });
  if (!check.gate.ok) return check.gate;
  const db = await adapter(ctx, 'seed-refresh');
  await applyRows(db, seedPlan, { worlds: [worldId], now: ctx.clock.now(), users: false });
  return seedScanGate(ctx);
}

/**
 * Delete rows a capture's clicks created (ids recorded from intercepted responses), then scan.
 * Refuses any row outside the run's worlds. Called by capture (C) after M9 clicks.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ table: string, id: string }[]} rows
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function teardownRows(ctx, rows) {
  const seedPlan = await requireSeedPlan(ctx);
  const orgIds = new Set(seedPlan.worlds.map((w) => w.orgId));
  const byTable = new Map();
  for (const r of rows) {
    if (!/^[a-z_][a-z0-9_]*$/.test(String(r.table)) || !/^[A-Za-z0-9._:-]+$/.test(String(r.id))) {
      return gateResult([{ code: 'M13-teardown', message: `refusing ${r.table}/${r.id}: not a plain table and id` }], EXIT.USAGE);
    }
    if (!byTable.has(r.table)) byTable.set(r.table, []);
    byTable.get(r.table).push(r.id);
  }
  const reader = await adapter(ctx, null);
  const outside = [];
  const present = new Map();
  for (const [table, ids] of byTable) {
    const found = await reader.query(`select * from public."${table}" where id::text = any(${idArrayLiteral(ids)})`);
    for (const row of found) {
      const col = ORG_COLUMNS.find((c) => Object.prototype.hasOwnProperty.call(row, c));
      if (!col || !orgIds.has(String(row[col]))) outside.push(`${table}/${row.id}`);
      else {
        if (!present.has(table)) present.set(table, []);
        present.get(table).push(String(row.id));
      }
    }
  }
  if (outside.length) {
    return gateResult([{ code: 'M13-teardown', message: `refusing to delete ${outside.length} row(s) that are not in one of the run's worlds: ${outside.slice(0, 5).join(', ')}` }]);
  }
  const writer = await adapter(ctx, 'seed-teardown');
  for (const [table, ids] of present) await writer.deleteByIds(table, ids);
  return seedScanGate(ctx);
}

/**
 * `seed --teardown`: delete every row of the seed plan by id (dependants first, organisations
 * last), then its fixture users, then scan.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 */
export async function teardownSeed(ctx) {
  const seedPlan = await requireSeedPlan(ctx);
  const { safety } = await ctx.safety();
  const userRe = new RegExp(safety.fixtureUserPattern);
  const writer = await adapter(ctx, 'seed-teardown');
  const orgIds = new Set(seedPlan.worlds.map((w) => w.orgId));
  // A join row has no id to delete by. It carries the organisation's id, so it goes when the
  // organisation does — which is why organisations are deleted last. If a repo's join table does
  // not cascade, that organisation's delete fails loudly rather than leaving the row unnoticed.
  const ordered = [...seedPlan.rows].reverse().filter((r) => !r.idless);
  const nonOrg = ordered.filter((r) => !orgIds.has(r.id));
  const orgs = ordered.filter((r) => orgIds.has(r.id));
  let deleted = 0;
  for (const group of [...consecutiveByTable(nonOrg), ...consecutiveByTable(orgs)]) {
    deleted += await writer.deleteByIds(group.table, group.ids);
  }
  let users = 0;
  for (const u of seedPlan.users) {
    if (!userRe.test(u.email)) continue; // never delete an account that is not a fixture user
    if (await writer.deleteUser(u.id)) users++;
  }
  const scan = await seedScanGate(ctx);
  return { deleted, users, scan: combineGates([scan]) };
}

function consecutiveByTable(rows) {
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.table === r.table) last.ids.push(r.id);
    else out.push({ table: r.table, ids: [r.id] });
  }
  return out;
}
