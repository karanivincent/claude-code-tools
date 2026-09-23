// Per-file analysis for the baseline (spec 5.1): what one component, API route or e2e spec says
// about the capabilities of a page. Pure: text in, facts out, each with a line number.

import { tokenize, callArgs, splitTop, stripCasts, literalValue, topLevelConsts, matchBracket, expressionEnd, NOT_LITERAL } from '../sidefx/tokenize.mjs';

const isP = (tk, v) => tk?.t === 'p' && tk.v === v;
const isId = (tk, v) => tk?.t === 'id' && (v === undefined || tk.v === v);

// ---------------------------------------------------------------------------------------------
// Values an expression can take, as far as the file says: string literals, ternaries, unions,
// const objects, useState variables and their setters. Unknown gives an empty list.

function declarations(tokens) {
  const decls = new Map();
  const states = new Map();
  const types = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (!isId(tk)) continue;
    if ((tk.v === 'const' || tk.v === 'let' || tk.v === 'var') && isId(tokens[i + 1])) {
      let k = i + 2;
      if (isP(tokens[k], ':')) k = skipTypeTo(tokens, k + 1, '=');
      if (!isP(tokens[k], '=')) continue;
      const end = expressionEnd(tokens, k + 1);
      if (!decls.has(tokens[i + 1].v)) decls.set(tokens[i + 1].v, []);
      decls.get(tokens[i + 1].v).push(tokens.slice(k + 1, end));
    } else if ((tk.v === 'const' || tk.v === 'let') && isP(tokens[i + 1], '[') && isId(tokens[i + 2]) && isP(tokens[i + 3], ',') && isId(tokens[i + 4]) && isP(tokens[i + 5], ']') && isP(tokens[i + 6], '=')) {
      const end = expressionEnd(tokens, i + 7);
      states.set(tokens[i + 2].v, { setter: tokens[i + 4].v, init: tokens.slice(i + 7, end) });
    } else if (tk.v === 'type' && isId(tokens[i + 1]) && (isP(tokens[i + 2], '=') || isP(tokens[i + 2], '<'))) {
      let k = i + 2;
      if (isP(tokens[k], '<')) { let d = 0; for (; k < tokens.length; k++) { if (isP(tokens[k], '<')) d++; else if (isP(tokens[k], '>')) { d--; if (d === 0) { k++; break; } } } }
      if (!isP(tokens[k], '=')) continue;
      const end = expressionEnd(tokens, k + 1);
      types.set(tokens[i + 1].v, tokens.slice(k + 1, end));
    }
  }
  return { decls, states, types };
}

function skipTypeTo(tokens, k, stop) {
  let d = 0;
  for (; k < tokens.length; k++) {
    const tk = tokens[k];
    if (tk.t !== 'p') continue;
    if (tk.v === '(' || tk.v === '[' || tk.v === '{' || tk.v === '<') d++;
    else if (tk.v === ')' || tk.v === ']' || tk.v === '}' || tk.v === '>') d--;
    else if (tk.v === stop && d <= 0) return k;
  }
  return k;
}

