// Which code belongs to the in-scope screens (spec 5.1): route files from the profile's route
// globs, matched to the intent's in-scope routes, and every source file those pages reach through
// their imports (relative paths and tsconfig path aliases), test files excluded.

import { posix } from 'node:path';
import { globLiteralPrefix, matchesAny } from '../sidefx/glob.mjs';
import { tokenize } from '../sidefx/tokenize.mjs';

const EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)e2e\//;

/** Next-style segments that do not appear in the URL: route groups and parallel slots. */
function urlSegments(rel) {
  return rel.split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
}

/**
 * The URL route of a page file: the path under the glob's literal prefix, without the file name.
 * @param {string} file
 * @param {string[]} globs appRouteGlobs
 */
export function pageRoute(file, globs) {
  for (const g of globs) {
    if (!matchesAny(file, [g])) continue;
    const prefix = globLiteralPrefix(g);
    const rel = file.slice(prefix.length).split('/').slice(0, -1).join('/');
    return `/${urlSegments(rel).join('/')}`.replace(/\/+$/, '') || '/';
  }
  return null;
}

/** The URL path of an API route file: from its app directory (`.../app/api/x/route.ts` -> `/api/x`). */
export function apiRoutePath(file) {
  const i = file.lastIndexOf('/app/');
  const rel = (i >= 0 ? file.slice(i + 5) : file).split('/').slice(0, -1).join('/');
  return `/${urlSegments(rel).join('/')}`;
}

const isDynamic = (s) => /^\[.*\]$/.test(s);

/**
 * Whether a page route or a visited URL path matches an in-scope route pattern. A dynamic pattern
 * segment (`[id]`) matches any one segment; a literal pattern segment matches only itself, never a
 * dynamic page segment or a runtime value (`[*]`). One extra leading dynamic or locale-looking
 * segment is allowed on the path side (`/[locale]/x` and `/en/x` both match `/x`).
 */
export function routeMatches(path, pattern) {
  const a = String(path).split('?')[0].split('/').filter(Boolean);
  const b = String(pattern).split('?')[0].split('/').filter(Boolean);
  const eq = (x, y) => x.length === y.length && x.every((s, i) => s === y[i] || isDynamic(y[i]));
  if (eq(a, b)) return true;
  if (a.length === b.length + 1 && (isDynamic(a[0]) || /^[a-z]{2}(-[A-Za-z]{2})?$/.test(a[0])) && eq(a.slice(1), b)) return true;
  if (b.length === a.length + 1 && isDynamic(b[0]) && eq(a, b.slice(1))) return true;
  return false;
}

/**
 * @param {string[]} allFiles every path at the ref
 * @param {object} profile
 * @param {object} intent
 * @returns {{ file: string, route: string, screen: string }[]}
 */
export function inScopePages(allFiles, profile, intent) {
  const out = [];
  for (const file of allFiles) {
    if (!matchesAny(file, profile.paths.appRouteGlobs)) continue;
    const route = pageRoute(file, profile.paths.appRouteGlobs);
    if (route === null) continue;
    for (const s of intent.inScope ?? []) {
      if ((s.routes ?? []).some((r) => routeMatches(route, r))) { out.push({ file, route: normaliseRoute(route, s.routes), screen: s.screen }); break; }
    }
  }
  return out.sort((x, y) => (x.file < y.file ? -1 : 1));
}

/**
 * The URL route of the directory a file sits in, when it sits under an app route glob's literal
 * prefix. A private folder (`_components`) belongs to the route that holds it.
 * @param {string} file
 * @param {string[]} globs appRouteGlobs
 * @returns {string | null}
 */
export function dirRoute(file, globs) {
  for (const g of globs) {
    const prefix = globLiteralPrefix(g);
    if (!prefix || !file.startsWith(prefix)) continue;
    const segs = file.slice(prefix.length).split('/').slice(0, -1);
    const cut = segs.findIndex((s) => s.startsWith('_'));
    const kept = cut >= 0 ? segs.slice(0, cut) : segs;
    return `/${urlSegments(kept.join('/')).join('/')}`.replace(/\/+$/, '') || '/';
  }
  return null;
}

/**
 * Changed files that belong to a page the run was not asked to change: files in the route
 * directory of a screen intent.json lists as out of scope (by its `routes`), unless an in-scope
 * screen claims the same route. Shared components live outside route directories and are never
 * listed: the design's shared parts follow the design wherever they appear.
 * @param {string[]} changed
 * @param {object} profile
 * @param {object | null} intent
 * @returns {{ file: string, route: string, screen: string }[]}
 */
export function outOfScopeFiles(changed, profile, intent) {
  const outs = (intent?.outOfScope ?? []).filter((s) => s.routes?.length);
  if (!outs.length) return [];
  const globs = profile.paths.appRouteGlobs ?? [];
  const out = [];
  for (const file of changed) {
    const route = dirRoute(file, globs);
    if (route === null) continue;
    if ((intent.inScope ?? []).some((s) => (s.routes ?? []).some((r) => routeMatches(route, r)))) continue;
    const hit = outs.find((s) => s.routes.some((r) => routeMatches(route, r)));
    if (hit) out.push({ file, route, screen: hit.screen });
  }
  return out;
}

/** Present a page route the way the intent writes it (drop a leading dynamic segment it lacks). */
function normaliseRoute(route, patterns) {
  const segs = route.split('/').filter(Boolean);
  if (segs.length && isDynamic(segs[0]) && patterns.some((p) => !String(p).split('/').filter(Boolean)[0]?.startsWith('['))) {
    return `/${segs.slice(1).join('/')}`;
  }
  return route;
}

