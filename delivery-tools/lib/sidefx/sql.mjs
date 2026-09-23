// Layer 1, SQL half (spec 7.1): the latest definition of each database function the workers call,
// and the where clauses over tables inside it, as predicates. Also used for scheduled jobs'
// commands. Only literal conditions become filters: a parameter, a variable, a subquery or an
// `or` is dropped, which widens the predicate. A `not exists (...)` subquery names rows that stop
// the statement acting, so its where clause is not a target. An UPDATE or DELETE with no where
// clause acts on every row and becomes a predicate with no filters.

const MULTI = ['::', '<=', '>=', '<>', '!=', '||', '=>', ':=', '->>', '->', '#>>', '#>', '@>', '<@', '&&'];
const NOW_FUNCS = new Set(['now', 'current_timestamp', 'current_date', 'localtimestamp', 'statement_timestamp', 'transaction_timestamp', 'clock_timestamp']);
const CLAUSE_END = new Set(['group', 'order', 'limit', 'offset', 'having', 'window', 'union', 'intersect', 'except',
  'for', 'returning', 'on', 'into', 'loop', 'then', 'else', 'end', 'when', 'do', 'if', 'return', 'raise', 'perform',
  'begin', 'exception', 'fetch', 'select', 'insert', 'update', 'delete', 'with', 'values', 'elsif']);
const JOIN_WORDS = new Set(['join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'lateral']);
const FROM_END = new Set(['where', ...CLAUSE_END]);
const OPS = { '=': 'eq', '<>': 'neq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };
const FLIP = { eq: 'eq', neq: 'neq', lt: 'gt', lte: 'gte', gt: 'lt', gte: 'lte' };

/**
 * @param {string} text
 * @param {number} [lineOffset] added to every token's line (a function body inside a file)
 */
export function sqlTokenize(text, lineOffset = 0) {
  const s = String(text);
  const out = [];
  let line = 1;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && s[i + 1] === '-') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (s[i] === '/' && s[i + 1] === '*') { depth++; i += 2; continue; }
        if (s[i] === '*' && s[i + 1] === '/') { depth--; i += 2; continue; }
        if (s[i] === '\n') line++;
        i++;
      }
      continue;
    }
    const at = line + lineOffset;
    if (c === "'" || ((c === 'E' || c === 'e') && s[i + 1] === "'")) {
      const escapes = c !== "'";
      i += escapes ? 2 : 1;
      let v = '';
      while (i < n) {
        const ch = s[i];
        if (ch === "'" && s[i + 1] === "'") { v += "'"; i += 2; continue; }
        if (ch === "'") { i++; break; }
        if (escapes && ch === '\\') { v += s[i + 1] ?? ''; i += 2; continue; }
        if (ch === '\n') line++;
        v += ch;
        i++;
      }
      out.push({ t: 'str', v, line: at });
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = s.indexOf(tag, i + tag.length);
        const bodyEnd = end < 0 ? n : end;
        const body = s.slice(i + tag.length, bodyEnd);
        out.push({ t: 'dollar', v: body, tag, line: at });
        for (const ch of body) if (ch === '\n') line++;
        i = end < 0 ? n : end + tag.length;
        continue;
      }
      const pm = /^\$\d+/.exec(s.slice(i, i + 12));
      if (pm) { out.push({ t: 'param', v: pm[0], line: at }); i += pm[0].length; continue; }
    }
    if (c === '"') {
      let j = i + 1;
      let v = '';
      while (j < n) {
        if (s[j] === '"' && s[j + 1] === '"') { v += '"'; j += 2; continue; }
        if (s[j] === '"') { j++; break; }
        v += s[j++];
      }
      out.push({ t: 'id', v, low: v, quoted: true, line: at });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i, i + 64));
      out.push({ t: 'num', v: m[0], line: at });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_\u0080-\uffff]/.test(c)) {
      const m = /^[A-Za-z_\u0080-\uffff][A-Za-z0-9_$\u0080-\uffff]*/.exec(s.slice(i, i + 256));
      out.push({ t: 'id', v: m[0], low: m[0].toLowerCase(), line: at });
      i += m[0].length;
      continue;
    }
    let p = c;
    for (const op of MULTI) if (s.startsWith(op, i)) { p = op; break; }
    out.push({ t: 'p', v: p, line: at });
    i += p.length;
  }
  return out;
}

