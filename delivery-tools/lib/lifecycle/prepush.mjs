// delivery prepush: the checks that would otherwise fail after the first push (a design gate or
// E2E that reads the BASE branch, a retirement list, a staging conflict). Pure helpers first, then
// prepushProblems, which reads git through ctx. Owner: slice A2 (docs/ARCHITECTURE.md).

import { globToRegExp } from '../run/glob.mjs';
import { readMap } from '../picture/map.mjs';
import { componentsCheck } from '../run/ready-compute.mjs';

const SPEC_EXT = /\.(?:[cm]?[jt]sx?)$/;
const TESTID_KEYS = new Set(['testid', 'testId', 'test_id', 'dataTestid', 'dataTestId']);
const TEXT_KEYS = new Set(['text', 'label', 'name', 'title', 'placeholder', 'expect', 'expectText', 'contains', 'hasText', 'copy']);
const QUOTED = '([\'"`])((?:(?!\\1).)+)\\1';
const SPEC_TESTID = [new RegExp(`getByTestId\\(\\s*${QUOTED}`, 'g'), /data-testid\s*=\s*["']?([^"'\]\s>)]+)/g, /\[data-testid=["']?([^"'\]]+)/g];
const SPEC_TEXT = [
  new RegExp(`(?:getByText|getByLabel|getByPlaceholder|getByTitle|toHaveText|toContainText|hasText)\\(\\s*${QUOTED}`, 'g'),
  new RegExp(`getByRole\\([^)]*?name:\\s*${QUOTED}`, 'g'),
];
const GREP_CHUNK = 100;

const usable = (t) => typeof t === 'string' && t.length >= 3 && t.length <= 120 && !t.includes('\n');

/** The last capture group of every match (the quoted text, or the bare id). */
function matches(re, src) {
  return [...src.matchAll(re)].map((m) => m[m.length - 1]);
}

/**
 * The test ids and visible text a Playwright spec names (string literals only).
 * @param {string} src
 * @returns {{ testIds: Set<string>, texts: Set<string> }}
 */
export function specNames(src) {
  const testIds = new Set(SPEC_TESTID.flatMap((re) => matches(re, src)).filter(usable));
  const texts = new Set(SPEC_TEXT.flatMap((re) => matches(re, src)).filter(usable));
  return { testIds, texts };
}

/**
 * The test ids and visible text a design plan.json names. The plan's exact shape is the design
 * gate's, so this reads it loosely: a value under a test-id key is an id, a value under a text key
 * is visible text, and any string holding a data-testid selector names its id.
 * @param {unknown} doc
 * @returns {{ testIds: Set<string>, texts: Set<string> }}
 */
export function planNames(doc) {
  const testIds = new Set();
  const texts = new Set();
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => walk(x, k));
    if (typeof v !== 'string') return;
    for (const re of SPEC_TESTID) for (const id of matches(re, v)) if (usable(id)) testIds.add(id);
    if (TESTID_KEYS.has(key) && usable(v)) testIds.add(v);
    else if (TEXT_KEYS.has(key) && usable(v)) texts.add(v);
  };
  walk(doc, '');
  return { testIds, texts };
}

/**
 * Tables a migration creates that carry the org column.
 * @param {string} sql
 * @param {string} [orgColumn]
 * @returns {string[]}
 */
export function orgScopedTables(sql, orgColumn = 'organization_id') {
  const src = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?\w+"?\.)?"?\w+"?)\s*\(/gi;
  for (let m; (m = re.exec(src)); ) {
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    const cols = [];
    let d = 0;
    let cur = '';
    for (const c of src.slice(start, i - 1)) {
      if (c === '(') d++;
      if (c === ')') d--;
      if (c === ',' && d === 0) { cols.push(cur); cur = ''; } else cur += c;
    }
    cols.push(cur);
    if (cols.some((c) => c.trim().replace(/^"|"(?=\s)/g, '').split(/\s+/)[0].replace(/"/g, '') === orgColumn)) {
      out.push(m[1].replace(/"/g, '').split('.').pop());
    }
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (src, table) => new RegExp(`(?<![\\w])${escapeRe(table)}(?![\\w])`).test(src);

const ID_CHAR = 'A-Za-z0-9_.:-';
const PLAIN_ID = new RegExp(`^[${ID_CHAR}]+$`);

/**
 * git grep -o over one ref: which of the names appear in the app sources there. A test id counts
 * only as a whole id ("save" is not found inside "save-widget", and "save-widget" is not found
 * inside "save-widget-2", so a rename that extends an id is seen); visible text counts as a
 * substring.
 */
async function foundAt(git, ref, { testIds, texts }, pathspecs) {
  const found = new Set();
  const grep = async (mode, patterns) => {
    for (let i = 0; i < patterns.length; i += GREP_CHUNK) {
      const chunk = patterns.slice(i, i + GREP_CHUNK);
      const r = await git.raw(['grep', '-h', '-o', mode, ...chunk.flatMap((t) => ['-e', t]), ref, '--', ...pathspecs]);
      if (r.code > 1) throw new Error(`git grep failed on ${ref}: ${String(r.stderr).trim().split('\n')[0]}`);
      for (const line of String(r.stdout).split('\n')) if (line) found.add(line);
    }
  };
  const whole = [...testIds].filter((t) => PLAIN_ID.test(t));
  await grep('-E', whole.map((t) => `(^|[^${ID_CHAR}])${t.replace(/\./g, '\\.')}([^${ID_CHAR}]|$)`));
  // The whole-id matches carry one boundary character each side; keep the bare id.
  for (const line of [...found]) {
    found.delete(line);
    found.add(line.replace(new RegExp(`^[^${ID_CHAR}]`), '').replace(new RegExp(`[^${ID_CHAR}]$`), ''));
  }
  await grep('-F', [...texts, ...[...testIds].filter((t) => !PLAIN_ID.test(t))]);
  return found;
}

const globSpec = (g) => `:(glob)${g}`;

/**
 * Rule 1. Names the base branch's design plans and e2e specs use that the branch no longer has in
 * its app sources. "App sources" is a whole-tree search of paths.componentGlobs and
 * paths.appRouteGlobs (plus the message files, where visible text lives; the whole tree when both
 * globs are empty), at the branch's merge base and at HEAD. Both are read with git grep, so the
 * working copy is never consulted. Plans and specs come from the base tip, as the gates read them.
 */
async function removedNames(ctx, profile, base, baseTip) {
  const { git } = ctx;
  const p = profile.paths ?? {};
  const names = { testIds: new Map(), texts: new Map() }; // name -> where the base names it
  const note = (kind, set, where) => { for (const n of set) if (!names[kind].has(n)) names[kind].set(n, where); };

  const planFiles = (await git.lsTree(baseTip, `${p.deliveryRoot}/replay`)).filter((f) => f.endsWith('/plan.json') || f === `${p.deliveryRoot}/replay/plan.json`);
  for (const f of planFiles) {
    const raw = await git.show(baseTip, f);
    let doc = null;
    try { doc = JSON.parse(raw.toString('utf8')); } catch { continue; }
    const n = planNames(doc);
    note('testIds', n.testIds, f); note('texts', n.texts, f);
  }
  const specFiles = (await git.lsTree(baseTip, p.e2eDir)).filter((f) => SPEC_EXT.test(f));
  for (const f of specFiles) {
    const raw = await git.show(baseTip, f);
    const n = specNames(raw.toString('utf8'));
    note('testIds', n.testIds, f); note('texts', n.texts, f);
  }
  if (!names.testIds.size && !names.texts.size) return [];
  const all = { testIds: new Set(names.testIds.keys()), texts: new Set(names.texts.keys()) };

  const globs = [...(p.componentGlobs ?? []), ...(p.appRouteGlobs ?? []), ...(p.messages ?? []).map((m) => m.file)];
  const specs = [
    ...(globs.length ? globs.map(globSpec) : ['.']),
    ...[p.e2eDir, p.deliveryRoot, p.designRoot].filter(Boolean).map((d) => `:(exclude)${d}`),
  ];
  const mb = await git.mergeBase(baseTip, 'HEAD');
  if (!mb) return [];
  const [before, after] = [await foundAt(git, mb, all, specs), await foundAt(git, 'HEAD', all, specs)];
  const out = [];
  for (const [kind, label] of [['testIds', 'test id'], ['texts', 'visible text']]) {
    for (const [name, where] of names[kind]) {
      if (before.has(name) && !after.has(name)) out.push({ code: 'removed-name', message: `the branch removes or renames the ${label} "${name}", which ${where} on ${baseTip.replace(/^origin\//, '')} names; keep it, or change the design plan or spec on the base branch first` });
    }
  }
  return out;
}

/** Rule 2: org-scoped tables the branch's new migrations create, missing from a list. */
async function orgListProblems(ctx, profile, baseTip) {
  const p = profile.paths ?? {};
  const lists = p.orgScopedLists;
  if (!p.migrationsGlob || !Array.isArray(lists) || !lists.length) return [];
  const { git } = ctx;
  const mb = await git.mergeBase(baseTip, 'HEAD');
  if (!mb) return [];
  const diff = await git.ok(['diff', '--name-status', mb, 'HEAD']);
  const re = globToRegExp(p.migrationsGlob);
  const added = diff.split('\n').filter((l) => /^A\d*\t/.test(l)).map((l) => l.slice(l.indexOf('\t') + 1)).filter((f) => re.test(f));
  const tables = new Set();
  for (const f of added) {
    const raw = await git.show('HEAD', f);
    for (const t of orgScopedTables(raw.toString('utf8'), p.orgColumn ?? 'organization_id')) tables.add(t);
  }
  if (!tables.size) return [];
  const tree = await git.lsTree('HEAD');
  const out = [];
  for (const list of lists) {
    const lre = globToRegExp(list.files);
    const sources = [];
    for (const f of tree.filter((x) => lre.test(x))) {
      const s = (await git.show('HEAD', f))?.toString('utf8') ?? '';
      if (!list.alsoContains || s.includes(list.alsoContains)) sources.push(s);
    }
    for (const t of tables) {
      if (!sources.some((s) => mentions(s, t))) {
        out.push({ code: 'org-scoped', message: `table ${t} has ${p.orgColumn ?? 'organization_id'} but is missing from ${list.label} (${list.files}${list.alsoContains ? `, files containing ${list.alsoContains}` : ''})` });
      }
    }
  }
  return out;
}

/**
 * Every problem the branch has before its first push.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ code: string, message: string }[]>}
 */
export async function prepushProblems(ctx) {
  const profile = await ctx.profile();
  const base = profile.repo.base;
  const { git } = ctx;
  const problems = [];

  // Rule 3 first: the fetch makes every later "base" the newest one.
  let baseTip = `origin/${base}`;
  try {
    await git.fetch('origin', base);
  } catch (err) {
    problems.push({ code: 'fetch', message: `cannot fetch origin ${base}: ${String(err.message).replace(/^git fetch[^:]*: /, '')}` });
  }
  if (!(await git.revParse(baseTip))) baseTip = base;
  if (!(await git.revParse(baseTip))) {
    problems.push({ code: 'base', message: `base ref ${base} not found` });
    return problems;
  }
  const behind = Number((await git.raw(['rev-list', '--count', `HEAD..${baseTip}`])).stdout.trim());
  if (behind > 0) problems.push({ code: 'behind-base', message: `the branch is ${behind} commit(s) behind ${baseTip}; merge or rebase it now, before the first push` });

  problems.push(...(await removedNames(ctx, profile, base, baseTip)));
  problems.push(...(await orgListProblems(ctx, profile, baseTip)));

  // Rule 4: the components rule ready runs after CI, reused as is. Needs a picture-mode run.
  const runMap = ctx.paths ? readMap(ctx.paths) : null;
  if (runMap) {
    const r = await componentsCheck(ctx, { paths: ctx.paths, profile, runMap });
    if (!r.ok) for (const m of r.problems ?? [r.detail]) problems.push({ code: 'components', message: m });
  }
  return problems;
}
