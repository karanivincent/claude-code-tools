// W8: two runs changing the same shared code. Two runs both redefined one database function, and
// the later one silently dropped the other's tables on staging; nothing said so before the merge.
// `delivery map` (and `delivery prepush` again, once this run has migrations) lists what this run
// will likely touch that another open run also changes: a function both redefine, the message
// files, and the profile's shared files (the navigation config). It names the run to coordinate
// with. It warns; it never refuses. Pure helpers first; openRunChanges asks GitHub.

import { globToRegExp } from '../run/glob.mjs';

const FUNCTION_DEF = /create\s+(?:or\s+replace\s+)?function\s+(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;

/**
 * The database functions a migration text (re)defines, schema-qualified ("public.retire_organization").
 * @param {string} sql
 * @returns {string[]}
 */
export function definedFunctions(sql) {
  const out = new Set();
  for (const m of String(sql ?? '').matchAll(FUNCTION_DEF)) out.add(`${(m[1] ?? 'public').toLowerCase()}.${m[2].toLowerCase()}`);
  return [...out];
}

/** The added lines of a unified diff patch, as text. */
export function addedText(patch) {
  return String(patch ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
}

/**
 * What this run and the other open runs share.
 * @param {{ mine: { files: string[], globs: string[], functions: string[] },
 *           others: { pr: number, branch: string, title?: string, files: string[], functions: string[] }[],
 *           shared: string[] }} o
 *   mine.files: files this branch already changed; mine.globs: what it will likely touch (the map's
 *   route sources); shared: globs every run touches when it touches the page (message files, the
 *   navigation config)
 * @returns {{ pr: number, branch: string, why: string }[]}
 */
export function overlaps({ mine, others, shared }) {
  const out = [];
  const mineRes = [...(mine.globs ?? []), ...(shared ?? [])].map((g) => globToRegExp(g));
  const sharedRes = (shared ?? []).map((g) => globToRegExp(g));
  const myFiles = new Set(mine.files ?? []);
  const myFunctions = new Set(mine.functions ?? []);
  for (const o of others) {
    const fns = o.functions.filter((f) => myFunctions.has(f));
    if (fns.length) out.push({ pr: o.pr, branch: o.branch, why: `both runs redefine ${fns.join(', ')}: the later migration replaces the earlier one's body, so merge one into the other before either reaches staging` });
    const sharedHits = o.files.filter((f) => sharedRes.some((re) => re.test(f)));
    if (sharedHits.length) out.push({ pr: o.pr, branch: o.branch, why: `it changes shared file(s) this run will change too: ${sharedHits.slice(0, 4).join(', ')}` });
    const pageHits = o.files.filter((f) => !sharedRes.some((re) => re.test(f)) && (myFiles.has(f) || mineRes.some((re) => re.test(f))));
    if (pageHits.length) out.push({ pr: o.pr, branch: o.branch, why: `it changes file(s) under this run's routes: ${pageHits.slice(0, 4).join(', ')}${pageHits.length > 4 ? ` and ${pageHits.length - 4} more` : ''}` });
  }
  return out;
}

/**
 * The other open runs' changed files and the functions their migrations define: every open PR
 * whose branch starts with the profile's branch prefix, except this one's.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ branchPrefix: string, myBranch: string|null, migrationsGlob?: string|null }} o
 */
export async function openRunChanges(ctx, { branchPrefix, myBranch, migrationsGlob = null }) {
  const prs = (await ctx.gh.prList({ state: 'open', limit: 50 })).filter((p) => String(p.headRefName ?? p.head ?? '').startsWith(branchPrefix) && (p.headRefName ?? p.head) !== myBranch);
  const mig = migrationsGlob ? globToRegExp(migrationsGlob) : null;
  const out = [];
  for (const p of prs) {
    const files = await ctx.gh.api('GET', `repos/${ctx.gh.repo}/pulls/${p.number}/files?per_page=100`).catch(() => null);
    if (!Array.isArray(files)) continue;
    const functions = new Set();
    for (const f of files) if (mig && mig.test(f.filename)) for (const fn of definedFunctions(addedText(f.patch))) functions.add(fn);
    out.push({ pr: p.number, branch: p.headRefName ?? p.head, title: p.title, files: files.map((f) => f.filename), functions: [...functions] });
  }
  return out;
}

/**
 * This branch's own changes since its base: the files, and the functions its migrations define.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ baseTip: string, migrationsGlob?: string|null }} o
 */
export async function myChanges(ctx, { baseTip, migrationsGlob = null }) {
  const mb = await ctx.git.mergeBase(baseTip, 'HEAD').catch(() => null);
  if (!mb) return { files: [], functions: [] };
  const diff = await ctx.git.raw(['diff', '--name-only', mb, 'HEAD']);
  const files = String(diff.stdout ?? '').split('\n').filter(Boolean);
  const functions = new Set();
  if (migrationsGlob) {
    const re = globToRegExp(migrationsGlob);
    for (const f of files.filter((x) => re.test(x))) {
      const raw = await ctx.git.show('HEAD', f).catch(() => null);
      for (const fn of definedFunctions(raw ? raw.toString('utf8') : '')) functions.add(fn);
    }
  }
  return { files, functions: [...functions] };
}

/**
 * The shared globs: the message files (every page's words) and the profile's paths.sharedFiles
 * (the navigation config and the like).
 * @param {object} profile
 */
export function sharedGlobs(profile) {
  return [...(profile?.paths?.messages ?? []).map((m) => m.file), ...(profile?.paths?.sharedFiles ?? [])].filter(Boolean);
}

/**
 * Overlap warnings for this run, as lines; never throws (GitHub or git unreadable is one line).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ profile: object, map?: object|null, myBranch?: string|null }} o
 * @returns {Promise<string[]>}
 */
export async function overlapLines(ctx, { profile, map = null, myBranch = null }) {
  try {
    const p = profile.paths ?? {};
    const base = profile.repo.base;
    const baseTip = (await ctx.git.revParse(`origin/${base}`)) ? `origin/${base}` : base;
    const mine = await myChanges(ctx, { baseTip, migrationsGlob: p.migrationsGlob ?? null });
    const globs = Object.values(map?.sources ?? {}).flat();
    const others = await openRunChanges(ctx, { branchPrefix: profile.repo.branchPrefix, myBranch: myBranch ?? (await ctx.git.currentBranch?.().catch(() => null)) ?? null, migrationsGlob: p.migrationsGlob ?? null });
    return overlaps({ mine: { ...mine, globs }, others, shared: sharedGlobs(profile) }).map((x) => `overlap with PR #${x.pr} (${x.branch}): ${x.why}; coordinate with that run`);
  } catch (err) {
    return [`could not check other open runs for overlap (${String(err?.message ?? err).split('\n')[0]})`];
  }
}