const isKw = (tk, w) => tk?.t === 'id' && !tk.quoted && tk.low === w;
const isP = (tk, v) => tk?.t === 'p' && tk.v === v;

function depthsOf(tokens) {
  const d = new Array(tokens.length);
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (isP(tokens[i], ')')) depth--;
    d[i] = depth;
    if (isP(tokens[i], '(')) depth++;
  }
  return d;
}

function matchParen(tokens, i) {
  let depth = 0;
  for (let k = i; k < tokens.length; k++) {
    if (isP(tokens[k], '(')) depth++;
    else if (isP(tokens[k], ')')) { depth--; if (depth === 0) return k; }
  }
  return tokens.length - 1;
}

// ---------------------------------------------------------------------------------------------
// Function definitions in migrations.

/**
 * Every `create [or replace] function <name>(...)` in one SQL file, with its body.
 * @param {string} path
 * @param {string} text
 * @returns {{ name: string, file: string, line: number, params: string[], body: string, bodyLine: number }[]}
 */
export function functionDefinitions(path, text) {
  const tokens = sqlTokenize(text);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isKw(tokens[i], 'create')) continue;
    let k = i + 1;
    if (isKw(tokens[k], 'or') && isKw(tokens[k + 1], 'replace')) k += 2;
    if (!isKw(tokens[k], 'function') && !isKw(tokens[k], 'procedure')) continue;
    k++;
    let name = tokens[k]?.t === 'id' ? tokens[k].low : null;
    if (!name) continue;
    if (isP(tokens[k + 1], '.') && tokens[k + 2]?.t === 'id') { k += 2; name = tokens[k].low; }
    k++;
    if (!isP(tokens[k], '(')) continue;
    const close = matchParen(tokens, k);
    const params = [];
    let seg = [];
    const flush = () => {
      let s = seg;
      while (s.length && ['in', 'out', 'inout', 'variadic'].includes(s[0].low)) s = s.slice(1);
      if (s.length > 1 && s[0].t === 'id') params.push(s[0].low);
      seg = [];
    };
    let depth = 0;
    for (let j = k + 1; j < close; j++) {
      if (isP(tokens[j], '(')) depth++;
      else if (isP(tokens[j], ')')) depth--;
      if (isP(tokens[j], ',') && depth === 0) { flush(); continue; }
      seg.push(tokens[j]);
    }
    flush();
    // the body: the first dollar-quoted string (or plain string) after `as`, before the next create
    let body = null;
    let bodyLine = 0;
    for (let j = close + 1; j < tokens.length && !isKw(tokens[j], 'create'); j++) {
      if (isKw(tokens[j], 'as') && (tokens[j + 1]?.t === 'dollar' || tokens[j + 1]?.t === 'str')) {
        body = tokens[j + 1].v;
        bodyLine = tokens[j + 1].line;
        break;
      }
      if (isKw(tokens[j], 'begin') && isKw(tokens[j + 1], 'atomic')) {
        const endAt = tokens.findIndex((tk, idx) => idx > j && isKw(tk, 'end'));
        body = text.split('\n').slice(tokens[j].line - 1, (tokens[endAt]?.line ?? tokens[j].line)).join('\n');
        bodyLine = tokens[j].line;
        break;
      }
    }
    if (body === null) continue;
    out.push({ name, file: path, line: tokens[i].line, params, body, bodyLine });
  }
  return out;
}

/**
 * Index every function definition across files; the latest one per name wins, by file name order
 * and then position in the file (spec 7.1: "the latest definition").
 * @param {{ path: string, text: string }[]} files
 */
export function indexFunctions(files) {
  const index = new Map();
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const def of functionDefinitions(f.path, f.text)) {
      const all = index.get(def.name)?.all ?? [];
      all.push({ file: def.file, line: def.line });
      index.set(def.name, { latest: def, all });
    }
  }
  return index;
}

