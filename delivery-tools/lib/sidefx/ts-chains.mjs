// Layer 1, TypeScript half (spec 7.1): every `.from('<table>')` query-builder chain with literal
// filters becomes a predicate, and every `.rpc('<fn>')` call is recorded so its SQL definition can
// be read. Non-literal filters are dropped, which widens the predicate: a floor, never a ceiling.

import { tokenize, callArgs, literalValue, stripCasts, topLevelConsts, NOT_LITERAL } from './tokenize.mjs';

// `.from(` on these receivers is not a query builder.
const NOT_A_CLIENT = new Set(['Buffer', 'Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array',
  'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'Object', 'Promise', 'Set', 'Map', 'String', 'storage', 'Observable', 'Rx', 'stream', 'Readable']);

const SIMPLE_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

/**
 * @param {string} path repo-relative
 * @param {string} text
 * @returns {{ chains: { table: string, filters: object[], fn: string, fnLine: number, line: number, endLine: number, methods: string[] }[],
 *             rpcs: { name: string, line: number }[] }}
 */
export function extractTsChains(path, text) {
  const tokens = tokenize(text, { jsx: /\.[jt]sx$/.test(path) });
  const consts = topLevelConsts(tokens);
  const lines = String(text).split('\n');
  const chains = [];
  const rpcs = [];
  for (let i = 1; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t !== 'id' || !isDot(tokens[i - 1]) || !isP(tokens[i + 1], '(')) continue;
    if (tk.v === 'rpc') {
      const { args } = callArgs(tokens, i + 1);
      const name = args[0] ? literalValue(args[0], consts) : NOT_LITERAL;
      if (typeof name === 'string' && name) rpcs.push({ name, line: tk.line });
      continue;
    }
    if (tk.v !== 'from') continue;
    const recv = tokens[i - 2];
    if (recv?.t === 'id' && NOT_A_CLIENT.has(recv.v)) continue;
    const { args, end } = callArgs(tokens, i + 1);
    if (end < 0 || args.length !== 1) continue;
    const table = literalValue(args[0], consts);
    if (typeof table !== 'string' || !/^[A-Za-z_][\w.]*$/.test(table)) continue;
    const calls = followChain(tokens, end + 1);
    const filters = [];
    for (const c of calls) filters.push(...filtersOf(c, consts));
    const fn = enclosingFunction(lines, tk.line);
    chains.push({
      table: table.replace(/^public\./, ''),
      filters,
      fn: fn.name,
      fnLine: fn.line,
      line: tokens[i - 1].line,
      endLine: calls.length ? calls[calls.length - 1].endLine : tk.line,
      methods: calls.map((c) => c.name),
    });
  }
  return { chains, rpcs };
}

function isP(tk, v) { return tk?.t === 'p' && tk.v === v; }
function isDot(tk) { return tk?.t === 'p' && (tk.v === '.' || tk.v === '?.'); }

/** The `.method(args)` calls that follow a from() call, through casts, `!` and one wrapping `)`. */
function followChain(tokens, k) {
  const calls = [];
  let unwrapped = false;
  for (;;) {
    k = skipCasts(tokens, k);
    if (isP(tokens[k], ')') && !unwrapped) {
      const after = skipCasts(tokens, k + 1);
      if (isDot(tokens[after]) && tokens[after + 1]?.t === 'id') { unwrapped = true; k = after; continue; }
      break;
    }
    if (!isDot(tokens[k]) || tokens[k + 1]?.t !== 'id') break;
    const name = tokens[k + 1].v;
    let p = k + 2;
    if (isP(tokens[p], '<')) p = skipAngles(tokens, p);
    if (!isP(tokens[p], '(')) break;
    const { args, end } = callArgs(tokens, p);
    if (end < 0) break;
    calls.push({ name, args, line: tokens[k + 1].line, endLine: tokens[end].line });
    k = end + 1;
  }
  return calls;
}

function skipCasts(tokens, k) {
  for (;;) {
    if (isP(tokens[k], '!')) { k++; continue; }
    if (tokens[k]?.t === 'id' && (tokens[k].v === 'as' || tokens[k].v === 'satisfies')) {
      k++;
      for (;;) {
        if (tokens[k]?.t === 'id') {
          k++;
          if (isP(tokens[k], '<')) k = skipAngles(tokens, k);
          if (isP(tokens[k], '[') && isP(tokens[k + 1], ']')) k += 2;
          if (isP(tokens[k], '.') && tokens[k + 1]?.t === 'id') { k++; continue; }
          if (isP(tokens[k], '|') || isP(tokens[k], '&')) { k++; continue; }
          break;
        }
        break;
      }
      continue;
    }
    return k;
  }
}

function skipAngles(tokens, k) {
  let depth = 0;
  for (; k < tokens.length; k++) {
    const tk = tokens[k];
    if (tk.t !== 'p') continue;
    if (tk.v === '<') depth++;
    else if (tk.v === '>') depth--;
    else if (tk.v === '>>') depth -= 2;
    else if (tk.v === '>>>') depth -= 3;
    if (depth <= 0) return k + 1;
  }
  return k;
}

/** The literal filters one builder method adds. */
function filtersOf(call, consts) {
  const { name, args } = call;
  const lit = (a) => (a ? literalValue(a, consts) : NOT_LITERAL);
  if (SIMPLE_OPS.has(name) && args.length >= 2) {
    const col = lit(args[0]);
    const v = lit(args[1]);
    if (typeof col !== 'string' || v === NOT_LITERAL || Array.isArray(v)) return [];
    return [{ column: col, op: name, value: v }];
  }
  if (name === 'in' && args.length >= 2) {
    const col = lit(args[0]);
    const v = lit(args[1]);
    if (typeof col !== 'string' || !Array.isArray(v)) return [];
    return [{ column: col, op: 'in', value: v }];
  }
  if (name === 'is' && args.length >= 2) {
    const col = lit(args[0]);
    const v = lit(args[1]);
    if (typeof col !== 'string' || !(v === null || v === true || v === false)) return [];
    return [{ column: col, op: 'is', value: v }];
  }
  if (name === 'not' && args.length >= 3) {
    const col = lit(args[0]);
    const op = lit(args[1]);
    const v = lit(args[2]);
    if (typeof col !== 'string') return [];
    if (op === 'is' && v === null) return [{ column: col, op: 'not-null', value: null }];
    if (op === 'eq' && v !== NOT_LITERAL && !Array.isArray(v)) return [{ column: col, op: 'neq', value: v }];
    return [];
  }
  if (name === 'filter' && args.length >= 3) {
    const col = lit(args[0]);
    const op = lit(args[1]);
    const v = lit(args[2]);
    if (typeof col !== 'string' || typeof op !== 'string' || v === NOT_LITERAL) return [];
    if (SIMPLE_OPS.has(op) && !Array.isArray(v)) return [{ column: col, op, value: v }];
    if (op === 'is' && (v === null || v === true || v === false)) return [{ column: col, op: 'is', value: v }];
    if (op === 'in' && typeof v === 'string') {
      const m = /^\((.*)\)$/.exec(v.trim());
      if (m) return [{ column: col, op: 'in', value: m[1].split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1')) }];
    }
    return [];
  }
  if (name === 'match' && args.length >= 1) {
    const obj = stripCasts(args[0]);
    if (!isP(obj[0], '{')) return [];
    const out = [];
    for (const prop of splitProps(obj.slice(1, -1))) {
      if (!prop) continue;
      const v = literalValue(prop.value, consts);
      if (v !== NOT_LITERAL && !Array.isArray(v)) out.push({ column: prop.key, op: 'eq', value: v });
    }
    return out;
  }
  return [];
}

function splitProps(slice) {
  const out = [];
  let depth = 0;
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const k = cur[0];
    if ((k.t === 'id' || k.t === 'str') && isP(cur[1], ':')) out.push({ key: k.v, value: cur.slice(2) });
    else out.push(null);
    cur = [];
  };
  for (const tk of slice) {
    if (tk.t === 'p') {
      if (tk.v === '(' || tk.v === '[' || tk.v === '{') depth++;
      else if (tk.v === ')' || tk.v === ']' || tk.v === '}') depth--;
      else if (tk.v === ',' && depth === 0) { flush(); continue; }
    }
    cur.push(tk);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------------------------
// The enclosing function of a line, by indentation. Formatted TypeScript nests a function's body
// deeper than its head, so walking up to the nearest less-indented line that reads as a function
// head finds the function a chain runs in (a declaration, a const arrow, an object property
// arrow, or a method).

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'await', 'new', 'typeof',
  'else', 'do', 'try', 'finally', 'with', 'yield', 'throw', 'case', 'import', 'export', 'const', 'let', 'var']);

const HEADS = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>|<)/,
  /^\s*(?:(?:public|private|protected|static|readonly|override|abstract)\s+)*(?:async\s+)?([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*(?:(?:public|private|protected|static|readonly|override|abstract)\s+)*(?:async\s+)?(?:get\s+|set\s+)?\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/,
];

/** @param {string[]} lines @param {number} lineNo 1-based */
export function enclosingFunction(lines, lineNo) {
  // `name: async (id) => db.from(...)` or a one-line function: the chain's own line is the head
  const own = lines[lineNo - 1] ?? '';
  const ownHead = headName(lines, lineNo);
  if (ownHead) return { name: ownHead, line: lineNo };
  let minIndent = indentOf(own);
  for (let j = lineNo - 1; j >= 1; j--) {
    const raw = lines[j - 1];
    if (!raw || !raw.trim()) continue;
    const trimmed = raw.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    const ind = indentOf(raw);
    if (ind >= minIndent) continue;
    // `): Promise<T> {` or `}> {` closes a head that spans lines (or an else branch): the line
    // that opened it is the next one up at the same indentation.
    if (/^[)\]}]/.test(trimmed)) { minIndent = ind + 1; continue; }
    const head = headName(lines, j);
    if (head) return { name: head, line: j };
    minIndent = ind;
    if (ind === 0) break;
  }
  return { name: '<module>', line: 1 };
}

function indentOf(line) {
  const m = /^[ \t]*/.exec(line);
  return m[0].replace(/\t/g, '  ').length;
}

function headName(lines, j) {
  const line = lines[j - 1];
  for (let h = 0; h < HEADS.length; h++) {
    const m = HEADS[h].exec(line);
    if (!m) continue;
    const name = m[1].replace(/^['"]|['"]$/g, '');
    if (KEYWORDS.has(name)) continue;
    if (h === 1 && !opensFunction(lines, j, /=>|\bfunction\b/)) continue;
    if (h === 2 && !opensFunction(lines, j, /=>|\bfunction\b/)) continue;
    if (h === 3 && !opensFunction(lines, j, /\)\s*(?::[^=]*)?\{\s*$|=>/)) continue;
    return name;
  }
  return null;
}

/** The head line, or one of the next few (a parameter list spanning lines), shows the function opening. */
function opensFunction(lines, j, re) {
  for (let k = j; k < Math.min(lines.length, j + 10); k++) {
    const l = lines[k - 1];
    if (re.test(l)) return true;
    if (k > j && /;\s*$/.test(l)) return false;
  }
  return false;
}
