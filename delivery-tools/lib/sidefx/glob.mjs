// Path globs as the profile and the safety file write them: `**` spans directories, `*` and `?`
// stay inside one segment, `[...]` is a character class (so `[[]locale]` is the literal
// segment `[locale]`), `{a,b}` is alternation. Paths are repo-relative with forward slashes.

const cache = new Map();

/** @param {string} glob @returns {RegExp} */
export function globToRegExp(glob) {
  let re = cache.get(glob);
  if (!re) { re = new RegExp(`^${translate(String(glob))}$`); cache.set(glob, re); }
  return re;
}

function translate(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const segStart = i === 0 || glob[i - 1] === '/';
        const segEnd = i + 2 === glob.length || glob[i + 2] === '/';
        if (segStart && segEnd) {
          if (glob[i + 2] === '/') { out += '(?:[^/]*/)*'; i += 2; } else { out += '.*'; i += 1; }
          continue;
        }
        out += '[^/]*';
        i += 1;
        continue;
      }
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '[') {
      const end = classEnd(glob, i);
      if (end < 0) { out += '\\['; continue; }
      let body = glob.slice(i + 1, end);
      let neg = false;
      if (body[0] === '!' || body[0] === '^') { neg = true; body = body.slice(1); }
      out += `[${neg ? '^' : ''}${body.replace(/[\\\]\[^]/g, (m) => `\\${m}`)}]`;
      i = end;
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) { out += '\\{'; continue; }
      out += `(?:${glob.slice(i + 1, end).split(',').map(translate).join('|')})`;
      i = end;
    } else {
      out += c.replace(/[.+^${}()|\\]/g, (m) => `\\${m}`);
    }
  }
  return out;
}

function classEnd(glob, start) {
  let j = start + 1;
  if (glob[j] === '!' || glob[j] === '^') j++;
  if (glob[j] === ']') j++;
  while (j < glob.length && glob[j] !== ']') j++;
  return j < glob.length ? j : -1;
}

/** @param {string} path @param {string[]} globs */
export function matchesAny(path, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(path));
}

/**
 * The literal directory prefix of a glob, with single-character classes unescaped:
 * `apps/web/src/app/[[]locale]/**\/page.tsx` gives `apps/web/src/app/[locale]/`.
 * @param {string} glob
 */
export function globLiteralPrefix(glob) {
  const segs = String(glob).split('/');
  const out = [];
  for (const seg of segs.slice(0, -1)) {
    const lit = literalSegment(seg);
    if (lit === null) break;
    out.push(lit);
  }
  return out.length ? `${out.join('/')}/` : '';
}

function literalSegment(seg) {
  let out = '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '*' || c === '?' || c === '{') return null;
    if (c === '[') {
      const end = classEnd(seg, i);
      if (end < 0) { out += c; continue; }
      const body = seg.slice(i + 1, end);
      if (body.length !== 1 || body === '!' || body === '^') return null;
      out += body;
      i = end;
    } else out += c;
  }
  return out;
}
