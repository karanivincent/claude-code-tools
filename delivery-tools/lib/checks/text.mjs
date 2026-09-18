// The element model the text checks share (M4, M7, M12, invariants). A render's or capture's .txt
// holds one visible element per line, in reading order; a line with tabs is a table row, and each
// of its cells is an element of its own. Empty lines and empty cells are not elements.

/**
 * @typedef {{ line: number, cell: number|null, text: string }} Element
 *   line is 1-based; cell is the 0-based index in the tab-split row (empty cells still count)
 */

/**
 * @param {string} txt
 * @returns {Element[]}
 */
export function parseElements(txt) {
  const out = [];
  const lines = String(txt ?? '').replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    if (raw.includes('\t')) {
      raw.split('\t').forEach((cell, c) => {
        const text = cell.trim();
        if (text) out.push({ line: i + 1, cell: c, text });
      });
    } else {
      const text = raw.trim();
      if (text) out.push({ line: i + 1, cell: null, text });
    }
  });
  return out;
}

/** "36" or "4#2" (line, or line and cell), the suffix of a finding's where. */
export function elementLocation(el) {
  return el.cell === null || el.cell === undefined ? String(el.line) : `${el.line}#${el.cell}`;
}

/** Collapse whitespace (including no-break and thin spaces) to single spaces and trim. */
export function collapseSpace(s) {
  return String(s).replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * Typography folded so the same words compare equal: curly quotes and apostrophes become straight,
 * the ellipsis becomes three dots, spaces collapse. Case is kept.
 */
export function foldTypography(s) {
  return collapseSpace(String(s).normalize('NFKC'))
    .replace(/[‘’‚‛′ʼ]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/…/g, '...');
}

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const DAY_MON_RE = new RegExp(`(?<![\\p{L}\\p{N}])\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?(?![\\p{L}])(?:,?\\s+\\d{4}(?![\\p{N}]))?`, 'giu');
const MON_DAY_RE = new RegExp(`(?<![\\p{L}])(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?![\\p{L}\\p{N}])(?:,?\\s+\\d{4}(?![\\p{N}]))?`, 'giu');
const NUMERIC_DATE_RE = /(?<![\p{N}.\/-])\d{1,4}([/.-])\d{1,2}\1\d{2,4}(?![\p{N}])/gu;
const TIME_RE = /(?<![\p{N}:])\d{1,2}:\d{2}(?::\d{2})?(?:\s*([ap])\.?m\.?)?(?![\p{L}\p{N}])/giu;
const AGO_RE = /(?<![\p{N}])\d+\s+(sec(?:ond)?|min(?:ute)?|hour|day|week|month|year)s?\s+ago(?![\p{L}])/giu;
const MASK = '•●*';
const PHONE_RE = new RegExp(`(?<![\\p{L}\\p{N}+])\\+?\\(?\\d[\\d${MASK} ().-]{5,}[\\d${MASK}](?![\\p{L}\\p{N}])`, 'gu');

/**
 * A value shaped like a phone number, masked or not: at least seven digits or mask characters,
 * and either a leading + or 0, a mask character, or nine digits or more.
 * @param {string} s
 */
export function isPhoneShaped(s) {
  const digits = (s.match(/\d/g) ?? []).length;
  const masks = (s.match(new RegExp(`[${MASK}]`, 'g')) ?? []).length;
  if (digits < 3 || digits + masks < 7) return false;
  return /^\+|^\(?0/.test(s) || masks > 0 || digits >= 9;
}

/**
 * Copy-parity normal form (M4): typography folded, case folded, and the parts that legitimately
 * differ between the design and a live page replaced by their shape. A day and month name
 * becomes "D Mon" whatever the day; a numeric date keeps its separators ("D/D/Y"), so a live
 * "8/31/2026" never matches a designed "17 Sep"; a clock time becomes "H:MM"; "N minutes ago"
 * keeps its unit; a phone-shaped value (masked or not) becomes "PHONE".
 * @param {string} s
 */
export function parityForm(s) {
  let t = foldTypography(s);
  t = t.replace(DAY_MON_RE, 'D Mon').replace(MON_DAY_RE, 'Mon D');
  t = t.replace(NUMERIC_DATE_RE, (m, sep) => `D${sep}D${sep}Y`);
  t = t.replace(TIME_RE, (m, ap) => (ap ? `H:MM ${ap.toLowerCase()}m` : 'H:MM'));
  t = t.replace(AGO_RE, (m, unit) => `N ${unit.toLowerCase()} ago`);
  t = t.replace(PHONE_RE, (m) => (isPhoneShaped(m) ? 'PHONE' : m));
  return t.toLowerCase();
}

/**
 * Whether needle occurs in haystack as whole words (no letter or digit touching either end).
 * Both are expected in the same normal form.
 */
export function containsWords(haystack, needle) {
  if (!needle) return true;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const before = haystack[i - 1];
    const after = haystack[i + needle.length];
    const edgeOk = (ch, inner) => ch === undefined || !(/[\p{L}\p{N}]/u.test(ch) && /[\p{L}\p{N}]/u.test(inner));
    if (edgeOk(before, needle[0]) && edgeOk(after, needle[needle.length - 1])) return true;
    from = i + 1;
  }
}

/** A short excerpt for a finding's live or design field. */
export function excerpt(s, max = 240) {
  const t = collapseSpace(s);
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
