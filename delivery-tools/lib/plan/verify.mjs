// plan verify (spec 4.3): every exists claim the CLI can settle from files. Columns against the
// generated database types; API routes against the route files (the file, the exported method,
// and a discriminator's literal in the handler or a module it imports). What it cannot settle
// (verifiedBy "verify-spec") is listed for general-tools:verify-spec. Owner: slice B1.

import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { exists } from '../core/fs.mjs';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function block(text, openAt) {
  // text[openAt] is "{"; returns the index just after its matching "}".
  let depth = 0;
  for (let i = openAt; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < text.length && text[i] !== q; i++) if (text[i] === '\\') i++;
    }
  }
  return text.length;
}

/** Keys of a type literal's body at depth 0: "a: x; b?: { c: y }" gives a and b. */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let expectKey = true;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(' || c === '<') { depth++; expectKey = false; continue; }
    if (c === '}' || c === ']' || c === ')' || c === '>') { depth--; continue; }
    if (depth !== 0) continue;
    if (c === ';' || c === ',' || c === '\n') { expectKey = true; continue; }
    if (!expectKey || /\s/.test(c)) continue;
    const m = /^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\??\s*:/.exec(body.slice(i));
    if (m) { keys.push(m[1]); i += m[0].length - 1; }
    expectKey = false;
  }
  return keys;
}

/**
 * Tables and views with their columns, from generated database types (a "Row: { ... }" block
 * under each table or view name, as Supabase and similar generators write them).
 * @param {string} text
 * @returns {Map<string, Set<string>>}
 */
