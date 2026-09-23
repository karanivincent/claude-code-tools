// Which screens of a Claude Design prototype each candidate belongs to.
//
// An export is the whole design project, not the feature: one prototype holds every screen, a
// state key (`screen`) picks the one shown, <sc-if> blocks in the template show one screen's
// markup, and the logic script computes the values those blocks read. A run builds only its
// in-scope screens, so a candidate that provably belongs to other screens is excluded by the
// assembler and no extractor spends time on it.
//
// Everything here errs one way. A site it cannot attribute makes the candidate untagged, and an
// untagged candidate is judged by an extractor exactly as before. Wrongly tagging a candidate
// would exclude a state the run was asked to build; wrongly leaving one untagged costs one
// extractor's glance. So every reference counts, a name that could be two things counts as both,
// and any site that could render on a screen the analysis cannot name makes the answer "unknown".

import { tokenize, isOpen, isClose, matchBracket } from './js-tokens.mjs';
import { lineIndex } from './claude-dc.mjs';

/** State keys a prototype uses to pick its screen, in the order they are tried. */
export const SCREEN_KEYS = ['screen', 'page', 'view', 'route'];

/**
 * The prototype's screen key and every value it is set to, or null when it has no screens.
 * @param {{ entries: { key: string, literals: unknown[] }[] }[]} writes from stateWrites
 * @returns {{ key: string, values: string[] } | null}
 */
export function screenKey(writes) {
  for (const key of SCREEN_KEYS) {
    const values = new Set();
    for (const w of writes) for (const e of w.entries) {
      if (e.key !== key) continue;
      for (const v of e.literals) if (typeof v === 'string' && v) values.add(v);
    }
    if (values.size >= 2) return { key, values: [...values].sort() };
  }
  return null;
}

const stripParens = (toks) => {
  while (toks.length >= 2 && toks[0].v === '(' && matchBracket(toks, 0) === toks.length - 1) toks = toks.slice(1, -1);
  return toks;
};

function splitTop(toks, op) {
  const out = [];
  let depth = 0, start = 0;
  for (let k = 0; k < toks.length; k++) {
    if (isOpen(toks[k])) depth++;
    else if (isClose(toks[k])) depth--;
    else if (depth === 0 && toks[k].t === 'punc' && toks[k].v === op) { out.push(toks.slice(start, k)); start = k + 1; }
  }
  out.push(toks.slice(start));
  return out;
}

/** `screen === 'x'` (or `s.screen == 'x'`, or the literal first): the value, else null. */
function equality(toks, key) {
  toks = stripParens(toks);
  const at = toks.findIndex((t) => t.t === 'punc' && (t.v === '===' || t.v === '=='));
  if (at < 0) return null;
  const isKey = (side) => side.length > 0 && side[side.length - 1].t === 'name' && side[side.length - 1].v === key
    && side.every((t) => t.t === 'name' || t.v === '.' || t.v === '?.');
  const left = toks.slice(0, at), right = toks.slice(at + 1);
  if (isKey(left) && right.length === 1 && right[0].t === 'str') return right[0].v;
  if (isKey(right) && left.length === 1 && left[0].t === 'str') return left[0].v;
  return null;
}

/**
 * The screens on which a condition can be true, or null when it can be true on a screen it does
 * not name. `a === 'x' && more` allows x; `a === 'x' || a === 'y'` allows x and y; any disjunct
 * without a screen equality (`screen === 'x' || showAll`) makes it null.
 * @param {import('./js-tokens.mjs').Token[]} toks
 * @param {string} key
 * @returns {string[] | null}
 */
export function conditionScreens(toks, key) {
  const out = new Set();
  for (const d of splitTop(stripParens(toks), '||')) {
    let allowed = null;
    for (const c of splitTop(stripParens(d), '&&')) {
      const v = equality(c, key);
      if (v === null) continue;
      allowed = allowed === null ? new Set([v]) : new Set([...allowed].filter((x) => x === v));
    }
    if (allowed === null) return null;
    for (const v of allowed) out.add(v);
  }
  return out.size ? [...out].sort() : null;
}

/** Every token, template-literal expressions included, in source order. */
function flatten(toks, out = []) {
  for (const t of toks) {
    out.push(t);
    if (t.t === 'tmpl') for (const inner of t.inner ?? []) flatten(inner, out);
  }
  return out;
}

