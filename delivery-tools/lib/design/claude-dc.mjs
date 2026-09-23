// Reading a Claude Design export's *.dc.html (spec 4.2 step 1). The file is one component: a
// template inside <x-dc>, a logic script in <script data-dc-script> whose data-props attribute
// declares the demo switches, and state changed by this.set({...}). Everything here is pure text
// work on the file; nothing in it is executed.

import { tokenize, isOpen, isClose, matchBracket, sliceText } from './js-tokens.mjs';

/** @typedef {import('./js-tokens.mjs').Token} Token */

/**
 * Line number (1-based) of each character offset, by binary search over line starts.
 * @param {string} text
 */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

const HTML_ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: String.fromCharCode(0xa0) };

/** Decode the HTML entities an attribute value can carry. */
export function htmlUnescape(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return HTML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Split a .dc.html into its parts.
 * @param {string} text
 * @returns {{ template: { text: string, line: number }|null, script: { text: string, line: number }|null,
 *             props: { value: Record<string, any>|null, line: number, error?: string }|null }}
 */
export function splitDcHtml(text) {
  const lineOf = lineIndex(text);
  let template = null;
  const open = /<x-dc(?:\s[^>]*)?>/.exec(text);
  if (open) {
    const close = text.lastIndexOf('</x-dc>');
    if (close > open.index) {
      const start = open.index + open[0].length;
      template = { text: text.slice(start, close), line: lineOf(start) };
    }
  }
  let script = null;
  let props = null;
  const tag = /<script\b[^>]*\bdata-dc-script\b[^>]*>/i.exec(text);
  if (tag) {
    const start = tag.index + tag[0].length;
    const end = text.indexOf('</script>', start);
    script = { text: text.slice(start, end < 0 ? text.length : end), line: lineOf(start) };
    const attr = /\bdata-props\s*=\s*"([^"]*)"/i.exec(tag[0]) ?? /\bdata-props\s*=\s*'([^']*)'/i.exec(tag[0]);
    if (attr) {
      const line = lineOf(tag.index + attr.index);
      try {
        const value = JSON.parse(htmlUnescape(attr[1]));
        props = { value: value && typeof value === 'object' && !Array.isArray(value) ? value : null, line };
      } catch (err) {
        props = { value: null, line, error: `data-props is not JSON (${err.message})` };
      }
    }
  }
  return { template, script, props };
}

/** A candidate id segment from any value: letters, digits, dot, underscore and hyphen only. */
export function idPart(value) {
  const raw = String(value).trim();
  let s = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-');
  if (!/^-\d/.test(raw)) s = s.replace(/^[-.]+/, ''); // keep the sign of a negative number
  s = s.replace(/[-.]+$/, '');
  return s || 'empty';
}

/**
 * Every value a data-props switch can take: each enum option, both booleans, a number's
 * default, minimum and maximum; anything else by its default.
 * @param {Record<string, any>} props the parsed data-props object
 * @returns {{ key: string, value: unknown, isDefault: boolean, section: string|null, editor: string|null }[]}
 */
export function propValues(props) {
  const out = [];
  for (const [key, meta] of Object.entries(props ?? {})) {
    if (key.startsWith('$') || !meta || typeof meta !== 'object') continue;
    const editor = typeof meta.editor === 'string' ? meta.editor : null;
    const section = typeof meta.section === 'string' ? meta.section : null;
    const def = meta.default;
    let values;
    if (Array.isArray(meta.options) && meta.options.length) values = meta.options;
    else if (editor === 'boolean' || typeof def === 'boolean') values = [true, false];
    else if (editor === 'int' || editor === 'number' || typeof def === 'number') {
      values = [def, meta.min, meta.max].filter((v) => typeof v === 'number');
    } else values = [def];
    const seen = new Set();
    for (const v of values) {
      const k = JSON.stringify(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key, value: v, isDefault: JSON.stringify(def) === k, section, editor });
    }
  }
  return out;
}