/** Variables a plpgsql body declares, lower-cased. */
export function declaredVariables(tokens) {
  const out = new Set();
  const start = tokens.findIndex((tk) => isKw(tk, 'declare'));
  if (start < 0) return out;
  let expectName = true;
  for (let i = start + 1; i < tokens.length; i++) {
    const tk = tokens[i];
    if (isKw(tk, 'begin')) break;
    if (expectName && tk.t === 'id') { out.add(tk.low); expectName = false; continue; }
    if (isP(tk, ';')) expectName = true;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Predicates from statements.

/**
 * @param {string} sql a function body or a scheduled job's command
 * @param {{ lineOffset?: number, vars?: Iterable<string> }} [opts]
 * @returns {{ table: string, filters: object[], kind: 'select'|'update'|'delete', line: number, endLine: number }[]}
 */
export function sqlPredicates(sql, opts = {}) {
  const tokens = sqlTokenize(sql, opts.lineOffset ?? 0);
  const vars = new Set([...(opts.vars ?? [])].map((v) => String(v).toLowerCase()));
  for (const v of declaredVariables(tokens)) vars.add(v);
  const depth = depthsOf(tokens);
  const skip = negatedRanges(tokens);
  const inSkip = (i) => skip.some(([a, b]) => i >= a && i <= b);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (inSkip(i)) continue;
    const tk = tokens[i];
    if (isKw(tk, 'update') && !isKw(tokens[i - 1], 'for') && !isKw(tokens[i - 1], 'do') && !isKw(tokens[i - 1], 'on')) {
      const st = parseUpdate(tokens, depth, i);
      if (st) out.push(...statementPredicates(tokens, depth, st, vars, 'update'));
      continue;
    }
    if (isKw(tk, 'delete') && isKw(tokens[i + 1], 'from')) {
      const st = parseDelete(tokens, depth, i);
      if (st) out.push(...statementPredicates(tokens, depth, st, vars, 'delete'));
      continue;
    }
    if (isKw(tk, 'from') && !isKw(tokens[i - 1], 'delete') && !isKw(tokens[i - 1], 'distinct')) {
      const list = parseFromList(tokens, depth, i + 1);
      if (!list.tables.length) continue;
      const where = findWhere(tokens, depth, list.end, depth[i]);
      if (!where) continue;
      out.push(...statementPredicates(tokens, depth, { tables: list.tables, aliases: list.aliases, where }, vars, 'select'));
    }
  }
  return out;
}

/** Token ranges inside `not exists (...)` and `not in (select ...)`. */
function negatedRanges(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isKw(tokens[i], 'not')) continue;
    let k = i + 1;
    if (isKw(tokens[k], 'exists') || (isKw(tokens[k], 'in') && isP(tokens[k + 1], '(') && isKw(tokens[k + 2], 'select'))) {
      k++;
      if (isP(tokens[k], '(')) out.push([k, matchParen(tokens, k)]);
    }
  }
  return out;
}

/** A FROM list starting at i: tables and aliases, and the index where the list ends. */
function parseFromList(tokens, depth, i) {
  const d0 = depth[i - 1] ?? 0;
  const tables = [];
  const aliases = new Map();
  let k = i;
  let expectItem = true;
  const word = (tk) => (tk?.t === 'id' && !tk.quoted ? tk.low : null);
  while (k < tokens.length) {
    const tk = tokens[k];
    if (depth[k] < d0) break;
    if (depth[k] > d0) { k++; continue; }
    if (isP(tk, ';')) break;
    if (isP(tk, ',')) { expectItem = true; k++; continue; }
    const w = word(tk);
    if (w && JOIN_WORDS.has(w)) { expectItem = true; k++; continue; }
    if ((w === 'on' && !isKw(tokens[k + 1], 'conflict')) || w === 'using') {
      // a join condition: skip to the next comma, join word or end of the list at this depth
      k++;
      while (k < tokens.length && depth[k] >= d0) {
        if (depth[k] === d0) {
          const w2 = word(tokens[k]);
          if (isP(tokens[k], ',') || isP(tokens[k], ';') || (w2 && (JOIN_WORDS.has(w2) || (FROM_END.has(w2) && w2 !== 'on')))) break;
        }
        k++;
      }
      continue;
    }
    if (w && FROM_END.has(w)) break;
    if (!expectItem) { k++; continue; }
    expectItem = false;
    if (w === 'only') k++;
    const t0 = tokens[k];
    if (isP(t0, '(')) { k = skipAlias(tokens, matchParen(tokens, k) + 1, null, aliases); continue; } // a subquery
    if (t0?.t !== 'id') { k++; continue; }
    let name = t0.low;
    let j = k + 1;
    if (isP(tokens[j], '.') && tokens[j + 1]?.t === 'id') { name = tokens[j + 1].low; j += 2; }
    if (isP(tokens[j], '(')) { k = skipAlias(tokens, matchParen(tokens, j) + 1, null, aliases); continue; } // a function
    tables.push(name);
    aliases.set(name, name);
    k = skipAlias(tokens, j, name, aliases);
  }
  return { tables, aliases, end: k };
}

