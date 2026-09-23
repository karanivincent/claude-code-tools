// M13 as pure logic (spec 7): every seed row against the four layers. Any reason refuses the seed.
//   layer 1  a row matches a derived or hand-listed predicate that no holding guard covers;
//   layer 2  a phone-shaped value that is not an approved fake number, a value in the never-dial
//            set, or an email address off the fake domain;
//   layer 3  guards: a guard only covers predicates while every probe holds (the caller runs the
//            probes; this module only applies the result);
//   layer 4  structure: production and project, rows inside their own world, organisation
//            naming, fixture users, global rows listed in the plan.
// The caller supplies everything that needs the database; nothing here does I/O.

import { resolveValues, matchPredicate, describeFilters } from './evaluate.mjs';
import { phonesIn, isFakeNumber, neverDialMatch, emailsIn, onDomain, stringLeaves } from './contacts.mjs';

export const ORG_COLUMNS = Object.freeze(['organization_id', 'organisation_id', 'org_id', 'tenant_id']);

/**
 * @typedef {{ world: string, table: string, id: string, values: Record<string, unknown> }} SeedRow
 * @typedef {{ layer: 1|2|3|4, code: string, message: string, table?: string, column?: string,
 *             predicate?: object, when?: string, rows: { world: string, table: string, id: string }[] }} Reason
 */

/**
 * @param {{
 *   rows: SeedRow[], users?: { world: string, role: string, email: string, id: string }[],
 *   worlds?: { id: string, orgId: string }[], predicates: object[], safety: object,
 *   neverDial: string[], guards?: { id: string, covers: string[], holds: boolean, why?: string }[],
 *   now: Date, structure?: { project: string, testRef: string, globalTables: string[], robotEmails: string[] } | null,
 * }} input
 * @returns {{ ok: boolean, reasons: Reason[], accepted: { guard: string, predicate: string, rows: number }[], counts: object }}
 */
export function evaluateSeedSafety(input) {
  const { rows, predicates, safety, now } = input;
  const users = input.users ?? [];
  const worlds = input.worlds ?? [];
  const guards = input.guards ?? [];
  const neverDial = [...new Set([...(safety.neverDial ?? []), ...(input.neverDial ?? [])])];
  const reasons = [];
  const accepted = new Map();

  const resolved = rows.map((r) => ({ ...r, resolved: resolveValues(r.values ?? {}, now) }));

  // Layer 1
  const byTable = new Map();
  for (const p of predicates) {
    if (!byTable.has(p.table)) byTable.set(p.table, []);
    byTable.get(p.table).push(p);
  }
  const hits = new Map();
  for (const row of resolved) {
    for (const p of byTable.get(row.table) ?? []) {
      const when = matchPredicate(p, row.resolved, now);
      if (!when) continue;
      const guard = guards.find((g) => g.holds && g.covers.some((c) => covers(c, p)));
      if (guard) {
        const key = `${guard.id}\0${p.id}`;
        const a = accepted.get(key) ?? { guard: guard.id, predicate: p.id, rows: 0 };
        a.rows++;
        accepted.set(key, a);
        continue;
      }
      const key = `${p.id}\0${when}`;
      if (!hits.has(key)) hits.set(key, { p, when, rows: [] });
      hits.get(key).rows.push(ref(row));
    }
  }
  for (const { p, when, rows: hit } of hits.values()) {
    const unheld = guards.filter((g) => !g.holds && g.covers.some((c) => covers(c, p)));
    const guardNote = unheld.length ? `; guard ${unheld.map((g) => `${g.id} does not hold (${g.why ?? 'a probe failed'})`).join(', ')}` : '';
    const whenText = when === 'now' ? 'now' : when === 'later' ? 'once time passes' : 'unless the database default rules it out';
    reasons.push({
      layer: 1,
      code: p.origin === 'hand' ? 'forbidden-state' : 'predicate',
      message: `${hit.length} ${p.table} row(s) match ${p.id} (${describeFilters(p.filters)}) ${whenText}: ${p.source}${guardNote}`,
      table: p.table,
      predicate: p,
      when,
      rows: hit,
    });
  }

  // Layer 2
  const fakeRe = new RegExp(safety.fakeNumbers.pattern);
  const userRe = new RegExp(safety.fixtureUserPattern);
  const userEmails = new Set(users.map((u) => String(u.email).toLowerCase()));
  const l2 = new Map();
  const add = (code, row, column, sample, message) => {
    const key = `${code}\0${row.table}\0${column}`;
    if (!l2.has(key)) l2.set(key, { code, table: row.table, column, rows: [], samples: new Set(), message });
    const e = l2.get(key);
    e.rows.push(ref(row));
    if (e.samples.size < 3) e.samples.add(sample);
  };
  for (const row of resolved) {
    for (const leaf of stringLeaves(row.resolved)) {
      for (const phone of phonesIn(leaf.value)) {
        const nd = neverDialMatch(phone, neverDial);
        if (nd) add('never-dial', row, leaf.path, mask(phone.text), 'a number in the never-dial set');
        if (!isFakeNumber(phone, fakeRe)) add('not-fake', row, leaf.path, phone.text, `phone-shaped and not matching ${safety.fakeNumbers.pattern}`);
      }
      for (const email of emailsIn(leaf.value)) {
        if (onDomain(email, safety.fakeEmailDomain)) continue;
        if (userEmails.has(email.toLowerCase()) && userRe.test(email)) continue;
        add('email', row, leaf.path, email, `an email address off ${safety.fakeEmailDomain} that is not a fixture user's sign-in address`);
      }
    }
  }
  for (const e of l2.values()) {
    reasons.push({
      layer: 2,
      code: e.code,
      message: `${e.rows.length} ${e.table}.${e.column} value(s): ${e.message} (${[...e.samples].join(', ')})`,
      table: e.table,
      column: e.column,
      rows: e.rows,
    });
  }
  for (const u of users) {
    if (!userRe.test(u.email)) {
      reasons.push({ layer: 2, code: 'fixture-user', message: `fixture user ${u.email} (${u.world}/${u.role}) does not match ${safety.fixtureUserPattern}`, rows: [] });
    }
  }

  // Layer 4
  if (input.structure) reasons.push(...structureReasons(input, resolved, users, worlds));

  const layerCount = (n) => reasons.filter((r) => r.layer === n).length;
  return {
    ok: reasons.length === 0,
    reasons,
    accepted: [...accepted.values()],
    counts: { rows: rows.length, users: users.length, predicates: predicates.length, layer1: layerCount(1), layer2: layerCount(2), layer4: layerCount(4) },
  };
}

