// The data contract of a picture-mode run (stable picture data, fixes 1 and 2): every text each
// designed state shows, taken mechanically from the design render's own DOM (never transcribed by
// a model), and labelled "data" (a value the seeded world must hold), "fixed" (the page's own
// words) or "random" (an id, an avatar: masked, never seeded). A Sonnet extractor labels the texts
// (briefs/contract-labeller.md) into contract-labels.json; `delivery contract` folds its labels in.
// `seed --check` then refuses a plan whose worlds lack a data value, before anything is built, and
// the review sorts a data-only difference by looking the value up in the world.
//
// docs/delivery/<feature>/contract.json:
//   { "schemaVersion": 1, "builtAt": "...",
//     "states": { "KC-05": { "texts": [
//         { "text": "Amina Otieno", "label": "data", "table": "contacts", "column": "name" },
//         { "text": "8 calls", "label": "data", "kind": "count", "table": "calls", "where": { "status": "done" }, "value": "8" },
//         { "text": "2 min ago", "label": "data", "kind": "time", "table": "calls", "column": "created_at" },
//         { "text": "AO", "label": "data", "user": "admin", "field": "initials" },
//         { "text": "Save", "label": "fixed" },
//         { "text": "#A81F", "label": "random" },
//         { "text": "New text", "label": null } ],
//       "inconsistent": "the header says 6 calls and the list shows 8" } } }
//
// A data text's value is `value` when the text wraps it in fixed words ("Called Amina Otieno"),
// else the whole text. `world` defaults to the state's reach.world. Kinds: value (a row whose column
// equals it), count (exactly that many rows where `where` holds), date and time (compared by
// format, never by the absolute day the design happens to show, R1: a row with the column set is
// enough), generated (a value the product writes itself, an AI summary or an outcome: checked by
// shape only, "text is there" or "a number is there"). `user` names the world's fixture user in
// that role (R10): `field` name (default) or initials. `row` (W3) groups the values one row shows
// ("m-2": a member's name, email and role), so seed --from-trace can build the row and datacheck can
// tell a wrong value in a row the page shows (a data fault) from a row the page does not show.
//
// A fourth label, "none" (W3, D6), is a value the design shows that the product does not store.
// It is never seeded or checked. The founder decides each one once, before the build
// (`delivery contract --decide`): "build" (a rule: the product gains it), "drop" (a cut rule) or
// "design" (back to Claude Design). A decided one is closed; an undecided one keeps ready red.
// Everything here is pure except the two file readers.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cropFor, designFileCandidates, mapItems } from './widths.mjs';
import { matchesWhere } from '../seed/data.mjs';
import { plannedValues } from '../seed/plan.mjs';
import { resolveValues } from '../seed/evaluate.mjs';

export const LABELS = Object.freeze(['data', 'fixed', 'random', 'none']);
export const KINDS = Object.freeze(['value', 'count', 'date', 'time', 'generated']);
/** What the founder decides for a "none" value (D6). */
export const DECISIONS = Object.freeze(['build', 'drop', 'design']);
/** What a generated value is checked by. */
export const SHAPES = Object.freeze(['text', 'number']);

/** docs/delivery/<feature>/contract.json */
export function contractPath(paths) { return join(paths.deliveryDir, 'contract.json'); }
/** docs/delivery/<feature>/contract-labels.json: the labeller's output, folded in by `delivery contract`. */
export function labelsPath(paths) { return join(paths.deliveryDir, 'contract-labels.json'); }

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The run's contract.json, or null when there is none yet. Throws on a file that does not parse. */
export function readContract(paths) { return readJson(contractPath(paths)); }
/** The labeller's contract-labels.json, or null. */
export function readLabels(paths) { return readJson(labelsPath(paths)); }

const collapse = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

/** How two values compare: case, spacing and Unicode forms do not count. */
export function normalise(v) {
  return collapse(String(v ?? '').normalize('NFKC')).toLowerCase();
}