function skipAlias(tokens, k, table, aliases) {
  if (isKw(tokens[k], 'as')) k++;
  const tk = tokens[k];
  if (tk?.t === 'id' && (tk.quoted || !(FROM_END.has(tk.low) || JOIN_WORDS.has(tk.low) || tk.low === 'using' || tk.low === 'set'))) {
    if (table) aliases.set(tk.low, table);
    k++;
    if (isP(tokens[k], '(')) k = matchParen(tokens, k) + 1; // column alias list
  }
  return k;
}

/** The where clause of the statement whose FROM list ended at k, at depth d0: [start, end). */
function findWhere(tokens, depth, k, d0) {
  for (; k < tokens.length; k++) {
    if (depth[k] < d0) return null;
    if (depth[k] !== d0) continue;
    const tk = tokens[k];
    if (isP(tk, ';')) return null;
    if (isKw(tk, 'where')) {
      let e = k + 1;
      for (; e < tokens.length; e++) {
        if (depth[e] < d0) break;
        if (depth[e] !== d0) continue;
        const t2 = tokens[e];
        if (isP(t2, ';')) break;
        if (t2.t === 'id' && !t2.quoted && CLAUSE_END.has(t2.low)) break;
      }
      return [k + 1, e];
    }
    if (tk.t === 'id' && !tk.quoted && CLAUSE_END.has(tk.low)) return null;
  }
  return null;
}

function parseUpdate(tokens, depth, i) {
  const d0 = depth[i];
  let k = i + 1;
  if (isKw(tokens[k], 'only')) k++;
  const t0 = tokens[k];
  if (t0?.t !== 'id') return null;
  let name = t0.low;
  if (isP(tokens[k + 1], '.') && tokens[k + 2]?.t === 'id') { name = tokens[k + 2].low; k += 2; }
  const aliases = new Map([[name, name]]);
  k = skipAlias(tokens, k + 1, name, aliases);
  if (!isKw(tokens[k], 'set')) return null;
  const tables = [name];
  // past the SET list to FROM or WHERE at this depth
  for (k++; k < tokens.length; k++) {
    if (depth[k] < d0) break;
    if (depth[k] !== d0) continue;
    if (isKw(tokens[k], 'from')) {
      const list = parseFromList(tokens, depth, k + 1);
      for (const [a, t] of list.aliases) aliases.set(a, t);
      k = list.end;
      break;
    }
    if (isKw(tokens[k], 'where') || isP(tokens[k], ';') || isKw(tokens[k], 'returning')) break;
  }
  const where = findWhere(tokens, depth, k, d0);
  return { tables, aliases, where, target: name, start: i };
}

function parseDelete(tokens, depth, i) {
  const d0 = depth[i];
  let k = i + 2;
  if (isKw(tokens[k], 'only')) k++;
  const t0 = tokens[k];
  if (t0?.t !== 'id') return null;
  let name = t0.low;
  if (isP(tokens[k + 1], '.') && tokens[k + 2]?.t === 'id') { name = tokens[k + 2].low; k += 2; }
  const aliases = new Map([[name, name]]);
  k = skipAlias(tokens, k + 1, name, aliases);
  if (isKw(tokens[k], 'using')) {
    const list = parseFromList(tokens, depth, k + 1);
    for (const [a, t] of list.aliases) aliases.set(a, t);
    k = list.end;
  }
  const where = findWhere(tokens, depth, k, d0);
  return { tables: [name], aliases, where, target: name, start: i };
}