export function parseDatabaseTypes(text) {
  const out = new Map();
  const re = /["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:\s*\{\s*Row\s*:\s*\{/g;
  for (const m of text.matchAll(re)) {
    const open = m.index + m[0].length - 1;
    const body = text.slice(open + 1, block(text, open) - 1);
    const cols = out.get(m[1]) ?? new Set();
    for (const k of topLevelKeys(body)) cols.add(k);
    out.set(m[1], cols);
  }
  return out;
}

/** The static part of a glob, up to its first wildcard. */
function globStem(glob) {
  const i = glob.search(/[*?[]/);
  return i < 0 ? glob : glob.slice(0, i);
}

/** Glob to regex: ** crosses directories, * stays in one, [[] is a literal [. */
export function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') { re += '/?'; i++; } }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end > i) { re += `[${glob.slice(i + 1, end).replace(/\\/g, '\\\\')}]`; i = end; } else re += '\\[';
    } else re += c.replace(/[.+^${}()|\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * The URL path a route or page file serves, from the Next.js-style app directory: route groups
 * "(x)" and slots "@x" dropped, the file name dropped.
 * @param {string} file repo-relative
 * @param {string} glob the profile glob it matched
 */
export function urlForRouteFile(file, glob) {
  const stemSegs = globStem(glob.replace(/\[\[\]/g, '[')).split('/').filter(Boolean);
  const appIdx = stemSegs.lastIndexOf('app');
  const segs = file.split('/');
  const start = appIdx >= 0 ? appIdx + 1 : Math.max(0, stemSegs.length - 1);
  const urlSegs = segs.slice(start, -1).filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return `/${urlSegs.join('/')}`;
}

const isParam = (s) => /^\[.*\]$/.test(s);

/**
 * Whether a planned route ("/api/widgets/[id]/publish") is served by a file's URL
 * ("/api/widgets/[widgetId]/publish"): parameters match parameters, and leading parameters of
 * the file (a locale segment) may be absent from the plan.
 */
export function routeMatches(planned, served) {
  const p = planned.split('?')[0].split('/').filter(Boolean);
  let s = served.split('/').filter(Boolean);
  while (s.length > p.length && isParam(s[0]) && !isParam(p[0] ?? '')) s = s.slice(1);
  if (p.length !== s.length) return false;
  return p.every((seg, i) => (isParam(seg) && isParam(s[i])) || seg === s[i]);
}

/** HTTP methods a route handler exports. */
export function exportedMethods(text) {
  const found = new Set();
  const alt = METHODS.join('|');
  for (const m of text.matchAll(new RegExp(`export\\s+(?:async\\s+)?function\\s+(${alt})\\b`, 'g'))) found.add(m[1]);
  for (const m of text.matchAll(new RegExp(`export\\s+(?:const|let|var)\\s+(${alt})\\b`, 'g'))) found.add(m[1]);
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (METHODS.includes(name)) found.add(name);
    }
  }
  return found;
}

/**
 * Whether a discriminator ("move=generate", or a bare literal) appears in any of the texts: the
 * key as a word and the value as a string literal.
 */
export function hasDiscriminator(texts, discriminator) {
  const [key, value] = discriminator.includes('=') ? discriminator.split('=', 2).map((x) => x.trim()) : [null, discriminator.trim()];
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const valueRe = new RegExp(`(['"\`])${esc}\\1`);
  const keyRe = key ? new RegExp(`(?<![A-Za-z0-9_$])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_$])`) : null;
  return texts.some((t) => valueRe.test(t) && (!keyRe || keyRe.test(t)));
}

async function readText(path) {
  try { return await readFile(path, 'utf8'); } catch { return null; }
}

// The route file plus the modules it imports by relative path or the "@/" alias (src/), one level.
async function handlerTexts(repoRoot, file, text) {
  const texts = [text];
  const dir = dirname(join(repoRoot, file));
  const srcIdx = file.split('/').lastIndexOf('app');
  const srcDir = srcIdx > 0 ? join(repoRoot, ...file.split('/').slice(0, srcIdx)) : null;
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    let base = null;
    if (spec.startsWith('.')) base = normalize(join(dir, spec));
    else if (spec.startsWith('@/') && srcDir) base = join(srcDir, spec.slice(2));
    if (!base) continue;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (!(await exists(cand))) continue;
      const t = await readText(cand);
      if (t !== null) { texts.push(t); break; }
    }
  }
  return texts;
}

/**
 * Check every mechanical exists claim of a plan against the files of a working tree.
 * @param {{ plan: object, repoRoot: string, files: string[], profile: object, typesText: string|null }} input
 *   files: every tracked file, repo-relative (git ls-files)
 * @returns {Promise<{ failures: { code: string, message: string }[], left: string[], checked: number }>}
 */
export async function verifyPlanClaims({ plan, repoRoot, files, profile, typesText }) {
  const failures = [];
  const left = [];
  let checked = 0;
  const types = typesText === null ? null : parseDatabaseTypes(typesText);
  const apiGlobs = (profile.paths.apiRouteGlobs ?? []).map((g) => ({ g, re: globToRe(g) }));
  const routeFiles = [];
  for (const f of files) {
    const hit = apiGlobs.find(({ re }) => re.test(f));
    if (hit) routeFiles.push({ file: f, url: urlForRouteFile(f, hit.g) });
  }
  const textCache = new Map();
  const text = async (f) => { if (!textCache.has(f)) textCache.set(f, await readText(join(repoRoot, f))); return textCache.get(f); };

  for (const r of plan.rows ?? []) {
    for (const d of r.data ?? []) {
      const claim = `${d.table}.${d.column}`;
      if (d.verifiedBy === 'verify-spec') { left.push(`${r.id}: ${claim} ${d.exists ? 'exists' : 'is missing'}`); continue; }
      checked++;
      if (!types) { failures.push({ code: 'verify-types', message: `${r.id}: cannot check ${claim}: no database types at ${profile.paths.databaseTypes}` }); continue; }
      const cols = types.get(d.table);
      const found = Boolean(cols?.has(d.column));
      if (d.exists && !found) failures.push({ code: 'verify-column', message: `${r.id}: ${claim} is claimed to exist, but ${cols ? `table ${d.table} has no column ${d.column}` : `the types have no table ${d.table}`}` });
      if (!d.exists && found) failures.push({ code: 'verify-column', message: `${r.id}: ${claim} is claimed missing, but the database types already have it` });
    }
    for (const b of r.backend ?? []) {
      const claim = `${b.method} ${b.route}${b.discriminator ? ` ${b.discriminator}` : ''}`;
      if (b.verifiedBy === 'verify-spec') { left.push(`${r.id}: ${claim} ${b.exists ? 'exists' : 'is missing'}`); continue; }
      checked++;
      const matches = routeFiles.filter((x) => routeMatches(b.route, x.url));
      let served = null;
      let why = matches.length ? null : 'no route file serves it';
      for (const x of matches) {
        const t = await text(x.file);
        if (t === null) continue;
        if (!exportedMethods(t).has(b.method)) { why = `${x.file} does not export ${b.method}`; continue; }
        if (b.discriminator && !hasDiscriminator(await handlerTexts(repoRoot, x.file, t), b.discriminator)) {
          why = `${x.file} exports ${b.method} but its handler never names ${b.discriminator}`;
          continue;
        }
        served = x.file;
        break;
      }
      if (b.exists && !served) failures.push({ code: 'verify-route', message: `${r.id}: ${claim} is claimed to exist, but ${why}` });
      if (!b.exists && served) failures.push({ code: 'verify-route', message: `${r.id}: ${claim} is claimed missing, but ${served} already serves it` });
    }
  }
  return { failures, left, checked };
}