const LITERAL_WORDS = new Map([['true', true], ['false', false], ['null', null], ['undefined', undefined]]);

/**
 * The literal results of a value expression: `'x'` gives ['x']; `c ? 'a' : 'b'` gives ['a', 'b'];
 * anything else in a result position adds the marker `computed`.
 * @param {Token[]} toks the expression's tokens
 * @returns {{ literals: unknown[], computed: boolean }}
 */
export function literalResults(toks) {
  const res = { literals: [], computed: false };
  collectResults(toks, res);
  return res;
}

function collectResults(toks, res) {
  // strip wrapping parentheses
  while (toks.length >= 2 && toks[0].v === '(' && matchBracket(toks, 0) === toks.length - 1) toks = toks.slice(1, -1);
  const q = topLevelIndex(toks, '?');
  if (q >= 0) {
    const colon = matchingColon(toks, q);
    if (colon > q) {
      collectResults(toks.slice(q + 1, colon), res);
      collectResults(toks.slice(colon + 1), res);
      return;
    }
  }
  if (toks.length === 1) {
    const t = toks[0];
    if (t.t === 'str') { res.literals.push(t.v); return; }
    if (t.t === 'num') { res.literals.push(Number(t.v.replace(/_/g, ''))); return; }
    if (t.t === 'name' && LITERAL_WORDS.has(t.v)) { res.literals.push(LITERAL_WORDS.get(t.v)); return; }
    if (t.t === 'tmpl' && !t.inner.length) { res.literals.push(t.v); return; }
  }
  if (toks.length === 2 && toks[0].v === '-' && toks[1].t === 'num') { res.literals.push(-Number(toks[1].v)); return; }
  if (toks.length === 2 && toks[0].v === '{' && toks[1].v === '}') { res.literals.push({}); return; }
  if (toks.length === 2 && toks[0].v === '[' && toks[1].v === ']') { res.literals.push([]); return; }
  res.computed = true;
}

function topLevelIndex(toks, v) {
  let depth = 0;
  for (let k = 0; k < toks.length; k++) {
    if (isOpen(toks[k])) depth++;
    else if (isClose(toks[k])) depth--;
    else if (depth === 0 && toks[k].t === 'punc' && toks[k].v === v) return k;
  }
  return -1;
}

/** Index of the ':' that pairs with the '?' at q (same bracket depth, nested ternaries counted). */
function matchingColon(toks, q) {
  let depth = 0, nest = 0;
  for (let j = q + 1; j < toks.length; j++) {
    const t = toks[j];
    if (isOpen(t)) depth++;
    else if (isClose(t)) { if (depth === 0) return -1; depth--; }
    else if (depth === 0 && t.t === 'punc') {
      if (t.v === '?') nest++;
      else if (t.v === ':') { if (nest === 0) return j; nest--; }
      else if (t.v === ',' || t.v === ';') return -1;
    }
  }
  return -1;
}

/**
 * Split an object literal's tokens (between its braces) into top-level entries.
 * @param {Token[]} toks tokens strictly inside { }
 * @returns {{ key: string|null, value: Token[], spread: boolean }[]}
 */
export function objectEntries(toks) {
  const entries = [];
  let depth = 0, start = 0;
  const flush = (end) => {
    const part = toks.slice(start, end);
    start = end + 1;
    if (!part.length) return;
    if (part[0].v === '...') { entries.push({ key: null, value: part.slice(1), spread: true }); return; }
    let colon = -1, d = 0;
    for (let k = 0; k < part.length; k++) {
      if (isOpen(part[k])) d++;
      else if (isClose(part[k])) d--;
      else if (d === 0 && part[k].t === 'punc' && part[k].v === ':') { colon = k; break; }
    }
    const keyTok = part[0];
    const key = keyTok.t === 'name' || keyTok.t === 'str' || keyTok.t === 'num' ? keyTok.v : null;
    if (colon === 1) entries.push({ key, value: part.slice(2), spread: false });
    else if (part.length === 1 && keyTok.t === 'name') entries.push({ key, value: part, spread: false }); // shorthand
    else entries.push({ key, value: part.slice(colon + 1), spread: false }); // methods, computed keys: kept as computed
  };
  for (let k = 0; k < toks.length; k++) {
    if (isOpen(toks[k])) depth++;
    else if (isClose(toks[k])) depth--;
    else if (depth === 0 && toks[k].t === 'punc' && toks[k].v === ',') flush(k);
  }
  flush(toks.length);
  return entries;
}

