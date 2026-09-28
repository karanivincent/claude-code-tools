// A1 and A2 (spec: "say at map time whether each state's data exists", "validate CHECK
// constraints at intake"). Owner: slice B2 (docs/ARCHITECTURE.md). Both functions are pure: the
// caller reads the seed plan's rows (the world files, already resolved by lib/seed/plan.mjs) and,
// for A2, the database's CHECK constraints and enum labels (lib/seed/db.mjs); nothing here does I/O.

import { evalFilter, resolveValues } from './evaluate.mjs';
import { plannedValues } from './plan.mjs';

/**
 * @typedef {{ world?: string, table: string, where: Record<string, unknown>, min?: number }} DataNeed
 * @typedef {{ state: string, table: string, where: Record<string, unknown>, wanted: number, found: number }} DataGap
 */

/** Whether every column of `where` reads "yes" against a row's resolved values. */
function matchesWhere(where, values, now) {
  return Object.entries(where ?? {}).every(([column, value]) => {
    const op = value === null ? 'is' : 'eq';
    return evalFilter({ column, op, value }, values, now) === 'yes';
  });
}

/**
 * A1: which of the map's states declare data (`state.data`, written by the mapper, briefs/mapper.md)
 * that the seed plan's rows do not have enough of. Checked against the rows the worlds seed — the
 * world files, already resolved into `seedPlan.rows` by buildSeedPlan — never the live database:
 * seed --check runs this before any write, and seed --apply runs it again on the same plan.
 * A state's `data` entry with no `world` defaults to the state's own `reach.world`.
 * @param {{ id: string, data?: DataNeed[], reach?: { world?: string } }[]} states map.states
 * @param {{ world: string, table: string, values: object, deferred?: object }[]} rows seedPlan.rows
 * @param {Date} [now]
 * @returns {DataGap[]}
 */
export function stateDataGaps(states, rows, now = new Date()) {
  const gaps = [];
  const resolved = rows.map((r) => ({ world: r.world, table: r.table, values: resolveValues(plannedValues(r), now) }));
  for (const s of states ?? []) {
    for (const d of s.data ?? []) {
      const world = d.world ?? s.reach?.world;
      const min = d.min ?? 1;
      const found = resolved.filter((r) => r.table === d.table && (!world || r.world === world) && matchesWhere(d.where, r.values, now)).length;
      if (found < min) gaps.push({ state: s.id, table: d.table, where: d.where ?? {}, wanted: min, found });
    }
  }
  return gaps;
}

/** "column = value and column2 = value2", for a data-gap message. */
export function describeWhere(where) {
  const entries = Object.entries(where ?? {});
  if (!entries.length) return 'every row';
  return entries.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(' and ');
}

// ---------------------------------------------------------------------------------------------
// A2: CHECK constraints and enum types, at seed --plan.

/**
 * A CHECK constraint's definition text, as `pg_get_constraintdef` prints it, parsed when it is a
 * simple allow-list: `col IN (...)` or `(col)::text = ANY (ARRAY['a'::text, 'b'::text])`. Any
 * other shape (a range, a regex, several columns) is not understood and returns null: it is never
 * enforced here, so a check --plan cannot parse is silently skipped, never wrongly refused.
 * @param {string} definition
 * @returns {{ column: string, values: string[] }|null}
 */
export function parseCheckConstraint(definition) {
  const text = String(definition ?? '');
  const anyArray = /\(?\(?([a-zA-Z_][a-zA-Z0-9_]*)\)?(?:::[\w " ]+)?\)?\s*=\s*any\s*\(\s*array\s*\[([^\]]*)\]/i.exec(text);
  const inList = !anyArray ? /\(?\(?([a-zA-Z_][a-zA-Z0-9_]*)\)?(?:::[\w " ]+)?\)?\s*in\s*\(([^)]*)\)/i.exec(text) : null;
  const m = anyArray ?? inList;
  if (!m) return null;
  const values = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  if (!values.length) return null;
  return { column: m[1], values };
}

/**
 * `table.column` -> its allowed literal values, from CHECK constraints (parseCheckConstraint) and
 * enum columns. A CHECK this cannot parse contributes nothing (see parseCheckConstraint); an enum
 * column always contributes its labels. When both name the same column, the enum wins (it is
 * always parseable, so it is the more trustworthy of the two).
 * @param {{ table_name: string, definition: string }[]} checks
 * @param {{ table_name: string, column_name: string, labels: string[] }[]} enums
 * @returns {Map<string, string[]>}
 */
export function columnAllowList(checks, enums) {
  const byColumn = new Map();
  for (const row of checks ?? []) {
    const parsed = parseCheckConstraint(row.definition);
    if (parsed) byColumn.set(`${row.table_name}.${parsed.column}`, parsed.values);
  }
  for (const row of enums ?? []) {
    const labels = Array.isArray(row.labels) ? row.labels.filter((l) => l !== null) : [];
    if (labels.length) byColumn.set(`${row.table_name}.${row.column_name}`, labels);
  }
  return byColumn;
}

/**
 * A2: seed plan rows whose value in a constrained column is not one of the allowed values. A null
 * or undefined value is left to the database's own nullability rule, never reported here.
 * @param {{ world: string, table: string, values: object, deferred?: object }[]} rows seedPlan.rows
 * @param {Map<string, string[]>} allowed columnAllowList's result
 * @param {Date} [now]
 * @returns {{ world: string, table: string, column: string, value: unknown, allowed: string[] }[]}
 */
export function columnConstraintViolations(rows, allowed, now = new Date()) {
  const out = [];
  if (!allowed.size) return out;
  for (const row of rows) {
    const values = resolveValues(plannedValues(row), now);
    for (const [column, value] of Object.entries(values)) {
      if (value === null || value === undefined) continue;
      const list = allowed.get(`${row.table}.${column}`);
      if (!list) continue;
      if (!list.some((a) => String(a) === String(value))) out.push({ world: row.world, table: row.table, column, value, allowed: list });
    }
  }
  return out;
}

/**
 * A2: every table the seed plan's rows write that no guard in the safety file covers (any of its
 * predicates, `table:*`, or a specific one, `table:<predicate id>`), for `seed --plan`'s "guards to
 * approve" list. Grouped and de-duplicated, in the plan's own row order.
 * @param {{ table: string }[]} rows seedPlan.rows
 * @param {{ guards?: { covers?: string[] }[] }} safety
 * @returns {string[]}
 */
export function tablesWithoutGuard(rows, safety) {
  const guarded = new Set();
  for (const g of safety.guards ?? []) for (const c of g.covers ?? []) guarded.add(String(c).split(':')[0]);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (guarded.has(r.table) || seen.has(r.table)) continue;
    seen.add(r.table);
    out.push(r.table);
  }
  return out.sort();
}
