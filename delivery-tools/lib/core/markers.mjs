// Idempotency markers (spec 11.3): <!-- delivery:<feature>:<kind>:<id> -->, the id optional
// (the epic's marker is <!-- delivery:<feature>:epic -->). A two-part marker such as
// <!-- delivery:claims --> is global: it names no feature (spec 12.2).
// Generated blocks sit between a start marker and the same marker with a leading slash.

import { UsageError } from './exit.mjs';

const SEG = /^[a-z0-9][a-z0-9-]*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._#-]*$/;
const MARKER_RE = /<!--\s*(\/?)([a-z][a-z0-9-]*(?::[A-Za-z0-9][A-Za-z0-9._#-]*){1,3})\s*-->/g;

/**
 * @typedef {{ prefix: string, feature: string|null, kind: string, id: string|null, closing: boolean,
 *             raw: string, index: number }} ParsedMarker
 */

/**
 * @param {{ prefix?: string, feature: string, kind: string, id?: string|number|null }} m
 * @returns {string}
 */
export function makeMarker({ prefix = 'delivery', feature, kind, id = null }) {
  if (!SEG.test(prefix)) throw new UsageError(`bad marker prefix "${prefix}"`);
  if (!SEG.test(feature ?? '')) throw new UsageError(`bad marker feature "${feature}"`);
  if (!SEG.test(kind ?? '')) throw new UsageError(`bad marker kind "${kind}"`);
  if (id !== null && id !== undefined && !ID.test(String(id))) throw new UsageError(`bad marker id "${id}"`);
  const body = [prefix, feature, kind, ...(id === null || id === undefined ? [] : [String(id)])].join(':');
  return `<!-- ${body} -->`;
}

/** A global marker with no feature, e.g. makeGlobalMarker('claims') -> <!-- delivery:claims --> */
export function makeGlobalMarker(kind, prefix = 'delivery') {
  if (!SEG.test(kind) || !SEG.test(prefix)) throw new UsageError(`bad global marker "${prefix}:${kind}"`);
  return `<!-- ${prefix}:${kind} -->`;
}

export const CLAIMS_MARKER = '<!-- delivery:claims -->';

/**
 * Every marker in a text, opening and closing, in order.
 * @param {string} text
 * @param {{ prefix?: string }} [opts] only markers with this prefix (default "delivery")
 * @returns {ParsedMarker[]}
 */
export function parseMarkers(text, opts = {}) {
  const want = opts.prefix ?? 'delivery';
  const out = [];
  for (const m of String(text ?? '').matchAll(MARKER_RE)) {
    const parts = m[2].split(':');
    const [prefix] = parts;
    if (prefix !== want) continue;
    let feature = null, kind, id = null;
    if (parts.length === 2) kind = parts[1];
    else { feature = parts[1]; kind = parts[2]; id = parts[3] ?? null; }
    if (feature !== null && !SEG.test(feature)) continue;
    if (!SEG.test(kind)) continue;
    out.push({ prefix, feature, kind, id, closing: m[1] === '/', raw: m[0], index: m.index });
  }
  return out;
}

/** Normalise any spacing variant of a marker to its canonical text. */
export function canonicalMarker(marker) {
  const [m] = parseMarkers(marker, { prefix: marker.match(/<!--\s*\/?([a-z][a-z0-9-]*)/)?.[1] });
  if (!m) throw new UsageError(`not a marker: ${marker}`);
  const body = [m.prefix, ...(m.feature ? [m.feature] : []), m.kind, ...(m.id ? [m.id] : [])].join(':');
  return `<!-- ${body} -->`;
}

/** True when text contains the marker (any spacing inside the comment). */
export function hasMarker(text, marker) {
  const want = canonicalMarker(marker);
  const prefix = want.match(/<!-- ([a-z][a-z0-9-]*)/)[1];
  return parseMarkers(text, { prefix }).some((m) => !m.closing && canonicalMarker(m.raw) === want);
}

/** @returns {{ start: string, end: string }} */
export function blockMarkers(marker) {
  const start = canonicalMarker(marker);
  return { start, end: start.replace('<!-- ', '<!-- /') };
}

/**
 * The text between a block's start and end markers, trimmed; null when the block is absent.
 * @param {string} text
 * @param {string} marker
 */
export function readBlock(text, marker) {
  const { start, end } = blockMarkers(marker);
  const s = String(text ?? '');
  const i = s.indexOf(start);
  if (i < 0) return null;
  const j = s.indexOf(end, i + start.length);
  if (j < 0) return null;
  return s.slice(i + start.length, j).trim();
}

/**
 * Replace a block's content, or append the block (after a blank line) when absent.
 * Everything outside the block is left byte-for-byte alone.
 * @param {string} text
 * @param {string} marker
 * @param {string} content
 */
export function upsertBlock(text, marker, content) {
  const { start, end } = blockMarkers(marker);
  const block = `${start}\n${String(content).trim()}\n${end}`;
  const s = String(text ?? '');
  const i = s.indexOf(start);
  const j = i < 0 ? -1 : s.indexOf(end, i + start.length);
  if (i < 0 || j < 0) return s.length === 0 ? block + '\n' : `${s.replace(/\s*$/, '')}\n\n${block}\n`;
  return s.slice(0, i) + block + s.slice(j + end.length);
}
