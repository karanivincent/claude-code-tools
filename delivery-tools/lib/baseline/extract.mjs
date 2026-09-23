// Baseline extraction (spec 5.1). Owner: slice B2 (docs/ARCHITECTURE.md). Every capability of the
// in-scope pages at one git ref, each with a kind, a signature (the string the M2 diff compares),
// the screen it belongs to and file:line evidence:
//   route         route:/x/[id]  and  route:/x/[id]?tab=<value>
//   control       control:<role> "<name>"@<path>        (from a capture's dom, when one exists)
//   api-call      api:POST /api/x/[id]/y   and   api:POST /api/x/[id]/y <discriminator>=<value>
//   e2e-assertion e2e:<spec path under the e2e dir>#<test title>
//   copy-key      copy:<namespace>.<key>                (a dynamic tail is `prefix*`)
//   data-field    field:<table>.<column>                (selected by a route the page calls, and read by a component)
//   open-issue    issue:#<n>                            (an open issue naming an in-scope file)

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gateResult, PASS } from '../core/gate.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { readJson } from '../core/fs.mjs';
import { EXIT } from '../core/exit.mjs';
import { refReader } from '../sidefx/source.mjs';
import { matchesAny } from '../sidefx/glob.mjs';
import { inScopePages, createResolver, importClosure, apiRoutePath, routeMatches, TEST_FILE } from './scope.mjs';
import { analyzeSource, analyzeApiRoute, analyzeE2e } from './analyze.mjs';

export const KIND_ORDER = Object.freeze(['route', 'control', 'api-call', 'data-field', 'copy-key', 'e2e-assertion', 'open-issue']);
const E2E_FILE = /\.(spec|e2e)\.[cm]?[jt]sx?$/;

/**
 * Phase-2 gate input: for a redesign (intent.redesign), baseline.json exists, validates, was taken
 * at the run's start SHA on the base, and every capability has a signature and evidence. Green
 * with no baseline when the intent is not a redesign.
 * Called by lib/gates/phase-2.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function baselineGate(ctx) {
  const paths = ctx.requirePaths();
  const intent = await readArtefact(paths, 'intent', { optional: true });
  if (!intent) return gateResult([{ code: 'baseline', message: 'no intent.json, so whether this is a redesign is unknown' }], EXIT.USAGE);
  if (!intent.redesign) return PASS;
  const baseline = await readArtefact(paths, 'baseline', { optional: true });
  if (!baseline) return gateResult([{ code: 'baseline', message: 'this is a redesign and there is no baseline.json; run delivery baseline' }]);
  const failures = [];
  const profile = await ctx.profile();
  const base = `origin/${profile.repo.base}`;
  const onBase = await ctx.git.raw(['merge-base', '--is-ancestor', baseline.base.sha, base]);
  if (onBase.code !== 0) failures.push({ code: 'baseline', message: `baseline.json was taken at ${baseline.base.sha.slice(0, 9)}, which is not on ${base}` });
  const inRun = await ctx.git.raw(['merge-base', '--is-ancestor', baseline.base.sha, 'HEAD']);
  if (inRun.code !== 0) failures.push({ code: 'baseline', message: `baseline.json was taken at ${baseline.base.sha.slice(0, 9)}, which this branch does not contain: not the run's start` });
  for (const c of baseline.capabilities) {
    if (!c.signature) failures.push({ code: 'baseline', message: `${c.id} has no signature` });
    if (!c.evidence.length) failures.push({ code: 'baseline', message: `${c.id} (${c.signature}) has no file:line evidence` });
  }
  if (!baseline.capabilities.length) failures.push({ code: 'baseline', message: 'baseline.json lists no capability; the in-scope routes in intent.json match no page' });
  return gateResult(failures);
}

/**
 * Extract every capability at a ref.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ ref: string, intent: object, profile: object, issues?: boolean, captureDir?: string|null }} opts
 * @returns {Promise<{ ref: string, sha: string, capabilities: object[], e2e: Map<string, string[]>, files: Set<string>, notes: string[] }>}
 */