/** Index of the next token at depth 0 (from `from`) whose value is in `stops`, or toks.length. */
function nextTop(toks, from, stops) {
  let depth = 0;
  for (let k = from; k < toks.length; k++) {
    if (isOpen(toks[k])) depth++;
    else if (isClose(toks[k])) { if (depth === 0) return k; depth--; }
    else if (depth === 0 && toks[k].t === 'punc' && stops.includes(toks[k].v)) return k;
  }
  return toks.length;
}

const span = (toks, a, b) => ({ start: toks[a].start, end: toks[Math.max(a, b)].end });
const inside = (s, off) => s.start <= off && off < s.end;
const size = (s) => s.end - s.start;

/**
 * Read a prototype once and answer, for any template line or offset in the script, which screens
 * can show what is there.
 * @param {{ template: { text: string, line: number } | null, script: { text: string, line: number } | null }} parts
 * @param {{ key: string, values: string[] } | null} screen from screenKey
 */
export function screenMap(parts, screen) {
  const none = { key: null, values: [], templateLine: () => null, scriptOffsets: () => null, propSites: () => [] };
  if (!screen || !parts.script) return none;
  const key = screen.key;
  const src = parts.script.text;
  const toks = tokenize(src, { line: parts.script.line });
  const all = flatten(toks);

  // ---- the script's regions -------------------------------------------------------------------
  /** @type {{ kind: string, name?: string, start: number, end: number, screens?: string[] }[]} */
  const regions = [];
  let renderBody = null;

  // the component class's members, wherever the class sits
  const cls = toks.findIndex((t) => t.t === 'name' && t.v === 'class');
  if (cls >= 0) {
    const open = toks.findIndex((x, j) => j > cls && x.v === '{');
    if (open > 0) members(toks, open + 1, matchBracket(toks, open), regions);
  }
  // top-level declarations: const DATA = ..., function fmt(...) {...}
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'name' && (t.v === 'const' || t.v === 'let' || t.v === 'var') && toks[k + 1]?.t === 'name') {
      const end = nextTop(toks, k + 1, [';']);
      declarators(toks, k + 1, Math.min(end, toks.length), 'const', regions);
      k = end;
      continue;
    }
    if (t.t === 'name' && t.v === 'function' && toks[k + 1]?.t === 'name' && toks[k + 2]?.v === '(') {
      const pclose = matchBracket(toks, k + 2);
      if (toks[pclose + 1]?.v === '{') {
        const bclose = matchBracket(toks, pclose + 1);
        regions.push({ kind: 'const', name: toks[k + 1].v, ...span(toks, k, bclose) });
        k = bclose;
        continue;
      }
    }
    if (isOpen(t)) k = matchBracket(toks, k);
  }
  const render = regions.find((r) => r.kind === 'method' && r.name === 'renderVals');
  if (render) renderBody = render.body;

  // inside renderVals: its locals and the entries of the object it returns
  const entries = new Map(); // template name -> [span]
  if (renderBody) {
    const [a, b] = renderBody;
    for (let k = a; k < b; k++) {
      const t = toks[k];
      if (isOpen(t)) { k = matchBracket(toks, k); continue; }
      if (t.t === 'name' && (t.v === 'const' || t.v === 'let' || t.v === 'var') && toks[k + 1]?.t === 'name') {
        const end = nextTop(toks, k + 1, [';']);
        declarators(toks, k + 1, Math.min(end, b), 'local', regions);
        k = end;
        continue;
      }
      if (t.t === 'name' && t.v === 'return' && toks[k + 1]?.v === '{') {
        const close = matchBracket(toks, k + 1);
        let s = k + 2;
        while (s < close) {
          const e = nextTop(toks, s, [',']);
          const end = Math.min(e, close);
          if (end > s && toks[s].t === 'name') {
            const r = { kind: 'entry', name: toks[s].v, ...span(toks, s, end - 1) };
            regions.push(r);
            if (!entries.has(r.name)) entries.set(r.name, []);
            entries.get(r.name).push(r);
          }
          s = end + 1;
        }
        k = close;
      }
    }
  }

  // `if (screen === 'x') { ... }` anywhere in the script: that block shows only on x
  for (let k = 0; k < toks.length; k++) {
    if (!(toks[k].t === 'name' && toks[k].v === 'if' && toks[k + 1]?.v === '(')) continue;
    const cclose = matchBracket(toks, k + 1);
    if (toks[cclose + 1]?.v !== '{') continue;
    const screens = conditionScreens(toks.slice(k + 2, cclose), key);
    if (!screens) continue;
    const bclose = matchBracket(toks, cclose + 1);
    regions.push({ kind: 'if', screens, ...span(toks, cclose + 1, bclose) });
  }

  // ---- the template: which screens each line can show, and where each name is used ------------
  const blocks = [];
  const uses = new Map(); // name -> [template line]
  if (parts.template) {
    const t = parts.template;
    const lineOf = lineIndex(t.text);
    const at = (i) => t.line + lineOf(i) - 1;
    const stack = [];
    for (const m of t.text.matchAll(/<sc-if\b([^>]*)>|<\/sc-if\s*>/g)) {
      if (m[0].startsWith('</')) {
        const b = stack.pop();
        if (b) { b.to = at(m.index); blocks.push(b); }
        continue;
      }
      const v = /\bvalue\s*=\s*"\{\{([\s\S]*?)\}\}"/.exec(m[1]);
      stack.push({ from: at(m.index), to: Infinity, screens: v ? templateCondition(v[1]) : null });
    }
    for (const b of stack) blocks.push(b);
    for (const m of t.text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      const line = at(m.index);
      const names = flatten(tokenize(m[1]));
      for (let i = 0; i < names.length; i++) {
        const n = names[i];
        // `{{ x.label }}`: label is a property of x, not the render value named label
        if (n.t !== 'name' || names[i - 1]?.v === '.' || names[i - 1]?.v === '?.') continue;
        if (!uses.has(n.v)) uses.set(n.v, []);
        uses.get(n.v).push(line);
      }
    }
  }

  function templateCondition(expr) {
    const et = tokenize(expr);
    const direct = conditionScreens(et, key);
    if (direct) return direct;
    // {{ onCalls }}: a name the render values define as a screen condition
    if (et.length === 1 && et[0].t === 'name' && entries.has(et[0].v)) {
      const defs = entries.get(et[0].v);
      if (defs.length !== 1) return null;
      const d = defs[0];
      const body = toks.filter((x) => x.start >= d.start && x.end <= d.end);
      const colon = body.findIndex((x) => x.v === ':');
      return colon < 0 ? null : conditionScreens(body.slice(colon + 1), key);
    }
    return null;
  }

  function templateLine(line) {
    let allowed = null;
    for (const b of blocks) {
      if (!(b.from <= line && line <= b.to) || !b.screens) continue;
      allowed = allowed === null ? new Set(b.screens) : new Set([...allowed].filter((x) => b.screens.includes(x)));
    }
    return allowed === null || allowed.size === 0 ? null : [...allowed].sort();
  }

  // ---- attribution ------------------------------------------------------------------------------
  const memo = new Map();
  const BUSY = Symbol('busy');

  /** Screens that can show what a name (a template entry, a local, a method, a constant) produces. */
  function nameScreens(region) {
    const id = `${region.kind}:${region.name}:${region.start}`;
    if (memo.has(id)) return memo.get(id) === BUSY ? [] : memo.get(id);
    memo.set(id, BUSY);
    let result;
    if (region.kind === 'entry') {
      const lines = uses.get(region.name) ?? [];
      result = lines.length ? union(lines.map(templateLine)) : null;
    } else {
      const refs = references(region);
      // a template that names a method directly shows it wherever that name is used
      const direct = region.kind === 'method' && !entries.has(region.name) ? (uses.get(region.name) ?? []).map(templateLine) : [];
      result = refs.length || direct.length ? union([...refs.map((off) => offset(off)), ...direct]) : null;
    }
    if (Array.isArray(result) && result.length === 0) result = null;
    memo.set(id, result);
    return result;
  }

  function references(region) {
    const out = [];
    for (let k = 0; k < all.length; k++) {
      const t = all[k];
      if (t.t !== 'name' || t.v !== region.name || inside(region, t.start)) continue;
      const dotted = all[k - 1]?.v === '.' || all[k - 1]?.v === '?.';
      if (region.kind === 'method' ? !dotted : dotted) continue;
      if (region.kind === 'local' && !(renderBody && inRender(t.start))) continue;
      out.push(t.start);
    }
    return out;
  }

  const renderSpan = render ? { start: render.start, end: render.end } : null;
  const inRender = (off) => renderSpan && inside(renderSpan, off);

  /** Screens that can show what the code at a character offset of the script produces. */
  function offset(off) {
    const hits = regions.filter((r) => inside(r, off));
    const ifs = hits.filter((r) => r.kind === 'if');
    if (ifs.length) return ifs.map((r) => r.screens).reduce((a, b) => a.filter((x) => b.includes(x)));
    const smallest = (kind) => hits.filter((r) => r.kind === kind).sort((a, b) => size(a) - size(b))[0];
    for (const kind of ['entry', 'local']) {
      const r = smallest(kind);
      if (r) return nameScreens(r);
    }
    const m = smallest('method');
    if (m) return m.name === 'renderVals' ? null : nameScreens(m);
    const c = smallest('const');
    return c ? nameScreens(c) : null;
  }

  /** Every offset where `.name` is read: a prop or state value the prototype uses. */
  function propSites(name) {
    const out = [];
    for (let k = 1; k < all.length; k++) {
      if (all[k].t === 'name' && all[k].v === name && (all[k - 1].v === '.' || all[k - 1].v === '?.')) out.push(all[k].start);
      else if (all[k].t === 'str' && all[k].v === name && all[k - 1].v === '[') out.push(all[k].start);
    }
    return out;
  }

  return {
    key,
    values: screen.values,
    templateLine,
    scriptOffsets: (offsets) => (offsets.length ? union(offsets.map(offset)) : null),
    propSites,
  };
}