function statementPredicates(tokens, depth, st, vars, kind) {
  if (!st.where) {
    if (kind === 'select' || !st.target) return [];
    const line = tokens[st.start].line;
    return [{ table: st.target, filters: [], kind, line, endLine: line }];
  }
  const [a, b] = st.where;
  const primary = st.target ?? (st.tables.length === 1 ? st.tables[0] : null);
  const byTable = new Map();
  for (const conj of conjuncts(tokens.slice(a, b))) {
    for (const f of conditionFilters(conj, st.aliases, primary, vars)) {
      if (!byTable.has(f.table)) byTable.set(f.table, []);
      byTable.get(f.table).push({ column: f.column, op: f.op, value: f.value });
    }
  }
  const line = tokens[a - 1]?.line ?? 0;
  const endLine = tokens[b - 1]?.line ?? line;
  return [...byTable].map(([table, filters]) => ({ table, filters, kind, line, endLine }));
}

/** Split a where clause at top-level AND (keeping BETWEEN x AND y together). */
function conjuncts(slice) {
  const out = [];
  let cur = [];
  let depth = 0;
  let between = false;
  for (const tk of slice) {
    if (isP(tk, '(')) depth++;
    else if (isP(tk, ')')) depth--;
    if (depth === 0 && isKw(tk, 'between')) between = true;
    if (depth === 0 && isKw(tk, 'and')) {
      if (between) { between = false; cur.push(tk); continue; }
      out.push(cur);
      cur = [];
      continue;
    }
    cur.push(tk);
  }
  if (cur.length) out.push(cur);
  return out;
}

function hasTopLevel(slice, word) {
  let depth = 0;
  for (const tk of slice) {
    if (isP(tk, '(')) depth++;
    else if (isP(tk, ')')) depth--;
    else if (depth === 0 && isKw(tk, word)) return true;
  }
  return false;
}

function conditionFilters(conj, aliases, primary, vars) {
  let s = conj;
  while (s.length > 2 && isP(s[0], '(') && matchParen(s, 0) === s.length - 1) s = s.slice(1, -1);
  if (!s.length || isKw(s[0], 'not') || isKw(s[0], 'exists')) return [];
  if (hasTopLevel(s, 'or')) return [];
  if (hasTopLevel(s, 'and')) {
    const parts = conjuncts(s);
    if (parts.length > 1) return parts.flatMap((c) => conditionFilters(c, aliases, primary, vars));
  }
  const col = columnRef(s, 0, aliases, primary, vars);
  if (col) {
    const rest = s.slice(col.next);
    const f = afterColumn(rest);
    return f ? f.map((x) => ({ table: col.table, column: col.column, ...x })) : [];
  }
  // literal op column
  const lit = literalAt(s, 0);
  if (lit && s[lit.next]?.t === 'p' && OPS[s[lit.next].v]) {
    const c2 = columnRef(s, lit.next + 1, aliases, primary, vars);
    if (c2 && c2.next === s.length) return [{ table: c2.table, column: c2.column, op: FLIP[OPS[s[lit.next].v]], value: lit.value }];
  }
  return [];
}

function columnRef(s, i, aliases, primary, vars) {
  const a = s[i];
  if (a?.t !== 'id') return null;
  if (isP(s[i + 1], '.') && s[i + 2]?.t === 'id') {
    if (isP(s[i + 3], '(')) return null;
    const table = aliases.get(a.low);
    if (!table) return null;
    return { table, column: s[i + 2].low, next: i + 3 };
  }
  if (isP(s[i + 1], '(')) return null;
  if (!a.quoted && (vars.has(a.low) || ['not', 'exists', 'true', 'false', 'null', 'case', 'coalesce'].includes(a.low))) return null;
  if (!primary) return null;
  return { table: primary, column: a.low, next: i + 1 };
}