/** Module specifiers a file imports (static, re-export, dynamic, require); type-only imports skipped. */
export function importSpecifiers(text, path) {
  const tokens = tokenize(text, { jsx: /\.[jt]sx$/.test(path) });
  const out = [];
  let typeOnly = false;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t !== 'id') continue;
    if ((tk.v === 'import' || tk.v === 'export') && tokens[i + 1]?.t === 'id' && tokens[i + 1].v === 'type' && tokens[i + 2]?.v !== '(') { typeOnly = true; continue; }
    if (tk.v === 'from' && tokens[i + 1]?.t === 'str') {
      if (!typeOnly) out.push(tokens[i + 1].v);
      typeOnly = false;
      continue;
    }
    if (tk.v === 'import' && tokens[i + 1]?.t === 'str') { out.push(tokens[i + 1].v); continue; }
    if ((tk.v === 'import' || tk.v === 'require') && tokens[i + 1]?.v === '(' && tokens[i + 2]?.t === 'str') out.push(tokens[i + 2].v);
  }
  return out;
}

/** Strip comments and trailing commas so a tsconfig parses as JSON. */
function parseJsonc(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { out += c; if (c === '\\') { out += text[++i] ?? ''; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 1; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Resolve imports across a file set read at one ref.
 * @param {{ list(): Promise<string[]>, read(paths: string[]): Promise<Map<string, string>> }} reader
 */
export async function createResolver(reader) {
  const files = new Set(await reader.list());
  const tsconfigCache = new Map();
  async function tsconfigFor(dir) {
    if (tsconfigCache.has(dir)) return tsconfigCache.get(dir);
    let result = null;
    const candidate = dir ? `${dir}/tsconfig.json` : 'tsconfig.json';
    if (files.has(candidate)) {
      try {
        const cfg = parseJsonc((await reader.read([candidate])).get(candidate) ?? '{}');
        let paths = cfg.compilerOptions?.paths ?? null;
        let baseUrl = cfg.compilerOptions?.baseUrl ?? '.';
        let root = dir;
        if (!paths && typeof cfg.extends === 'string' && cfg.extends.startsWith('.')) {
          const ext = posix.normalize(posix.join(dir, cfg.extends.endsWith('.json') ? cfg.extends : `${cfg.extends}.json`));
          if (files.has(ext)) {
            const parent = parseJsonc((await reader.read([ext])).get(ext) ?? '{}');
            paths = parent.compilerOptions?.paths ?? null;
            baseUrl = parent.compilerOptions?.baseUrl ?? '.';
            root = posix.dirname(ext) === '.' ? '' : posix.dirname(ext);
          }
        }
        result = { paths: paths ?? {}, base: posix.normalize(posix.join(root || '.', baseUrl)) };
      } catch { result = { paths: {}, base: dir || '.' }; }
    } else if (dir) {
      result = await tsconfigFor(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '');
    }
    tsconfigCache.set(dir, result);
    return result;
  }
  const withExt = (p) => {
    const n = posix.normalize(p).replace(/^\.\//, '');
    for (const e of EXTS) if (files.has(n + e)) return n + e;
    return null;
  };
  return {
    files,
    async resolve(fromFile, spec) {
      const dir = posix.dirname(fromFile) === '.' ? '' : posix.dirname(fromFile);
      if (spec.startsWith('.')) return withExt(posix.join(dir, spec));
      const cfg = await tsconfigFor(dir);
      if (!cfg) return null;
      for (const [alias, targets] of Object.entries(cfg.paths)) {
        const star = alias.endsWith('*');
        const head = star ? alias.slice(0, -1) : alias;
        if (star ? !spec.startsWith(head) : spec !== alias) continue;
        const rest = star ? spec.slice(head.length) : '';
        for (const t of targets) {
          const target = star ? t.replace('*', rest) : t;
          const hit = withExt(posix.join(cfg.base, target));
          if (hit) return hit;
        }
      }
      return null;
    },
  };
}

/**
 * Every repo file reachable by imports from the start files (test files excluded), with the first
 * start file that reaches it. Capped so a barrel that imports the whole app cannot run away.
 * @param {{ read(paths: string[]): Promise<Map<string, string>> }} reader
 * @param {Awaited<ReturnType<typeof createResolver>>} resolver
 * @param {string[]} starts
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Map<string, string>>} file -> the start file it was reached from
 */
export async function importClosure(reader, resolver, starts, opts = {}) {
  const limit = opts.limit ?? 1500;
  const seen = new Map();
  let frontier = starts.map((s) => [s, s]);
  while (frontier.length && seen.size < limit) {
    const want = frontier.filter(([f]) => !seen.has(f) && !TEST_FILE.test(f) && /\.[cm]?[jt]sx?$/.test(f));
    for (const [f, from] of want) seen.set(f, from);
    const texts = await reader.read(want.map(([f]) => f));
    const next = [];
    for (const [f, from] of want) {
      const text = texts.get(f);
      if (text === undefined) continue;
      for (const spec of importSpecifiers(text, f)) {
        const hit = await resolver.resolve(f, spec);
        if (hit && !seen.has(hit)) next.push([hit, from]);
      }
    }
    frontier = next;
  }
  return seen;
}

export { TEST_FILE };
