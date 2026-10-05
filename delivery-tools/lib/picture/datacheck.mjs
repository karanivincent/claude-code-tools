// Datacheck (W3 item 8): before any reviewer looks at a round, every value the data contract labels
// "data" is looked for in the live page's text. It is a text comparison: seconds, no tokens.
//
// A value the page lacks is sorted by what the world held when the item was shot (the rows the
// shoot's reset read back, saved in rounds/<n>/seeded.json):
//   - the world lacks it: a data fault. The seed-writer fixes the world file, the item is re-shot,
//     and only then does a reviewer see it. It never costs a fix round.
//   - the world holds it: a must fix. The page does not show what it has.
// When the rows are not known (an older round), the spike's row rule sorts it instead: a miss is a
// data fault when the page shows the rest of its traced row (the row is there, this value is not
// the design's), and otherwise a page issue for the reviewers (the page shows nothing of the row).
//
// Values the product generates are checked by shape only ("text is there", "a number is there"),
// so a wrong AI summary still needs a reviewer's eye. Dates and times compare by format, as the
// design's day is never the shoot's. A value seed --from-trace swapped for a safe one (a fixture
// email, a prefixed organisation name) is looked for as the swapped value.
//
// A phone item is checked only against the contract texts its own phone design render shows: the
// contract is the union of every width's texts, and a phone layout hides parts the desktop shows
// (a list page's detail pane, a call page's list). With no phone render text, the whole state's
// contract is used, as before.

import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { countOf, dateShape, designTexts, entryProblem, holds, initials, interceptHolds, normalise, swapped } from './contract.mjs';
import { cropFor, designFileCandidates, mapItems } from './widths.mjs';

/** The round's record of what each world held when it was shot. */
export const SEEDED_FILE = 'seeded.json';
/** The round's datacheck summary. */
export const DATACHECK_FILE = 'datacheck.json';

/** An item's live text file in its round: one text per line, as the page showed it. */
export function liveTextFile(key) { return `${key}.live.txt`; }

const escapeRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The ways a whole number can be written: 1234 and 1,234. */
function numberForms(n) {
  const plain = String(n);
  const grouped = Number(n).toLocaleString('en-US');
  return [...new Set([plain, grouped])];
}

/**
 * The texts an item's own design render shows, when the item is at a width other than desktop: the
 * render's dom.json cut to the page area, or failing that its .txt (one text per line). Null for a
 * desktop item, and for a phone item with no render text: the whole contract state is checked then.
 * @param {object} map
 * @param {{ id: string, width: string, state: object }} item
 * @param {string|null|undefined} designDir
 * @returns {string[]|null}
 */
