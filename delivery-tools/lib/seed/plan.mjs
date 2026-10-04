// `delivery seed --plan` (spec 4.4 step 5, 7.4): the plan's worlds plus one world file per world
// become .delivery/<feature>/seedplan.json, with deterministic ids (UUIDv5 of feature, world and
// row key), so a re-seed is an idempotent upsert and teardown is a delete by id list.
//
// A world file, docs/delivery/<feature>/worlds/<world>.json, is written by the coverage-plan step:
//
//   { "schemaVersion": 1, "world": "design",
//     "rows": [ { "key": "org", "table": "organizations", "values": { "name": { "$orgName": true } } },
//               { "key": "w1", "table": "widgets",
//                 "values": { "organization_id": { "$ref": "org" }, "owner_id": { "$ref": "user:admin" },
//                             "created_at": { "$rel": "now-3d" }, "due_on": { "$rel": "today+1d", "as": "date" } } } ] }
//
//   $ref "<key>"   the id of another row of the same world ("org" is the world's organisation)
//   $ref "user:<role>"   the id of the world's fixture user in that role (plan.worlds[].users)
//   $orgName       the world's organisation name: plan.worlds[].orgName behind safety.fixtureOrgPrefix
//   $rel           a time relative to the moment the row is written ("today" worlds stay today)
//   $minuteOfDay   a minute of the local day (0..1440) relative to that moment: "now-60",
//                  "now+2h", "startOfDay", "endOfDay" (time-of-day settings such as calling hours)
// Row keys are unique within a world; the organisation row's key is "org". A row may not set its
// own id. References across worlds are refused: a world is its own organisation.
//
// Rows are written in file order, the organisation first. A $ref to a row written later (a forward
// reference) cannot be written with its row: the row it names is not there yet, and a plain
// foreign key refuses the insert. Two tables that name each other (a script's live version, a
// version's script) need one, whichever comes first. So the column is planned as null and the
// value kept in the row's `deferred`; seed --apply writes every row, then sets those columns.

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { UsageError } from '../core/exit.mjs';
import { readJson } from '../core/fs.mjs';
import { schemaRegistry } from '../core/schema.mjs';
import { resolveMinuteOfDay, resolveRelative, stampTodayMarkers } from './evaluate.mjs';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
/** The namespace every fixture id is derived in. */
export const SEED_NAMESPACE = uuidv5('delivery-tools.invalid', DNS_NAMESPACE);

/** RFC 4122 version 5 (SHA-1) UUID. */
export function uuidv5(name, namespace) {
  const ns = Buffer.from(String(namespace).replace(/-/g, ''), 'hex');
  if (ns.length !== 16) throw new Error(`namespace ${namespace} is not a UUID`);
  const h = createHash('sha1').update(ns).update(Buffer.from(String(name), 'utf8')).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The deterministic id of one fixture row. */
export function fixtureId(feature, world, key) {
  return uuidv5(`${feature}:${world}:${key}`, SEED_NAMESPACE);
}

export const WORLD_SCHEMA = Object.freeze({
  $id: 'https://delivery-tools.invalid/schemas/world.local.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'world', 'rows'],
  properties: {
    schemaVersion: { const: 1 },
    world: { $ref: 'common.schema.json#/$defs/FileId' },
    // R7 of stable picture data: shared tables the world reads but does not own (voices, prompt
    // layers, plan settings). seed --apply hashes them, and shoot warns when one changed since.
    globals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['table'],
        properties: {
          table: { type: 'string', pattern: '^[a-z_][a-z0-9_]*$' },
          ids: { type: 'array', items: { type: 'string', pattern: '^[A-Za-z0-9._:-]+$' } },
        },
      },
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'table', 'values'],
        properties: {
          key: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
          table: { type: 'string', pattern: '^[a-z_][a-z0-9_]*$' },
          values: { type: 'object' },
        },
      },
    },
  },
});

/** docs/delivery/<feature>/worlds/<world>.json */
export function worldFilePath(paths, worldId) {
  return join(paths.deliveryDir, 'worlds', `${worldId}.json`);
}