export async function extractAtRef(ctx, opts) {
  const { profile, intent } = opts;
  const reader = await refReader(ctx.git, opts.ref);
  const all = await reader.list();
  const notes = [];
  const pages = inScopePages(all, profile, intent);
  if (!pages.length) notes.push(`no page at ${opts.ref} matches the intent's in-scope routes`);
  // one read for everything the globs name; the import walk then mostly hits the reader's cache
  const e2ePrefix = `${String(profile.paths.e2eDir).replace(/\/+$/, '')}/`;
  const globs = [...profile.paths.componentGlobs, ...profile.paths.appRouteGlobs, ...profile.paths.apiRouteGlobs];
  await reader.read(all.filter((f) => (f.startsWith(e2ePrefix) && E2E_FILE.test(f)) || (/\.[cm]?[jt]sx?$/.test(f) && !TEST_FILE.test(f) && matchesAny(f, globs))));
  const resolver = await createResolver(reader);

  // which page (and so which route and screen) reaches each file
  const reach = new Map();
  for (const page of pages) {
    const closure = await importClosure(reader, resolver, [page.file]);
    for (const f of closure.keys()) {
      if (!reach.has(f)) reach.set(f, []);
      reach.get(f).push(page);
    }
  }
  const apiIndex = all.filter((f) => matchesAny(f, profile.paths.apiRouteGlobs)).map((file) => ({ file, path: apiRoutePath(file) }));
  const apiFiles = new Set(apiIndex.map((a) => a.file));
  const sources = [...reach.keys()].filter((f) => !apiFiles.has(f) && !TEST_FILE.test(f));
  const texts = await reader.read(sources);
  const caps = new Map();
  const add = (kind, signature, screen, file, line) => {
    let c = caps.get(signature);
    if (!c) { c = { kind, signature, screen, evidence: [] }; caps.set(signature, c); }
    if (file && line && c.evidence.length < 8 && !c.evidence.some((e) => e.file === file && e.line === line)) c.evidence.push({ file, line });
  };

  for (const page of pages) add('route', `route:${page.route}`, page.screen, page.file, 1);

  const discriminators = profile.baseline?.discriminators ?? [];
  const calledRoutes = new Map();
  const propsByFile = new Map();
  for (const file of sources) {
    const text = texts.get(file);
    if (text === undefined) continue;
    const from = reach.get(file);
    const screen = from[0].screen;
    let a;
    try { a = analyzeSource(file, text, { discriminators }); } catch (err) { notes.push(`${file}: not analysed (${err.message})`); continue; }
    for (const call of a.apiCalls) {
      const route = matchApi(call.url, apiIndex);
      const url = route?.path ?? call.url;
      if (route) calledRoutes.set(route.file, screen);
      add('api-call', `api:${call.method} ${url}`, screen, file, call.line);
      for (const [k, vals] of call.discriminators) {
        for (const [v, line] of vals) add('api-call', `api:${call.method} ${url} ${k}=${v}`, screen, file, line ?? call.line);
      }
    }
    for (const c of a.copyKeys) add('copy-key', `copy:${c.key}`, screen, file, c.line);
    for (const t of a.tabs) for (const p of from) add('route', `route:${p.route}?tab=${t.value}`, p.screen, file, t.line);
    if (matchesAny(file, profile.paths.componentGlobs) || matchesAny(file, profile.paths.appRouteGlobs)) propsByFile.set(file, { props: a.props, screen });
  }

  // data fields: selected by a called route, read by an in-scope component
  const apiTexts = await reader.read([...calledRoutes.keys()]);
  const selected = new Map();
  for (const [file] of calledRoutes) {
    const text = apiTexts.get(file);
    if (text === undefined) continue;
    for (const s of analyzeApiRoute(file, text).selects) {
      for (const col of s.columns) {
        const key = `${s.table}.${col}`;
        if (!selected.has(key)) selected.set(key, { table: s.table, col, file, line: s.line });
      }
    }
  }
  for (const [file, { props, screen }] of propsByFile) {
    for (const { table, col, file: sf, line: sl } of selected.values()) {
      const lines = props.get(col);
      if (!lines) continue;
      add('data-field', `field:${table}.${col}`, screen, file, lines[0]);
      add('data-field', `field:${table}.${col}`, screen, sf, sl);
    }
  }

  // e2e assertions on in-scope routes
  const e2eDir = String(profile.paths.e2eDir).replace(/\/+$/, '');
  const specs = all.filter((f) => f.startsWith(`${e2eDir}/`) && E2E_FILE.test(f));
  const specTexts = await reader.read(specs);
  const e2e = new Map();
  for (const file of specs) {
    const text = specTexts.get(file);
    if (text === undefined) continue;
    let r;
    try { r = analyzeE2e(file, text); } catch (err) { notes.push(`${file}: not analysed (${err.message})`); continue; }
    const titles = new Map();
    for (const t of r.tests) {
      const visits = [...t.visits, ...r.hookVisits];
      const page = pages.find((p) => visits.some((v) => routeMatches(v, p.route)));
      if (!page) continue;
      const n = (titles.get(t.title) ?? 0) + 1;
      titles.set(t.title, n);
      const signature = `e2e:${file.slice(e2eDir.length + 1)}#${t.title}${n > 1 ? ` (${n})` : ''}`;
      add('e2e-assertion', signature, page.screen, file, t.line);
      e2e.set(signature, { assertions: t.assertions, file, line: t.line, title: t.title });
    }
  }

  // controls, from a capture of these pages when one exists
  if (opts.captureDir) {
    for (const c of await controlsFromCapture(opts.captureDir, pages, ctx.repoRoot ?? process.cwd())) add('control', c.signature, c.screen, c.file, 1);
  }

  // open issues naming an in-scope file
  if (opts.issues) {
    try {
      const issues = await ctx.gh.issueList({ state: 'open', limit: 500 });
      const named = [...reach.keys()].filter((f) => !apiFiles.has(f));
      for (const issue of issues) {
        const hay = `${issue.title}\n${issue.body ?? ''}`;
        const hit = named.find((f) => hay.includes(f) || (distinctive(f) && hay.includes(f.split('/').pop())));
        if (hit) add('open-issue', `issue:#${issue.number}`, reach.get(hit)[0].screen, hit, 1);
      }
    } catch (err) {
      notes.push(`open issues not read (${err.message})`);
    }
  }

  const sha = reader.sha;
  return { ref: opts.ref, sha, capabilities: [...caps.values()], e2e, files: new Set([...reach.keys(), ...all.filter((f) => f.startsWith(`${e2eDir}/`))]), allFiles: all, reader, notes };
}

