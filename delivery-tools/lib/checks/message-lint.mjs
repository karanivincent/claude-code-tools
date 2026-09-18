// Message-file lint (M8), pure. For every key the plan names, in every locale: the key exists and
// parses; every count placeholder sits inside an ICU plural; a key the plan marks plural has one;
// no banned word; a translation identical to the primary locale is P3 unless allowlisted. Keys a
// translation has that the primary locale lacks, under the same namespaces, are P3.

import { parseIcu, icuArguments, hasPlural, icuLiteralText, flattenMessages, ARG_MARK } from './icu.mjs';

/** Severity by rule (spec 8.1 M8; banned words as in M7). */
export const M8_RULES = Object.freeze({
  'missing-key': 'P1',
  'invalid-icu': 'P1',
  'count-outside-plural': 'P1',
  'plural-missing': 'P1',
  'banned-word': 'P1',
  'identical-to-primary': 'P3',
  'extra-key': 'P3',
});

/**
 * Whether an argument name is a count. "count" and "n" by convention, and camelCase or snake_case
 * names ending in count ("callCount", "call_count").
 * @param {string} name
 */
export function isCountName(name) {
  return name === 'count' || name === 'n' || /[a-z0-9]Count$/.test(name) || /_count$/.test(name);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wordRe(words) {
  const alts = (words ?? []).filter((w) => typeof w === 'string' && w.trim()).map((w) => {
    const t = w.trim();
    return t.endsWith('*') ? `${escapeRe(t.slice(0, -1))}[\\p{L}\\p{N}]*` : escapeRe(t);
  });
  return alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
}

/**
 * @typedef {{ locale: string, file: string, messages: object }} LocaleMessages
 * @typedef {{ rule: keyof typeof M8_RULES, severity: string, locale: string, file: string, key: string,
 *             placeholder?: string, value: string|null, detail: string, primaryValue?: string|null }} MessageHit
 */

/**
 * @param {{
 *   locales: LocaleMessages[], primary: string, keys: string[], pluralKeys?: Iterable<string>,
 *   bannedWords?: Record<string, string[]>, sameAsPrimaryOk?: string[],
 * }} input
 * @returns {MessageHit[]}
 */
export function lintMessages(input) {
  const { locales, primary } = input;
  const keys = [...new Set(input.keys)];
  const pluralKeys = new Set(input.pluralKeys ?? []);
  const flat = new Map(locales.map((l) => [l.locale, new Map(flattenMessages(l.messages))]));
  const primaryFlat = flat.get(primary) ?? new Map();
  const allowed = (input.sameAsPrimaryOk ?? []).map((s) => s.toLowerCase());
  const hits = [];

  for (const l of locales) {
    const values = flat.get(l.locale);
    const banned = wordRe(input.bannedWords?.[l.locale] ?? input.bannedWords?.[l.locale.split('-')[0]]);
    const hit = (rule, key, value, detail, extra = {}) => hits.push({ rule, severity: M8_RULES[rule], locale: l.locale, file: l.file, key, value, detail, ...extra });

    for (const key of keys) {
      const value = values.get(key);
      if (typeof value !== 'string') {
        hit('missing-key', key, null, `${key} is missing from ${l.file}`);
        continue;
      }
      let ast;
      try { ast = parseIcu(value); } catch (err) {
        hit('invalid-icu', key, value, `${key} in ${l.file} does not parse: ${err.message}`);
        continue;
      }
      const seen = new Set();
      for (const a of icuArguments(ast)) {
        if (a.inPlural || seen.has(a.name)) continue;
        if (!isCountName(a.name) || !(a.type === 'simple' || a.type === 'number')) continue;
        seen.add(a.name);
        hit('count-outside-plural', key, value, `{${a.name}} is a count outside any plural in ${key} (${l.locale})`, { placeholder: a.name });
      }
      if (pluralKeys.has(key) && !hasPlural(ast)) hit('plural-missing', key, value, `${key} (${l.locale}) is marked plural in the plan but has no ICU plural`);
      if (banned) {
        const words = [...icuLiteralText(ast).matchAll(banned)].map((m) => m[0]);
        if (words.length) hit('banned-word', key, value, `${key} (${l.locale}) uses ${[...new Set(words)].map((w) => `"${w}"`).join(', ')}`);
      }
      if (l.locale !== primary) {
        const pv = primaryFlat.get(key);
        if (typeof pv === 'string' && sameText(pv, value) && !allowlisted(value, allowed)) {
          hit('identical-to-primary', key, value, `${key} (${l.locale}) is identical to ${primary}`, { primaryValue: pv });
        }
      }
    }

    if (l.locale !== primary) {
      const namespaces = new Set(keys.map((k) => k.split('.')[0]));
      for (const [key, value] of values) {
        if (typeof value !== 'string' || primaryFlat.has(key)) continue;
        if (!namespaces.has(key.split('.')[0])) continue;
        hit('extra-key', key, value, `${key} is in ${l.file} but not in the ${primary} file`);
      }
    }
  }
  return hits;
}

function sameText(a, b) {
  return a.trim() === b.trim();
}

// Identical is fine when nothing translatable is left once placeholders, numbers, punctuation and
// the allowlisted words are taken out.
function allowlisted(value, allowed) {
  let t;
  try { t = icuLiteralText(parseIcu(value)); } catch { t = value; }
  t = t.toLowerCase();
  for (const a of [...allowed].sort((x, y) => y.length - x.length)) t = t.split(a).join(' ');
  return !/\p{L}{2,}/u.test(t.split(ARG_MARK).join(' '));
}