/**
 * A planned row's values as they stand once seed --apply is done: its deferred columns (forward
 * references, written after every row) set to the ids they name rather than the null written first.
 * @param {{ values: object, deferred?: object }} row
 * @returns {object}
 */
export function plannedValues(row) {
  return row.deferred ? { ...row.values, ...row.deferred } : row.values;
}

/**
 * Read and validate one world file.
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {string} worldId
 */
export async function readWorldFile(paths, worldId) {
  const path = worldFilePath(paths, worldId);
  const value = await readJson(path, { optional: true });
  if (value === null) throw new UsageError(`world ${worldId} has no world file at ${path}; the coverage-plan step writes one per world`);
  const { ok, errors } = schemaRegistry().validate(WORLD_SCHEMA, value);
  if (!ok) {
    throw new UsageError(`${path} is not a valid world file (${errors.length} issue(s))`, {
      failures: errors.map((e) => ({ code: 'world', message: `${path}${e.path === '/' ? '' : e.path}: ${e.message}` })),
    });
  }
  if (value.world !== worldId) throw new UsageError(`${path} says world "${value.world}", not "${worldId}"`);
  return value;
}

/**
 * Pure: plan worlds and world files to a seed plan.
 *
 * `tablesWithoutId` names the tables the generated database types show with no `id` column — a
 * join table such as a membership, whose primary key is the pair of columns it joins. Every other
 * row carries a derived id, which is what makes a re-seed an idempotent upsert and a teardown a
 * delete by id list. A join row is written without one and goes when its organisation does, so a
 * world can say who its fixture users are members of. Nothing could, before: `applyRows` set `id`
 * on every row and the database refused the insert.
 *
 * `previous` is the seed plan this one replaces, if there was one. Each world records
 * `seededTables`: every table its rows write now plus every table it wrote before (the previous
 * plan's own `seededTables`, or its rows' tables). A refresh uses it to clean a table the world
 * has stopped seeding, which the current rows alone would never name. Tables with no `id` column
 * (a join table) are left out: a refresh judges rows by id.
 * @param {{ feature: string, runId: string, project: string, plan: object, worldFiles: Record<string, object>, safety: object, tablesWithoutId?: Set<string>, previous?: object|null }} input
 * @returns {object} seedplan.json value
 */
