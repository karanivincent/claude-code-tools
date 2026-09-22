// plan check, M1 (spec 4.3 step 4, 5.2, 6.1, 10.1, 10.2). Owner: slice B1 (docs/ARCHITECTURE.md).
// checkPlan is pure; planGate reads the files and composes it. Every failure names the row, unit
// or line it is about, so the plan's author can fix it without rereading the spec.

import { readArtefact } from '../core/artefacts.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson } from '../core/fs.mjs';
import { parseDatabaseTypes } from './verify.mjs';
import { schemaRegistry } from '../core/schema.mjs';
import { WORLD_SCHEMA, worldFilePath } from '../seed/plan.mjs';
import { gateResult } from '../core/gate.mjs';
import { parseInvariant } from '../checks/invariants.mjs';

/** Classes that are built (spec 5.2); cut and remove are not. */
export const BUILD_CLASSES = Object.freeze(new Set(['keep', 'change', 'new', 'migrate', 'adapt']));
/** The only reasons a designed state may be cut (spec 10.1). */
export const CUT_REASONS = Object.freeze(new Set(['money', 'dials', 'production', 'new-vendor', 'over-size']));
/** The rules an adapt row may name (spec 10.3, 11.6). */
export const ADAPT_RULES = Object.freeze(new Set(['banned-word', 'product-behaviour', 'data-not-in-product', 'older-than-product']));
/** Reach classes verified by a capture rather than a component test. */
const CAPTURED = new Set(['seeded', 'action']);
const CAP_ID_RE = /^CAP-\d{3}$/;
const STATE_ID_RE = /^[A-Z]{1,6}-\d{2,3}$/;
const MAX_SCOPE_LINES = 5;

/** "Product behavior", "the product's behaviour" and "product-behaviour" all name one rule. */
export function normaliseAdaptRule(rule) {
  const t = String(rule ?? '').toLowerCase().replace(/\bthe\b/g, ' ').replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
  return { 'product-behavior': 'product-behaviour', 'banned-words': 'banned-word' }[t] ?? t;
}

/** Simple glob to regex: ** crosses directories, * stays inside one. */
function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const isGlob = (p) => /[*?]/.test(p);

/** Whether two file entries of unit lists can name the same file. */
export function filesOverlap(a, b) {
  if (a === b) return true;
  if (isGlob(a) && globRe(a).test(b)) return true;
  if (isGlob(b) && globRe(b).test(a)) return true;
  if (isGlob(a) && isGlob(b)) {
    const stem = (g) => g.slice(0, g.search(/[*?]/));
    const [x, y] = [stem(a), stem(b)];
    return x.startsWith(y) || y.startsWith(x);
  }
  return false;
}

/**
 * M1 over plain data. Returns one failure per problem.
 * @param {{ plan: object, inventory?: object|null, baseline?: object|null, intent?: object|null, profile: object }} input
 * @returns {import('../core/gate.mjs').GateFailure[]}
 */
