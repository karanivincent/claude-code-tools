// A4: picture items the founder waived with `delivery waive <ITEM> --why "<reason>"`. A waived
// item keeps its verdict on every page, but it is not open: the stop rule does not count it, and
// ready does not wait for it. Its reason is shown in ready and in the round's stuck.md. The record
// lives in .delivery/<f>/waived.json: { schemaVersion, items: { "<ITEM>": { why, at, verdict, round } } }.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from '../core/fs.mjs';

/** Verdicts a waiver may cover: the ones that keep an item open or keep ready red. */
export const WAIVABLE_VERDICTS = Object.freeze(['must', 'not-reached', 'data-fault', 'data-gap']);

/** @param {{ runDir: string }} paths */
export function waivedPath(paths) { return join(paths.runDir, 'waived.json'); }

/**
 * The waived items, keyed by item ("KC-05", "KC-05@phone").
 * @returns {Record<string, { why: string, at: string, verdict: string|null, round: number|null }>}
 */
export function readWaived(paths) {
  try { return JSON.parse(readFileSync(waivedPath(paths), 'utf8')).items ?? {}; } catch { return {}; }
}

/** Record (or replace) the waivers of some items. */
export async function writeWaivers(paths, entries) {
  const items = { ...readWaived(paths), ...entries };
  await writeJsonAtomic(waivedPath(paths), { schemaVersion: 1, items });
  return items;
}

/** One line per waived item: "<ITEM>: <why>". */
export function waivedLines(waived) {
  return Object.entries(waived).map(([key, w]) => `${key}: ${w.why}`);
}