/**
 * The texts a design DOM shows in the page area (elements at or right of `left`), once each, in
 * reading order (top to bottom, then left to right).
 * @param {{ elements?: object[] }|null} dom
 * @param {number} [left]
 * @returns {string[]}
 */
export function designTexts(dom, left = 0) {
  if (!dom || !Array.isArray(dom.elements)) return [];
  const els = dom.elements
    .filter((e) => e.kind === 'text' && e.visible !== false && (e.box?.x ?? 0) >= left - 8 && collapse(e.text))
    .sort((a, b) => (a.box?.y ?? 0) - (b.box?.y ?? 0) || (a.box?.x ?? 0) - (b.box?.x ?? 0));
  return [...new Set(els.map((e) => collapse(e.text)))];
}

/**
 * Every state's texts, from its design renders at every width it is checked at (the union, in the
 * order first seen). A state reached only by a component test, or with no design picture, has none.
 * @param {object} map
 * @param {string} designDir the run's design renders
 * @returns {Map<string, string[]>}
 */
export function stateTexts(map, designDir) {
  const out = new Map();
  for (const it of mapItems(map)) {
    if (it.state.reach?.test) continue;
    const file = designFileCandidates(it.state, it.width).find((f) => existsSync(join(designDir, f)));
    if (!file) continue;
    let dom;
    try { dom = JSON.parse(readFileSync(join(designDir, file.replace(/\.png$/, '.dom.json')), 'utf8')); } catch { continue; }
    const crop = cropFor(map, it.width, it.id);
    const list = out.get(it.id) ?? [];
    for (const t of designTexts(dom, crop.designLeft ?? 0)) if (!list.includes(t)) list.push(t);
    out.set(it.id, list);
  }
  return out;
}

/**
 * Build the contract from the states' texts (R11: rebuilt on every new export). A text keeps the
 * label it had; the labeller's file wins over the old contract; a text labelled "fixed" in any state
 * is fixed wherever else it appears ("Save" is labelled once). A new text is unlabelled (null). A
 * state's inconsistency note is kept only while its texts are unchanged: a new export may be the fix.
 * @param {{ texts: Map<string, string[]>, previous?: object|null, labels?: object|null, at: string }} o
 * @returns {{ contract: object, changed: string[], added: number, removed: number }}
 */
export function buildContract({ texts, previous = null, labels = null, at }) {
  const prevStates = previous?.states ?? {};
  const given = labels?.states ?? {};
  const fixed = new Set();
  for (const src of [prevStates, given]) {
    for (const s of Object.values(src)) for (const e of (Array.isArray(s) ? s : s?.texts) ?? []) if (e?.label === 'fixed') fixed.add(e.text);
  }
  const states = {};
  const changed = [];
  let added = 0;
  let removed = 0;
  for (const [id, list] of texts) {
    const prev = prevStates[id];
    const prevBy = new Map((prev?.texts ?? []).map((e) => [e.text, e]));
    const givenList = Array.isArray(given[id]) ? given[id] : (given[id]?.texts ?? []);
    const givenBy = new Map(givenList.filter((e) => e && typeof e.text === 'string').map((e) => [collapse(e.text), e]));
    const entries = list.map((text) => {
      const e = givenBy.get(text) ?? prevBy.get(text);
      // The founder's decision on a "none" value is recorded in the contract itself; a labeller's
      // file written before it must not wipe it.
      const kept = prevBy.get(text);
      if (e && e.label === 'none' && e.decision === undefined && kept?.label === 'none' && kept.decision) return { ...e, text, decision: kept.decision, ...(kept.decisionNote ? { decisionNote: kept.decisionNote } : {}) };
      if (e && e.label !== null && e.label !== undefined) return { ...e, text };
      if (!prevBy.has(text)) added += 1;
      return fixed.has(text) ? { text, label: 'fixed' } : { text, label: null };
    });
    const same = prev && prev.texts?.length === list.length && list.every((t) => prevBy.has(t));
    if (prev && !same) {
      changed.push(id);
      removed += (prev.texts ?? []).filter((e) => !list.includes(e.text)).length;
    }
    const note = labels?.inconsistent?.[id] ?? (same ? prev?.inconsistent : undefined);
    states[id] = { texts: entries, ...(note ? { inconsistent: String(note) } : {}) };
  }
  return { contract: { schemaVersion: 1, builtAt: at, states }, changed, added, removed };
}

