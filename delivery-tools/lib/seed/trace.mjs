// W3 item 3 and decision D13: test data written by a command, not an agent guessing from pictures.
//
// `seed --from-trace` builds world rows from the data contract (contract.json, "the trace"): the
// data values each design state shows, labelled with their table, column and `row` key. Values
// with one row key become one row of the world file, so the seeded page shows the design's own
// names, counts and statuses. What it cannot infer (a value with no row key, a person who is no
// fixture user, an absolute date) it lists as needs, for a small seed-writer shown only those.
//
// Safety swaps (spike S3): an email the design shows becomes a fixture address (the fixture
// user's own when the row is that person, else the local part on the safety file's fake domain),
// and the organisation's name is the world's, behind the fixture prefix. Each swap is written to
// docs/delivery/<feature>/swaps.json, per world, so seed --check and datacheck look for the value
// the world really holds.
//
// `seed --need "<STATE>: <what>"` lets any agent ask for data and get a one-line answer: held (a
// contract value the world already holds) or queued in needs.json for the seed-writer.
//
// Everything here is pure except the file helpers at the end.

import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { entryProblem, holds, normalise } from '../picture/contract.mjs';
import { ORG_COLUMNS } from './check.mjs';
import { fixtureForbiddenTables } from './forbidden.mjs';
import { hashJson } from '../core/hash.mjs';

/** Row keys this command writes start with it; rows without it are a person's, and never touched. */
export const TRACE_KEY_PREFIX = 't-';

/** docs/delivery/<feature>/swaps.json: { "worlds": { "<world>": { "<design value>": "<seeded value>" } } } */
export function swapsPath(paths) { return join(paths.deliveryDir, 'swaps.json'); }
/** docs/delivery/<feature>/needs.json: data an agent asked for that no world holds yet. */
export function needsPath(paths) { return join(paths.deliveryDir, 'needs.json'); }

/** The swap list per world, or null when seed --from-trace has not written one. */
export function readSwaps(paths) {
  try { return JSON.parse(readFileSync(swapsPath(paths), 'utf8')).worlds ?? null; } catch { return null; }
}

/** The needs list: { needs: [{ n, state, world, need, at, done? }] }. */
export function readNeeds(paths) {
  try { return JSON.parse(readFileSync(needsPath(paths), 'utf8')); } catch { return { schemaVersion: 1, needs: [] }; }
}

const RELATIVE = [
  [/^just now$|^now$/i, () => 'now'],
  [/^(\d+)\s*(s|sec|secs|seconds?)\s+ago$/i, (n) => `now-${n}s`],
  [/^(\d+)\s*(m|min|mins|minutes?)\s+ago$/i, (n) => `now-${n}m`],
  [/^(\d+)\s*(h|hr|hrs|hours?)\s+ago$/i, (n) => `now-${n}h`],
  [/^(\d+)\s*(d|days?)\s+ago$/i, (n) => `now-${n}d`],
  [/^(\d+)\s*(w|wk|wks|weeks?)\s+ago$/i, (n) => `now-${n}w`],
  [/^in\s+(\d+)\s*(m|min|mins|minutes?)$/i, (n) => `now+${n}m`],
  [/^in\s+(\d+)\s*(h|hr|hrs|hours?)$/i, (n) => `now+${n}h`],
  [/^in\s+(\d+)\s*(d|days?)$/i, (n) => `now+${n}d`],
  [/^yesterday$/i, () => 'now-1d'],
  [/^today$/i, () => 'now'],
  [/^tomorrow$/i, () => 'now+1d'],
];

/**
 * A relative time marker for a design's date or time text ("2 min ago" is now-2m), or null when the
 * text names an absolute day, which the shoot's day never is.
 * @param {string} text
 * @returns {string|null}
 */
export function relativeOf(text) {
  const t = String(text ?? '').trim();
  for (const [re, f] of RELATIVE) { const m = re.exec(t); if (m) return f(m[1]); }
  return null;
}

/** The enum a generated column type names, or null. */
function enumName(typeText) {
  const m = /\["Enums"\]\["([^"]+)"\]/.exec(String(typeText ?? ''));
  return m ? m[1] : null;
}

/**
 * The value to write for a design text, by the column's type when the types are known: a number
 * column gets a number, an enum column its own literal (the design shows "Owner", the enum holds
 * "owner"), a boolean column true or false. Without types, a plain number becomes a number.
 */