/** Union of screen sets; null (unknown) as soon as any of them is null. */
function union(sets) {
  const out = new Set();
  for (const s of sets) {
    if (s === null || s === undefined) return null;
    for (const v of s) out.add(v);
  }
  return [...out].sort();
}

/** `const a = 1, b = 2` from toks[a..end): one region per declarator. */
function declarators(toks, a, end, kind, regions) {
  let s = a;
  while (s < end) {
    const e = Math.min(nextTop(toks, s, [',']), end);
    if (toks[s]?.t === 'name' && e > s) regions.push({ kind, name: toks[s].v, ...span(toks, s, e - 1) });
    s = e + 1;
  }
}

/**
 * Where a class field's value ends: at a `;`, or, with no semicolon, where the next member starts
 * (a new line opening with `name(` or `name =` after a complete value).
 */
function fieldEnd(toks, from) {
  for (let k = from; k < toks.length; k++) {
    const t = toks[k];
    if (isOpen(t)) { k = matchBracket(toks, k); continue; }
    if (isClose(t) || (t.t === 'punc' && t.v === ';')) return k;
    const prev = toks[k - 1];
    const complete = prev && (isClose(prev) || ['name', 'str', 'num', 'tmpl', 'regex'].includes(prev.t));
    if (k > from && t.line > prev.line && complete && t.t === 'name' && (toks[k + 1]?.v === '(' || toks[k + 1]?.v === '=')) return k;
  }
  return toks.length;
}

/** A class body's members: methods (`name(...) {...}`) and fields (`name = ...`). */
function members(toks, a, b, regions) {
  let k = a;
  while (k < b) {
    const t = toks[k];
    if (t.t === 'name' && toks[k + 1]?.v === '(') {
      const pclose = matchBracket(toks, k + 1);
      if (toks[pclose + 1]?.v === '{') {
        const bclose = matchBracket(toks, pclose + 1);
        regions.push({ kind: 'method', name: t.v, body: [pclose + 2, bclose], ...span(toks, k, bclose) });
        k = bclose + 1;
        continue;
      }
    }
    if (t.t === 'name' && toks[k + 1]?.v === '=') {
      const end = Math.min(fieldEnd(toks, k + 2), b);
      regions.push({ kind: 'method', name: t.v, ...span(toks, k, Math.max(k, end - 1)) });
      // past the `;`, or onto the next member when the field had none
      k = toks[end]?.v === ';' ? end + 1 : end;
      continue;
    }
    if (isOpen(t)) { k = matchBracket(toks, k) + 1; continue; }
    k++;
  }
}