export function checkPlan({ plan, inventory = null, baseline = null, intent = null, profile }) {
  const out = [];
  const fail = (code, message) => out.push({ code, message });
  const limits = profile?.limits ?? {};
  const messageFiles = new Set((profile?.paths?.messages ?? []).map((m) => m.file));
  const rows = plan.rows ?? [];
  const units = plan.units ?? [];
  const worlds = new Map((plan.worlds ?? []).map((w) => [w.id, w]));
  const unitById = new Map();
  for (const u of units) {
    if (unitById.has(u.id)) fail('M1-unit-invalid', `unit ${u.id} is defined twice`);
    unitById.set(u.id, u);
  }
  const states = new Map((inventory?.states ?? []).map((s) => [s.id, s]));
  const caps = new Map((baseline?.capabilities ?? []).map((c) => [c.id, c]));
  const scopeByLine = new Map((plan.scope ?? []).map((s) => [s.line, s]));

  // Coverage: every inventory state and baseline capability has exactly one row.
  const rowCount = new Map();
  for (const r of rows) rowCount.set(r.id, (rowCount.get(r.id) ?? 0) + 1);
  for (const [id, n] of rowCount) if (n > 1) fail('M1-duplicate-row', `${id} has ${n} rows; exactly one is allowed`);
  for (const s of states.values()) {
    if (!rowCount.has(s.id)) fail('M1-missing-row', `state ${s.id} (${s.screen}: ${s.name}) has no plan row: it is unowned; build it (a row with an owner), or cut it with a reason code, an issue and budget`);
  }
  for (const c of caps.values()) {
    if (!rowCount.has(c.id)) fail('M1-missing-row', `capability ${c.id} (${c.signature}) has no plan row; an old capability the design leaves out defaults to migrate`);
  }

  // Which unit lists which row.
  const listedBy = new Map();
  for (const u of units) {
    for (const id of [...(u.states ?? []), ...(u.capabilities ?? [])]) {
      listedBy.set(id, [...(listedBy.get(id) ?? []), u.id]);
      if (!rowCount.has(id)) fail('M1-unit-invalid', `unit ${u.id} lists ${id}, which has no plan row`);
    }
  }

  const allIds = new Set([...states.keys(), ...caps.keys(), ...rows.map((r) => r.id)]);
  const buildStates = [];
  const cutFeatures = new Set();
  for (const r of rows) {
    const isCap = CAP_ID_RE.test(r.id) || caps.has(r.id);
    const known = states.has(r.id) || caps.has(r.id);
    if (!known && !r.invented && (inventory || baseline)) {
      fail('M1-unknown-row', `row ${r.id} is not an inventory state or a baseline capability; mark it invented if the design does not draw it`);
    }
    const build = BUILD_CLASSES.has(r.class);

    if (build) {
      if (!r.owner) fail('M1-no-owner', `${r.id} (${r.class}) has no owner: every built row belongs to exactly one unit`);
      else if (!unitById.has(r.owner)) fail('M1-owner-unknown', `${r.id} is owned by ${r.owner}, which is not a unit`);
      const lists = listedBy.get(r.id) ?? [];
      if (r.owner && unitById.has(r.owner) && !lists.includes(r.owner)) fail('M1-owner-mismatch', `${r.id} is owned by ${r.owner}, but ${r.owner} does not list it`);
      if (lists.length > 1) fail('M1-owner-mismatch', `${r.id} is listed by ${lists.length} units (${lists.join(', ')}); exactly one owns it`);
    }

    const needsReach = build && (!isCap || ['route', 'control'].includes(caps.get(r.id)?.kind));
    if (needsReach) {
      if (!isCap) buildStates.push(r);
      checkReach(r, worlds, fail);
      checkMarkers(r, allIds, fail);
    }

    if (r.class === 'migrate' && !r.migrateTo) fail('M1-migrate-no-target', `${r.id} is migrate but names no migrateTo file and control`);
    if (r.class === 'adapt') {
      if (!r.adapt) fail('M1-adapt-invalid', `${r.id} is adapt but has no adapt rule, design text and product text`);
      else if (!ADAPT_RULES.has(normaliseAdaptRule(r.adapt.rule))) fail('M1-adapt-invalid', `${r.id}: adapt rule "${r.adapt.rule}" is not one of ${[...ADAPT_RULES].join(', ')}`);
    }

    if (r.class === 'cut') {
      if (!r.reason) fail('M1-cut-no-reason', `${r.id} is cut without a reason code (one of ${[...CUT_REASONS].join(', ')})`);
      else if (!CUT_REASONS.has(r.reason.code)) fail('M1-cut-no-reason', `${r.id} is cut with reason "${r.reason.code}", which is not one of ${[...CUT_REASONS].join(', ')}`);
      if (!r.issue) fail('M1-cut-no-issue', `${r.id} is cut without a follow-up issue`);
      if (r.requested) checkScopeLine(r, 'cut-requested', scopeByLine, fail, `${r.id} cuts ${r.requested}, which the founder requested`);
      cutFeatures.add(r.issue ? `issue:${r.issue}` : `row:${r.id}`);
    }
    if (r.class === 'remove') {
      if (!r.reason) fail('M1-remove-no-reason', `${r.id} is removed without a reason code`);
      checkScopeLine(r, 'remove', scopeByLine, fail, `${r.id} removes a shipped capability`);
    }

    for (const c of r.controls ?? []) {
      if (typeof c.target === 'string' && STATE_ID_RE.test(c.target) && !allIds.has(c.target)) {
        fail('M1-control-target', `${r.id}: control "${c.label}" leads to ${c.target}, which is neither a state nor a row`);
      }
    }
    for (const inv of r.invariants ?? []) {
      if (!parseInvariant(inv)) fail('M1-invariant', `${r.id}: invariant "${inv}" is not machine-checkable; write it as "at most <n> ... shows <text>", "never <text>" or "\\"a\\" never beside \\"b\\""`);
    }

    for (const d of r.data ?? []) {
      if (d.exists) continue;
      const byUnit = units.some((u) => u.kind === 'backend' && [u.title, ...(u.files ?? []), ...(u.capabilities ?? [])].some((x) => String(x).toLowerCase().includes(d.table.toLowerCase())));
      const byRow = (r.backend ?? []).some((b) => !b.exists && b.unit && unitById.has(b.unit));
      if (!byUnit && !byRow) fail('M1-backend-no-unit', `${r.id} needs ${d.table}.${d.column}, which is missing, and no backend unit adds it`);
    }
    for (const b of r.backend ?? []) {
      if (b.exists) continue;
      if (!b.unit) fail('M1-backend-no-unit', `${r.id} calls ${b.method} ${b.route}${b.discriminator ? ` ${b.discriminator}` : ''}, which is missing, with no unit to build it`);
      else if (!unitById.has(b.unit)) fail('M1-backend-no-unit', `${r.id}: ${b.method} ${b.route} is assigned to ${b.unit}, which is not a unit`);
    }
  }

  // Budgets.
  const maxCuts = limits.maxCuts ?? 5;
  if (cutFeatures.size > maxCuts) fail('M1-cut-budget', `${cutFeatures.size} cut features; the budget is ${maxCuts}: build the rest`);
  const capPct = limits.maxPropOrUnseedablePct ?? 20;
  const propLike = buildStates.filter((r) => r.reach && (r.reach.class === 'prop' || r.reach.class === 'unseedable'));
  if (buildStates.length && (propLike.length * 100) / buildStates.length > capPct) {
    fail('M1-prop-cap', `${propLike.length} of ${buildStates.length} built states are prop or unseedable (${Math.round((propLike.length * 1000) / buildStates.length) / 10}%); the cap is ${capPct}%: add a world or an intercept (${propLike.map((r) => r.id).join(', ')})`);
  }

  // Scope lines.
  const scope = plan.scope ?? [];
  if (scope.length > MAX_SCOPE_LINES) fail('M1-scope-too-long', `${scope.length} Scope lines; at most ${MAX_SCOPE_LINES}: more than five means the plan is wrong`);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const lineIds = new Set();
  for (const s of scope) {
    if (lineIds.has(s.line)) fail('M1-scope-invalid', `Scope line ${s.line} appears twice`);
    lineIds.add(s.line);
    for (const id of s.rows) if (!rowById.has(id)) fail('M1-scope-invalid', `Scope line ${s.line} names ${id}, which has no row`);
  }

  // Units: files, waves, contracts.
  if (units.some((u) => u.kind !== 'contract') && !units.some((u) => u.kind === 'contract' && u.wave === 0)) {
    fail('M1-no-contract-unit', 'wave 0 has no contract unit; screens build against contracts and stubs (spec 12.1)');
  }
  for (const u of units) {
    for (const f of u.files ?? []) {
      if (messageFiles.has(f) && u.kind !== 'words') fail('M1-message-file', `unit ${u.id} (${u.kind}) lists message file ${f}; only the words unit edits message files`);
    }
    for (const id of u.states ?? []) {
      const r = rowById.get(id);
      if (r && !BUILD_CLASSES.has(r.class)) fail('M1-unit-invalid', `unit ${u.id} lists ${id}, whose row is ${r.class}, not built`);
    }
  }
  const waves = new Map();
  for (const u of units) waves.set(u.wave, [...(waves.get(u.wave) ?? []), u]);
  for (const [wave, list] of [...waves].sort(([a], [b]) => a - b)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        for (const a of list[i].files ?? []) {
          if (messageFiles.has(a)) continue;
          const hit = (list[j].files ?? []).find((b) => !messageFiles.has(b) && filesOverlap(a, b));
          if (hit) fail('M1-file-overlap', `units ${list[i].id} and ${list[j].id} both touch ${a === hit ? a : `${a} and ${hit}`} in wave ${wave}`);
        }
      }
    }
  }
  for (const c of plan.contracts ?? []) {
    for (const consumer of c.consumers ?? []) if (!unitById.has(consumer)) fail('M1-contract-consumer', `contract ${c.id} names consumer ${consumer}, which is not a unit`);
  }

  // Everything the founder requested in a design round is planned somewhere.
  const requestedRows = new Set(rows.map((r) => r.requested).filter(Boolean));
  for (const q of intent?.requested ?? []) {
    if (!requestedRows.has(q.id)) fail('M1-requested-unplanned', `requested item ${q.id} ("${q.text}") is on no plan row`);
  }
  return out;
}