function distinctive(file) {
  const base = file.split('/').pop();
  return base.length >= 10 && !/^(page|layout|route|index|loading|error|not-found)\.[cm]?[jt]sx?$/.test(base);
}

/** The API route file a fetch URL pattern names: most literal segments win. */
export function matchApi(url, apiIndex) {
  const segs = url.split('/').filter(Boolean);
  let best = null;
  let bestScore = -1;
  for (const r of apiIndex) {
    const rs = r.path.split('/').filter(Boolean);
    if (rs.length !== segs.length) continue;
    let score = 0;
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i] === segs[i]) score += 2;
      else if (/^\[.*\]$/.test(rs[i]) && (segs[i] === '[*]' || !/^\[/.test(segs[i]))) score += segs[i] === '[*]' ? 1 : 0;
      else { ok = false; break; }
    }
    if (ok && score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/** Controls a capture saw: role and accessible name at the page's path. */
async function controlsFromCapture(captureDir, pages, repoRoot) {
  const out = [];
  let entries = [];
  try { entries = await readdir(captureDir, { recursive: true }); } catch { return out; }
  for (const rel of entries.filter((e) => String(e).endsWith('.dom.json'))) {
    const path = join(captureDir, String(rel));
    const dom = await readJson(path, { optional: true }).catch(() => null);
    if (!dom?.elements) continue;
    let urlPath = '/';
    try { urlPath = new URL(dom.url, 'http://x.invalid').pathname; } catch { /* keep / */ }
    const page = pages.find((p) => routeMatches(urlPath, p.route));
    if (!page) continue;
    const tab = (() => { try { return new URL(dom.url, 'http://x.invalid').searchParams.get('tab'); } catch { return null; } })();
    const where = `${page.route}${tab ? `?tab=${tab}` : ''}`;
    for (const el of dom.elements) {
      if (el.kind !== 'control' || !el.visible || !el.name) continue;
      out.push({ signature: `control:${el.role ?? el.tag} "${String(el.name).replace(/\s+/g, ' ').trim()}"@${where}`, screen: page.screen, file: relative(repoRoot, path) });
    }
  }
  return out;
}

/**
 * Capabilities with ids: CAP-001 onwards, ordered by kind then signature, so the same code gives
 * the same ids.
 * @param {object[]} caps
 * @param {number} [start]
 */
export function numberCapabilities(caps, start = 1) {
  const sorted = [...caps].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0));
  return sorted.map((c, i) => ({ id: `CAP-${String(start + i).padStart(3, '0')}`, kind: c.kind, signature: c.signature, screen: c.screen ?? '', evidence: c.evidence }));
}
