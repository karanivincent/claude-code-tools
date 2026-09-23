// Which design screens a run builds (intent.json inScope / outOfScope, each naming the prototype
// screens it covers in designScreens), and what that means for a candidate. A design export is
// the whole project, so most runs meet screens they were not asked to build; those are excluded
// as whole screens, with one fixed reason, and never inventoried, planned or built.

export const OUT_OF_SCOPE = 'out of scope: ';

/**
 * @param {object | null | undefined} intent
 * @returns {{ inKeys: Set<string>, outKeys: Map<string, string>, names: Set<string>, unnamed: string[] }}
 *   inKeys: design screens a run builds; outKeys: design screen -> the outOfScope screen it belongs to;
 *   names: every outOfScope screen name; unnamed: scope entries with no designScreens
 */
export function scopeScreens(intent) {
  const inKeys = new Set();
  const outKeys = new Map();
  const names = new Set();
  const unnamed = [];
  for (const s of intent?.inScope ?? []) {
    if (!s.designScreens?.length) unnamed.push(s.screen);
    for (const k of s.designScreens ?? []) inKeys.add(k);
  }
  for (const s of intent?.outOfScope ?? []) {
    names.add(s.screen);
    if (!s.designScreens?.length) unnamed.push(s.screen);
    for (const k of s.designScreens ?? []) if (!inKeys.has(k)) outKeys.set(k, s.screen);
  }
  return { inKeys, outKeys, names, unnamed };
}

/**
 * The exclusion reason for a candidate the run was not asked to build, or null. Only a candidate
 * that shows on out-of-scope screens alone qualifies; one with no screens, or with any in-scope or
 * unlisted screen, is an extractor's to judge.
 * @param {{ screens?: string[] }} candidate
 * @param {ReturnType<typeof scopeScreens>} scope
 */
export function outOfScopeReason(candidate, scope) {
  const screens = candidate.screens ?? [];
  if (!screens.length || !screens.every((k) => scope.outKeys.has(k))) return null;
  return OUT_OF_SCOPE + [...new Set(screens.map((k) => scope.outKeys.get(k)))].sort().join(' and ');
}

/**
 * An extractor's `out of scope: <screen>` exclusion is valid only for screens intent.json lists
 * as out of scope, and never for a candidate the adapter tied to in-scope screens alone.
 * @returns {string | null} what is wrong, or null
 */
export function checkOutOfScopeClaim(reason, candidate, scope) {
  if (!reason.startsWith(OUT_OF_SCOPE)) return null;
  const rest = reason.slice(OUT_OF_SCOPE.length).trim();
  const named = scope.names.has(rest) ? [rest] : rest.split(' and ').map((s) => s.trim());
  const unknown = named.filter((n) => !scope.names.has(n));
  if (unknown.length) return `"${unknown.join('", "')}" is not an out-of-scope screen in intent.json (${[...scope.names].join(', ') || 'none listed'})`;
  const screens = candidate.screens ?? [];
  if (screens.length && screens.every((k) => scope.inKeys.has(k))) return `it shows only on in-scope screens (${screens.join(', ')})`;
  return null;
}

/**
 * How many candidates the assembler will exclude as out of scope, for design candidates to print.
 * @param {{ id: string, screens?: string[] }[]} candidates
 * @param {object | null | undefined} intent
 */
export function outOfScopeOnly(candidates, intent) {
  const scope = scopeScreens(intent);
  let count = 0;
  for (const c of candidates) if (outOfScopeReason(c, scope)) count++;
  return { count, unnamed: scope.unnamed };
}