function makeValues(tokens) {
  const { decls, states, types } = declarations(tokens);
  const setterCalls = new Map();
  for (let i = 0; i < tokens.length - 2; i++) {
    if (isId(tokens[i]) && isP(tokens[i + 1], '(') && !isP(tokens[i - 1], '.')) {
      const { args } = callArgs(tokens, i + 1);
      if (!setterCalls.has(tokens[i].v)) setterCalls.set(tokens[i].v, []);
      if (args[0]) setterCalls.get(tokens[i].v).push(args[0]);
    }
  }
  const valuesOf = (slice, depth = 0) => {
    const s = stripCasts(slice);
    if (!s.length || depth > 4) return [];
    const lit = literalValue(s);
    if (typeof lit === 'string') return [lit];
    if (lit !== NOT_LITERAL) return [];
    // ternary: c ? a : b
    const q = topLevelIndex(s, '?');
    if (q > 0) {
      const c = topLevelIndex(s.slice(q + 1), ':');
      if (c >= 0) return uniq([...valuesOf(s.slice(q + 1, q + 1 + c), depth + 1), ...valuesOf(s.slice(q + 2 + c), depth + 1)]);
    }
    for (const op of ['??', '||', '|']) {
      const parts = splitTop(s, op);
      if (parts.length > 1) return uniq(parts.flatMap((p) => valuesOf(p, depth + 1)));
    }
    if (s.length === 1 && isId(s[0])) return valuesOfName(s[0].v, depth + 1);
    // OBJ[x] or OBJ.x over a const object literal: every string property value
    if (isId(s[0]) && (isP(s[1], '[') || isP(s[1], '.'))) {
      const init = decls.get(s[0].v)?.[0];
      if (init) {
        const obj = stripCasts(init);
        if (isP(obj[0], '{')) return uniq(objectProps(obj).flatMap((p) => (p.value ? valuesOf(p.value, depth + 1) : [])));
      }
    }
    return [];
  };
  const valuesOfName = (name, depth) => {
    if (depth > 4) return [];
    const out = [];
    for (const init of decls.get(name) ?? []) out.push(...valuesOf(init, depth));
    const st = states.get(name);
    if (st) {
      const call = st.init;
      const gen = call.findIndex((t) => isP(t, '<'));
      if (gen >= 0) {
        const close = call.findIndex((t, k) => k > gen && isP(t, '>'));
        if (close > gen) out.push(...valuesOf(call.slice(gen + 1, close), depth));
      }
      const open = call.findIndex((t) => isP(t, '('));
      if (open >= 0) { const { args } = callArgs(call, open); if (args[0]) out.push(...valuesOf(args[0], depth)); }
      for (const a of setterCalls.get(st.setter) ?? []) out.push(...valuesOf(a, depth));
    }
    const t = types.get(name);
    if (t) out.push(...valuesOf(t, depth));
    return uniq(out);
  };
  return { valuesOf, valuesOfName, decls };
}

function uniq(a) { return [...new Set(a)]; }

function topLevelIndex(slice, v) {
  let d = 0;
  for (let k = 0; k < slice.length; k++) {
    const tk = slice[k];
    if (tk.t !== 'p') continue;
    if (tk.v === '(' || tk.v === '[' || tk.v === '{') d++;
    else if (tk.v === ')' || tk.v === ']' || tk.v === '}') d--;
    else if (tk.v === v && d === 0) return k;
  }
  return -1;
}

