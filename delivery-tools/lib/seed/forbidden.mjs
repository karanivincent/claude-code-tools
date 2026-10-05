// Tables a fixture organisation may not hold a row in. Owner: slice B2 (docs/ARCHITECTURE.md).
//
// The safety file never lists them. The rule lives only in its guard probes: a probe such as
// `select count(*) from <table> where organization_id = any($fixtureOrgs)` with `expect: 0` says
// that no fixture organisation may have a row there (a line, a phone number). A state that shows
// such data cannot get it from a seeded world; it gets it from an intercept. This module reads
// those probes, so the map, the trace and the reviewers' steers all name the same tables.
// Everything here is pure.

// A plain count over one table, filtered only by the fixture organisations. Any other condition
// (a join, a pattern, a second filter) makes it a narrower rule, not a whole-table one.
const PLAIN_PROBE = /^select\s+count\(\s*\*\s*\)\s+from\s+(?:public\.)?([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?(?!where\b)([a-z_][a-z0-9_]*))?\s+where\s+(?:([a-z_][a-z0-9_]*)\.)?[a-z_][a-z0-9_]*\s*=\s*any\s*\(\s*\$fixtureOrgs\s*\)$/i;

/**
 * The tables the safety file's guard probes say a fixture organisation may hold no row in: a plain
 * count over the table, filtered only by `$fixtureOrgs`, expecting 0. Sorted, each once.
 * @param {{ guards?: { probes?: { sql?: string, expect?: unknown }[] }[] }|null|undefined} safety
 * @returns {string[]}
 */
export function fixtureForbiddenTables(safety) {
  const out = new Set();
  for (const g of safety?.guards ?? []) {
    for (const p of g?.probes ?? []) {
      if (Number(p?.expect) !== 0 || p?.expect === null || p?.expect === '') continue;
      const sql = String(p?.sql ?? '').replace(/\s+/g, ' ').trim().replace(/;$/, '').trim();
      const m = PLAIN_PROBE.exec(sql);
      if (!m) continue;
      const [, table, alias, qualifier] = m;
      if (qualifier && qualifier !== table && qualifier !== alias) continue;
      out.add(table);
    }
  }
  return [...out].sort();
}

/** The fix every problem below ends with. */
export const INTERCEPT_HINT = 'answer it with an intercept (reach.intercept: { "method", "url", "status", "body" }, the body holding the values the design shows)';

/**
 * `delivery map`'s problems for those tables: a world file row that writes one, and a state that
 * shows data from one (its `data` entries, or its contract data texts) with no reach.intercept.
 * A state reached by a component test needs no intercept.
 * @param {object} map
 * @param {Record<string, object|null>} worldFiles world id -> world file (null when unreadable)
 * @param {string[]} tables fixtureForbiddenTables' result
 * @param {object|null} [contract] contract.json, when the run has one
 * @returns {string[]}
 */
export function forbiddenTableProblems(map, worldFiles, tables, contract = null) {
  if (!tables?.length) return [];
  const forbidden = new Set(tables);
  const out = [];
  const statesIn = (world) => (map?.states ?? []).filter((s) => s.reach?.world === world).map((s) => s.id);
  for (const [world, file] of Object.entries(worldFiles ?? {})) {
    for (const r of file?.rows ?? []) {
      if (!forbidden.has(r?.table)) continue;
      const states = statesIn(world);
      out.push(`world ${world} row "${r.key}" writes ${r.table}, a table no fixture organisation may hold a row in (the safety file's probes expect none): drop the row, and for ${states.length ? states.join(', ') : 'each state that shows it'} ${INTERCEPT_HINT}`);
    }
  }
  for (const s of map?.states ?? []) {
    if (!s?.reach || s.reach.test || s.reach.intercept) continue;
    const shown = new Set();
    for (const d of s.data ?? []) if (forbidden.has(d?.table)) shown.add(d.table);
    for (const e of contract?.states?.[s.id]?.texts ?? []) if (e?.label === 'data' && forbidden.has(e.table)) shown.add(e.table);
    for (const t of shown) out.push(`state ${s.id} shows data from ${t}, which no fixture organisation may hold, and has no intercept: ${INTERCEPT_HINT}`);
  }
  return out;
}

/**
 * One steer line per forbidden table, for the reviewers (steers.md): the page cannot show those
 * values from a seeded world, so a difference there is the test data's, not the code's.
 * @param {string[]} tables
 * @returns {string[]}
 */
export function forbiddenSteerLines(tables) {
  return (tables ?? []).map((t) => `Values from ${t} are test-data gaps (no fixture organisation may hold a row there): mark them \`data gap:\`, never \`must fix:\`.`);
}
