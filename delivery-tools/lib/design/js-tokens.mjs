// A small JavaScript tokenizer for reading a design's logic script (spec 4.2 step 1). It never
// executes anything: candidates come from the tokens. Enough of the language for exported
// design files: strings, template literals (their ${} expressions are tokenized separately),
// regular expressions, comments, numbers, names and punctuators, each with its source line.

const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@', '#',
];

// Whitespace by code point: space, tab, CR, FF, VT, no-break space, BOM, line and paragraph separators.
const SPACE = new Set([0x20, 0x09, 0x0d, 0x0c, 0x0b, 0xa0, 0xfeff, 0x2028, 0x2029]);

// After these keywords a "/" starts a regular expression, not a division.
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/**
 * @typedef {{ t: 'str'|'tmpl'|'num'|'name'|'punc'|'regex', v: string, line: number, start: number, end: number,
 *             parts?: string[], inner?: Token[][] }} Token
 *   str: v is the decoded value; tmpl: v is the static parts joined with "{}", inner holds each ${} expression's tokens
 */

/**
 * @param {string} src
 * @param {{ line?: number }} [opts] line: the line number of src's first character (default 1)
 * @returns {Token[]}
 */
export function tokenize(src, opts = {}) {
  const state = { src, i: 0, line: opts.line ?? 1 };
  return readTokens(state, false);
}

function readTokens(s, untilBrace) {
  const out = [];
  let depth = 0;
  const { src } = s;
  while (s.i < src.length) {
    const c = src[s.i];
    if (c === '\n') { s.line++; s.i++; continue; }
    if (SPACE.has(c.charCodeAt(0))) { s.i++; continue; }
    if (c === '/' && src[s.i + 1] === '/') { while (s.i < src.length && src[s.i] !== '\n') s.i++; continue; }
    if (c === '/' && src[s.i + 1] === '*') {
      const end = src.indexOf('*/', s.i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = s.i; k < stop; k++) if (src[k] === '\n') s.line++;
      s.i = stop;
      continue;
    }
    if (untilBrace) {
      if (c === '{') depth++;
      if (c === '}') {
        if (depth === 0) { s.i++; return out; }
        depth--;
      }
    }
    const start = s.i;
    const line = s.line;
    if (c === '"' || c === "'") { out.push({ t: 'str', v: readString(s, c), line, start, end: s.i }); continue; }
    if (c === '`') { out.push(readTemplate(s, line, start)); continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[s.i + 1]))) { out.push({ t: 'num', v: readNumber(s), line, start, end: s.i }); continue; }
    if (isNameStart(c)) {
      let j = s.i + 1;
      while (j < src.length && isNamePart(src[j])) j++;
      out.push({ t: 'name', v: src.slice(s.i, j), line, start, end: j });
      s.i = j;
      continue;
    }
    if (c === '/' && regexAllowed(out[out.length - 1])) { out.push({ t: 'regex', v: readRegex(s), line, start, end: s.i }); continue; }
    let p = null;
    for (const cand of PUNCTUATORS) {
      if (src.startsWith(cand, s.i)) { p = cand; break; }
    }
    if (p === '?.' && isDigit(src[s.i + 2])) p = '?';
    if (!p) { s.i++; continue; } // an unknown character: skip it rather than fail the whole file
    s.i += p.length;
    out.push({ t: 'punc', v: p, line, start, end: s.i });
  }
  return out;
}

function isDigit(c) { return c >= '0' && c <= '9'; }
function isNameStart(c) { return /[A-Za-z_$]/.test(c) || c.charCodeAt(0) >= 0xc0; }
function isNamePart(c) { return /[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) >= 0xc0; } // includes the zero-width joiners

function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.t === 'num' || prev.t === 'str' || prev.t === 'tmpl' || prev.t === 'regex') return false;
  if (prev.t === 'name') return REGEX_AFTER_WORDS.has(prev.v);
  return !(prev.v === ')' || prev.v === ']' || prev.v === '}');
}