/** Properties of an object literal slice `{ ... }`: { key, value (tokens) | null for shorthand, line }. */
export function objectProps(obj) {
  const s = stripCasts(obj);
  if (!isP(s[0], '{')) return [];
  const end = matchBracket(s, 0);
  const out = [];
  for (const part of splitTop(s.slice(1, end < 0 ? s.length : end), ',')) {
    if (!part.length) continue;
    const k = part[0];
    if (isP(k, '...')) continue;
    if ((k.t === 'id' || k.t === 'str') && isP(part[1], ':')) out.push({ key: k.v, value: part.slice(2), line: k.line });
    else if (k.t === 'id' && part.length === 1) out.push({ key: k.v, value: null, line: k.line });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Components and hooks.

/**
 * @param {string} path
 * @param {string} text
 * @param {{ discriminators: string[] }} cfg
 */
export function analyzeSource(path, text, cfg) {
  const tokens = tokenize(text, { jsx: /\.[jt]sx$/.test(path) });
  const consts = topLevelConsts(tokens);
  const { valuesOf, valuesOfName, decls } = makeValues(tokens);
  const disc = new Set(cfg.discriminators ?? []);

  // discriminator values anywhere in the file (object and type literals), for bodies built elsewhere
  const fileDisc = new Map();
  for (let i = 0; i < tokens.length - 2; i++) {
    const k = tokens[i];
    if (!((k.t === 'id' || k.t === 'str') && disc.has(k.v) && isP(tokens[i + 1], ':'))) continue;
    if (isP(tokens[i - 1], '?')) continue; // `a ? move : x` is not a property
    let e = i + 2;
    let d = 0;
    for (; e < tokens.length; e++) {
      const tk = tokens[e];
      if (tk.t === 'p') {
        if (tk.v === '(' || tk.v === '[' || tk.v === '{') d++;
        else if (tk.v === ')' || tk.v === ']' || tk.v === '}') { if (d === 0) break; d--; }
        else if ((tk.v === ',' || tk.v === ';') && d === 0) break;
      }
    }
    for (const v of valuesOf(tokens.slice(i + 2, e))) addTo(fileDisc, k.v, v, k.line);
  }

  const apiCalls = [];
  const copyKeys = [];
  const tabs = [];
  const props = new Map();
  const translators = new Map();

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    // translators: const t = useTranslations('ns') / await getTranslations({ namespace: 'ns' })
    if ((isId(tk, 'const') || isId(tk, 'let')) && isId(tokens[i + 1]) && isP(tokens[i + 2], '=')) {
      let k = i + 3;
      if (isId(tokens[k], 'await')) k++;
      if (isId(tokens[k]) && /^(useTranslations|getTranslations)$/.test(tokens[k].v) && isP(tokens[k + 1], '(')) {
        const { args } = callArgs(tokens, k + 1);
        let ns = '';
        if (args[0]) {
          const lit = literalValue(args[0]);
          if (typeof lit === 'string') ns = lit;
          else { const p = objectProps(args[0]).find((x) => x.key === 'namespace'); const v = p?.value ? literalValue(p.value) : null; if (typeof v === 'string') ns = v; }
        }
        translators.set(tokens[i + 1].v, ns);
      }
    }
    // fetch(url, init)
    if (isId(tk, 'fetch') && isP(tokens[i + 1], '(') && (!isP(tokens[i - 1], '.') || /^(window|globalThis|self)$/.test(tokens[i - 2]?.v ?? ''))) {
      const { args } = callArgs(tokens, i + 1);
      const call = fetchCall(args, { consts, decls, valuesOf, valuesOfName, disc, fileDisc });
      if (call) apiCalls.push({ ...call, line: tk.line });
    }
    // property accesses that are not method calls
    if ((isP(tk, '.') || isP(tk, '?.')) && isId(tokens[i + 1]) && !isP(tokens[i + 2], '(') && !isP(tokens[i + 2], '<')) {
      const prev = tokens[i - 1];
      if (prev && (prev.t === 'id' || isP(prev, ')') || isP(prev, ']') || isP(prev, '!'))) {
        const name = tokens[i + 1].v;
        if (!props.has(name)) props.set(name, []);
        props.get(name).push(tokens[i + 1].line);
      }
    }
    // tabs: <TabsTrigger value="x">, <TabsContent value="x">, `?tab=x`, get('tab') === 'x'
    if (tk.t === 'jsx' && !tk.close && /Tab/.test(tk.v)) {
      for (let k = i + 1; k < tokens.length && tokens[k].t !== 'jsx'; k++) {
        if (tokens[k].t === 'attr' && tokens[k].v === 'value' && tokens[k + 1]?.t === 'str') { tabs.push({ value: tokens[k + 1].v, line: tokens[k + 1].line }); break; }
      }
    }
    if ((tk.t === 'str' || tk.t === 'tpl') && /[?&]tab=([A-Za-z0-9_-]+)/.test(tk.t === 'str' ? tk.v : tk.quasis.join(''))) {
      for (const m of (tk.t === 'str' ? tk.v : tk.quasis.join('')).matchAll(/[?&]tab=([A-Za-z0-9_-]+)/g)) tabs.push({ value: m[1], line: tk.line });
    }
    if (isId(tk, 'get') && isP(tokens[i + 1], '(') && tokens[i + 2]?.t === 'str' && tokens[i + 2].v === 'tab' && isP(tokens[i + 3], ')')
      && (isP(tokens[i + 4], '===') || isP(tokens[i + 4], '!==') || isP(tokens[i + 4], '==')) && tokens[i + 5]?.t === 'str') {
      tabs.push({ value: tokens[i + 5].v, line: tokens[i + 5].line });
    }
  }

  // t('key'), t.rich('key'), ...
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (!isId(tk) || !translators.has(tk.v) || isP(tokens[i - 1], '.')) continue;
    let open = i + 1;
    if (isP(tokens[i + 1], '.') && isId(tokens[i + 2]) && /^(rich|markup|raw|has)$/.test(tokens[i + 2].v)) open = i + 3;
    if (!isP(tokens[open], '(')) continue;
    const { args } = callArgs(tokens, open);
    if (!args[0]) continue;
    const ns = translators.get(tk.v);
    for (const key of keysOf(args[0], valuesOf)) copyKeys.push({ key: ns ? `${ns}.${key}` : key, line: tk.line });
  }

  return { apiCalls, copyKeys, tabs, props };
}