function afterColumn(rest) {
  if (!rest.length) return null;
  const op = rest[0];
  if (op.t === 'p' && OPS[op.v]) {
    if (isKw(rest[1], 'any') && isP(rest[2], '(')) {
      const inner = rest.slice(3, matchParen(rest, 2));
      const list = arrayLiteral(inner);
      return list && OPS[op.v] === 'eq' ? [{ op: 'in', value: list }] : null;
    }
    const lit = literalAt(rest, 1);
    if (lit && lit.next === rest.length) return [{ op: OPS[op.v], value: lit.value }];
    return null;
  }
  if (isKw(op, 'in') && isP(rest[1], '(')) {
    const close = matchParen(rest, 1);
    if (close !== rest.length - 1) return null;
    const items = [];
    let k = 2;
    while (k < close) {
      const lit = literalAt(rest, k);
      if (!lit || lit.value === null) return null;
      items.push(lit.value);
      k = lit.next;
      if (isP(rest[k], ',')) k++;
      else if (k !== close) return null;
    }
    return items.length ? [{ op: 'in', value: items }] : null;
  }
  if (isKw(op, 'is')) {
    if (isKw(rest[1], 'null') && rest.length === 2) return [{ op: 'is', value: null }];
    if (isKw(rest[1], 'not') && isKw(rest[2], 'null') && rest.length === 3) return [{ op: 'not-null', value: null }];
    if ((isKw(rest[1], 'true') || isKw(rest[1], 'false')) && rest.length === 2) return [{ op: 'is', value: rest[1].low === 'true' }];
    return null;
  }
  if (isKw(op, 'between')) {
    const lo = literalAt(rest, 1);
    if (!lo || !isKw(rest[lo.next], 'and')) return null;
    const hi = literalAt(rest, lo.next + 1);
    if (!hi || hi.next !== rest.length) return null;
    return [{ op: 'gte', value: lo.value }, { op: 'lte', value: hi.value }];
  }
  return null;
}

function arrayLiteral(inner) {
  if (inner.length === 1 && inner[0].t === 'str') {
    const m = /^\{(.*)\}$/.exec(inner[0].v.trim());
    return m ? m[1].split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean) : null;
  }
  if (isKw(inner[0], 'array') && isP(inner[1], '[')) {
    const items = [];
    let k = 2;
    while (k < inner.length && !isP(inner[k], ']')) {
      const lit = literalAt(inner, k);
      if (!lit) return null;
      items.push(lit.value);
      k = lit.next;
      if (isP(inner[k], ',')) k++;
    }
    return items;
  }
  return null;
}

/**
 * A literal at s[i]: a string (with casts), a number, true/false/null, now() and its synonyms,
 * optionally plus or minus an interval. Returns { value, next } or null.
 */
function literalAt(s, i) {
  const tk = s[i];
  if (!tk) return null;
  let value;
  let k = i + 1;
  if (tk.t === 'str') value = tk.v;
  else if (tk.t === 'num') value = Number(tk.v);
  else if (isP(tk, '-') && s[i + 1]?.t === 'num') { value = -Number(s[i + 1].v); k = i + 2; }
  else if (isKw(tk, 'true') || isKw(tk, 'false')) value = tk.low === 'true';
  else if (isKw(tk, 'null')) value = null;
  else if (tk.t === 'id' && NOW_FUNCS.has(tk.low)) {
    if (isP(s[k], '(') && isP(s[k + 1], ')')) k += 2;
    value = 'now()';
    if ((isP(s[k], '+') || isP(s[k], '-')) && isKw(s[k + 1], 'interval') && s[k + 2]?.t === 'str') {
      value = `now() ${s[k].v} interval '${s[k + 2].v}'`;
      k += 3;
    }
  } else return null;
  while (isP(s[k], '::') && s[k + 1]?.t === 'id') {
    k += 2;
    if (isP(s[k], '(')) k = matchParen(s, k) + 1;
    if (isP(s[k], '[') && isP(s[k + 1], ']')) k += 2;
  }
  return { value, next: k };
}

// ---------------------------------------------------------------------------------------------
// Scheduled jobs.