function ref(row) { return { world: row.world, table: row.table, id: row.id }; }

/** A guard's covers entry: `table:*` or `table:<predicate id>`. */
export function covers(entry, predicate) {
  const i = entry.indexOf(':');
  const table = entry.slice(0, i);
  const what = entry.slice(i + 1);
  return table === predicate.table && (what === '*' || what === predicate.id);
}

function mask(text) {
  const digits = String(text).replace(/\D/g, '');
  return `\u2026${digits.slice(-3)}`;
}

function structureReasons(input, rows, users, worlds) {
  const { structure, safety } = input;
  const out = [];
  const r4 = (code, message, list = []) => out.push({ layer: 4, code, message, rows: list });
  if ((safety.productionRefs ?? []).includes(structure.project)) r4('production', `the seed plan targets ${structure.project}, a production project`);
  if (structure.project !== structure.testRef) r4('project', `the seed plan targets ${structure.project}, not the profile's test project ${structure.testRef}`);

  const worldById = new Map(worlds.map((w) => [w.id, w]));
  const orgIds = new Set(worlds.map((w) => w.orgId));
  const globalTables = new Set(structure.globalTables ?? []);
  const outside = [];
  const unlisted = new Map();
  for (const row of rows) {
    const w = worldById.get(row.world);
    if (!w) { outside.push(ref(row)); continue; }
    if (row.id === w.orgId) continue;
    const col = ORG_COLUMNS.find((c) => Object.prototype.hasOwnProperty.call(row.resolved, c));
    if (col) {
      if (row.resolved[col] !== w.orgId) outside.push(ref(row));
    } else if (!globalTables.has(row.table)) {
      if (!unlisted.has(row.table)) unlisted.set(row.table, []);
      unlisted.get(row.table).push(ref(row));
    }
  }
  if (outside.length) r4('outside-world', `${outside.length} row(s) name an organisation other than their own world's (or a world the plan does not have)`, outside);
  for (const [table, list] of unlisted) {
    r4('global-unlisted', `${list.length} ${table} row(s) carry no organisation column and ${table} is not in the plan's seed.globalRows`, list);
  }
  for (const w of worlds) {
    const org = rows.find((r) => r.id === w.orgId);
    if (!org) { r4('org-missing', `world ${w.id} has no organisation row with id ${w.orgId}`); continue; }
    const named = stringLeaves(org.resolved).some((l) => l.value.startsWith(safety.fixtureOrgPrefix));
    if (!named) r4('org-name', `world ${w.id}'s organisation is not named with the fixture prefix "${safety.fixtureOrgPrefix}"`, [ref(org)]);
  }
  const worldsByUser = new Map();
  for (const u of users) {
    if (!worldById.has(u.world)) r4('user-world', `fixture user ${u.email} names world ${u.world}, which the seed plan does not have`);
    const k = String(u.email).toLowerCase();
    worldsByUser.set(k, new Set([...(worldsByUser.get(k) ?? []), u.world]));
  }
  for (const [email, ws] of worldsByUser) {
    if (ws.size > 1) r4('user-shared', `fixture user ${email} belongs to ${ws.size} worlds; each belongs to exactly one`);
  }
  const robots = new Set((structure.robotEmails ?? []).filter(Boolean).map((e) => String(e).toLowerCase()));
  for (const u of users) if (robots.has(String(u.email).toLowerCase())) r4('robot', `the e2e robot ${u.email} is a fixture user; it never belongs to a fixture world`);
  const robotRows = rows.filter((r) => stringLeaves(r.resolved).some((l) => robots.has(l.value.toLowerCase())));
  if (robotRows.length) r4('robot', `${robotRows.length} row(s) name the e2e robot's address`, robotRows.map(ref));
  const seen = new Set();
  const dupes = [];
  for (const row of rows) {
    const k = `${row.table}\0${row.id}`;
    if (seen.has(k)) dupes.push(ref(row));
    seen.add(k);
  }
  if (dupes.length) r4('duplicate-id', `${dupes.length} row id(s) appear twice in one table`, dupes);
  if (orgIds.size !== worlds.length) r4('shared-org', 'two worlds share an organisation id; each world is its own organisation');
  return out;
}