function addTo(map, k, v, line) {
  if (!map.has(k)) map.set(k, new Map());
  if (!map.get(k).has(v)) map.get(k).set(v, line);
}

/** Message keys a t() argument can name; a dynamic tail becomes a `prefix*` wildcard. */
function keysOf(arg, valuesOf) {
  const s = stripCasts(arg);
  if (s.length === 1 && s[0].t === 'str') return [s[0].v];
  if (s.length === 1 && s[0].t === 'tpl') {
    const tpl = s[0];
    let combos = [tpl.quasis[0]];
    for (let k = 0; k < tpl.exprs.length; k++) {
      const vals = valuesOf(tpl.exprs[k]);
      if (!vals.length || combos.length * vals.length > 24) return [`${tpl.quasis.slice(0, k + 1).join('*').replace(/\*+$/, '')}*`];
      combos = combos.flatMap((c) => vals.map((v) => `${c}${v}${tpl.quasis[k + 1]}`));
    }
    return combos;
  }
  const vals = valuesOf(s);
  return vals;
}

/** A fetch call's method, URL pattern and discriminator values, or null when the URL is unknown. */
function fetchCall(args, env) {
  if (!args[0]) return null;
  const url = urlPattern(args[0], env);
  if (!url || !url.path.startsWith('/')) return null;
  let method = 'GET';
  const discriminators = new Map();
  for (const [k, vals] of url.query) if (env.disc.has(k)) for (const v of vals) addTo(discriminators, k, v, null);
  let init = args[1] ? stripCasts(args[1]) : null;
  if (init && init.length === 1 && isId(init[0])) init = env.decls.get(init[0].v)?.[0] ?? null;
  let bodyKnown = false;
  if (init && isP(stripCasts(init)[0], '{')) {
    const props = objectProps(init);
    const m = props.find((p) => p.key === 'method');
    if (m?.value) { const v = env.valuesOf(m.value)[0]; if (v) method = v.toUpperCase(); }
    const body = props.find((p) => p.key === 'body');
    if (body?.value) {
      const b = stripCasts(body.value);
      // JSON.stringify({ ... })
      if (isId(b[0], 'JSON') && isP(b[1], '.') && isId(b[2], 'stringify') && isP(b[3], '(')) {
        const { args: sa } = callArgs(b, 3);
        const payload = sa[0] ? stripCasts(sa[0]) : [];
        if (isP(payload[0], '{')) {
          bodyKnown = true;
          for (const p of objectProps(payload)) {
            if (!env.disc.has(p.key)) continue;
            const vals = p.value ? env.valuesOf(p.value) : env.valuesOfName(p.key, 0);
            for (const v of vals) addTo(discriminators, p.key, v, p.line);
          }
        }
      }
    }
  }
  if (!bodyKnown && method !== 'GET') {
    for (const [k, vals] of env.fileDisc) for (const [v, line] of vals) addTo(discriminators, k, v, line);
  }
  return { method, url: url.path, discriminators };
}

