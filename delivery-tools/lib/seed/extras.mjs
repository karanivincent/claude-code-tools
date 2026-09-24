// What a refresh removes: rows a capture's clicks added to a fixture world that its plan does not
// have. A click that adds a knowledge entry inserts a row; re-applying the plan never removed it,
// so the next capture in that world counted one entry too many, and a state that added the same
// entry again got a 409. After a refresh the world is exactly what its plan says.
//
// The scope is deliberately narrow, and every part of it comes from the seed plan, never from the
// database: the world's own organisation (the plan's derived id, which is also the id of the
// world's organisation row), and only tables the world's plan seeds rows into, by the organisation
// column those planned rows carry. A row outside that organisation cannot be named here, and the
// delete itself carries the organisation filter too, so the database refuses it as well.

import { ORG_COLUMNS } from './check.mjs';
import { idArrayLiteral } from './db.mjs';

const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const TABLE = /^[a-z_][a-z0-9_]*$/;

/**
 * The world's own organisation id, resolved from the plan alone: the world names it, one of the
 * world's own rows is that organisation, and no other world shares it. Anything less and a refresh
 * cannot say which rows are the world's, so it refuses before writing anything.
 * @param {object} seedPlan
 * @param {string} worldId
 * @returns {{ orgId: string } | { error: string }}
 */
export function worldOrgId(seedPlan, worldId) {
  const world = (seedPlan.worlds ?? []).find((w) => w.id === worldId);
  if (!world) return { error: `the seed plan has no world "${worldId}"` };
  const orgId = world.orgId;
  if (typeof orgId !== 'string' || !SAFE_ID.test(orgId)) {
    return { error: `world ${worldId} names no organisation id in the seed plan; a refresh cannot tell which rows are the world's` };
  }
  if (!(seedPlan.rows ?? []).some((r) => r.world === worldId && r.id === orgId && !r.idless)) {
    return { error: `world ${worldId}'s organisation ${orgId} is not one of its own rows in the seed plan; a refresh cannot tell which rows are the world's` };
  }
  if ((seedPlan.worlds ?? []).some((w) => w.id !== worldId && w.orgId === orgId)) {
    return { error: `world ${worldId}'s organisation ${orgId} is also another world's; a refresh cannot tell which rows are the world's` };
  }
  return { orgId };
}

/**
 * One read per table the world's plan seeds rows into, by the organisation column its planned
 * rows set to the world's organisation. A join table (no id) and a table whose planned rows name
 * the organisation in no organisation column are not read, and are reported as not scoped.
 * @param {object} seedPlan
 * @param {string} worldId
 * @param {string} orgId
 * @returns {{ reads: { table: string, column: string, sql: string }[], unscoped: string[] }}
 */
export function extraReads(seedPlan, worldId, orgId) {
  const byTable = new Map();
  for (const r of seedPlan.rows ?? []) {
    if (r.world !== worldId || r.idless || r.id === orgId) continue;
    if (!byTable.has(r.table)) byTable.set(r.table, []);
    byTable.get(r.table).push(r);
  }
  const reads = [];
  const unscoped = [];
  for (const [table, rows] of byTable) {
    const column = ORG_COLUMNS.find((c) => rows.some((r) => r.values?.[c] === orgId));
    if (!column || !TABLE.test(table)) { unscoped.push(table); continue; }
    reads.push({ table, column, sql: `select id, "${column}" from public."${table}" where "${column}"::text = any(${idArrayLiteral([orgId])})` });
  }
  return { reads, unscoped };
}

/**
 * The rows the reads found that the plan does not have: in the world's organisation (checked
 * again here, whatever the read returned), with a plain id that is no row of the plan in any world
 * and no fixture organisation.
 * @param {object} seedPlan
 * @param {string} orgId
 * @param {{ table: string, column: string }[]} reads
 * @param {object[][]} answers one list of rows per read
 * @returns {{ table: string, column: string, id: string }[]}
 */
export function extraRows(seedPlan, orgId, reads, answers) {
  const planned = new Set((seedPlan.rows ?? []).filter((r) => !r.idless).map((r) => `${r.table}\0${r.id}`));
  const orgIds = new Set((seedPlan.worlds ?? []).map((w) => w.orgId));
  const out = [];
  reads.forEach((read, i) => {
    for (const row of answers[i] ?? []) {
      const id = row?.id === null || row?.id === undefined ? '' : String(row.id);
      if (!SAFE_ID.test(id) || String(row[read.column]) !== orgId) continue;
      if (planned.has(`${read.table}\0${id}`) || orgIds.has(id)) continue;
      out.push({ table: read.table, column: read.column, id });
    }
  });
  return out;
}

/**
 * The order to delete tables in: a table whose planned rows reference another table's planned rows
 * (a value equal to that row's id) is a child of it and goes first. Tables the plan relates in no
 * way go latest-seeded first, as teardown does; a cycle is broken the same way.
 * @param {object} seedPlan
 * @param {string} worldId
 * @param {string[]} tables the tables with rows to delete
 * @returns {string[]}
 */
export function deleteOrder(seedPlan, worldId, tables) {
  const rows = (seedPlan.rows ?? []).filter((r) => r.world === worldId);
  const orgIds = new Set((seedPlan.worlds ?? []).map((w) => w.orgId));
  const tableOf = new Map();
  for (const r of rows) if (!r.idless && !orgIds.has(r.id)) tableOf.set(String(r.id), r.table);
  const firstSeen = new Map();
  rows.forEach((r, i) => { if (!firstSeen.has(r.table)) firstSeen.set(r.table, i); });
  const want = new Set(tables);
  const parentsOf = new Map([...want].map((t) => [t, new Set()]));
  for (const r of rows) {
    if (!want.has(r.table)) continue;
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (k === 'id') continue;
      for (const leaf of leaves(v)) {
        const parent = tableOf.get(leaf);
        if (parent && parent !== r.table && want.has(parent)) parentsOf.get(r.table).add(parent);
      }
    }
  }
  const latestFirst = (a, b) => (firstSeen.get(b) ?? -1) - (firstSeen.get(a) ?? -1) || (a < b ? -1 : 1);
  const left = new Set(want);
  const out = [];
  while (left.size) {
    // A table is ready once no table still to be deleted references it.
    const ready = [...left].filter((t) => ![...left].some((c) => c !== t && parentsOf.get(c).has(t))).sort(latestFirst);
    const next = ready[0] ?? [...left].sort(latestFirst)[0];
    out.push(next);
    left.delete(next);
  }
  return out;
}

function leaves(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(leaves);
  if (v && typeof v === 'object') return Object.values(v).flatMap(leaves);
  return [];
}