export function columnValueFor(text, typeText, enums) {
  const t = String(text).trim();
  if (typeText) {
    const en = enumName(typeText);
    if (en && enums?.has(en)) return enums.get(en).find((v) => normalise(v) === normalise(t) || normalise(v).replace(/_/g, ' ') === normalise(t)) ?? t;
    if (/\bnumber\b/.test(typeText) && /^-?[\d,]+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
    if (/\bboolean\b/.test(typeText) && /^(yes|no|true|false|on|off)$/i.test(t)) return /^(yes|true|on)$/i.test(t);
    return t;
  }
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

function setPath(obj, column, value) {
  const parts = String(column).split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) o = (o[p] ??= {});
  o[parts[parts.length - 1]] = value;
}

const safeKey = (row) => `${TRACE_KEY_PREFIX}${String(row).replace(/[^A-Za-z0-9._:-]/g, '-')}`.slice(0, 128);

/**
 * B3: the hash of a t- row as --from-trace wrote it (its table and values). The world file keeps
 * one per row under `traced`; a row whose hash no longer matches was edited by hand.
 * @param {{ table: string, values: object }} row
 */
export function traceRowHash(row) {
  return hashJson({ table: row.table, values: row.values ?? {} });
}

/**
 * Build one world's rows from the contract.
 * @param {{ contract: object, map: object, worldId: string, worldFile: object|null, safety: object,
 *           types?: ReturnType<import('./validate.mjs').parseColumnTypes>|null, now?: Date }} o
 * @returns {{ rows: object[], kept: number, replaced: number, added: number, skipped: string[],
 *             swaps: Record<string, string>, userNames: Record<string, string>, needs: string[],
 *             traced: Record<string, string>, handEdited: string[], dropped: string[], forbidden: string[] }}
 *   traced: the hash of every t- row as written (the world file's `traced`); handEdited: the t- rows
 *   kept because they differ from the hash recorded when they were written; dropped: the t- rows
 *   the contract no longer produces; forbidden: rows not written because no fixture organisation
 *   may hold a row in their table (the state needs an intercept instead)
 */
export function traceWorld({ contract, map, worldId, worldFile, safety, types = null, now = new Date() }) {
  const world = (map.worlds ?? []).find((w) => w.id === worldId);
  if (!world) throw new Error(`the map has no world "${worldId}"`);
  const users = world.users ?? [];
  const needs = [];
  const swaps = {};
  const userNames = {};
  const byState = new Map((map.states ?? []).map((s) => [s.id, s]));
  const existing = worldFile?.rows ?? [];
  const orgRow = existing.find((r) => r.key === 'org');

  // Every data entry this world must hold, once per (row, column).
  const groups = new Map(); // table\0row -> { table, row, cols: Map<column, entry> }
  const seen = new Set();
  for (const [id, s] of Object.entries(contract?.states ?? {})) {
    if (s.inconsistent) continue;
    for (const e of s.texts ?? []) {
      if (e.label !== 'data' || entryProblem(e)) continue;
      const w = e.world ?? byState.get(id)?.reach?.world;
      if (w !== worldId) continue;
      if (e.user !== undefined) {
        const u = users.find((x) => x.role === e.user);
        if (u && !u.name && (e.field ?? 'name') === 'name') userNames[e.user] = String(e.value ?? e.text);
        continue;
      }
      if (orgRow && e.table === orgRow.table && e.column === 'name') {
        swaps[String(e.value ?? e.text)] = orgNameOf(world, safety);
        continue;
      }
      if ((e.kind ?? 'value') === 'count') continue; // a count is met by the rows, not written
      if (!e.column) continue;
      if (!e.row) {
        const tag = `${id} "${e.text}"`;
        if (!seen.has(tag)) { seen.add(tag); needs.push(`${id}: "${e.text}" (${e.table}.${e.column}) has no row key, so no row was built for it`); }
        continue;
      }
      const k = `${e.table}\0${e.row}`;
      if (!groups.has(k)) groups.set(k, { table: e.table, row: e.row, cols: new Map(), states: new Set() });
      const g = groups.get(k);
      g.states.add(id);
      const prev = g.cols.get(e.column);
      if (prev && normalise(prev.value ?? prev.text) !== normalise(e.value ?? e.text)) {
        needs.push(`row ${e.row} (${e.table}): ${e.column} is "${prev.value ?? prev.text}" in one state and "${e.value ?? e.text}" in another; the first was used`);
        continue;
      }
      if (!prev) g.cols.set(e.column, e);
    }
  }

  const tableTypes = (t) => types?.get?.(t) ?? null;
  const personName = (g) => [...g.cols.values()].map((e) => String(e.value ?? e.text)).find((v) => users.some((u) => u.name && normalise(u.name) === normalise(v)));
  const generated = [];
  const skipped = [];
  const forbiddenTables = new Set(fixtureForbiddenTables(safety));
  const forbidden = [];
  for (const g of groups.values()) {
    const cols = tableTypes(g.table);
    // B1: the safety file's probes expect no fixture row in this table. The state gets the
    // value from an intercept, never from the world.
    if (forbiddenTables.has(g.table)) {
      const line = `${g.row}: ${g.table} is a table no fixture organisation may hold a row in; answer ${[...g.states].join(', ')} with an intercept (reach.intercept) instead`;
      skipped.push(line);
      forbidden.push(line);
      continue;
    }
    // A row that describes a fixture user is that user: seed --apply creates it from the map.
    const person = personName(g);
    if (person) {
      const u = users.find((x) => normalise(x.name) === normalise(person));
      for (const e of g.cols.values()) if (/email/i.test(e.column)) swaps[String(e.value ?? e.text)] = u.email;
      skipped.push(`${g.row}: the ${u.role} fixture user`);
      continue;
    }
    const values = {};
    for (const e of g.cols.values()) {
      const raw = String(e.value ?? e.text);
      const kind = e.kind ?? 'value';
      if (kind === 'date' || kind === 'time') {
        const rel = relativeOf(raw);
        setPath(values, e.column, { $rel: rel ?? 'now' });
        if (!rel) needs.push(`row ${g.row} (${g.table}.${e.column}): the design shows a fixed day ("${raw}"); the row is written at the shoot's moment and datacheck compares its format`);
        continue;
      }
      if (/email/i.test(e.column) && !isSafeEmail(raw, safety)) {
        const safe = `${raw.split('@')[0].replace(/[^A-Za-z0-9._+-]/g, '') || 'person'}@${safety.fakeEmailDomain ?? 'example.invalid'}`;
        swaps[raw] = safe;
        setPath(values, e.column, safe);
        continue;
      }
      setPath(values, e.column, columnValueFor(raw, cols?.get(e.column.split('.')[0]), types?.enums));
    }
    // The world's organisation, on whichever organisation column the table has.
    if (cols && orgRow) {
      const oc = ORG_COLUMNS.find((c) => cols.has(c));
      if (oc && values[oc] === undefined) values[oc] = { $ref: 'org' };
    } else if (!cols) needs.push(`row ${g.row} (${g.table}): the database types are not readable, so its organisation column and required columns were not filled`);
    if (cols) {
      const missing = [...cols].filter(([c, t]) => c !== 'id' && !/\|\s*null/.test(t) && values[c] === undefined && !/^(created_at|updated_at)$/.test(c)).map(([c]) => c);
      if (missing.length) needs.push(`row ${g.row} (${g.table}): the design does not show ${missing.join(', ')}, which may be required; the seed-writer fills them`);
    }
    generated.push({ key: safeKey(g.row), table: g.table, values, entries: [...g.cols.values()] });
  }

  // B3: a t- row whose values differ from the hash recorded when it was written was edited by
  // hand. It is kept as it is, and said so. A t- row with no recorded hash (a world file from before
  // hashes) is treated as generated, as it always was.
  const recorded = worldFile?.traced ?? {};
  const isHandEdit = (r) => typeof recorded[r.key] === 'string' && recorded[r.key] !== traceRowHash(r);
  const handRows = existing.filter((r) => r.key.startsWith(TRACE_KEY_PREFIX) && isHandEdit(r));
  const handKeys = new Set(handRows.map((r) => r.key));
  // A group the hand-written rows already hold is left alone, so a row is never written twice.
  const rowsNow = existing.filter((r) => !r.key.startsWith(TRACE_KEY_PREFIX)).map((r) => ({ table: r.table, values: plainValues(r.values) }));
  const out = existing.filter((r) => !r.key.startsWith(TRACE_KEY_PREFIX) || handKeys.has(r.key)).map((r) => r);
  const before = new Set(existing.filter((r) => r.key.startsWith(TRACE_KEY_PREFIX)).map((r) => r.key));
  const traced = {};
  for (const r of handRows) traced[r.key] = recorded[r.key];
  const handEdited = handRows.map((r) => r.key);
  let added = 0;
  let replaced = 0;
  const produced = new Set();
  for (const g of generated) {
    produced.add(g.key);
    if (handKeys.has(g.key)) continue;
    const already = g.entries.every((e) => holds(e, rowsNow, users, now, swaps).ok);
    if (already) { skipped.push(`${g.key}: the world already holds it`); continue; }
    const row = { key: g.key, table: g.table, values: g.values };
    out.push(row);
    traced[g.key] = traceRowHash(row);
    if (before.has(g.key)) replaced += 1; else added += 1;
  }
  const dropped = [...before].filter((k) => !produced.has(k) && !handKeys.has(k));
  return { rows: out, kept: out.length - added - replaced, replaced, added, skipped, swaps, userNames, needs, traced, handEdited, dropped, forbidden };
}

/** A world file's values without markers, for the "already holds it" check. */
function plainValues(values) {
  const out = {};
  for (const [k, v] of Object.entries(values ?? {})) if (!(v && typeof v === 'object' && !Array.isArray(v) && ('$ref' in v || '$rel' in v || '$orgName' in v || '$minuteOfDay' in v))) out[k] = v;
  return out;
}

function isSafeEmail(email, safety) {
  if (safety?.fixtureUserPattern && new RegExp(safety.fixtureUserPattern).test(email)) return true;
  return Boolean(safety?.fakeEmailDomain) && String(email).toLowerCase().endsWith(`@${String(safety.fakeEmailDomain).toLowerCase()}`);
}

function orgNameOf(world, safety) {
  const name = world.orgName ?? world.id;
  const prefix = safety?.fixtureOrgPrefix ?? '';
  return name.startsWith(prefix) ? name : `${prefix}${name}`;
}

/**
 * What `seed --need` answers: the contract values of the state that match the request, and
 * whether the world's seed plan holds each. A request no contract value matches is not held.
 * @param {{ contract: object|null, map: object, seedPlan: object|null, state: string, need: string, now?: Date, swaps?: object|null }} o
 * @returns {{ world: string|null, held: boolean, matched: { text: string, ok: boolean, why?: string }[] }}
 */
export function answerNeed({ contract, map, seedPlan, state, need, now = new Date(), swaps = null }) {
  const s = (map.states ?? []).find((x) => x.id === state);
  if (!s) throw new Error(`the map has no state "${state}"`);
  const world = s.reach?.world ?? null;
  const want = normalise(need);
  // A number is a word too ("40 seats" is not met by a value of 12), and matches whole.
  const words = want.split(' ').filter((w) => w.length > 2 || /\d/.test(w));
  const hasWord = (hay, w) => (/^\d+$/.test(w) ? hay.split(/[^a-z0-9.,]+/).includes(w) : hay.includes(w));
  const entries = (contract?.states?.[state]?.texts ?? []).filter((e) => e.label === 'data' && !entryProblem(e)
    && (normalise(e.text).includes(want) || want.includes(normalise(e.text)) || (words.length && words.every((w) => hasWord(normalise(`${e.text} ${e.table ?? ''} ${e.column ?? ''}`), w)))));
  if (!seedPlan || !entries.length) return { world, held: false, matched: [] };
  const rows = (seedPlan.rows ?? []).filter((r) => r.world === world).map((r) => ({ table: r.table, values: r.values }));
  const users = (seedPlan.users ?? []).filter((u) => u.world === world);
  const matched = entries.map((e) => { const r = holds(e, rows, users, now, swaps?.[world] ?? null); return { text: e.text, ok: r.ok, ...(r.ok ? {} : { why: r.why }) }; });
  return { world, held: matched.every((m) => m.ok), matched };
}

/** Write swaps.json, keeping other worlds' lists. */
export async function writeSwaps(paths, worldId, swaps) {
  let doc = { schemaVersion: 1, worlds: {} };
  if (existsSync(swapsPath(paths))) { try { doc = JSON.parse(readFileSync(swapsPath(paths), 'utf8')); } catch { /* rewritten below */ } }
  doc.worlds = { ...(doc.worlds ?? {}), [worldId]: swaps };
  await writeFile(swapsPath(paths), `${JSON.stringify(doc, null, 2)}\n`);
}

/** Append one need; returns its number. */
export async function addNeed(paths, need) {
  const doc = readNeeds(paths);
  const n = Math.max(0, ...doc.needs.map((x) => x.n)) + 1;
  doc.needs.push({ n, ...need });
  await writeFile(needsPath(paths), `${JSON.stringify(doc, null, 2)}\n`);
  return n;
}

/** Mark needs done ("all", or a list of numbers); returns how many. */
export async function closeNeeds(paths, which) {
  const doc = readNeeds(paths);
  let n = 0;
  for (const x of doc.needs) if (!x.done && (which === 'all' || which.includes(x.n))) { x.done = true; n += 1; }
  await writeFile(needsPath(paths), `${JSON.stringify(doc, null, 2)}\n`);
  return n;
}

/** The needs no seed-writer has closed yet. */
export function openNeeds(paths) {
  return readNeeds(paths).needs.filter((x) => !x.done);
}