function urlPattern(arg, env) {
  let s = stripCasts(arg);
  if (s.length === 1 && isId(s[0])) {
    const c = env.consts.get(s[0].v);
    if (typeof c === 'string') s = [{ t: 'str', v: c }];
    else s = env.decls.get(s[0].v)?.[0] ? stripCasts(env.decls.get(s[0].v)[0]) : s;
  }
  let raw;
  const exprAt = [];
  if (s.length === 1 && s[0].t === 'str') raw = s[0].v;
  else if (s.length === 1 && s[0].t === 'tpl') {
    raw = '';
    s[0].quasis.forEach((q, k) => {
      raw += q;
      if (k < s[0].exprs.length) { exprAt.push({ at: raw.length, expr: s[0].exprs[k] }); raw += '\u0000'; }
    });
  } else return null;
  raw = raw.replace(/^\u0000(?=\/)/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.split('/').map((seg) => (seg.includes('\u0000') ? '[*]' : seg)).join('/').replace(/\/+$/, '');
  const query = new Map();
  let offset = pathPart.length + 1;
  for (const pair of queryPart.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (!k) { offset += pair.length + 1; continue; }
    if (v === '\u0000') {
      const e = exprAt.find((x) => x.at === offset + k.length + 1);
      query.set(k, e ? env.valuesOf(e.expr) : []);
    } else if (!v.includes('\u0000')) query.set(k, [decodeURIComponent(v)]);
    offset += pair.length + 1;
  }
  return { path, query };
}

// ---------------------------------------------------------------------------------------------
// API routes: the columns their selects read.

/** @returns {{ selects: { table: string, columns: string[], line: number }[] }} */
export function analyzeApiRoute(path, text) {
  const tokens = tokenize(text, { jsx: /\.[jt]sx$/.test(path) });
  const consts = topLevelConsts(tokens);
  const { decls } = makeValues(tokens);
  const selects = [];
  for (let i = 1; i < tokens.length; i++) {
    if (!isId(tokens[i], 'from') || !isP(tokens[i - 1], '.') || !isP(tokens[i + 1], '(')) continue;
    const { args, end } = callArgs(tokens, i + 1);
    const table = args[0] ? literalValue(args[0], consts) : null;
    if (typeof table !== 'string') continue;
    let k = end + 1;
    while (isP(tokens[k], '.') && isId(tokens[k + 1]) && isP(tokens[k + 2], '(')) {
      const call = callArgs(tokens, k + 2);
      if (tokens[k + 1].v === 'select' && call.args[0]) {
        const str = stringOf(call.args[0], consts, decls);
        if (str !== null) {
          for (const sel of parseSelect(str, table)) selects.push({ ...sel, line: tokens[k + 1].line });
        }
      }
      k = call.end + 1;
    }
  }
  return { selects };
}

function stringOf(slice, consts, decls, depth = 0) {
  const s = stripCasts(slice);
  if (depth > 3) return null;
  const parts = splitTop(s, '+');
  if (parts.length > 1) {
    const strs = parts.map((p) => stringOf(p, consts, decls, depth + 1));
    return strs.every((x) => x !== null) ? strs.join('') : null;
  }
  const lit = literalValue(s, consts);
  if (typeof lit === 'string') return lit;
  if (s.length === 1 && isId(s[0]) && decls.get(s[0].v)?.[0]) return stringOf(decls.get(s[0].v)[0], consts, decls, depth + 1);
  return null;
}

/** PostgREST select syntax to (table, columns) pairs; embedded resources become their own table. */
export function parseSelect(str, table) {
  const out = new Map([[table, new Set()]]);
  const walk = (s, t) => {
    let depth = 0;
    let cur = '';
    const items = [];
    for (const c of s) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) { items.push(cur); cur = ''; continue; }
      cur += c;
    }
    items.push(cur);
    for (let item of items) {
      item = item.trim();
      if (!item || item === '*') continue;
      const paren = item.indexOf('(');
      if (paren > 0 && item.endsWith(')')) {
        let rel = item.slice(0, paren).trim();
        if (rel.includes(':')) rel = rel.split(':').pop();
        rel = rel.split('!')[0].trim();
        if (!out.has(rel)) out.set(rel, new Set());
        walk(item.slice(paren + 1, -1), rel);
        continue;
      }
      let col = item.includes(':') ? item.split(':').pop() : item;
      col = col.split('::')[0].split('->')[0].trim();
      if (/^[A-Za-z_][\w]*$/.test(col)) out.get(t).add(col);
    }
  };
  walk(str, table);
  return [...out].filter(([, cols]) => cols.size).map(([t, cols]) => ({ table: t, columns: [...cols] }));
}

// ---------------------------------------------------------------------------------------------
// e2e specs: each test's title, the URLs it visits, and what it asserts.

