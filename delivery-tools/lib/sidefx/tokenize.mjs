// A small tokenizer for TypeScript and TSX source, enough to find call chains, literals and
// JSX attributes without a parser dependency. It knows comments, strings, template literals
// (their `${}` parts are tokenized too), regular expressions, numbers and, in TSX, JSX elements:
// tag names and attribute names become tokens and JSX text is skipped, so an apostrophe in
// "Don't" never opens a string.
//
// Token: { t, v, line, i } where t is
//   'id'  identifier or keyword        'str' string literal (v is the decoded value)
//   'tpl' template literal (quasis: string[], exprs: Token[][]; v is the raw text)
//   'num' number   'p' punctuator   're' regular expression
//   'jsx' a JSX tag name (v; close: true for a closing tag or />)   'attr' a JSX attribute name

const ID_START = /[A-Za-z_$\p{ID_Start}]/u;
const ID_PART = /[\w$\p{ID_Continue}\u200c\u200d]/u;
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>'];
const REGEX_AFTER_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new',
  'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/**
 * @param {string} text
 * @param {{ jsx?: boolean }} [opts]
 * @returns {object[]} tokens
 */
export function tokenize(text, opts = {}) {
  const lx = new Lexer(String(text), Boolean(opts.jsx));
  const out = [];
  lx.run(out, null);
  return out;
}

class Lexer {
  constructor(src, jsx) {
    this.s = src;
    this.n = src.length;
    this.pos = 0;
    this.line = 1;
    this.jsx = jsx;
  }