export function buildSeedPlan({ feature, runId, project, plan, worldFiles, safety, tablesWithoutId, previous }) {
  const worlds = [];
  const rows = [];
  const users = [];
  const problems = [];
  for (const w of plan.worlds ?? []) {
    const file = worldFiles[w.id];
    if (!file) { problems.push(`world ${w.id} has no world file`); continue; }
    const orgId = fixtureId(feature, w.id, 'org');
    const world = { id: w.id, orgId, ...(file.globals?.length ? { globals: file.globals } : {}) };
    worlds.push(world);
    const userIds = new Map();
    const usedRoles = new Set();
    for (const u of w.users ?? []) {
      if (userIds.has(u.role)) { problems.push(`world ${w.id} has two ${u.role} users`); continue; }
      const id = fixtureId(feature, w.id, `user:${u.role}`);
      userIds.set(u.role, id);
      users.push({ world: w.id, role: u.role, email: u.email, id, ...(u.name ? { name: u.name } : {}) });
    }
    const keys = new Map();
    // Where each row is written: the organisation first, then the rest in file order.
    const order = new Map();
    file.rows.forEach((r, i) => {
      if (keys.has(r.key)) problems.push(`world ${w.id}: row key "${r.key}" is used twice`);
      keys.set(r.key, r.key === 'org' ? orgId : fixtureId(feature, w.id, r.key));
      if (!order.has(r.key)) order.set(r.key, r.key === 'org' ? -1 : i);
    });
    let writing = -1;
    let forward = false;
    if (!keys.has('org')) problems.push(`world ${w.id}: no row with key "org" (the world's organisation)`);
    const resolve = (v, where) => {
      if (Array.isArray(v)) return v.map((x, i) => resolve(x, `${where}[${i}]`));
      if (v && typeof v === 'object') {
        const k = Object.keys(v);
        if (k.length === 1 && k[0] === '$ref') {
          const target = String(v.$ref);
          if (target.startsWith('user:')) {
            const role = target.slice(5);
            const id = userIds.get(role);
            if (!id) problems.push(`world ${w.id} ${where}: no ${role} user in the plan's world`);
            else usedRoles.add(role);
            return id ?? null;
          }
          if (!keys.has(target)) problems.push(`world ${w.id} ${where}: $ref "${target}" names no row of this world`);
          else if (order.get(target) > writing) forward = true;
          return keys.get(target) ?? null;
        }
        if (k.length === 1 && k[0] === '$orgName') {
          // A world with no orgName used to crash here ("Cannot read properties of undefined
          // (reading 'startsWith')") rather than naming the problem (fix round, 0.9.1 bug 2).
          if (typeof w.orgName !== 'string' || !w.orgName) { problems.push(`world ${w.id}: no orgName set (the plan or map must give every world an orgName)`); return null; }
          return w.orgName.startsWith(safety.fixtureOrgPrefix) ? w.orgName : `${safety.fixtureOrgPrefix}${w.orgName}`;
        }
        if (typeof v.$rel === 'string') {
          if ('today' in v && v.today !== true) problems.push(`world ${w.id} ${where}: "today" on a $rel marker takes only true (the time must fall today)`);
          return v.today === true ? { ...v } : v; // resolved when written
        }
        if (k.includes('$minuteOfDay')) {
          const extra = k.filter((key) => key !== '$minuteOfDay' && key !== 'wrap');
          if (extra.length || typeof v.$minuteOfDay !== 'string') problems.push(`world ${w.id} ${where}: a $minuteOfDay marker takes a string and an optional "wrap": true, nothing else${extra.length ? ` (not ${extra.join(', ')})` : ''}`);
          else try { resolveMinuteOfDay(v, new Date(0)); } catch (err) { problems.push(`world ${w.id} ${where}: ${err.message}`); }
          return v; // resolved when written, like $rel
        }
        // An unrecognised $key is a typo or an invented placeholder, never a value anyone meant.
        // It used to fall through and be written literally, so a world file could put
        // {"$orgSlug": true} where a slug belongs and nothing said so until the database refused
        // the insert - or, for a permissive column, did not.
        const dollar = k.filter((key) => key.startsWith('$'));
        if (dollar.length) problems.push(`world ${w.id} ${where}: ${dollar.map((key) => `"${key}"`).join(', ')} ${dollar.length === 1 ? 'is not a' : 'are not'} placeholder${dollar.length === 1 ? '' : 's'}; the world file placeholders are $ref, $orgName, $rel and $minuteOfDay`);
        const out = {};
        for (const [kk, vv] of Object.entries(v)) out[kk] = resolve(vv, `${where}.${kk}`);
        return out;
      }
      return v;
    };
    file.rows.forEach((r, i) => {
      if (Object.prototype.hasOwnProperty.call(r.values, 'id')) problems.push(`world ${w.id} row "${r.key}": sets its own id; ids are derived`);
      const id = keys.get(r.key);
      const idless = Boolean(tablesWithoutId?.has(r.table));
      writing = r.key === 'org' ? -1 : i;
      const values = {};
      const deferred = {};
      const dollar = Object.keys(r.values).filter((col) => col.startsWith('$'));
      if (dollar.length) problems.push(`world ${w.id} row "${r.key}": ${dollar.map((col) => `"${col}"`).join(', ')} ${dollar.length === 1 ? 'is not a' : 'are not'} placeholder${dollar.length === 1 ? '' : 's'}; the world file placeholders are $ref, $orgName, $rel and $minuteOfDay`);
      for (const [col, v] of Object.entries(r.values)) {
        forward = false;
        const resolved = resolve(v, `row "${r.key}".${col}`);
        if (!forward) { values[col] = resolved; continue; }
        values[col] = null;
        deferred[col] = resolved;
      }
      const later = Object.keys(deferred);
      // A join row has no id to set a column by afterwards, so it must come after what it names.
      if (idless && later.length) problems.push(`world ${w.id} row "${r.key}": ${later.join(', ')} names a row written after it, and a ${r.table} row has no id to set it by later; move the row after the rows it names`);
      rows.push({
        world: w.id, table: r.table, id, ...(idless ? { idless: true } : {}),
        values: idless ? values : { id, ...values },
        ...(later.length && !idless ? { deferred } : {}),
      });
    });
    // A world's users are created in the auth system by seed --apply and joined to its organisation
    // by the world file, because only the repo knows which table and columns that join lives in.
    // A world file that never references a user leaves that user belonging to nothing, and nothing
    // said so: the widgets rehearsal's wave-0 smoke signed each fixture user in, every world
    // resolved to no organisation, and all four captures came back byte-identical.
    for (const role of userIds.keys()) {
      if (usedRoles.has(role)) continue;
      problems.push(`world ${w.id}: the plan declares a ${role} user and no row of its world file references it; join it to the organisation with {"$ref": "user:${role}"}, or the capture signs that user in and they belong to nothing`);
    }
  }
  for (const world of worlds) world.seededTables = seededTablesOf(world.id, rows, previous, tablesWithoutId);
  if (problems.length) {
    throw new UsageError(`the worlds cannot become a seed plan (${problems.length} problem(s))`, { failures: problems.map((m) => ({ code: 'seed-plan', message: m })) });
  }
  const staggered = staggerTies(rows);
  // After the stagger, so the second each tie gained counts toward the world's earliest today value.
  for (const world of worlds) stampTodayMarkers(rows.filter((r) => r.world === world.id));
  return { schemaVersion: 1, runId, project, worlds, rows, users, ...(staggered.length ? { staggered } : {}) };
}

