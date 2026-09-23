// Copy lint (M7), one visible element at a time (spec 8.1). Pure: the caller supplies the locale,
// the banned words and developer phrases from the profile, the profile's date shape, and the
// message namespaces when it knows them. Nothing project-specific lives here: the word lists that
// are language facts (prepositions, singular words ending in s) are generic grammar.

/** Every M7 rule, with the severity spec 8.1 gives it. */
export const M7_RULES = Object.freeze({
  'leak-preposition-punctuation': { severity: 'P1', expect: 'a value where the sentence has a blank' },
  'leak-empty-quotes': { severity: 'P1', expect: 'a value inside the quotes' },
  'leak-dash-in-sentence': { severity: 'P1', expect: 'a value or a sentence written for the empty case, not a bare dash' },
  'leak-token': { severity: 'P1', expect: 'rendered text, not a template or runtime token' },
  uuid: { severity: 'P1', expect: 'a name a customer knows, not a raw id' },
  'message-key': { severity: 'P1', expect: 'the message, not its key' },
  'developer-phrase': { severity: 'P1', expect: 'customer-facing words, no developer notes' },
  'banned-word': { severity: 'P1', expect: "the product's own word" },
  'numeric-date': { severity: 'P2', expect: 'the date in the profile\'s shape' },
  spacing: { severity: 'P2', expect: 'no space before punctuation, no dangling separator' },
  'count-one-plural': { severity: 'P2', expect: 'the singular after a count of 1' },
});

// Prepositions, articles, conjunctions and copulas: a sentence never ends on one of these followed
// by punctuation unless a value was meant to sit between them.
const LEAD_WORDS = {
  en: 'a an the on at in of for to from by with since until about after before as into onto per via than and or but is are was were',
  fr: 'à au aux de du des en le la les un une sur pour par avec depuis dans chez et ou est sont',
  es: 'a al de del en el la los las un una por para con desde sobre y o es son',
  de: 'an am auf aus bei mit nach seit von vom zu zum zur für in im der die das den dem des ein eine einen einem und oder um ist sind',
  it: 'a al alla di del della da in nel nella con su per tra fra il lo la i gli le un una e o è sono',
  pt: 'a ao à de do da dos das em no na com por para sobre o os as um uma e ou é são',
  nl: 'aan op in van voor met bij naar sinds de het een en of is zijn',
};

// Singular English words that end in s; "1 <word>" with one of these is grammatical.
const SINGULAR_S_EN = new Set(('is was has does goes says this thus plus minus less yes us its as always sometimes perhaps ' +
  'whereas besides across towards afterwards series species news lens bus gas canvas atlas bias status focus campus bonus virus ' +
  'census analysis basis crisis thesis axis chassis corps means headquarters physics mathematics economics politics ethics ' +
  'various previous famous serious anonymous numerous obvious gorgeous dangerous jealous nervous').split(' '));
// Words that can follow a plural noun: "1 calls today", "1 minutes apart", "1 hours ago".
const AFTER_NOUN_EN = new Set('in on at of per today yet so left total apart ago remaining waiting used since from by and or'.split(' '));

const UUID_RE = /(?<![0-9A-Fa-f-])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Fa-f-])/g;
const TOKEN_RES = [
  /\{\{|\}\}/g,
  /(?<![\p{L}\p{N}_])(?:undefined|null|NaN)(?![\p{L}\p{N}_])/gu,
  /\[object [A-Z][A-Za-z]*\]/g,
  /Invalid Date/g,
  /\$\{/g,
  /(?<![\p{L}\p{N}%])%[sd@](?![\p{L}\p{N}])/gu,
  /\{[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*(?:number|date|time|plural|select|selectordinal)[^{}]*)?\}/g,
];
const EMPTY_QUOTES_RE = /(?<![\p{L}\p{N}])(?:""|''|“\s*”|‘\s*’|„\s*“|«\s*»|‹\s*›)(?![\p{L}\p{N}])/gu;
const NUMERIC_DATE_RES = [
  /(?<![\p{N}./-])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\p{N}/])/gu,
  /(?<![\p{N}./-])(\d{4})-(\d{2})-(\d{2})(?![\p{N}])/gu,
  /(?<![\p{N}./-])(\d{1,2})\.(\d{1,2})\.(\d{4})(?![\p{N}.])/gu,
  /(?<![\p{N}./-])(\d{1,2})-(\d{1,2})-(\d{4})(?![\p{N}-])/gu,
];
const KEY_RE = /(?<![\p{L}\p{N}_@./:\\-])([a-z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){2,})(?![\p{L}\p{N}_/@]|\.[A-Za-z0-9])/gu;
const TLDS = new Set('com net org io ai co uk dev app invalid example local test ke de fr es it nl pt eu info biz me tv us'.split(' '));
const SEPARATORS = '·•|';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const baseLang = (locale) => String(locale ?? 'en').split('-')[0].toLowerCase();