function readString(s, quote) {
  const { src } = s;
  let out = '';
  s.i++;
  while (s.i < src.length) {
    const c = src[s.i];
    if (c === quote) { s.i++; return out; }
    if (c === '\n') { return out; } // unterminated: stop at the line end
    if (c === '\\') { out += readEscape(s); continue; }
    out += c;
    s.i++;
  }
  return out;
}

function readEscape(s) {
  const { src } = s;
  const n = src[s.i + 1];
  s.i += 2;
  switch (n) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case 'b': return '\b';
    case 'f': return '\f';
    case 'v': return '\v';
    case '0': return '\0';
    case '\n': s.line++; return '';
    case '\r': if (src[s.i] === '\n') s.i++; s.line++; return '';
    case 'x': { const h = src.slice(s.i, s.i + 2); s.i += 2; return String.fromCharCode(parseInt(h, 16) || 0); }
    case 'u': {
      if (src[s.i] === '{') {
        const close = src.indexOf('}', s.i);
        const code = parseInt(src.slice(s.i + 1, close), 16);
        s.i = close + 1;
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      }
      const h = src.slice(s.i, s.i + 4);
      s.i += 4;
      return String.fromCharCode(parseInt(h, 16) || 0);
    }
    default: return n ?? '';
  }
}

function readTemplate(s, line, start) {
  const { src } = s;
  const parts = [];
  const inner = [];
  let cur = '';
  s.i++;
  while (s.i < src.length) {
    const c = src[s.i];
    if (c === '`') { s.i++; break; }
    if (c === '\\') { cur += readEscape(s); continue; }
    if (c === '$' && src[s.i + 1] === '{') {
      parts.push(cur);
      cur = '';
      s.i += 2;
      inner.push(readTokens(s, true));
      continue;
    }
    if (c === '\n') s.line++;
    cur += c;
    s.i++;
  }
  parts.push(cur);
  return { t: 'tmpl', v: parts.join('{}'), parts, inner, line, start, end: s.i };
}

function readNumber(s) {
  const { src } = s;
  let j = s.i;
  if (src[j] === '0' && /[xXoObB]/.test(src[j + 1] ?? '')) {
    j += 2;
    while (j < src.length && /[0-9a-fA-F_]/.test(src[j])) j++;
  } else {
    while (j < src.length && /[0-9_]/.test(src[j])) j++;
    if (src[j] === '.') { j++; while (j < src.length && /[0-9_]/.test(src[j])) j++; }
    if (/[eE]/.test(src[j] ?? '')) {
      j++;
      if (/[+-]/.test(src[j] ?? '')) j++;
      while (j < src.length && /[0-9_]/.test(src[j])) j++;
    }
  }
  if (src[j] === 'n') j++;
  const v = src.slice(s.i, j);
  s.i = j;
  return v;
}

function readRegex(s) {
  const { src } = s;
  let j = s.i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\n') break;
    if (c === '\\') { j += 2; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) { j++; break; }
    j++;
  }
  while (j < src.length && /[a-z]/i.test(src[j])) j++;
  const v = src.slice(s.i, j);
  s.i = j;
  return v;
}

/** True for a token that opens a bracket. */
export function isOpen(tok) { return tok && tok.t === 'punc' && (tok.v === '(' || tok.v === '[' || tok.v === '{'); }
/** True for a token that closes a bracket. */
export function isClose(tok) { return tok && tok.t === 'punc' && (tok.v === ')' || tok.v === ']' || tok.v === '}'); }

/**
 * The index of the bracket that closes the one at `open`, or tokens.length when unbalanced.
 * @param {Token[]} tokens
 * @param {number} open
 */
export function matchBracket(tokens, open) {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    if (isOpen(tokens[k])) depth++;
    else if (isClose(tokens[k])) {
      depth--;
      if (depth === 0) return k;
    }
  }
  return tokens.length;
}

/**
 * Source text of tokens[a..b] (inclusive), whitespace collapsed.
 * @param {string} src
 * @param {Token[]} tokens
 * @param {number} a
 * @param {number} b
 */
export function sliceText(src, tokens, a, b) {
  if (a > b || !tokens[a]) return '';
  return src.slice(tokens[a].start, tokens[Math.min(b, tokens.length - 1)].end).replace(/\s+/g, ' ').trim();
}
