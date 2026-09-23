// Layer 2 (spec 7.2): contact values. What counts as a phone number or an email address in a seed
// value, whether it is one of the approved fake ones, and whether it is in the never-dial set.
//
// Phone-shaped: E.164 (`+` and 7 to 15 digits), an international `00` prefix, a local format
// with a leading 0 (8 to 12 digits, so 07..., 01..., 020...), or a bare run of 9 to 15 digits,
// with spaces, dots, dashes, slashes or brackets between the digits, optionally behind `tel:`.
// Dates, times, IP addresses and decimals are not phone-shaped. A value carrying mask characters
// (`+15•••0101`) is not phone-shaped: it cannot be dialled, and no part of it is read as a number.

const PHONE_CHARS = /^\+?[\d\s\-.()/]+$/;
const MASK_CHARS = /[\u2022\u25cf\u2219\u25e6\u2217\*\uff0a\u00d7xX#\u2026\u2027]/;
const EMBEDDED = /\+?\d[\d \-.()/]*\d/g;
const EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;

/**
 * @param {string} raw
 * @returns {{ kind: 'e164'|'intl-00'|'local'|'bare', digits: string, text: string }|null}
 */
export function phoneShape(raw) {
  let s = String(raw).trim();
  if (/^tel:/i.test(s)) s = s.slice(4).trim();
  if (!s || !PHONE_CHARS.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) return null; // 2026-09-17
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s)) return null; // 17/09/2026
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return null; // 10.0.0.12
  if (/^-?\d+\.\d+$/.test(s)) return null; // a decimal
  if (s.startsWith('+')) return digits.length <= 15 ? { kind: 'e164', digits, text: s } : null;
  if (digits.startsWith('00')) return digits.length >= 9 && digits.length <= 17 ? { kind: 'intl-00', digits: digits.slice(2), text: s } : null;
  if (digits.startsWith('0')) return digits.length >= 8 && digits.length <= 12 ? { kind: 'local', digits, text: s } : null;
  return digits.length >= 9 && digits.length <= 15 ? { kind: 'bare', digits, text: s } : null;
}

/**
 * Every phone-shaped piece of a string: the whole value when it is one, otherwise each embedded
 * run of digits that is one and does not touch a mask character.
 * @param {string} value
 */
export function phonesIn(value) {
  const raw = String(value);
  const whole = phoneShape(raw);
  if (whole) return [whole];
  if (MASK_CHARS.test(raw) && !/[A-Za-z]{3,}/.test(raw.replace(/tel:/i, ''))) return []; // a masked number, not text
  // Identifiers and timestamps carry long digit runs that are not numbers anyone dials.
  const s = raw.replace(UUID, (m) => ' '.repeat(m.length)).replace(ISO_TIME, (m) => ' '.repeat(m.length));
  const out = [];
  for (const m of s.matchAll(EMBEDDED)) {
    const before = s[m.index - 1] ?? '';
    const after = s[m.index + m[0].length] ?? '';
    if (MASK_CHARS.test(before) || MASK_CHARS.test(after)) continue;
    if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) continue; // part of a word or hash
    const p = phoneShape(m[0]);
    if (p) out.push(p);
  }
  return out;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TIME = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;

/** The candidate forms a fake-number pattern is tested against: as written, and compacted. */
export function isFakeNumber(shape, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const compact = shape.text.replace(/[\s\-.()/]/g, '');
  return re.test(shape.text) || re.test(compact) || (shape.kind === 'intl-00' && re.test(`+${shape.digits}`));
}

/** Digits of a number with leading zeros dropped (country-code and trunk prefixes vary). */
function core(digits) {
  return String(digits).replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Whether a phone shape is one of the never-dial numbers: equal digits, or one is the other with a
 * country code or trunk prefix dropped (at least 8 digits must agree).
 * @param {{ digits: string }} shape
 * @param {string[]} neverDial
 * @returns {string|null} the never-dial entry it matches
 */
export function neverDialMatch(shape, neverDial) {
  const d = core(shape.digits);
  if (d.length < 7) return null;
  for (const entry of neverDial) {
    const n = core(entry);
    if (n.length < 7) continue;
    if (d === n) return entry;
    if (d.length >= 8 && n.endsWith(d)) return entry;
    if (n.length >= 8 && d.endsWith(n)) return entry;
  }
  return null;
}

/** Every email address in a string. */
export function emailsIn(value) {
  return [...String(value).matchAll(EMAIL)].map((m) => m[0]);
}

/** @param {string} email @param {string} domain */
export function onDomain(email, domain) {
  const host = String(email).split('@').pop().toLowerCase();
  const d = String(domain).toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

/**
 * Every string leaf of a row value, with its path (`subject.phone`, `input_fields[2].label`).
 * Integers of 9 or more digits are included as strings: a number column can hold a phone number.
 * @param {unknown} value
 * @param {string} [path]
 * @returns {{ path: string, value: string }[]}
 */
export function stringLeaves(value, path = '') {
  if (typeof value === 'string') return [{ path, value }];
  if (typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) >= 1e8) return [{ path, value: String(value) }];
  if (Array.isArray(value)) return value.flatMap((v, i) => stringLeaves(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    if (isRelative(value)) return [];
    return Object.entries(value).flatMap(([k, v]) => stringLeaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** A `{ "$rel": "now-2h" }` relative time marker (spec 7.4: dates relative to now). */
export function isRelative(v) {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v) && typeof v.$rel === 'string' && Object.keys(v).every((k) => k === '$rel' || k === 'as'));
}
