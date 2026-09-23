// A small ICU MessageFormat parser for the message-file lint (M8). It follows the rules the
// common JavaScript runtime (intl-messageformat) applies: an apostrophe opens quoted literal text
// only right before { } < > (and # inside a plural branch), '' is one apostrophe, <tag>...</tag>
// is rich text, and a plural, selectordinal or select needs an "other" branch.

export class IcuSyntaxError extends Error {
  /** @param {string} message @param {number} offset */
  constructor(message, offset) {
    super(`${message} (at character ${offset})`);
    this.name = 'IcuSyntaxError';
    this.offset = offset;
  }
}

/**
 * @typedef {{ type: 'literal', value: string }
 *   | { type: 'argument', name: string, argType: string|null, style: string|null }
 *   | { type: 'plural'|'selectordinal'|'select', name: string, offset: number, options: { selector: string, value: IcuNode[] }[] }
 *   | { type: 'pound' }
 *   | { type: 'tag', name: string, children: IcuNode[] }} IcuNode
 */

const BRANCHING = new Set(['plural', 'selectordinal', 'select']);

/** What icuLiteralText puts where an argument was: spaces around a sign that is not a letter. */
export const ARG_MARK = ' ∅ ';

/**
 * @param {string} message
 * @returns {IcuNode[]}
 * @throws {IcuSyntaxError}
 */
export function parseIcu(message) {
  const s = String(message);
  let i = 0;

  const isWs = (c) => c !== undefined && /\s/.test(c);
  const skipWs = () => { while (isWs(s[i])) i++; };
  const isAlpha = (c) => c !== undefined && /[A-Za-z]/.test(c);

  // parentType: the kind of branching argument we are inside (for # and the '# quote), or null.
  function nodes(parentType, closeOn) {
    const out = [];
    let lit = '';
    const flush = () => { if (lit) { out.push({ type: 'literal', value: lit }); lit = ''; } };
    const inPlural = parentType === 'plural' || parentType === 'selectordinal';
    while (i < s.length) {
      const c = s[i];
      if (c === "'") {
        const n = s[i + 1];
        if (n === "'") { lit += "'"; i += 2; continue; }
        if (n === '{' || n === '}' || n === '<' || n === '>' || (n === '#' && inPlural)) {
          i += 1;
          lit += s[i];
          i += 1;
          while (i < s.length) {
            if (s[i] === "'") {
              if (s[i + 1] === "'") { lit += "'"; i += 2; continue; }
              i += 1;
              break;
            }
            lit += s[i];
            i += 1;
          }
          continue;
        }
        lit += c;
        i += 1;
        continue;
      }
      if (c === '{') { flush(); i += 1; out.push(argument()); continue; }
      if (c === '}') {
        if (closeOn === '}') { flush(); return out; }
        throw new IcuSyntaxError('unmatched }', i);
      }
      if (c === '#' && inPlural) { flush(); out.push({ type: 'pound' }); i += 1; continue; }
      if (c === '<' && s[i + 1] === '/') {
        if (typeof closeOn === 'object' && closeOn?.tag) { flush(); return out; }
        throw new IcuSyntaxError('closing tag with no opening tag', i);
      }
      if (c === '<' && isAlpha(s[i + 1])) { flush(); out.push(tag(parentType)); continue; }
      lit += c;
      i += 1;
    }
    if (closeOn === '}') throw new IcuSyntaxError('unterminated branch or argument', i);
    if (typeof closeOn === 'object' && closeOn?.tag) throw new IcuSyntaxError(`unclosed tag <${closeOn.tag}>`, i);
    flush();
    return out;
  }

  function tag(parentType) {
    const start = i;
    i += 1; // <
    let name = '';
    while (i < s.length && /[A-Za-z0-9_-]/.test(s[i])) name += s[i++];
    skipWs();
    if (s[i] === '/' && s[i + 1] === '>') { i += 2; return { type: 'tag', name, children: [] }; }
    if (s[i] !== '>') throw new IcuSyntaxError(`malformed tag <${name}`, start);
    i += 1;
    const children = nodes(parentType, { tag: name });
    // at "</"
    i += 2;
    let close = '';
    while (i < s.length && /[A-Za-z0-9_-]/.test(s[i])) close += s[i++];
    skipWs();
    if (close !== name || s[i] !== '>') throw new IcuSyntaxError(`<${name}> closed by </${close}>`, i);
    i += 1;
    return { type: 'tag', name, children };
  }

  function word() {
    skipWs();
    let w = '';
    while (i < s.length && !/[\s,{}#<>]/.test(s[i])) w += s[i++];
    skipWs();
    return w;
  }

  function argument() {
    const start = i - 1;
    const name = word();
    if (!name) throw new IcuSyntaxError('empty argument name', start);
    if (s[i] === '}') { i += 1; return { type: 'argument', name, argType: null, style: null }; }
    if (s[i] !== ',') throw new IcuSyntaxError(`expected "," or "}" after argument "${name}"`, i);
    i += 1;
    const argType = word();
    if (!argType) throw new IcuSyntaxError(`argument "${name}" has an empty type`, i);
    if (s[i] === '}') {
      if (BRANCHING.has(argType)) throw new IcuSyntaxError(`${argType} argument "${name}" has no branches`, i);
      i += 1;
      return { type: 'argument', name, argType, style: null };
    }
    if (s[i] !== ',') throw new IcuSyntaxError(`expected "," or "}" after type "${argType}"`, i);
    i += 1;
    if (!BRANCHING.has(argType)) {
      // number, date, time with a style or skeleton: everything up to the matching brace
      let depth = 1;
      let style = '';
      while (i < s.length) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth === 0) break; }
        style += s[i++];
      }
      if (s[i] !== '}') throw new IcuSyntaxError(`unterminated argument "${name}"`, start);
      i += 1;
      return { type: 'argument', name, argType, style: style.trim() };
    }
    let offset = 0;
    const options = [];
    const seen = new Set();
    for (;;) {
      skipWs();
      if (s[i] === '}') { i += 1; break; }
      if (i >= s.length) throw new IcuSyntaxError(`unterminated ${argType} argument "${name}"`, start);
      const selector = word();
      if (!selector) throw new IcuSyntaxError(`expected a selector in "${name}"`, i);
      if (selector.startsWith('offset:')) {
        if (argType === 'select') throw new IcuSyntaxError('offset is only valid in a plural', i);
        offset = Number(selector.slice(7) || word());
        continue;
      }
      if (s[i] !== '{') throw new IcuSyntaxError(`expected "{" after selector "${selector}"`, i);
      if (seen.has(selector)) throw new IcuSyntaxError(`duplicate selector "${selector}" in "${name}"`, i);
      seen.add(selector);
      i += 1;
      const value = nodes(argType, '}');
      i += 1; // the branch's }
      options.push({ selector, value });
    }
    if (!seen.has('other')) throw new IcuSyntaxError(`${argType} argument "${name}" has no "other" branch`, start);
    return { type: argType, name, offset, options };
  }

  const out = nodes(null, null);
  return out;
}