function checkScopeLine(r, kind, scopeByLine, fail, what) {
  if (!r.scopeLine) { fail(kind === 'remove' ? 'M1-remove-no-scope' : 'M1-cut-no-scope', `${what}: it needs a Scope line`); return; }
  const s = scopeByLine.get(r.scopeLine);
  if (!s) fail('M1-scope-invalid', `${r.id} points at Scope line ${r.scopeLine}, which the plan does not have`);
  else if (!s.rows.includes(r.id)) fail('M1-scope-invalid', `Scope line ${r.scopeLine} does not name ${r.id}`);
  else if (s.kind !== kind) fail('M1-scope-invalid', `Scope line ${r.scopeLine} is ${s.kind}, but ${r.id} needs a ${kind} line`);
}

function checkReach(r, worlds, fail) {
  const reach = r.reach;
  if (!reach) { fail('M1-no-reach', `${r.id} (${r.class}) has no reach: its class, world, role and steps`); return; }
  const w = worlds.get(reach.world);
  if (CAPTURED.has(reach.class)) {
    if (!w) fail('M1-reach-invalid', `${r.id}: world "${reach.world}" is not one of the plan's worlds`);
    else if (!w.users.some((u) => u.role === reach.role)) fail('M1-reach-invalid', `${r.id}: world ${reach.world} has no ${reach.role} user`);
  }
  if (reach.class === 'seeded' && !(reach.steps ?? []).length) fail('M1-reach-invalid', `${r.id} is seeded but has no steps (at least a goto)`);
  if (reach.class === 'action' && !reach.intercept && !reach.test) fail('M1-reach-invalid', `${r.id} is action: it needs an intercept the capture can answer, or a component test`);
  if (reach.class === 'action' && reach.intercept && !(reach.steps ?? []).length) fail('M1-reach-invalid', `${r.id} is action by intercept but has no steps`);
  if (reach.class === 'prop' && !reach.test) fail('M1-reach-invalid', `${r.id} is prop: it needs a component render test (file and name)`);
  if (reach.class === 'unseedable' && !reach.why) fail('M1-reach-invalid', `${r.id} is unseedable without a reason code (needs-live-call, needs-carrier, needs-time, needs-third-party, unsafe-to-seed)`);
}

