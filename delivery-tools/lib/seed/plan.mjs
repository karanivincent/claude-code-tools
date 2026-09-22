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
// Row keys are unique within a world; the organisation row's key is "org". A row may not set its
// own id. References across worlds are refused: a world is its own organisation.

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { UsageError } from '../core/exit.mjs';
import { readJson } from '../core/fs.mjs';
import { schemaRegistry } from '../core/schema.mjs';

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
 * @param {{ feature: string, runId: string, project: string, plan: object, worldFiles: Record<string, object>, safety: object, tablesWithoutId?: Set<string> }} input
 * @returns {object} seedplan.json value
 */
export function buildSeedPlan({ feature, runId, project, plan, worldFiles, safety, tablesWithoutId }) {
  const worlds = [];
  const rows = [];
  const users = [];
  const problems = [];
  for (const w of plan.worlds ?? []) {
    const file = worldFiles[w.id];
    if (!file) { problems.push(`world ${w.id} has no world file`); continue; }
    const orgId = fixtureId(feature, w.id, 'org');
    worlds.push({ id: w.id, orgId });
    const userIds = new Map();
    const usedRoles = new Set();
    for (const u of w.users ?? []) {
      if (userIds.has(u.role)) { problems.push(`world ${w.id} has two ${u.role} users`); continue; }
      const id = fixtureId(feature, w.id, `user:${u.role}`);
      userIds.set(u.role, id);
      users.push({ world: w.id, role: u.role, email: u.email, id });
    }
    const keys = new Map();
    for (const r of file.rows) {
      if (keys.has(r.key)) problems.push(`world ${w.id}: row key "${r.key}" is used twice`);
      keys.set(r.key, r.key === 'org' ? orgId : fixtureId(feature, w.id, r.key));
    }
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
          return keys.get(target) ?? null;
        }
        if (k.length === 1 && k[0] === '$orgName') return w.orgName.startsWith(safety.fixtureOrgPrefix) ? w.orgName : `${safety.fixtureOrgPrefix}${w.orgName}`;
        if (typeof v.$rel === 'string') return v; // resolved when written
        // An unrecognised $key is a typo or an invented placeholder, never a value anyone meant.
        // It used to fall through and be written literally, so a world file could put
        // {"$orgSlug": true} where a slug belongs and nothing said so until the database refused
        // the insert - or, for a permissive column, did not.
        const dollar = k.filter((key) => key.startsWith('$'));
        if (dollar.length) problems.push(`world ${w.id} ${where}: ${dollar.map((key) => `"${key}"`).join(', ')} ${dollar.length === 1 ? 'is not a' : 'are not'} placeholder${dollar.length === 1 ? '' : 's'}; the world file placeholders are $ref, $orgName and $rel`);
        const out = {};
        for (const [kk, vv] of Object.entries(v)) out[kk] = resolve(vv, `${where}.${kk}`);
        return out;
      }
      return v;
    };
    for (const r of file.rows) {
      if (Object.prototype.hasOwnProperty.call(r.values, 'id')) problems.push(`world ${w.id} row "${r.key}": sets its own id; ids are derived`);
      const id = keys.get(r.key);
      const idless = Boolean(tablesWithoutId?.has(r.table));
      const values = resolve(r.values, `row "${r.key}"`);
      rows.push({ world: w.id, table: r.table, id, ...(idless ? { idless: true } : {}), values: idless ? values : { id, ...values } });
    }
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
  if (problems.length) {
    throw new UsageError(`the worlds cannot become a seed plan (${problems.length} problem(s))`, { failures: problems.map((m) => ({ code: 'seed-plan', message: m })) });
  }
  return { schemaVersion: 1, runId, project, worlds, rows, users };
}