const NOT_TESTS = new Set(['describe', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'use', 'extend', 'step', 'info', 'setTimeout', 'slow', 'configure']);

/**
 * @returns {{ tests: { title: string, line: number, endLine: number, visits: string[], assertions: string[] }[], hookVisits: string[] }}
 */
export function analyzeE2e(path, text) {
  const tokens = tokenize(text, { jsx: /\.[jt]sx$/.test(path) });
  const consts = topLevelConsts(tokens);
  const { decls, valuesOf } = makeValues(tokens);
  const env = { consts, decls, valuesOf };
  const tests = [];
  const hookVisits = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (!(isId(tk, 'test') || isId(tk, 'it')) || isP(tokens[i - 1], '.')) continue;
    let open = i + 1;
    let modifier = null;
    if (isP(tokens[i + 1], '.') && isId(tokens[i + 2])) { modifier = tokens[i + 2].v; open = i + 3; }
    if (!isP(tokens[open], '(')) continue;
    const { args, end } = callArgs(tokens, open);
    if (end < 0) continue;
    const body = tokens.slice(open + 1, end);
    if (modifier === 'beforeEach' || modifier === 'beforeAll') { hookVisits.push(...visitsIn(body, env)); continue; }
    if (modifier && NOT_TESTS.has(modifier)) continue;
    if (!args[0] || args.length < 2) continue;
    const title = literalValue(args[0]);
    if (typeof title !== 'string') continue;
    tests.push({ title, line: tk.line, endLine: tokens[end].line, visits: visitsIn(body, env), assertions: assertionsIn(body, env) });
  }
  return { tests, hookVisits };
}

function visitsIn(body, env) {
  const out = [];
  for (let i = 1; i < body.length; i++) {
    if (!isId(body[i], 'goto') || !isP(body[i - 1], '.') || !isP(body[i + 1], '(')) continue;
    const { args } = callArgs(body, i + 1);
    if (!args[0]) continue;
    const u = urlPattern(args[0], env);
    if (u) out.push(u.path);
  }
  return out;
}

const TEXT_CALLS = new Set(['getByText', 'getByLabel', 'getByPlaceholder', 'getByTitle', 'getByAltText', 'toHaveText', 'toContainText', 'toHaveValue']);
const OBJECT_MATCHERS = new Set(['toMatchObject', 'toEqual', 'toStrictEqual']);

function assertionsIn(body, env) {
  const out = new Set();
  for (let i = 0; i < body.length; i++) {
    const tk = body[i];
    if (!isId(tk) || !isP(body[i + 1], '(')) continue;
    const { args } = callArgs(body, i + 1);
    const first = args[0] ? stripCasts(args[0]) : [];
    const lit = first.length ? literalValue(first) : NOT_LITERAL;
    if (tk.v === 'getByTestId') {
      if (typeof lit === 'string') out.add(`testid:${lit}`);
      else if (first[0]?.t === 're') out.add(`testid:${first[0].v}`);
    } else if (tk.v === 'getByRole' && args[1]) {
      const name = objectProps(args[1]).find((p) => p.key === 'name');
      const v = name?.value ? stripCasts(name.value) : null;
      if (v?.length === 1 && v[0].t === 'str') out.add(`text:${v[0].v}`);
      else if (v?.length === 1 && v[0].t === 're') out.add(`text:${v[0].v}`);
    } else if (TEXT_CALLS.has(tk.v)) {
      if (typeof lit === 'string') out.add(`text:${lit}`);
      else if (first[0]?.t === 're') out.add(`text:${first[0].v}`);
    } else if (tk.v === 'locator' && typeof lit === 'string') {
      for (const m of lit.matchAll(/data-testid\s*[*^$~|]?=\s*["']?([^"'\]]+)/g)) out.add(`testid:${m[1]}`);
    } else if (OBJECT_MATCHERS.has(tk.v) && first.length && isP(first[0], '{')) {
      for (const p of objectProps(first)) {
        if (!p.value) continue;
        const v = literalValue(p.value);
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out.add(`value:${p.key}=${v}`);
      }
    }
  }
  return [...out].sort();
}