/**
 * Why one labelled entry cannot be checked, or null when it can.
 * @param {object} e
 */
export function entryProblem(e) {
  if (e.label === null || e.label === undefined) return null;
  if (!LABELS.includes(e.label)) return `label "${e.label}" is not one of ${LABELS.join(', ')}`;
  if (e.label === 'none') return e.decision === undefined || DECISIONS.includes(e.decision) ? null : `decision "${e.decision}" is not one of ${DECISIONS.join(', ')}`;
  if (e.label !== 'data') return null;
  const kind = e.kind ?? 'value';
  if (!KINDS.includes(kind)) return `kind "${kind}" is not one of ${KINDS.join(', ')}`;
  if (e.row !== undefined && (typeof e.row !== 'string' || !e.row)) return 'row must be a non-empty string';
  if (kind === 'generated') {
    if (e.shape !== undefined && !SHAPES.includes(e.shape)) return `shape "${e.shape}" is not one of ${SHAPES.join(', ')}`;
    if (e.table !== undefined && !/^[a-z_][a-z0-9_]*$/.test(e.table)) return 'table must be a table name';
    return null;
  }
  if (e.user !== undefined) {
    if (typeof e.user !== 'string' || !e.user) return 'user must name a role';
    if (e.field !== undefined && !['name', 'initials'].includes(e.field)) return 'field must be name or initials';
    return null;
  }
  if (typeof e.table !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(e.table)) return 'a data text names its table (or a fixture user with "user")';
  if (kind === 'count') {
    if (e.where !== undefined && (typeof e.where !== 'object' || Array.isArray(e.where))) return 'where must be an object of column: value';
    if (countOf(e) === null) return 'a count text needs a number in it (or in value)';
    return null;
  }
  if (typeof e.column !== 'string' || !e.column) return `a ${kind} text names its column`;
  return null;
}