/**
 * Every this.set({...}) and this.setState({...}) call, and the component's initial `state = {...}`.
 * @param {Token[]} toks
 * @param {string} src the script text the tokens index into
 * @returns {{ line: number, at: number, text: string, initial: boolean, entries: { key: string, literals: unknown[], computed: boolean }[] }[]} at: the call's offset in src
 */
export function stateWrites(toks, src) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    // this . set ( {  /  this . setState ( {
    if (t.t === 'name' && t.v === 'this' && toks[k + 1]?.v === '.' && (toks[k + 2]?.v === 'set' || toks[k + 2]?.v === 'setState')
      && toks[k + 3]?.v === '(' && toks[k + 4]?.v === '{') {
      const close = matchBracket(toks, k + 4);
      out.push(write(toks, src, k, k + 4, close, false));
      continue;
    }
    // class field:  state = {   (not a comparison, not this.state = ...)
    if (t.t === 'name' && t.v === 'state' && toks[k + 1]?.v === '=' && toks[k + 2]?.v === '{' && toks[k - 1]?.v !== '.') {
      const close = matchBracket(toks, k + 2);
      out.push(write(toks, src, k, k + 2, close, true));
    }
  }
  return out;
}

function write(toks, src, at, open, close, initial) {
  const inner = toks.slice(open + 1, close);
  const entries = [];
  for (const e of objectEntries(inner)) {
    if (e.spread || e.key === null) continue;
    const r = literalResults(e.value);
    entries.push({ key: e.key, literals: r.literals, computed: r.computed });
  }
  return { line: toks[at].line, at: toks[at].start, text: sliceText(src, toks, at, Math.min(close + 1, toks.length - 1)), initial, entries };
}