const HARMLESS = /^\s*(vacuum|analyze|analyse|refresh\s+materialized\s+view|reindex|cluster|select\s+1\s*;?\s*$)/i;
const EXTERNAL = /\b(net\.http_\w+|http_(get|post|put|delete|request)|pg_notify|dblink\w*|pgmq\.\w+|extensions\.http\w*)\s*\(/i;

/**
 * Parse one cron.job command like a function body. Calls to functions defined in the migrations
 * are followed (one level deep, then their own calls, to a depth of 3).
 * @param {string} command
 * @param {Map<string, { latest: object }>} functions indexFunctions() output
 * @returns {{ predicates: object[], unparsed: string[] }}
 */
export function parseCronCommand(command, functions) {
  const unparsed = [];
  const predicates = [];
  const seen = new Set();
  const visit = (sql, where, depth) => {
    if (EXTERNAL.test(sql)) unparsed.push(`${where}: calls outside the database (${EXTERNAL.exec(sql)[1]})`);
    for (const p of sqlPredicates(sql)) predicates.push({ ...p, via: where });
    const tokens = sqlTokenize(sql);
    for (let i = 0; i < tokens.length - 1; i++) {
      const tk = tokens[i];
      if (tk.t !== 'id' || tk.quoted || !isP(tokens[i + 1], '(')) continue;
      if (isKw(tokens[i - 1], 'function') || isP(tokens[i - 1], '.')) continue;
      const fn = functions.get(tk.low);
      if (!fn) continue;
      if (seen.has(tk.low) || depth >= 3) continue;
      seen.add(tk.low);
      const def = fn.latest;
      visit(def.body, `${def.file}:${def.line} ${def.name}`, depth + 1);
    }
  };
  const text = String(command ?? '').trim();
  if (!text) return { predicates, unparsed: ['empty command'] };
  if (HARMLESS.test(text) && !EXTERNAL.test(text)) return { predicates, unparsed };
  visit(text, 'command', 0);
  // Every statement must be something this parser models: DML, a SELECT, or a call to a
  // function whose definition it read.
  const tokens = sqlTokenize(text);
  const statements = splitStatements(tokens);
  for (const st of statements) {
    const first = st[0];
    if (!first) continue;
    const w = first.low;
    if (['insert', 'update', 'delete', 'with'].includes(w)) continue;
    if (w === 'select' || w === 'perform' || w === 'call') {
      const calls = st.filter((tk, idx) => tk.t === 'id' && !tk.quoted && isP(st[idx + 1], '(') && !isP(st[idx - 1], '.'));
      const unknown = calls.filter((tk) => !functions.has(tk.low) && !BUILTINS.has(tk.low));
      const hasFrom = st.some((tk) => isKw(tk, 'from'));
      if (unknown.length) unparsed.push(`command calls ${unknown.map((u) => u.v).join(', ')}, defined nowhere in the migrations read`);
      else if (!calls.length && !hasFrom) unparsed.push('command selects nothing this parser can model');
      continue;
    }
    if (HARMLESS.test(st.map((x) => x.v).join(' '))) continue;
    unparsed.push(`statement "${st.slice(0, 4).map((x) => x.v).join(' ')}..." is not modelled`);
  }
  return { predicates, unparsed };
}

const BUILTINS = new Set(['now', 'count', 'coalesce', 'greatest', 'least', 'min', 'max', 'sum', 'avg', 'lower', 'upper',
  'date_trunc', 'extract', 'make_interval', 'to_char', 'to_timestamp', 'jsonb_build_object', 'json_build_object',
  'array_agg', 'string_agg', 'exists', 'nullif', 'abs', 'round', 'length', 'trim', 'ltrim', 'rtrim', 'substring',
  'current_setting', 'gen_random_uuid', 'uuid_generate_v4', 'md5', 'concat', 'format', 'jsonb_agg', 'json_agg']);

function splitStatements(tokens) {
  const out = [];
  let cur = [];
  let depth = 0;
  for (const tk of tokens) {
    if (isP(tk, '(')) depth++;
    else if (isP(tk, ')')) depth--;
    if (depth === 0 && isP(tk, ';')) { if (cur.length) out.push(cur); cur = []; continue; }
    cur.push(tk);
  }
  if (cur.length) out.push(cur);
  return out;
}