/** The whole number a count text shows ("8 calls" is 8), or null. */
export function countOf(e) {
  const m = /\d[\d,]*/.exec(String(e.value ?? e.text));
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

/**
 * What the contract still lacks: unlabelled texts, entries that cannot be checked, the states the
 * labeller found inconsistent in the design itself (R6: they go to Claude Design, not to seeding),
 * and the "none" values the founder has not decided yet (D6), with the decided ones beside them.
 * @param {object} contract
 */
export function contractSummary(contract) {
  const out = { states: 0, texts: 0, data: 0, fixed: 0, random: 0, none: 0, unlabelled: [], invalid: [], inconsistent: [], undecided: [], decided: [] };
  for (const [id, s] of Object.entries(contract?.states ?? {})) {
    out.states += 1;
    if (s.inconsistent) out.inconsistent.push({ state: id, why: s.inconsistent });
    for (const e of s.texts ?? []) {
      out.texts += 1;
      if (e.label === null || e.label === undefined) { out.unlabelled.push({ state: id, text: e.text }); continue; }
      if (LABELS.includes(e.label)) out[e.label] += 1;
      if (e.label === 'none') (e.decision ? out.decided : out.undecided).push({ state: id, text: e.text, why: e.why ?? null, decision: e.decision ?? null });
      const p = entryProblem(e);
      if (p) out.invalid.push({ state: id, text: e.text, why: p });
    }
  }
  return out;
}

/** Read a dotted column ("meta.title") from resolved row values. */
export function columnValue(values, column) {
  let v = values;
  for (const part of String(column).split('.')) {
    if (v === null || v === undefined || typeof v !== 'object') return undefined;
    v = v[part];
  }
  return v;
}

/**
 * The value a seeded world holds for a design value: the design's own, or the safe one seed
 * --from-trace put in its place (an email on the fake domain, an organisation name behind the
 * fixture prefix). Compared case- and space-blind, like every value here.
 * @param {unknown} value
 * @param {Record<string, string>|null} swaps
 */
export function swapped(value, swaps) {
  if (!swaps) return value;
  const key = normalise(value);
  for (const [from, to] of Object.entries(swaps)) if (normalise(from) === key) return to;
  return value;
}

/**
 * Record the founder's decision on "none" values (D6): one text of a state, every undecided one of
 * a state, or ("all") every undecided one in the contract. Returns how many it decided. Pure over
 * the contract object, which it changes in place.
 * @param {object} contract
 * @param {{ state: string, text?: string|null, decision: string, note?: string|null }} d
 */
export function decideNone(contract, { state, text = null, decision, note = null }) {
  if (!DECISIONS.includes(decision)) throw new Error(`decision "${decision}" is not one of ${DECISIONS.join(', ')}`);
  let n = 0;
  for (const [id, s] of Object.entries(contract?.states ?? {})) {
    if (state !== 'all' && id !== state) continue;
    for (const e of s.texts ?? []) {
      if (e.label !== 'none') continue;
      if (text !== null ? normalise(e.text) !== normalise(text) : e.decision) continue;
      e.decision = decision;
      if (note) e.decisionNote = note;
      n += 1;
    }
  }
  return n;
}

/** "Amina Otieno" -> "AO". */
export function initials(name) {
  return collapse(name).split(' ').filter(Boolean).map((w) => [...w][0]).join('').toUpperCase();
}

/**
 * Whether rows hold one data entry, as { ok, found, why }. `rows` are resolved rows of one world
 * (world, table, values); `users` the world's fixture users. Used before the seed (the plan's rows)
 * and after the shoot (the database's rows, R3).
 * @param {object} e a data entry
 * @param {{ table: string, values: object }[]} rows
 * @param {{ role: string, name?: string }[]} users
 * @param {Date} now
 * @param {Record<string, string>|null} [swaps] the world's swap list (design value -> seeded value)
 */
export function holds(e, rows, users, now, swaps = null) {
  const value = swapped(e.value ?? e.text, swaps);
  if (e.user !== undefined) {
    const u = users.find((x) => x.role === e.user);
    if (!u) return { ok: false, found: 0, why: `the world has no ${e.user} user` };
    if (!u.name) return { ok: false, found: 0, why: `the ${e.user} fixture user has no name; give it the design's ("${value}") in the map's worlds[].users[].name` };
    const shown = (e.field ?? 'name') === 'initials' ? initials(u.name) : u.name;
    return normalise(shown) === normalise(value)
      ? { ok: true, found: 1 }
      : { ok: false, found: 0, why: `the ${e.user} fixture user is "${u.name}", and the design shows "${value}"` };
  }
  const kind = e.kind ?? 'value';
  const mine = rows.filter((r) => r.table === e.table);
  if (kind === 'count') {
    const want = countOf(e);
    const found = mine.filter((r) => matchesWhere(e.where, r.values, now)).length;
    return found === want ? { ok: true, found } : { ok: false, found, why: `${found} ${e.table} row(s)${e.where ? ' where it holds' : ''}, and the design shows ${want}` };
  }
  if (kind === 'generated') {
    // A value the product writes is checked by shape: a row with the column set is enough, and
    // one with no column named cannot be seeded at all.
    if (!e.table || !e.column) return { ok: true, found: 0 };
    const found = mine.filter((r) => { const v = columnValue(r.values, e.column); return v !== null && v !== undefined && v !== ''; }).length;
    return found ? { ok: true, found } : { ok: false, found, why: `no ${e.table} row sets ${e.column}` };
  }
  if (kind === 'date' || kind === 'time') {
    const found = mine.filter((r) => { const v = columnValue(r.values, e.column); return v !== null && v !== undefined && v !== ''; }).length;
    return found ? { ok: true, found } : { ok: false, found, why: `no ${e.table} row sets ${e.column}` };
  }
  const found = mine.filter((r) => normalise(columnValue(r.values, e.column)) === normalise(value)).length;
  return found ? { ok: true, found } : { ok: false, found, why: `no ${e.table} row has ${e.column} = "${value}"` };
}

/**
 * Fix 2: each contract data value the seed plan's worlds do not hold, before anything is written.
 * Unlabelled texts and entries that cannot be checked are problems too: a value nobody sorted is a
 * value nobody seeded. A state the labeller found inconsistent is skipped (it is the design's to
 * fix), and so is a state the map no longer has.
 * @param {object} contract
 * @param {object} map
 * @param {{ rows: object[], users: object[] }} seedPlan
 * @param {Date} now
 * @param {Record<string, Record<string, string>>|null} [swaps] per world, from swaps.json
 * @returns {{ gaps: { state: string, text: string, why: string }[], unlabelled: number, skipped: string[] }}
 */
export function contractGaps(contract, map, seedPlan, now = new Date(), swaps = null) {
  const byState = new Map((map?.states ?? []).map((s) => [s.id, s]));
  const resolved = (seedPlan?.rows ?? []).map((r) => ({ world: r.world, table: r.table, values: resolveValues(plannedValues(r), now) }));
  const gaps = [];
  const skipped = [];
  let unlabelled = 0;
  for (const [id, s] of Object.entries(contract?.states ?? {})) {
    const state = byState.get(id);
    if (!state) continue;
    if (s.inconsistent) { skipped.push(id); continue; }
    for (const e of s.texts ?? []) {
      if (e.label === null || e.label === undefined) { unlabelled += 1; continue; }
      if (e.label !== 'data') continue;
      const problem = entryProblem(e);
      if (problem) { gaps.push({ state: id, text: e.text, why: problem }); continue; }
      const world = e.world ?? state.reach?.world;
      const r = holds(e, resolved.filter((x) => x.world === world), (seedPlan?.users ?? []).filter((u) => u.world === world), now, swaps?.[world] ?? null);
      if (!r.ok) gaps.push({ state: id, text: e.text, why: `${r.why} (world ${world})` });
    }
  }
  return { gaps, unlabelled, skipped };
}

/**
 * Rebuild contract.json from the run's design renders, folding in contract-labels.json, and write
 * it. Returns null when the run has no map yet (nothing to key texts by).
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {object|null} map
 * @param {string} at
 */
export async function rebuildContractFile(paths, map, at) {
  if (!map) return null;
  const { writeJsonAtomic } = await import('../core/fs.mjs');
  const built = buildContract({ texts: stateTexts(map, paths.designRenders), previous: readContract(paths), labels: readLabels(paths), at });
  await writeJsonAtomic(contractPath(paths), built.contract);
  return { ...built, summary: contractSummary(built.contract) };
}

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;
// am, pm, a.m., p.m., a. m. right after a number, any case (normalise lowercases first).
const AMPM = /(\d)\s*[ap]\.?\s?m\.?(?![a-z])/g;
const DAYS = /\b(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/g;

/**
 * A date or time text's format, without its values (R1): "Tue 14 Oct" and "Wed 3 Sep" are both
 * "D 9 M", "2 min ago" and "15 min ago" both "9 min ago". The am/pm marker after a number folds to one
 * token too ("10:38 am" and "10:16 PM" are both "9:9 A"), so a shoot in the other half of the day
 * than the design still matches. Pictures compare dates by this, never by the absolute day or time
 * the design happened to show.
 */
export function dateShape(text) {
  return normalise(text).replace(MONTHS, 'M').replace(DAYS, 'D').replace(AMPM, '$1 A').replace(/\d+/g, '9');
}