const TYPOGRAPHIC = /^[\s—–…·•]+$/;
const CSS_FUNC = /^(var|calc|min|max|clamp|rgba?|hsla?|oklch|oklab|lab|lch|color-mix|url|linear-gradient|radial-gradient|conic-gradient|rotate|translate[xyz]?|scale|cubic-bezier)\(/i;
const CSS_WORD = /^(none|auto|inherit|initial|unset|transparent|currentcolor|pointer|default|not-allowed|text|flex|inline-flex|block|inline|inline-block|grid|contents|center|start|end|left|right|top|bottom|middle|baseline|stretch|hidden|visible|scroll|solid|dashed|dotted|absolute|relative|fixed|sticky|static|nowrap|wrap|pre|pre-wrap|bold|bolder|lighter|normal|italic|uppercase|lowercase|capitalize|row|column|space-between|space-around|space-evenly|flex-start|flex-end|ease|ease-in|ease-out|ease-in-out|linear|forwards|infinite|both|ltr|rtl|_blank|true|false)$/i;

/**
 * Whether a string literal is text a person could see on the page, as opposed to a key, a CSS
 * value, a URL or an icon name. Errs towards "visible": a spare candidate costs one exclusion.
 * @param {string} s
 */
export function isVisibleText(s) {
  if (typeof s !== 'string' || !s.length) return false;
  if (TYPOGRAPHIC.test(s)) return /[—–…·•]/.test(s);
  const t = s.trim();
  if (/^(-?\d*\.?\d+(px|em|rem|%|ms|s|deg|fr|vh|vw|ch)?\s*)+$/i.test(t)) return false; // numbers and CSS lengths
  if (!/\p{L}/u.test(s)) return /\d/.test(s) && /[\s•·—–…:+/]/.test(t); // masks, times, "3 / 5"
  if (!/\s/.test(s) && !/\p{Lu}/u.test(s) && t.length <= 2) return false; // "-v", "px"
  if (/^-[a-z]+$/.test(t)) return false;
  if (CSS_FUNC.test(t)) return false;
  if (CSS_WORD.test(t) && !/\s/.test(s)) return false; // "left" is CSS; " left" glued to a number is words
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (/^-?\d*\.?\d+(px|em|rem|%|ms|s|vh|vw|fr|deg|ch)\b/i.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(s)) return false; // a bare camelCase word with no space around it: a key
  if (/^[a-z0-9]+([-_:/.][a-z0-9]+)+$/i.test(t) && !/\s/.test(t)) return false; // kebab keys, paths, file names
  if (/^(https?:|mailto:|tel:|data:|\/|\.\/|\.\.\/)/i.test(t) && !/\s/.test(t)) return false;
  if (/^[\w-]+\s*:\s*[^;]+;/.test(t)) return false; // an inline style string
  return true;
}

/**
 * Every ternary whose branches produce different visible text.
 * @param {Token[]} toks
 * @param {string} src
 * @returns {{ line: number, at: number, text: string, whenTrue: string[], whenFalse: string[] }[]} at: the `?`'s offset in src
 */
export function textTernaries(toks, src) {
  const found = [];
  scanTernaries(toks, src, found);
  return found;
}

function scanTernaries(toks, src, found) {
  const spans = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'tmpl') for (const inner of t.inner) scanTernaries(inner, src, found);
    if (t.t !== 'punc' || t.v !== '?') continue;
    const colon = matchingColon(toks, k);
    if (colon < 0) continue;
    const end = alternateEnd(toks, colon);
    spans.push({ q: k, colon, end });
  }
  for (const sp of spans) {
    const nested = spans.filter((o) => o !== sp && o.q > sp.q && o.q <= sp.end);
    const inNested = (j) => nested.some((o) => j > o.q && j <= o.end);
    const branch = (a, b) => {
      const lits = [];
      for (let j = a; j <= b; j++) {
        const t = toks[j];
        if (inNested(j)) continue;
        if (t.t !== 'str' && t.t !== 'tmpl') continue;
        const prev = toks[j - 1], next = toks[j + 1];
        if (isComparison(prev) || isComparison(next)) continue; // part of a condition
        if (next?.v === ':' && (prev?.v === '{' || prev?.v === ',')) continue; // an object key
        if (prev?.v === '[' && next?.v === ']') continue; // obj['key']
        if (NON_TEXT_CALLS.has(calleeOf(toks, j))) continue; // .split(' used'), .replace('x', ...)
        const text = t.t === 'tmpl' ? t.parts.join('') : t.v;
        if (isVisibleText(text) || (t.t === 'tmpl' && t.parts.some(isVisibleText))) lits.push(t.v);
      }
      return lits;
    };
    const whenTrue = branch(sp.q + 1, sp.colon - 1);
    const whenFalse = branch(sp.colon + 1, sp.end);
    if (!whenTrue.length && !whenFalse.length) continue;
    if (JSON.stringify([...whenTrue].sort()) === JSON.stringify([...whenFalse].sort())) continue;
    const from = conditionStart(toks, sp.q);
    found.push({ line: toks[sp.q].line, at: toks[sp.q].start, text: sliceText(src, toks, from, sp.end), whenTrue, whenFalse });
  }
}

function isComparison(t) {
  return t && t.t === 'punc' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(t.v);
}

// Calls whose string arguments are never shown: string, array and DOM helpers.
const NON_TEXT_CALLS = new Set(['split', 'join', 'replace', 'replaceAll', 'includes', 'startsWith', 'endsWith', 'indexOf',
  'lastIndexOf', 'match', 'matchAll', 'test', 'search', 'padStart', 'padEnd', 'localeCompare', 'querySelector',
  'querySelectorAll', 'closest', 'getAttribute', 'setAttribute', 'removeAttribute', 'hasAttribute', 'addEventListener',
  'removeEventListener', 'getElementById', 'matches', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString',
  'getItem', 'setItem', 'removeItem', 'getPropertyValue', 'setProperty', 'icon', 'Intl', 'RegExp', 'require', 'import', 'fetch']);