/**
 * The sorted union of the tables a world's rows write now and the tables it wrote in the previous
 * plan, without any table that has rows with no id (a join table, in this plan or the last).
 */
function seededTablesOf(worldId, rows, previous, tablesWithoutId) {
  const idless = new Set(tablesWithoutId ?? []);
  const tables = new Set();
  for (const r of rows) {
    if (r.world !== worldId) continue;
    if (r.idless) idless.add(r.table);
    tables.add(r.table);
  }
  for (const r of previous?.rows ?? []) if (r.idless) idless.add(r.table);
  const before = (previous?.worlds ?? []).find((w) => w.id === worldId);
  const carried = Array.isArray(before?.seededTables)
    ? before.seededTables
    : (previous?.rows ?? []).filter((r) => r.world === worldId).map((r) => r.table);
  for (const t of carried) tables.add(t);
  return [...tables].filter((t) => !idless.has(t)).sort();
}

// Any fixed instant: ties between relative times do not depend on which one.
const TIE_REFERENCE = new Date(Date.UTC(2026, 0, 15, 12));

/**
 * R9 of stable picture data: rows with equal timestamps sort in any order, so a list reorders
 * between shoots. Within one world, table and column, relative times that name the same moment are
 * made distinct: the first row (in file order, which is the order the design shows them) keeps its
 * time, and each later one is a second earlier than the one before, so a newest-first list shows
 * them in file order. Dates (`as: "date"`) may share a day and are left alone. Changes `rows` in place.
 * @param {{ world: string, table: string, values: object }[]} rows
 * @returns {{ world: string, table: string, column: string, rows: number }[]} the groups it changed
 */
export function staggerTies(rows) {
  const groups = new Map();
  for (const r of rows) {
    for (const [col, v] of Object.entries(r.values ?? {})) {
      if (!v || typeof v !== 'object' || typeof v.$rel !== 'string' || v.as === 'date') continue;
      let t;
      try { t = new Date(resolveRelative({ $rel: v.$rel }, TIE_REFERENCE)).getTime(); } catch { continue; }
      const k = `${r.world}\0${r.table}\0${col}\0${t}`;
      if (!groups.has(k)) groups.set(k, { world: r.world, table: r.table, column: col, list: [] });
      groups.get(k).list.push(r);
    }
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.list.length < 2) continue;
    g.list.forEach((r, i) => {
      if (i) r.values[g.column] = { ...r.values[g.column], $rel: `${r.values[g.column].$rel}-${i}s` };
    });
    out.push({ world: g.world, table: g.table, column: g.column, rows: g.list.length });
  }
  return out;
}