  /** Tokenize into out until EOF, or until an unmatched `}` when stopAtBrace (consumed). */
  run(out, stopAtBrace) {
    let depth = 0;
    const s = this.s;
    while (this.pos < this.n) {
      const c = s[this.pos];
      if (c === '\n') { this.line++; this.pos++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff') { this.pos++; continue; }
      if (c === '/' && s[this.pos + 1] === '/') { this.skipLineComment(); continue; }
      if (c === '/' && s[this.pos + 1] === '*') { this.skipBlockComment(); continue; }
      if (c === '#' && this.pos === 0 && s[1] === '!') { this.skipLineComment(); continue; }
      const line = this.line;
      const start = this.pos;
      if (c === '"' || c === "'") { out.push({ t: 'str', v: this.readString(c), line, i: start }); continue; }
      if (c === '`') { out.push(this.readTemplate(line, start)); continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[this.pos + 1] ?? ''))) { out.push({ t: 'num', v: this.readNumber(), line, i: start }); continue; }
      if (ID_START.test(c) || c === '\\') { out.push({ t: 'id', v: this.readIdent(), line, i: start }); continue; }
      if (c === '/' && regexAllowed(out)) { out.push({ t: 're', v: this.readRegex(), line, i: start }); continue; }
      if (c === '<' && this.jsx && jsxAllowed(out) && this.tryJsx(out)) continue;
      if (c === '{') depth++;
      if (c === '}') {
        if (stopAtBrace && depth === 0) { this.pos++; return; }
        depth--;
      }
      let p = c;
      for (const op of PUNCT) if (s.startsWith(op, this.pos)) { p = op; break; }
      // `a?.5:b` is a conditional, not optional chaining.
      if (p === '?.' && /[0-9]/.test(s[this.pos + 2] ?? '')) p = '?';
      this.pos += p.length;
      out.push({ t: 'p', v: p, line, i: start });
    }
  }

  skipLineComment() { while (this.pos < this.n && this.s[this.pos] !== '\n') this.pos++; }

  skipBlockComment() {
    const end = this.s.indexOf('*/', this.pos + 2);
    const stop = end < 0 ? this.n : end + 2;
    for (let k = this.pos; k < stop; k++) if (this.s[k] === '\n') this.line++;
    this.pos = stop;
  }

  readString(q) {
    const s = this.s;
    this.pos++;
    let v = '';
    while (this.pos < this.n) {
      const c = s[this.pos];
      if (c === q) { this.pos++; return v; }
      if (c === '\n') { this.line++; this.pos++; return v; } // unterminated: stop at the line end
      if (c === '\\') { v += this.readEscape(); continue; }
      v += c;
      this.pos++;
    }
    return v;
  }

  readEscape() {
    const s = this.s;
    const c = s[this.pos + 1];
    this.pos += 2;
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return '\0';
      case '\n': this.line++; return '';
      case '\r': if (s[this.pos] === '\n') { this.pos++; } this.line++; return '';
      case 'x': { const h = s.slice(this.pos, this.pos + 2); this.pos += 2; return String.fromCharCode(parseInt(h, 16) || 0); }
      case 'u': {
        if (s[this.pos] === '{') {
          const end = s.indexOf('}', this.pos);
          const cp = parseInt(s.slice(this.pos + 1, end), 16);
          this.pos = end + 1;
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
        }
        const h = s.slice(this.pos, this.pos + 4);
        this.pos += 4;
        return String.fromCharCode(parseInt(h, 16) || 0);
      }
      default: return c ?? '';
    }
  }

  readTemplate(line, start) {
    const s = this.s;
    this.pos++;
    const quasis = [];
    const exprs = [];
    let cur = '';
    while (this.pos < this.n) {
      const c = s[this.pos];
      if (c === '`') { this.pos++; break; }
      if (c === '\\') { cur += this.readEscape(); continue; }
      if (c === '$' && s[this.pos + 1] === '{') {
        this.pos += 2;
        quasis.push(cur);
        cur = '';
        const inner = [];
        this.run(inner, true);
        exprs.push(inner);
        continue;
      }
      if (c === '\n') this.line++;
      cur += c;
      this.pos++;
    }
    quasis.push(cur);
    return { t: 'tpl', v: s.slice(start, this.pos), quasis, exprs, line, i: start };
  }

  readNumber() {
    const m = /^(?:0[xX][0-9a-fA-F_]+n?|0[oO][0-7_]+n?|0[bB][01_]+n?|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?n?|\d[\d_]*\.?)/.exec(this.s.slice(this.pos, this.pos + 64));
    const v = m ? m[0] : this.s[this.pos];
    this.pos += v.length;
    return v;
  }

  readIdent() {
    const s = this.s;
    let v = '';
    while (this.pos < this.n) {
      const c = s[this.pos];
      if (c === '\\' && s[this.pos + 1] === 'u') { v += this.readEscape(); continue; }
      if (v === '' ? ID_START.test(c) : ID_PART.test(c)) { v += c; this.pos++; continue; }
      break;
    }
    if (v === '') { v = s[this.pos]; this.pos++; }
    return v;
  }

  readRegex() {
    const s = this.s;
    const start = this.pos;
    this.pos++;
    let inClass = false;
    while (this.pos < this.n) {
      const c = s[this.pos];
      if (c === '\n') break;
      if (c === '\\') { this.pos += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { this.pos++; break; }
      this.pos++;
    }
    while (this.pos < this.n && /[a-z]/i.test(s[this.pos])) this.pos++;
    return s.slice(start, this.pos);
  }

  /** Parse one JSX element at `<`; on failure restore the position and return false. */
  tryJsx(out) {
    const saved = { pos: this.pos, line: this.line, len: out.length };
    try {
      if (this.readJsxElement(out)) return true;
    } catch { /* fall through to restore */ }
    this.pos = saved.pos;
    this.line = saved.line;
    out.length = saved.len;
    return false;
  }

  readJsxElement(out) {
    const s = this.s;
    const line = this.line;
    const start = this.pos;
    this.pos++; // <
    this.skipJsxSpace();
    const name = this.readJsxName();
    if (name === null) {
      if (s[this.pos] !== '>') return false; // not a fragment either
    }
    if (name && !/^[A-Za-z_$][\w$.:-]*$/.test(name)) return false;
    out.push({ t: 'jsx', v: name ?? '', line, i: start });
    // attributes
    for (;;) {
      this.skipJsxSpace();
      if (this.pos >= this.n) throw new Error('eof');
      const c = s[this.pos];
      if (c === '/' && s[this.pos + 1] === '>') {
        this.pos += 2;
        out.push({ t: 'jsx', v: name ?? '', close: true, line: this.line, i: this.pos - 2 });
        return true;
      }
      if (c === '>') { this.pos++; break; }
      if (c === '{') { this.pos++; this.run(out, true); continue; }
      const aLine = this.line;
      const aStart = this.pos;
      const attr = this.readJsxName();
      if (!attr) throw new Error('bad attribute');
      out.push({ t: 'attr', v: attr, line: aLine, i: aStart });
      this.skipJsxSpace();
      if (s[this.pos] === '=') {
        this.pos++;
        this.skipJsxSpace();
        const v = s[this.pos];
        const vLine = this.line;
        const vStart = this.pos;
        if (v === '"' || v === "'") {
          const end = s.indexOf(v, this.pos + 1);
          if (end < 0) throw new Error('eof');
          const raw = s.slice(this.pos + 1, end);
          for (const ch of raw) if (ch === '\n') this.line++;
          this.pos = end + 1;
          out.push({ t: 'str', v: raw, line: vLine, i: vStart });
        } else if (v === '{') {
          this.pos++;
          this.run(out, true);
        } else if (v === '<') {
          if (!this.readJsxElement(out)) throw new Error('bad attribute element');
        } else throw new Error('bad attribute value');
      }
    }
    // children
    for (;;) {
      if (this.pos >= this.n) throw new Error('eof');
      const c = s[this.pos];
      if (c === '<') {
        if (s[this.pos + 1] === '/') {
          const end = s.indexOf('>', this.pos);
          if (end < 0) throw new Error('eof');
          out.push({ t: 'jsx', v: s.slice(this.pos + 2, end).trim(), close: true, line: this.line, i: this.pos });
          this.pos = end + 1;
          return true;
        }
        if (!this.readJsxElement(out)) throw new Error('bad child');
        continue;
      }
      if (c === '{') { this.pos++; this.run(out, true); continue; }
      if (c === '\n') this.line++;
      this.pos++;
    }
  }

  readJsxName() {
    const m = /^[A-Za-z_$][\w$.:-]*/.exec(this.s.slice(this.pos, this.pos + 256));
    if (!m) return null;
    this.pos += m[0].length;
    return m[0];
  }

  skipJsxSpace() {
    const s = this.s;
    while (this.pos < this.n) {
      const c = s[this.pos];
      if (c === '\n') { this.line++; this.pos++; continue; }
      if (/\s/.test(c)) { this.pos++; continue; }
      if (c === '/' && s[this.pos + 1] === '/') { this.skipLineComment(); continue; }
      if (c === '/' && s[this.pos + 1] === '*') { this.skipBlockComment(); continue; }
      break;
    }
  }
}