function checkMarkers(r, allIds, fail) {
  const m = r.markers;
  if (!m) { fail('M1-no-markers', `${r.id} has no markers: the text and test ids that prove its capture shows this state`); return; }
  const captured = CAPTURED.has(r.reach?.class);
  if (captured && !(m.testids ?? []).length) fail('M1-no-markers', `${r.id} names no test id; the plan gives every captured state a root test id`);
  if (captured && !(m.text ?? []).length) fail('M1-no-markers', `${r.id} names no text marker`);
  if (!captured && !(m.text ?? []).length && !(m.testids ?? []).length) fail('M1-no-markers', `${r.id} names no text or test-id marker for its component test`);
  if (m.sameAs && !allIds.has(m.sameAs.state)) fail('M1-sameas', `${r.id} is declared the same as ${m.sameAs.state}, which is not a state`);
}

/**
 * Phase-3 gate input (M1): plan.json against inventory.json, baseline.json (when present) and
 * intent.json, with the profile's limits. Called by lib/gates/phase-3.mjs (A1) and plan check.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function planGate(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readArtefact(paths, 'plan', { optional: true });
  if (!plan) return gateResult([{ code: 'M1-no-plan', message: `no plan at ${paths.plan}; write it with the coverage-plan skill` }]);
  const inventory = await readArtefact(paths, 'inventory', { optional: true });
  const baseline = await readArtefact(paths, 'baseline', { optional: true });
  const intent = await readArtefact(paths, 'intent', { optional: true });
  const failures = [];
  if (!inventory) failures.push({ code: 'M1-no-inventory', message: `no inventory at ${paths.inventory}; coverage cannot be checked without it` });
  if (intent?.redesign && !baseline) failures.push({ code: 'M1-no-baseline', message: `the intent says redesign, but there is no baseline at ${paths.baseline}` });
  if (plan.feature !== paths.feature) failures.push({ code: 'M1-feature', message: `plan.json is for feature ${plan.feature}, not ${paths.feature}` });
  failures.push(...checkPlan({ plan, inventory, baseline, intent, profile }));
  failures.push(...(await worldFileFailures(paths, plan, profile)));
  return gateResult(failures);
}

/**
 * Every world the plan declares has a world file the seed step can read (spec 7.4).
 *
 * The coverage-plan step writes one per world, and nothing used to check it: a plan could declare
 * five worlds, go green here, advance, open a draft pull request and run four builders, and the
 * omission surfaced two phases later at `seed --plan`, as a usage error naming one world at a
 * time. It belongs in this gate, where the worlds are written.
 *
 * The tables those files seed are checked here too. A world seeding a table that does not exist
 * and that no row declares missing is a plan with no backend unit for it: the seed step would
 * have found out from the database, after the draft pull request and the builders.
 */