/** The name called with the argument at j (walking back to the unmatched '('), or null. */
function calleeOf(toks, j) {
  let depth = 0;
  for (let k = j - 1; k >= 0 && k >= j - 200; k--) {
    const t = toks[k];
    if (isClose(t)) depth++;
    else if (isOpen(t)) {
      if (depth === 0) return t.v === '(' && toks[k - 1]?.t === 'name' ? toks[k - 1].v : null;
      depth--;
    } else if (depth === 0 && t.t === 'punc' && (t.v === ';' || t.v === '?' || t.v === ':' || t.v === '+')) return null;
  }
  return null;
}

const STATEMENT_WORDS = new Set(['const', 'let', 'var', 'return', 'if', 'for', 'while', 'switch', 'throw', 'class', 'function', 'break', 'continue', 'do', 'try', 'else']);

/** The last token of the alternate that starts after `colon`. */
function alternateEnd(toks, colon) {
  let depth = 0, nest = 0;
  for (let j = colon + 1; j < toks.length; j++) {
    const t = toks[j];
    if (isOpen(t)) { depth++; continue; }
    if (isClose(t)) { if (depth === 0) return j - 1; depth--; continue; }
    if (depth !== 0) continue;
    if (t.t === 'punc') {
      if (t.v === '?') nest++;
      else if (t.v === ':') { if (nest === 0) return j - 1; nest--; }
      else if (t.v === ',' || t.v === ';') return j - 1;
    } else if (t.t === 'name' && STATEMENT_WORDS.has(t.v) && t.line > toks[j - 1].line) return j - 1;
  }
  return toks.length - 1;
}

/** Where the condition before the '?' at q starts, for a readable detail line. */
function conditionStart(toks, q) {
  let depth = 0;
  for (let j = q - 1; j >= 0 && j >= q - 24; j--) {
    const t = toks[j];
    if (isClose(t)) { depth++; continue; }
    if (isOpen(t)) { if (depth === 0) return j + 1; depth--; continue; }
    if (depth === 0 && t.t === 'punc' && [',', ';', '=', ':', '=>', '?', '+=', '||=', '??='].includes(t.v)) return j + 1;
    if (depth === 0 && t.t === 'name' && (t.v === 'return' || t.v === 'case')) return j + 1;
  }
  return Math.max(0, q - 24);
}

/**
 * Every <sc-for list="{{ expr }}"> in the template, and every static <table>, <ul> or <ol>.
 * @param {string} template
 * @param {number} firstLine line number of the template's first character
 * @param {{ uses?: Map<string, number[]> }} [opts] uses: filled with every line each list expression is used on
 * @returns {{ expr: string, line: number }[]} line: the first use
 */
export function templateLists(template, firstLine = 1, opts = {}) {
  const lineOf = lineIndex(template);
  const out = [];
  const seen = opts.uses ?? new Map();
  const loop = /<sc-for\b[^>]*?\blist\s*=\s*"\{\{\s*([^"]*?)\s*\}\}"/g;
  for (const m of template.matchAll(loop)) {
    const expr = m[1].trim();
    const line = firstLine + lineOf(m.index) - 1;
    if (seen.has(expr)) { seen.get(expr).push(line); continue; }
    seen.set(expr, [line]);
    out.push({ expr, line });
  }
  const statics = /<(table|ul|ol)\b/gi;
  for (const m of template.matchAll(statics)) {
    out.push({ expr: `${m[1].toLowerCase()}@${firstLine + lineOf(m.index) - 1}`, line: firstLine + lineOf(m.index) - 1 });
  }
  return out;
}
