// W5 (D9): a fix round shoots only what can have changed. An item that passed the round before
// (match or small) is shot again only when a file under its route's sources changed since that
// round was shot. The map names each route's source folders (`sources`, filled in by the mapper);
// a route with none, or any changed file outside every route's sources (a shared component, a
// style sheet, a world file), means "not sure", and then everything is shot. Pure except
// changedSince, which asks git.

import { globToRegExp } from '../run/glob.mjs';
import { reachSteps } from './map.mjs';

const FINE = new Set(['match', 'small']);

const pathOf = (route) => { try { return new URL(route, 'http://x').pathname; } catch { return String(route); } };

/** The route an item ends on: its last goto, or the map's landing route. */
export function itemRoute(map, it) {
  const gotos = reachSteps(it.state, it.width).filter((s) => typeof s.goto === 'string').map((s) => s.goto);
  return pathOf(gotos.length ? gotos[gotos.length - 1] : map.route);
}

/** The source globs the map gives a route: the longest `sources` key the route starts with. */
export function sourcesFor(map, route) {
  const keys = Object.keys(map?.sources ?? {}).filter((k) => route === k || route.startsWith(k.endsWith('/') ? k : `${k}/`) || k === '/');
  if (!keys.length) return null;
  keys.sort((a, b) => b.length - a.length);
  return map.sources[keys[0]];
}

/**
 * The items a fix round need not shoot again, and why nothing is skipped when it is not sure.
 * @param {{ map: object, items: object[], verdicts: Map<string, { verdict: string, round: number }>,
 *           prevShoot: object|null, changed: string[]|null, ignore?: RegExp }} o
 * @returns {{ skip: Record<string, { from: number }>, why: string|null }}
 */
export function unchangedItems({ map, items, verdicts, prevShoot, changed, ignore = /^\.delivery\// }) {
  const skip = {};
  if (!map?.sources || !Object.keys(map.sources).length) return { skip, why: 'the map names no route sources, so every item is shot' };
  if (!prevShoot) return { skip, why: 'no earlier round to compare with' };
  if (!changed) return { skip, why: 'the files changed since the last round could not be read, so every item is shot' };
  const all = Object.values(map.sources).flat().map((g) => globToRegExp(g));
  const files = changed.filter((f) => !ignore.test(f));
  const outside = files.filter((f) => !all.some((re) => re.test(f)));
  if (outside.length) return { skip, why: `${outside.length} changed file(s) lie outside every route's sources (${outside.slice(0, 3).join(', ')}), so every item is shot` };
  for (const it of items) {
    const v = verdicts.get(it.key);
    if (!v || !FINE.has(v.verdict) || !prevShoot.states?.[it.key]?.reached) continue;
    const globs = sourcesFor(map, itemRoute(map, it));
    if (!globs?.length) continue;
    const res = globs.map((g) => globToRegExp(g));
    if (files.some((f) => res.some((re) => re.test(f)))) continue;
    skip[it.key] = { from: v.round };
  }
  return { skip, why: null };
}

/**
 * The files changed since a commit, committed or not, and new files git does not ignore; null
 * when git cannot say (then everything is shot).
 * @param {{ raw: (args: string[]) => Promise<{ code?: number, stdout: string }> }} git
 * @param {string|null} sha
 */
export async function changedSince(git, sha) {
  if (!sha) return null;
  try {
    const d = await git.raw(['diff', '--name-only', sha]);
    if ((d.code ?? 0) !== 0) return null;
    const u = await git.raw(['ls-files', '--others', '--exclude-standard']);
    return [...new Set([...String(d.stdout).split('\n'), ...String(u.stdout ?? '').split('\n')].map((x) => x.trim()).filter(Boolean))];
  } catch { return null; }
}