export function itemDesignTexts(map, item, designDir) {
  if (!designDir || !item || item.width === 'desktop') return null;
  for (const file of designFileCandidates(item.state, item.width)) {
    const base = join(designDir, file.replace(/\.png$/, ''));
    const dom = readJson(`${base}.dom.json`);
    if (dom && Array.isArray(dom.elements)) return designTexts(dom, cropFor(map, item.width, item.id).designLeft ?? 0);
    if (existsSync(`${base}.txt`)) return readFileSync(`${base}.txt`, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  }
  return null;
}

/**
 * The data entries a design render shows: an entry whose text is one of the render's texts, or
 * inside one. `texts` null keeps every entry.
 */
export function entriesShown(entries, texts) {
  if (!texts) return entries;
  const lines = texts.map(normalise).filter(Boolean);
  return entries.filter((e) => { const t = normalise(e.text); return Boolean(t) && lines.some((l) => l === t || l.includes(t)); });
}

/**
 * Whether the live lines show one data entry. `users` gives a `user` entry its fixture user's name.
 * @param {object} e a data entry of the contract
 * @param {string[]} lines the live texts, normalised
 * @param {{ role: string, name?: string }[]} users
 * @param {Record<string, string>|null} swaps
 */
export function shows(e, lines, users, swaps) {
  const kind = e.kind ?? 'value';
  const has = (v) => { const want = normalise(v); return Boolean(want) && lines.some((l) => l === want || l.includes(want)); };
  if (e.user !== undefined) {
    const u = users.find((x) => x.role === e.user);
    if (!u?.name) return has(e.value ?? e.text);
    return has((e.field ?? 'name') === 'initials' ? initials(u.name) : u.name);
  }
  if (kind === 'generated') return e.shape === 'number' ? lines.some((l) => /\d/.test(l)) : lines.some((l) => l.length > 0);
  if (kind === 'date' || kind === 'time') {
    const shape = dateShape(e.value ?? e.text);
    return lines.some((l) => dateShape(l).includes(shape));
  }
  if (kind === 'count') {
    // The text as written ("8 calls"), but never inside a longer number ("18 calls").
    const want = normalise(swapped(e.text, swaps));
    if (want) {
      const re = new RegExp(`${/^\d/.test(want) ? '(?<![\\d.,])' : ''}${escapeRe(want)}${/\d$/.test(want) ? '(?![\\d]|[.,]\\d)' : ''}`);
      if (lines.some((l) => re.test(l))) return true;
    }
    const n = countOf(e);
    if (n === null) return false;
    return numberForms(n).some((f) => { const re = new RegExp(`(^|[^\\d.,])${escapeRe(f)}($|[^\\d.,])`); return lines.some((l) => re.test(l)); });
  }
  return has(swapped(e.value ?? e.text, swaps)) || has(swapped(e.text, swaps));
}

/**
 * One item's datacheck. `rows` null means the world's rows are not known: the row rule sorts.
 * @param {{ contractState: object|null|undefined, liveLines: string[]|null, rows: object[]|null,
 *           users?: object[], now?: Date, swaps?: Record<string, string>|null, designTexts?: string[]|null }} o
 *   designTexts: the item's own design render texts (a phone item); only entries it shows are checked
 *   intercept: the state's reach.intercept; a value its body holds is held, so a miss is the page's
 * @returns {{ checked: number, faults: { text: string, why: string }[], page: { text: string, why: string }[] }}
 */
export function checkItem({ contractState, liveLines, rows, users = [], now = new Date(), swaps = null, designTexts: shown = null, intercept = null }) {
  const out = { checked: 0, faults: [], page: [] };
  if (!contractState || !liveLines) return out;
  const lines = liveLines.map(normalise).filter(Boolean);
  const entries = entriesShown((contractState.texts ?? []).filter((e) => e.label === 'data' && !entryProblem(e)), shown);
  const seen = new Map(entries.map((e) => [e, shows(e, lines, users, swaps)]));
  for (const e of entries) {
    out.checked += 1;
    if (seen.get(e)) continue;
    const kind = e.kind ?? 'value';
    const where = e.user !== undefined ? `the ${e.user} fixture user` : kind === 'count' ? `${e.table} rows` : e.column ? `${e.table}.${e.column}` : `${e.table ?? 'a generated value'}`;
    // B2: the state's intercept answers with this value, so the page had it to show.
    if (interceptHolds(e, intercept, swaps)) {
      out.page.push({ text: e.text, why: `the design shows "${e.text}" and the page does not, though the state's intercept answers with it (found by datacheck)` });
      continue;
    }
    if (rows) {
      const r = holds(e, rows, users, now, swaps);
      if (r.ok) out.page.push({ text: e.text, why: `the design shows "${e.text}" and the page does not, though the world holds it (${where}; found by datacheck)` });
      else out.faults.push({ text: e.text, why: `the design shows "${e.text}": ${r.why} (found by datacheck; fix the world file, not the code)` });
      continue;
    }
    const siblings = e.row ? entries.filter((x) => x !== e && x.row === e.row) : [];
    if (siblings.some((x) => seen.get(x))) {
      out.faults.push({ text: e.text, why: `the design shows "${e.text}" (${where}) and the page shows the rest of row ${e.row} without it: the world's value differs (found by datacheck; fix the world file, not the code)` });
    } else {
      out.page.push({ text: e.text, why: `the design shows "${e.text}" (${where}) and the page shows nothing of its row (found by datacheck; a page issue for the reviewers)` });
    }
  }
  return out;
}

/**
 * The lookup a shoot record carries for one item's datacheck: data faults and must fixes as notes
 * the review compiles (lib/picture/review.mjs summarise). Empty when nothing was missing.
 * @param {ReturnType<typeof checkItem>} r
 * @returns {{ dataFault: string[], must: string[] }|null}
 */
export function lookupOf(r) {
  if (!r.faults.length && !r.page.length) return null;
  return { dataFault: r.faults.map((f) => f.why), must: r.page.map((p) => p.why) };
}

/**
 * Datacheck every item of a round from its saved files: the live text of each item, the worlds as
 * seeded (seeded.json), the contract and the swap list. Items with no live text are skipped. With
 * `designDir`, a phone item is checked only against what its phone design render shows.
 * @param {{ map: object, contract: object|null, shoot: object, roundDir: string, swaps?: Record<string, Record<string, string>>|null, designDir?: string|null }} o
 * @returns {{ items: Record<string, ReturnType<typeof checkItem>>, faults: number, page: number, checked: number }}
 */
export function datacheckRound({ map, contract, shoot, roundDir, swaps = null, designDir = null }) {
  const seeded = readJson(join(roundDir, SEEDED_FILE)) ?? {};
  const items = {};
  let faults = 0;
  let page = 0;
  let checked = 0;
  for (const it of mapItems(map)) {
    const rec = shoot?.states?.[it.key];
    if (!rec?.reached) continue;
    const file = join(roundDir, liveTextFile(it.key));
    if (!existsSync(file)) continue;
    const world = it.state.reach?.world;
    const w = seeded[world] ?? null;
    const r = checkItem({
      contractState: contract?.states?.[it.id], liveLines: readFileSync(file, 'utf8').split('\n'),
      rows: w?.rows ?? null, users: w?.users ?? (map.worlds ?? []).find((x) => x.id === world)?.users ?? [],
      now: w?.at ? new Date(w.at) : new Date(rec.clock ?? rec.at ?? Date.now()), swaps: swaps?.[world] ?? null,
      designTexts: itemDesignTexts(map, it, designDir), intercept: it.state.reach?.intercept ?? null,
    });
    items[it.key] = r;
    faults += r.faults.length;
    page += r.page.length;
    checked += r.checked;
  }
  return { items, faults, page, checked };
}

/** The items of a round's shoot.json whose lookup holds a data fault (or an older round's data gap). */
export function dataFaultItems(shoot) {
  return Object.entries(shoot?.states ?? {}).filter(([, v]) => v.lookup?.dataFault?.length || v.lookup?.dataGap?.length).map(([k]) => k);
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * The round's datacheck.json, from its shoot.json: per item with a miss, its data faults and must
 * fixes, and (spike S2) the traced columns no query in the code selects. The seed-writer's Problem
 * file; `contract --questions` asks the founder about the sources.
 * @param {string} roundDir
 * @param {object} shoot the round's shoot.json as written
 * @param {string} at
 */
export async function writeDatacheck(roundDir, shoot, at, sources = null) {
  const items = {};
  for (const [k, r] of Object.entries(shoot?.states ?? {})) {
    const faults = r.lookup?.dataFault ?? r.lookup?.dataGap ?? [];
    const must = r.lookup?.must ?? [];
    if (faults.length || must.length) items[k] = { dataFault: faults, must };
  }
  const doc = { schemaVersion: 1, at, faults: Object.values(items).filter((x) => x.dataFault.length).length, must: Object.values(items).filter((x) => x.must.length).length, items, ...(sources ? { sources } : {}) };
  await writeFile(join(roundDir, DATACHECK_FILE), `${JSON.stringify(doc, null, 1)}\n`);
  return doc;
}