function regexAllowed(out) {
  const prev = out[out.length - 1];
  if (!prev) return true;
  if (prev.t === 'num' || prev.t === 'str' || prev.t === 'tpl' || prev.t === 're') return false;
  if (prev.t === 'id') return REGEX_AFTER_KEYWORDS.has(prev.v);
  if (prev.t === 'jsx' || prev.t === 'attr') return false;
  return !(prev.v === ')' || prev.v === ']' || prev.v === '}');
}

function jsxAllowed(out) {
  const prev = out[out.length - 1];
  if (!prev) return true;
  if (prev.t === 'id') return prev.v === 'return' || prev.v === 'default' || prev.v === 'yield' || prev.v === 'await';
  if (prev.t !== 'p') return false;
  return ['(', ',', '=', ':', '?', '[', '{', '}', '=>', '&&', '||', '??', '!', ';', '||=', '&&=', '??='].includes(prev.v);
}

// ---------------------------------------------------------------------------------------------
// Helpers over a token array.

const OPEN = { '(': ')', '[': ']', '{': '}' };

/** Index of the bracket matching tokens[i] (an opening bracket), or -1. */
export function matchBracket(tokens, i) {
  const open = tokens[i]?.v;
  const close = OPEN[open];
  if (!close || tokens[i].t !== 'p') return -1;
  let depth = 0;
  for (let k = i; k < tokens.length; k++) {
    const tk = tokens[k];
    if (tk.t !== 'p') continue;
    if (tk.v === open) depth++;
    else if (tk.v === close) { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/** Arguments of a call whose `(` is at tokens[i]: arrays of tokens split at top-level commas. */
export function callArgs(tokens, i) {
  const end = matchBracket(tokens, i);
  if (end < 0) return { args: [], end: -1 };
  return { args: splitTop(tokens.slice(i + 1, end), ','), end };
}

/** Split a token slice at top-level occurrences of a punctuator. Empty trailing parts dropped. */
export function splitTop(slice, sep) {
  const parts = [];
  let cur = [];
  let depth = 0;
  for (const tk of slice) {
    if (tk.t === 'p') {
      if (tk.v === '(' || tk.v === '[' || tk.v === '{') depth++;
      else if (tk.v === ')' || tk.v === ']' || tk.v === '}') depth--;
      else if (tk.v === sep && depth === 0) { parts.push(cur); cur = []; continue; }
    }
    cur.push(tk);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/** Strip a trailing `as T`, `as const`, `satisfies T` or `!` from an expression slice. */
export function stripCasts(slice) {
  let s = slice;
  for (;;) {
    const k = s.findIndex((tk, idx) => idx > 0 && tk.t === 'id' && (tk.v === 'as' || tk.v === 'satisfies') && depthAt(s, idx) === 0);
    if (k > 0) { s = s.slice(0, k); continue; }
    if (s.length > 1 && s[s.length - 1].t === 'p' && s[s.length - 1].v === '!') { s = s.slice(0, -1); continue; }
    return s;
  }
}

function depthAt(slice, idx) {
  let d = 0;
  for (let k = 0; k < idx; k++) {
    const tk = slice[k];
    if (tk.t !== 'p') continue;
    if (tk.v === '(' || tk.v === '[' || tk.v === '{') d++;
    else if (tk.v === ')' || tk.v === ']' || tk.v === '}') d--;
  }
  return d;
}

const NOT_LITERAL = Symbol('not-literal');
export { NOT_LITERAL };

/**
 * The literal value of an expression slice: a string, number, boolean, null, a template with no
 * substitutions, or an array of those. Anything else is NOT_LITERAL.
 * @param {object[]} slice
 * @param {Map<string, unknown>} [consts] top-level constant bindings to resolve identifiers
 */
export function literalValue(slice, consts) {
  const s = stripCasts(slice);
  if (s.length === 0) return NOT_LITERAL;
  if (s.length === 1) {
    const tk = s[0];
    if (tk.t === 'str') return tk.v;
    if (tk.t === 'tpl') return tk.exprs.length === 0 ? tk.quasis.join('') : NOT_LITERAL;
    if (tk.t === 'num') { const n = Number(tk.v.replace(/_/g, '').replace(/n$/, '')); return Number.isFinite(n) ? n : NOT_LITERAL; }
    if (tk.t === 'id') {
      if (tk.v === 'true') return true;
      if (tk.v === 'false') return false;
      if (tk.v === 'null') return null;
      if (consts?.has(tk.v)) return consts.get(tk.v);
    }
    return NOT_LITERAL;
  }
  if (s.length === 2 && s[0].t === 'p' && s[0].v === '-' && s[1].t === 'num') {
    const n = -Number(s[1].v.replace(/_/g, ''));
    return Number.isFinite(n) ? n : NOT_LITERAL;
  }
  if (s[0].t === 'p' && s[0].v === '[' && matchBracket(s, 0) === s.length - 1) {
    const items = splitTop(s.slice(1, -1), ',');
    const out = [];
    for (const it of items) {
      const v = literalValue(it, consts);
      if (v === NOT_LITERAL || Array.isArray(v)) return NOT_LITERAL;
      out.push(v);
    }
    return out;
  }
  if (s[0].t === 'p' && s[0].v === '(' && matchBracket(s, 0) === s.length - 1) return literalValue(s.slice(1, -1), consts);
  return NOT_LITERAL;
}

/**
 * Top-level `const NAME = <literal>` bindings (string, number, boolean, null, arrays of those),
 * so `.in('status', OPEN_STATUSES)` resolves. Only declarations at brace depth 0.
 * @param {object[]} tokens
 * @returns {Map<string, unknown>}
 */
export function topLevelConsts(tokens) {
  const out = new Map();
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'p') {
      if (tk.v === '{' || tk.v === '(' || tk.v === '[') depth++;
      else if (tk.v === '}' || tk.v === ')' || tk.v === ']') depth--;
      continue;
    }
    if (depth !== 0 || tk.t !== 'id' || tk.v !== 'const') continue;
    const name = tokens[i + 1];
    if (name?.t !== 'id') continue;
    let k = i + 2;
    if (tokens[k]?.t === 'p' && tokens[k].v === ':') {
      // skip a type annotation up to `=` at depth 0
      let d = 0;
      for (k++; k < tokens.length; k++) {
        const t2 = tokens[k];
        if (t2.t !== 'p') continue;
        if (t2.v === '(' || t2.v === '[' || t2.v === '{' || t2.v === '<') d++;
        else if (t2.v === ')' || t2.v === ']' || t2.v === '}' || t2.v === '>') d--;
        else if (t2.v === '=' && d <= 0) break;
      }
    }
    if (tokens[k]?.t !== 'p' || tokens[k].v !== '=') continue;
    const end = expressionEnd(tokens, k + 1);
    const v = literalValue(tokens.slice(k + 1, end), out);
    if (v !== NOT_LITERAL) out.set(name.v, v);
  }
  return out;
}

/** Index just past the expression starting at i: the first `;` or `,` at depth 0, or an unmatched closer. */
export function expressionEnd(tokens, i) {
  let depth = 0;
  let lastLine = tokens[i]?.line;
  for (let k = i; k < tokens.length; k++) {
    const tk = tokens[k];
    if (tk.t === 'p') {
      if (tk.v === '(' || tk.v === '[' || tk.v === '{') depth++;
      else if (tk.v === ')' || tk.v === ']' || tk.v === '}') { if (depth === 0) return k; depth--; }
      else if ((tk.v === ';' || tk.v === ',') && depth === 0) return k;
    } else if (depth === 0 && tk.line > lastLine && (tk.t === 'id') && ['const', 'let', 'var', 'export', 'function', 'import', 'return', 'if', 'for', 'while', 'type', 'interface', 'class'].includes(tk.v)) {
      return k; // an ASI boundary at a new statement keyword
    }
    lastLine = tk.line;
  }
  return tokens.length;
}
