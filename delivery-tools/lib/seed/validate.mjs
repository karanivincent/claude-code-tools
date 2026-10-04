// W3 item 4: world values checked against the database's generated types before anything is
// written. A column the table does not have, a value of the wrong kind, a null where the type does
// not allow one, and an enum value the enum does not list are all refused at `seed --plan`, not
// found later as a failed insert. Json columns can also be handed to a command the repo owns
// (commands.validateSeedJson), because only the repo knows what shape a Json column must have.
// The functions here do no I/O except runValidateSeedJson, which starts the repo's command.
// Owner: slice B2 (docs/ARCHITECTURE.md).

import { spawn } from 'node:child_process';
import { plannedValues } from './plan.mjs';

// Where a marker starts: values a later step turns into ids, times and names. They are skipped here.
const MARKER_KEYS = ['$ref', '$rel', '$orgName', '$minuteOfDay'];

const isMarker = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && MARKER_KEYS.some((k) => k in v);

/** Index just after the "}" that closes the "{" at text[openAt]; quoted text is skipped. */
function closeOf(text, openAt) {
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

/**
 * The "key: type" pairs at the top level of a type literal's body, with the type as written.
 * A type ends at ";", "," or a line end outside any brackets, unless the next line goes on with
 * "|" or "&" (a union written over several lines) or the line itself ends with one.
 * @param {string} body
 * @returns {[string, string][]}
 */
function keyTypePairs(body) {
  const pairs = [];
  let i = 0;
  while (i < body.length) {
    const m = /^\s*(?:\/\/[^\n]*\n\s*)*["']?([A-Za-z_][A-Za-z0-9_]*)["']?(\?)?\s*:/.exec(body.slice(i));
    if (!m) break;
    const key = m[1];
    i += m[0].length;
    const start = i;
    let depth = 0;
    for (; i < body.length; i++) {
      const c = body[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        for (i++; i < body.length && body[i] !== q; i++) if (body[i] === '\\') i++;
        continue;
      }
      if ('{[(<'.includes(c)) { depth++; continue; }
      if ('}])>'.includes(c)) { if (c === '>' && body[i - 1] === '=') continue; depth--; continue; }
      if (depth > 0) continue;
      if (c === ';' || c === ',') break;
      if (c === '\n') {
        const before = body.slice(start, i).trimEnd();
        const after = body.slice(i).trimStart();
        if (before.endsWith('|') || before.endsWith('&') || after.startsWith('|') || after.startsWith('&')) continue;
        break;
      }
    }
    pairs.push([key, body.slice(start, i).trim().replace(/\s+/g, ' ')]);
    i++;
  }
  return pairs;
}

/** The string literals of a union: `"a" | "b"` gives a and b. */
function literalsOf(typeText) {
  return [...typeText.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1] ?? m[2]);
}

/**
 * Column types from a generated database types file (Supabase's `database.types.ts`): for each
 * table or view, the raw TypeScript type of every column in its "Row" block. The result is a
 * Map of table to Map of column to type text ("string", "number | null", "Json",
 * `Database["public"]["Enums"]["call_status"]`), and also carries the enum lists it read from the
 * "Enums" blocks as `.enums`, a Map of enum name to the array of its values.
 * @param {string} text
 * @returns {Map<string, Map<string, string>> & { enums: Map<string, string[]> }}
 */
export function parseColumnTypes(text) {
  const out = new Map();
  out.enums = new Map();
  const rowRe = /["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:\s*\{\s*Row\s*:\s*\{/g;
  for (const m of text.matchAll(rowRe)) {
    const open = m.index + m[0].length - 1;
    const body = text.slice(open + 1, closeOf(text, open) - 1);
    const cols = out.get(m[1]) ?? new Map();
    for (const [k, t] of keyTypePairs(body)) cols.set(k, t);
    out.set(m[1], cols);
  }
  for (const m of text.matchAll(/\bEnums\s*:\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const body = text.slice(open + 1, closeOf(text, open) - 1);
    for (const [k, t] of keyTypePairs(body)) {
      const values = literalsOf(t);
      if (values.length) out.enums.set(k, values);
    }
  }
  return out;
}

/** A union's alternatives, split at "|" outside brackets and quotes. */
function alternatives(typeText) {
  const alts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < typeText.length; i++) {
    const c = typeText[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      cur += c;
      for (i++; i < typeText.length && typeText[i] !== q; i++) { cur += typeText[i]; if (typeText[i] === '\\') cur += typeText[++i] ?? ''; }
      cur += q;
      continue;
    }
    if ('{[(<'.includes(c)) depth++;
    else if ('}])>'.includes(c)) depth--;
    if (c === '|' && depth === 0) { alts.push(cur.trim()); cur = ''; } else cur += c;
  }
  alts.push(cur.trim());
  return alts.filter(Boolean);
}

const enumNameOf = (alt) => /\[\s*["']Enums["']\s*\]\s*\[\s*["']([A-Za-z0-9_]+)["']\s*\]/.exec(alt)?.[1] ?? null;

/**
 * Whether one alternative of a column's type takes the value. A type this file cannot read
 * (a custom type, `unknown`) takes anything: it never refuses what it does not understand.
 * @returns {boolean|string[]} true when it fits; false when it does not; the enum's values when
 *   the alternative is an enum the value is not in (so the message can list them)
 */
function fits(alt, value, enums) {
  if (alt === 'null' || alt === 'undefined') return false;
  if (alt === 'string') return typeof value === 'string';
  if (alt === 'number') return typeof value === 'number';
  if (alt === 'boolean') return typeof value === 'boolean';
  if (alt === 'true' || alt === 'false') return value === (alt === 'true');
  if (alt === 'Json') return true;
  if (/^(["']).*\1$/.test(alt)) return value === literalsOf(alt)[0];
  if (/\[\]$/.test(alt) || /^Array</.test(alt)) return Array.isArray(value);
  const name = enumNameOf(alt);
  if (name && enums.has(name)) return typeof value === 'string' && enums.get(name).includes(value) ? true : enums.get(name);
  return true;
}

const kindOf = (v) => (Array.isArray(v) ? 'an array' : v === null ? 'null' : typeof v === 'object' ? 'an object' : `a ${typeof v}`);

/**
 * Every world value that cannot go in its column, by the generated types. Values that are
 * markers ($ref, $rel, $orgName, $minuteOfDay) are skipped: they become ids, times and names later.
 * @param {{ world: string, table: string, key?: string, values: object, deferred?: object }[]} rows seed plan rows
 * @param {ReturnType<typeof parseColumnTypes>} types
 * @returns {{ world: string, table: string, column: string|null, value: unknown, why: string }[]}
 */
export function columnTypeProblems(rows, types) {
  const enums = types.enums ?? new Map();
  const problems = [];
  const noTable = new Set();
  for (const r of rows) {
    const cols = types.get(r.table);
    if (!cols) {
      const k = `${r.world}\u0000${r.table}`;
      if (!noTable.has(k)) { noTable.add(k); problems.push({ world: r.world, table: r.table, column: null, value: null, why: `table ${r.table} does not exist in database.types.ts` }); }
      continue;
    }
    for (const [column, value] of Object.entries(plannedValues(r) ?? {})) {
      if (isMarker(value)) continue;
      const type = cols.get(column);
      if (type === undefined) {
        problems.push({ world: r.world, table: r.table, column, value, why: `${r.table}.${column} does not exist in database.types.ts` });
        continue;
      }
      const alts = alternatives(type);
      if (value === null || value === undefined) {
        if (!alts.includes('null') && !alts.includes('undefined')) problems.push({ world: r.world, table: r.table, column, value: null, why: `${r.table}.${column} is ${type}, which does not allow null` });
        continue;
      }
      const results = alts.map((a) => fits(a, value, enums));
      if (results.includes(true)) continue;
      const allowed = results.find(Array.isArray);
      problems.push({
        world: r.world, table: r.table, column, value,
        why: allowed
          ? `${JSON.stringify(value)} is not one of ${allowed.join(', ')} for ${r.table}.${column}`
          : `${r.table}.${column} is ${type}, and ${kindOf(value)} does not fit it`,
      });
    }
  }
  return problems;
}

/**
 * The Json columns the worlds fill with an object or an array, for the repo's own validator.
 * @param {{ world: string, table: string, key?: string, id?: string, values: object, deferred?: object }[]} rows
 * @param {ReturnType<typeof parseColumnTypes>} types
 * @returns {{ world: string, table: string, key: string|null, column: string, value: object }[]}
 */
export function jsonColumns(rows, types) {
  const out = [];
  for (const r of rows) {
    const cols = types.get(r.table);
    if (!cols) continue;
    for (const [column, value] of Object.entries(plannedValues(r) ?? {})) {
      if (!value || typeof value !== 'object' || isMarker(value)) continue;
      if (!alternatives(cols.get(column) ?? '').includes('Json')) continue;
      out.push({ world: r.world, table: r.table, key: r.key ?? r.id ?? null, column, value });
    }
  }
  return out;
}

const VALIDATOR_TIMEOUT_MS = 30_000;

/** Default exec: `sh -c command` with `input` on stdin; never rejects. Code 124 is a timeout. */
function shellExec(command, { cwd, input, timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn('sh', ['-c', command], { cwd, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (err) { resolve({ code: 127, stdout: '', stderr: String(err.message) }); return; }
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.stdin.on('error', () => {}); // a command that never reads its input is not our failure
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, stdout: '', stderr: String(e.message) }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? 124 : code ?? 1, timedOut, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
    child.stdin.end(input);
  });
}

/**
 * Run the profile's commands.validateSeedJson over the Json values the worlds hold.
 * stdin is `{ "entries": [ { "world", "table", "row", "column", "value" } ] }`. The command prints
 * `{ "problems": [ { "world", "table", "row", "column", "message" } ] }` on stdout and exits 0
 * (1 is also allowed when it found problems). A command that is missing, runs past 30 seconds,
 * exits with another code or prints something that is not that JSON gives a note and no problems:
 * a validator that is broken never refuses a plan.
 * @param {string} command a shell command
 * @param {{ world: string, table: string, key: string|null, column: string, value: unknown }[]} entries from jsonColumns
 * @param {{ cwd?: string, exec?: (command: string, opts: { cwd?: string, input: string, timeoutMs: number }) => Promise<{ code: number, stdout: string, stderr?: string, timedOut?: boolean }> }} [opts]
 * @returns {Promise<{ problems: { world: string, table: string, row: string|null, column: string, message: string }[], note: string|null }>}
 */
export async function runValidateSeedJson(command, entries, { cwd, exec = shellExec } = {}) {
  if (!entries.length) return { problems: [], note: null };
  const input = JSON.stringify({ entries: entries.map((e) => ({ world: e.world, table: e.table, row: e.key ?? null, column: e.column, value: e.value })) });
  const broken = (why) => ({ problems: [], note: `commands.validateSeedJson ${why}; the Json values of the worlds were not checked` });
  let r;
  try { r = await exec(command, { cwd, input, timeoutMs: VALIDATOR_TIMEOUT_MS }); } catch (err) { return broken(`could not run (${String(err?.message ?? err).split('\n')[0]})`); }
  if (r.timedOut || r.code === 124) return broken('took longer than 30 seconds');
  if (r.code === 127) return broken('is not runnable (command not found)');
  if (r.code !== 0 && r.code !== 1) return broken(`exited ${r.code}${r.stderr ? `: ${String(r.stderr).trim().split('\n')[0]}` : ''}`);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return broken('did not print JSON'); }
  if (!parsed || !Array.isArray(parsed.problems)) return broken('did not print {"problems": [...]}');
  const problems = parsed.problems
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({ world: String(p.world ?? ''), table: String(p.table ?? ''), row: p.row == null ? null : String(p.row), column: String(p.column ?? ''), message: String(p.message ?? 'is not valid') }));
  return { problems, note: null };
}