/** The backend units of a plan that name a table, the way M1-backend-no-unit matches them. */
function buildersOf(plan, table) {
  const needle = String(table).toLowerCase();
  return (plan.units ?? []).filter((u) => u.kind === 'backend' && [u.title, ...(u.files ?? []), ...(u.capabilities ?? [])].some((x) => String(x).toLowerCase().includes(needle)));
}

async function worldFileFailures(paths, plan, profile) {
  const out = [];
  const databaseTypes = profile?.paths?.databaseTypes;
  let typesText = null;
  if (databaseTypes) { try { typesText = await readFile(join(paths.repoRoot, databaseTypes), 'utf8'); } catch { typesText = null; } }
  const types = typesText === null ? null : parseDatabaseTypes(typesText);
  // A plan says a table is missing through a row's data claim; that is how it asks for a backend
  // unit to build one. Any other table a world seeds has to exist already.
  const declaredMissing = new Set((plan.rows ?? []).flatMap((r) => (r.data ?? []).filter((d) => d.exists === false).map((d) => d.table)));
  for (const w of plan.worlds ?? []) {
    const path = worldFilePath(paths, w.id);
    const value = await readJson(path, { optional: true });
    if (value === null) {
      out.push({ code: 'M1-no-world-file', message: `world ${w.id} has no world file at ${path}; the coverage-plan step writes one per world` });
      continue;
    }
    const { ok, errors } = schemaRegistry().validate(WORLD_SCHEMA, value);
    if (!ok) { for (const e of errors.slice(0, 3)) out.push({ code: 'M1-world-file', message: `${path}${e.path === '/' ? '' : e.path}: ${e.message}` }); continue; }
    if (value.world !== w.id) { out.push({ code: 'M1-world-file', message: `${path} says world "${value.world}", not "${w.id}"` }); continue; }
    // No types file to read: that is its own problem, reported by preflight, and this rule has
    // nothing to say about a table it cannot look up.
    if (!types) continue;
    for (const t of new Set((value.rows ?? []).map((r) => r.table))) {
      if (types.has(t)) continue;
      if (!declaredMissing.has(t)) {
        out.push({ code: 'M1-world-table', message: `${path} seeds ${t}, which ${databaseTypes} does not have and no row of the plan declares missing; a table nobody builds is a backend unit, not a seed row` });
        continue;
      }
      // `delivery seed --apply` runs at the end of wave 0, so a table the worlds seed has to be
      // created in wave 0 too. A backend unit defaults to wave 1, which is right for a route or a
      // column on a table that already exists and wrong for the table the fixtures need.
      const builders = buildersOf(plan, t);
      if (builders.length && builders.every((u) => u.wave > 0)) {
        out.push({ code: 'M1-world-table-wave', message: `${path} seeds ${t}, which ${builders.map((u) => `${u.id} (wave ${u.wave})`).join(', ')} creates; wave 0 seeds, so the unit that creates a seeded table belongs in wave 0` });
      }
    }
  }
  return out;
}