/**
 * Words from a profile list, as one regex; "word*" matches every word starting with word.
 * @param {string[]} words
 */
function wordListRe(words) {
  const alts = (words ?? []).filter((w) => typeof w === 'string' && w.trim()).map((w) => {
    const t = w.trim();
    return t.endsWith('*') ? `${escapeRe(t.slice(0, -1))}[\\p{L}\\p{N}]*` : escapeRe(t);
  });
  if (!alts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/** A phrase from the profile: all-lowercase phrases match any case, others match their capitals. */
function phraseRe(phrase) {
  const t = phrase.trim();
  if (!t) return null;
  const lower = t === t.toLowerCase();
  let body = escapeRe(t);
  if (!lower && /[A-Za-z]/.test(t[0])) body = `[${t[0].toLowerCase()}${t[0].toUpperCase()}]${escapeRe(t.slice(1))}`;
  const pre = /[\p{L}\p{N}]/u.test(t[0]) ? '(?<![\\p{L}\\p{N}])' : '';
  const post = /[\p{L}\p{N}]/u.test(t[t.length - 1]) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${pre}${body}${post}`, lower ? 'giu' : 'gu');
}

/**
 * The profile's date shape as a regex over a whole token: D and DD day, M and MM month, YY and
 * YYYY year, Mon a short month name, Month a month name; anything else is literal.
 * @param {string} shape e.g. "D Mon"
 */
export function dateShapeRe(shape) {
  let re = '';
  const s = String(shape ?? '');
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    const tok = /^(YYYY|YY|DD|D|MM|Month|Mon|M)/.exec(rest)?.[1];
    if (tok) {
      re += { YYYY: '\\d{4}', YY: '\\d{2}', DD: '\\d{2}', D: '\\d{1,2}', MM: '\\d{2}', M: '\\d{1,2}', Mon: '\\p{L}{3,4}\\.?', Month: '\\p{L}+' }[tok];
      i += tok.length;
    } else { re += escapeRe(s[i]); i += 1; }
  }
  return new RegExp(`^${re}$`, 'u');
}

function plausibleDate(a, b, c, reIndex) {
  const n = [a, b, c].map(Number);
  if (reIndex === 1) return n[1] >= 1 && n[1] <= 12 && n[2] >= 1 && n[2] <= 31; // YYYY-MM-DD
  const [x, y] = n;
  if (x < 1 || y < 1 || x > 31 || y > 31) return false;
  return x <= 12 || y <= 12;
}

/**
 * @typedef {{ rule: keyof typeof M7_RULES, match: string, index: number }} LintHit
 * @typedef {{ locale?: string, bannedWords?: string[], developerPhrases?: string[], dateShape?: string,
 *             namespaces?: Iterable<string>|null }} LintOptions
 */

/**
 * Build a linter for one locale.
 * @param {LintOptions} opts
 * @returns {(text: string) => LintHit[]}
 */
export function makeCopyLinter(opts = {}) {
  const lang = baseLang(opts.locale);
  const lead = (LEAD_WORDS[lang] ?? '').split(' ').filter(Boolean);
  const leadSet = new Set(lead.map((w) => w.toLowerCase()));
  // French typography puts a space before : ; ! ? and inside guillemets.
  const punct = lang === 'fr' ? '.,' : '.,;:!?';
  const leadRe = lead.length
    ? new RegExp(`(?<![\\p{L}\\p{N}'’])(?:${lead.map(escapeRe).join('|')})\\s+[${punct}](?=$|[\\s"'”’»)\\]]|[${punct}])(?!\\.\\.)`, 'giu')
    : null;
  const spaceBeforeRe = new RegExp(`(?<=[^\\s${escapeRe(SEPARATORS)}])\\s+[${punct})](?=$|[\\s"'”’»)\\]]|[.,;:!?])(?!\\.\\.)`, 'gu');
  const openParenRe = /\(\s+(?=\S)/g;
  const danglingEndRe = new RegExp(`\\s[${escapeRe(SEPARATORS)}]$`, 'u');
  // A separator followed by punctuation, or two separators with only space between ("a · · b");
  // runs of bullets with no space are a masked value ("07•••12"), not separators.
  const sepPunctRe = new RegExp(`[${escapeRe(SEPARATORS)}]\\s*[.,;:!?]|[${escapeRe(SEPARATORS)}]\\s+[${escapeRe(SEPARATORS)}]`, 'gu');
  const bannedRe = wordListRe(opts.bannedWords);
  const phraseRes = (opts.developerPhrases ?? []).map(phraseRe).filter(Boolean);
  const shapeRe = opts.dateShape ? dateShapeRe(opts.dateShape) : null;
  const namespaces = opts.namespaces ? new Set(opts.namespaces) : null;

  return function lint(text) {
    const t = String(text);
    const hits = [];
    const add = (rule, m, index) => hits.push({ rule, match: m, index });
    const each = (re, fn) => { re.lastIndex = 0; for (const m of t.matchAll(re)) fn(m); };

    if (leadRe) each(leadRe, (m) => add('leak-preposition-punctuation', m[0], m.index));
    each(EMPTY_QUOTES_RE, (m) => add('leak-empty-quotes', m[0], m.index));
    dashes(t, leadSet, add);
    for (const re of TOKEN_RES) each(re, (m) => add('leak-token', m[0], m.index));

    each(spaceBeforeRe, (m) => add('spacing', m[0], m.index));
    each(openParenRe, (m) => add('spacing', m[0], m.index));
    const dangling = danglingEndRe.exec(t);
    if (dangling && /[\p{L}\p{N}]/u.test(t.slice(0, dangling.index))) add('spacing', dangling[0], dangling.index);
    each(sepPunctRe, (m) => { if (m.index > 0) add('spacing', m[0], m.index); });

    each(UUID_RE, (m) => add('uuid', m[0], m.index));
    each(KEY_RE, (m) => { if (isMessageKey(m[1], namespaces)) add('message-key', m[1], m.index); });

    NUMERIC_DATE_RES.forEach((re, k) => each(re, (m) => {
      if (!plausibleDate(m[1], m[2], m[3], k)) return;
      if (shapeRe && shapeRe.test(m[0])) return;
      add('numeric-date', m[0], m.index);
    }));

    for (const re of phraseRes) each(re, (m) => add('developer-phrase', m[0], m.index));
    if (bannedRe) each(bannedRe, (m) => add('banned-word', m[0], m.index));
    if (lang === 'en') countOnePlural(t, add);
    return dedupe(hits);
  };
}

// One problem, one hit: a spacing hit inside a leak hit's span ("on ." is a blank, not a typo)
// is dropped, and so is an exact repeat.
function dedupe(hits) {
  const leaks = hits.filter((h) => h.rule.startsWith('leak-'));
  const inLeak = (h) => leaks.some((l) => h.index >= l.index && h.index < l.index + l.match.length);
  const seen = new Set();
  return hits.filter((h) => {
    if (h.rule === 'spacing' && inLeak(h)) return false;
    const k = JSON.stringify([h.rule, h.index, h.match]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.index - b.index || a.rule.localeCompare(b.rule));
}

/** A bare dash standing in a sentence for a value: "came in at —." (never a lone dash element). */
function dashes(t, leadSet, add) {
  if (!/\p{L}.*\p{L}/su.test(t.replace(/[—–]/g, ''))) return;
  const re = /(?<=^|\s)[—–](?=$|\s|[.,;:!?)])/gu;
  for (const m of t.matchAll(re)) {
    const after = t.slice(m.index + 1);
    const before = t.slice(0, m.index).trimEnd();
    const prev = /([\p{L}'’]+)$/u.exec(before)?.[1] ?? '';
    const punctAfter = /^[.,;:!?]/.test(after);
    const leadBefore = prev && leadSet.has(prev.toLowerCase());
    if (!punctAfter && !leadBefore) continue;
    const start = prev ? before.length - prev.length : m.index;
    add('leak-dash-in-sentence', t.slice(start, m.index + 1 + (punctAfter ? 1 : 0)), start);
  }
}

function isMessageKey(token, namespaces) {
  const segs = token.split('.');
  if (namespaces && namespaces.size) return namespaces.has(segs[0]);
  if (TLDS.has(segs[segs.length - 1].toLowerCase()) || segs[0] === 'www') return false;
  return segs.length >= 4 || segs.slice(1).some((s) => /[A-Z]/.test(s));
}

function countOnePlural(t, add) {
  const re = /(?<![\p{N}.,:/-])\b1\s+([A-Za-z]+)(?![A-Za-z'’-])/gu;
  for (const m of t.matchAll(re)) {
    const word = m[1];
    const w = word.toLowerCase();
    if (w.length < 3 || !w.endsWith('s') || /(ss|us|is)$/.test(w) || SINGULAR_S_EN.has(w)) continue;
    const rest = t.slice(m.index + m[0].length);
    const next = /^\s*([A-Za-z]+)/.exec(rest)?.[1]?.toLowerCase();
    const endsHere = rest.trim() === '' || /^\s*[.,;:!?)·•|—–/]/.test(rest);
    if (!endsHere && !(next && AFTER_NOUN_EN.has(next))) continue;
    add('count-one-plural', m[0], m.index);
  }
}

/**
 * Lint one element's text.
 * @param {string} text
 * @param {LintOptions} opts
 */
export function lintCopy(text, opts) {
  return makeCopyLinter(opts)(text);
}
