// The capture validator's rules (spec 6.2), as pure functions over what a capture wrote. A capture
// is refused (not-reached) when a required marker is missing or a forbidden one is present, when its
// text is identical to another state's in the same world and role, or to another state's in a
// DIFFERENT world (unless the plan says same-as, which is how a plan declares two states really are
// one page), when the served SHA is not the expected one, or when a console error or a failed
// request occurred.
// M3 and M15 (slice B1) and ready (A1) reach these rules through validateCaptureItems.

import { sha256 } from '../core/hash.mjs';

// Built from code points so the source carries no invisible characters.
const cls = (...codes) => new RegExp(`[${String.fromCharCode(...codes)}]`, 'g');
const SINGLE_QUOTES = cls(0x2018, 0x2019, 0x201a, 0x201b, 0x2032);
const DOUBLE_QUOTES = cls(0x201c, 0x201d, 0x201e, 0x201f, 0x2033);
const ODD_SPACES = cls(0xa0, 0x2007, 0x202f);

/** Text as compared: NFKC, typographic quotes made straight, no-break spaces plain, whitespace collapsed. */
export function normaliseText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(ODD_SPACES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUMBER = /\d+(?:[.,:]\d+)*/g;

/**
 * A marker written in the design world as a pattern for other worlds: numbers become any number.
 * @param {string} marker
 */
export function markerPattern(marker) {
  const t = normaliseText(marker);
  const parts = t.split(NUMBER).map(escapeRe);
  return new RegExp(parts.join('\\d+(?:[.,:]\\d+)*'));
}

/**
 * Whether a text marker shows on any line.
 * @param {string[]} normLines lines already passed through normaliseText
 * @param {string} marker
 * @param {boolean} loose match numbers loosely (worlds other than design)
 */
export function textShows(normLines, marker, loose = false) {
  if (loose) {
    const re = markerPattern(marker);
    return normLines.some((l) => re.test(l));
  }
  const m = normaliseText(marker);
  return m.length > 0 && normLines.some((l) => l.includes(m));
}

/** Hash of a capture's visible text, as the identical-text rule compares it. */
export function textHash(lines) {
  return sha256(lines.map(normaliseText).filter(Boolean).join('\n'));
}

const ABORTED = /ERR_ABORTED|NS_BINDING_ABORTED|cancell?ed/i;

/**
 * Console errors and failed requests that refuse a capture (intercepted and read-only-aborted
 * requests never count; a navigation cancelling its own request does not either).
 * @param {object|null} errors a capture-errors document
 * @returns {string[]}
 */
export function errorReasons(errors, opts = {}) {
  if (!errors) return [];
  const out = [];
  // An error state reached on purpose (an intercept answering 4xx/5xx or timing out) may log its
  // own failure; a thrown page error still counts.
  const cons = errors.console.filter((c) => c.type === 'pageerror' || (c.type === 'error' && !opts.errorStateIntercept));
  if (cons.length) out.push(`console error${cons.length > 1 ? `s (${cons.length})` : ''}: ${cons[0].text.replace(/\s+/g, ' ').slice(0, 160)}`);
  const failed = errors.requests.filter((r) => !r.intercepted && !r.aborted
    && ((r.status !== null && r.status >= 400) || (r.failure && !ABORTED.test(r.failure))));
  if (failed.length) {
    const f = failed[0];
    out.push(`failed request${failed.length > 1 ? `s (${failed.length})` : ''}: ${f.method} ${shortUrl(f.url)} ${f.status ?? f.failure}`);
  }
  return out;
}

function shortUrl(u) {
  try { const x = new URL(u); return `${x.pathname}${x.search}`.slice(0, 120); } catch { return String(u).slice(0, 120); }
}

/** Whether two SHAs name the same commit (either may be abbreviated). */
export function sameSha(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/**
 * Judge every item of a capture run.
 * @param {{
 *   items: { key: string, state: string, world: string, role: string, width: number, locale: string, theme: string,
 *            check: 'markers'|'permission'|'none', written: boolean, error?: string|null, lines: string[],
 *            testids: string[], servedSha: string|null, errors: object|null, tampered?: string|null }[],
 *   rows: Map<string, object>|Record<string, object>, worldKinds?: Record<string, string>,
 *   expectedSha: string, primaryLocale: string,
 * }} input
 * @returns {{ key: string, status: 'reached'|'not-reached', why: string|null, reasons: string[] }[]}
 */
export function judgeItems(input) {
  const rows = input.rows instanceof Map ? input.rows : new Map(Object.entries(input.rows ?? {}));
  const kinds = input.worldKinds ?? {};
  const verdicts = new Map();
  const hashes = new Map();
  const acrossWorlds = new Map();

  for (const it of input.items) {
    const reasons = [];
    if (it.tampered) reasons.push(it.tampered);
    if (!it.written) reasons.push(it.error || 'the capture wrote nothing for this item');
    else if (it.error) reasons.push(it.error);
    if (it.written) {
      if (!it.servedSha) reasons.push('the version route reported no served SHA');
      else if (!sameSha(it.servedSha, input.expectedSha)) reasons.push(`served ${it.servedSha.slice(0, 12)}, expected ${input.expectedSha.slice(0, 12)}`);
      const icpt = rows.get(it.state)?.reach?.intercept;
      reasons.push(...errorReasons(it.errors, { errorStateIntercept: Boolean(icpt && (icpt.status >= 400 || icpt.timeoutMs)) }));
    }
    if (it.written && it.check === 'markers') {
      const row = rows.get(it.state);
      const norm = it.lines.map(normaliseText).filter(Boolean);
      if (!norm.length) reasons.push('no visible text');
      const markers = row?.markers;
      if (!markers) reasons.push('the plan gives this state no markers');
      else {
        const loose = (kinds[it.world] ?? 'design') !== 'design';
        const textApplies = it.locale === input.primaryLocale;
        const testids = new Set(it.testids);
        const missing = [];
        if (textApplies) for (const t of markers.text) if (!textShows(norm, t, loose)) missing.push(`"${t}"`);
        for (const id of markers.testids) if (!testids.has(id)) missing.push(`testid ${id}`);
        if (missing.length) reasons.push(`missing marker${missing.length > 1 ? 's' : ''} ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` (+${missing.length - 4})` : ''}`);
        const present = [];
        for (const f of markers.forbidden) {
          if (testids.has(f)) present.push(`testid ${f}`);
          else if (textApplies && textShows(norm, f, false)) present.push(`"${f}"`);
        }
        if (present.length) reasons.push(`forbidden marker${present.length > 1 ? 's' : ''} present ${present.slice(0, 4).join(', ')}`);
      }
      if (norm.length) {
        const g = JSON.stringify([it.world, it.role, it.width, it.locale, it.theme, textHash(it.lines)]);
        if (!hashes.has(g)) hashes.set(g, []);
        hashes.get(g).push(it);
        const w = JSON.stringify([it.width, it.locale, it.theme, textHash(it.lines)]);
        if (!acrossWorlds.has(w)) acrossWorlds.set(w, []);
        acrossWorlds.get(w).push(it);
      }
    }
    verdicts.set(it.key, reasons);
  }

  const sameAsPairs = (a, b) => rows.get(a)?.markers?.sameAs?.state === b || rows.get(b)?.markers?.sameAs?.state === a;
  for (const group of hashes.values()) {
    const states = [...new Set(group.map((i) => i.state))];
    if (states.length < 2) continue;
    for (const it of group) {
      const others = states.filter((s) => s !== it.state && !sameAsPairs(it.state, s));
      if (others.length) verdicts.get(it.key).push(`identical text to ${others.slice(0, 3).join(', ')} (same world and role)`);
    }
  }

  // A world exists to make the data differ. Two worlds that render the same text at the same
  // width, locale and theme mean the world never reached the app, and every marker those two
  // states happen to share then passes: the widgets rehearsal's wave-0 smoke signed each fixture
  // user in, none of them belonged to an organisation, all four captures came back byte-identical,
  // and the design state was reported as reached. The plan says two states really are the same
  // page with markers.sameAs; that is the only way past this.
  for (const group of acrossWorlds.values()) {
    const worlds = [...new Set(group.map((i) => i.world))];
    if (worlds.length < 2) continue;
    for (const it of group) {
      const others = [...new Set(group.filter((o) => o.world !== it.world && !sameAsPairs(it.state, o.state)).map((o) => `${o.state} (${o.world})`))];
      if (others.length) verdicts.get(it.key).push(`identical text to ${others.slice(0, 3).join(', ')} in another world, so the world made no difference`);
    }
  }

  return input.items.map((it) => {
    const reasons = verdicts.get(it.key);
    return { key: it.key, status: reasons.length ? 'not-reached' : 'reached', why: reasons.length ? reasons.join('; ') : null, reasons };
  });
}
