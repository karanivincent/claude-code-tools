// Picture-mode widths: the named screen widths a run checks, and the "items" they make. An item is
// one state at one width. Its key is the state id at desktop (so a desktop-only run keeps every
// file name and review key it had before widths existed) and "<ID>@phone" at phone width.
// Pure.

export const WIDTHS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  phone: Object.freeze({ width: 390, height: 844 }),
});
export const WIDTH_NAMES = Object.freeze(Object.keys(WIDTHS));
export const DEFAULT_WIDTHS = Object.freeze(['desktop']);

/** The widths a map checks: its `widths`, or desktop only. */
export function mapWidths(map) {
  return Array.isArray(map?.widths) && map.widths.length ? map.widths : DEFAULT_WIDTHS;
}

/** The widths one state is checked at: its own `widths`, or the map's. */
export function stateWidths(state, map) {
  return Array.isArray(state?.widths) && state.widths.length ? state.widths : mapWidths(map);
}

/** The file and review key of a state at a width: "KC-05" at desktop, "KC-05@phone" at phone. */
export function itemKey(id, width = 'desktop') {
  return width === 'desktop' ? id : `${id}@${width}`;
}

/**
 * A key back to its state and width. "KC-05@desktop" is read as "KC-05".
 * @returns {{ id: string, width: string }}
 */
export function parseItemKey(key) {
  const at = String(key).lastIndexOf('@');
  if (at <= 0) return { id: String(key), width: 'desktop' };
  return { id: String(key).slice(0, at), width: String(key).slice(at + 1) };
}

/** The canonical key: "KC-05@desktop" becomes "KC-05". */
export function normaliseItemKey(key) {
  const { id, width } = parseItemKey(key);
  return itemKey(id, width);
}

/**
 * Every item of a map, state by state and width by width in the map's order.
 * @returns {{ key: string, id: string, width: string, state: object }[]}
 */
export function mapItems(map) {
  const out = [];
  for (const s of map?.states ?? []) {
    for (const w of stateWidths(s, map)) out.push({ key: itemKey(s.id, w), id: s.id, width: w, state: s });
  }
  return out;
}

/** Whether any item of the map is at a width other than desktop. */
export function hasPhone(map) {
  return mapItems(map).some((i) => i.width !== 'desktop');
}

/**
 * Which design picture an item is compared with, before any file is looked at.
 *  - desktop: `design` absent is the state's own id, a string names another design state, false is
 *    none; `design: { desktop }` says the same in object form.
 *  - phone: `design.phone` names a separate mobile frame (a design state id), false is none; absent,
 *    the desktop design id rendered narrow (a responsive design).
 * @returns {{ id: string, separate: boolean } | null} separate: the phone has its own design state
 */
export function designFor(state, width) {
  const d = state?.design;
  if (d === false) return null;
  const desktop = typeof d === 'string' ? d : (d && typeof d === 'object' && 'desktop' in d ? d.desktop : state.id);
  if (width === 'desktop') return desktop === false || desktop == null ? null : { id: desktop, separate: false };
  const own = d && typeof d === 'object' && 'phone' in d ? d.phone : undefined;
  if (own === false) return null;
  if (typeof own === 'string') return { id: own, separate: true };
  if (desktop === false || desktop == null) return { id: state.id, separate: false };
  return { id: desktop, separate: false };
}

/**
 * The design render file names an item may use, in order of preference. A responsive phone item
 * needs "<ID>@phone.png" (design render --width phone); a separate mobile frame prefers its own
 * phone-width render and falls back to its default render.
 * @returns {string[]}
 */
export function designFileCandidates(state, width) {
  const d = designFor(state, width);
  if (!d) return [];
  if (width === 'desktop') return [`${d.id}.png`];
  const narrow = `${itemKey(d.id, width)}.png`;
  return d.separate ? [narrow, `${d.id}.png`] : [narrow];
}

/** The page-area crop at a width: desktop is `pageArea`, the phone `pageArea.phone` (no sidebar). */
export function cropFor(map, width) {
  const area = map?.pageArea ?? {};
  if (width === 'desktop') {
    const left = area.left ?? 240;
    return { left, designLeft: area.designLeft ?? left };
  }
  const own = area[width] ?? {};
  const left = own.left ?? 0;
  return { left, designLeft: own.designLeft ?? left };
}

/**
 * An item's files in a round's folder: "<key>.live.png" and "<key>.design.png". A desktop item's
 * key is its state id, so a desktop-only run keeps the names it had before widths existed.
 */
export function roundFiles(key) {
  return { live: `${key}.live.png`, design: `${key}.design.png` };
}

/** The objective check at phone width: does the page scroll sideways, and by how much. */
export function overflowProblem(scrollWidth, innerWidth) {
  const by = Math.round(Number(scrollWidth) - Number(innerWidth));
  return by > 1 ? { by, problem: `the page scrolls sideways by ${by} px` } : null;
}
