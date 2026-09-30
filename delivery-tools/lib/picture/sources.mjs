// W3, spike S2: a traced column the page's code never reads. The labeller traced "12 calls at once"
// to a column the product stores something else in; datacheck then calls every such value a data
// fault forever. After the build, this checks each traced `table.column` against the queries in the
// repository's own code (`.from('<table>')...select('<columns>')`): a column no query selects is a
// "no source" question for the founder, not a fault for the seed-writer.
//
// It reads code as text: a query built dynamically, or a view, may be missed, so it asks, it never
// refuses. `select('*')` and `select()` read every column.

import { execFile } from 'node:child_process';
import { entryProblem } from './contract.mjs';

const FROM = /\.from\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\)/g;
const SELECT = /^[\s\S]{0,400}?\.select\(\s*(?:(['"`])([\s\S]*?)\1)?\s*[,)]/;

/**
 * The top-level columns a select string names: "id, name, members(role), meta->title" gives id,
 * name, members (a joined table's name) and meta.
 * @param {string} sel
 * @returns {Set<string>|'*'}
 */
export function selectColumns(sel) {
  const text = String(sel ?? '').trim();
  if (!text || text === '*') return '*';
  const out = new Set();
  let depth = 0;
  let cur = '';
  const push = () => {
    const c = cur.trim().replace(/^[a-z_]+:(?!:)/i, '').split(/->|::|!/)[0].trim();
    if (c === '*') out.add('*'); else if (c) out.add(c.replace(/\(.*$/s, ''));
    cur = '';
  };
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) push(); else if (depth === 0 || ch !== ',') cur += ch;
  }
  push();
  return out.has('*') ? '*' : out;
}

/**
 * Every table the source text queries, with the columns its selects read (merged across queries).
 * A `.from()` with no `.select()` after it (an insert, an update) reads nothing.
 * @param {string[]} texts source files' text
 * @returns {Map<string, Set<string>|'*'>}
 */
export function selectedColumns(texts) {
  const out = new Map();
  for (const text of texts) {
    for (const m of text.matchAll(FROM)) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 500);
      const sel = SELECT.exec(after);
      if (!sel) continue;
      const cols = selectColumns(sel[2] ?? '*');
      const prev = out.get(m[1]);
      if (prev === '*' || cols === '*') out.set(m[1], '*');
      else out.set(m[1], new Set([...(prev ?? []), ...cols]));
    }
  }
  return out;
}

/**
 * The traced data values whose column no query in the code selects, once per table and column.
 * @param {object} contract
 * @param {Map<string, Set<string>|'*'>} selected
 * @returns {{ table: string, column: string, states: string[], texts: string[], why: string }[]}
 */
export function sourceProblems(contract, selected) {
  const found = new Map();
  for (const [id, s] of Object.entries(contract?.states ?? {})) {
    for (const e of s.texts ?? []) {
      if (e.label !== 'data' || entryProblem(e) || e.user !== undefined || !e.table || !e.column) continue;
      const col = String(e.column).split('.')[0];
      const cols = selected.get(e.table);
      let why = null;
      if (!cols) why = `no query in the code reads ${e.table}`;
      else if (cols !== '*' && !cols.has(col)) why = `the code reads ${e.table} but no query selects ${col}`;
      if (!why) continue;
      const k = `${e.table}.${col}`;
      const x = found.get(k) ?? { table: e.table, column: col, states: [], texts: [], why };
      if (!x.states.includes(id)) x.states.push(id);
      if (!x.texts.includes(e.text) && x.texts.length < 3) x.texts.push(e.text);
      found.set(k, x);
    }
  }
  return [...found.values()];
}

/**
 * The text of every tracked source file that mentions `.from(` (git grep, so it is fast and skips
 * build output). Tests and generated types are left out.
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export function readQuerySources(repoRoot) {
  return new Promise((resolve) => {
    execFile('git', ['grep', '-l', '-E', '\\.from\\(', '--', '*.ts', '*.tsx', '*.js', '*.mjs', ':!*.test.*', ':!*.spec.*', ':!*database.types.ts'], { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 }, async (err, stdout) => {
      if (err && !stdout) return resolve([]);
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const files = stdout.split('\n').filter(Boolean).slice(0, 5000);
      const texts = await Promise.all(files.map((f) => readFile(join(repoRoot, f), 'utf8').catch(() => '')));
      resolve(texts);
    });
  });
}