/**
 * Every argument in a parsed message, with where it sits.
 * inPlural: inside a plural or selectordinal branch; inSelect: inside a select branch.
 * @param {IcuNode[]} ast
 * @returns {{ name: string, type: string, inPlural: boolean, inSelect: boolean }[]}
 */
export function icuArguments(ast) {
  const out = [];
  const walk = (list, inPlural, inSelect) => {
    for (const n of list) {
      if (n.type === 'argument') out.push({ name: n.name, type: n.argType ?? 'simple', inPlural, inSelect });
      else if (BRANCHING.has(n.type)) {
        out.push({ name: n.name, type: n.type, inPlural, inSelect });
        const plural = n.type !== 'select';
        for (const o of n.options) walk(o.value, inPlural || plural, inSelect || !plural);
      } else if (n.type === 'tag') walk(n.children, inPlural, inSelect);
    }
  };
  walk(ast, false, false);
  return out;
}

/** Whether a parsed message holds a plural or selectordinal anywhere. */
export function hasPlural(ast) {
  return icuArguments(ast).some((a) => a.type === 'plural' || a.type === 'selectordinal');
}

/**
 * The words a reader can see, from every branch, with each argument replaced by a space-padded
 * ARG_MARK so text on either side of it never joins into one word.
 * @param {IcuNode[]} ast
 */
export function icuLiteralText(ast) {
  const parts = [];
  const walk = (list) => {
    for (const n of list) {
      if (n.type === 'literal') parts.push(n.value);
      else if (n.type === 'tag') walk(n.children);
      else if (BRANCHING.has(n.type)) { parts.push(ARG_MARK); for (const o of n.options) { walk(o.value); parts.push(ARG_MARK); } }
      else parts.push(ARG_MARK);
    }
  };
  walk(ast);
  return parts.join('');
}

/**
 * [dotted.key, value] for every leaf of a message object, in document order.
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {[string, unknown][]}
 */
export function flattenMessages(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenMessages(v, key));
    else out.push([key, v]);
  }
  return out;
}
