// W7: a short facts file per item, which reviewers read instead of shoot.json (500 KB on a big
// run, too big to read). review --plan writes rounds/<n>/facts/<ITEM>.md: whether the item was
// reached, the buttons missing or shown where they should not be, sideways scroll, the pixel
// difference, the texts the design shows that the page does not (and the other way round), and
// what datacheck already sorted. Each file stays under FACTS_MAX_BYTES, lists cut short with a
// count of what was left out.

import { normalise } from './contract.mjs';

export const FACTS_DIR = 'facts';
export const FACTS_MAX_BYTES = 2000;
const LIST_MAX = 8;

/** rounds/<n>/facts/<ITEM>.md */
export function factsFile(key) { return `${FACTS_DIR}/${key}.md`; }

const clip = (t, n = 80) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

function list(title, xs) {
  if (!xs.length) return [];
  const shown = xs.slice(0, LIST_MAX).map((x) => `- ${clip(x)}`);
  return [title, ...shown, ...(xs.length > LIST_MAX ? [`- and ${xs.length - LIST_MAX} more`] : [])];
}

/**
 * The texts one side shows that the other does not, compared case- and space-blind.
 * @param {string[]} design
 * @param {string[]} live
 */
export function textDifferences(design, live) {
  const d = new Map((design ?? []).map((t) => [normalise(t), t]));
  const l = new Map((live ?? []).map((t) => [normalise(t), t]));
  return {
    onlyDesign: [...d].filter(([k]) => k && !l.has(k)).map(([, t]) => t),
    onlyLive: [...l].filter(([k]) => k && !d.has(k)).map(([, t]) => t),
  };
}

/**
 * One item's facts, as markdown under FACTS_MAX_BYTES.
 * @param {{ key: string, rec: object, designTexts?: string[]|null, liveTexts?: string[]|null }} o
 * @returns {string}
 */
export function renderFacts({ key, rec, designTexts = null, liveTexts = null }) {
  const lines = [`# ${key}`, ''];
  if (!rec?.reached) {
    lines.push(`Not reached: ${clip((rec?.problems ?? []).join('; ') || 'no record', 200)}`);
    return `${lines.join('\n')}\n`;
  }
  const missing = (rec.buttons ?? []).filter((b) => b.shouldBe === 'shown' && !b.onPage).map((b) => b.label);
  const leaked = (rec.buttons ?? []).filter((b) => b.shouldBe === 'hidden' && b.onPage).map((b) => `${b.label}${b.hiddenAt ? ` (hidden at ${b.hiddenAt})` : ' (hidden from this role)'}`);
  lines.push(`Reached. Buttons checked: ${(rec.buttons ?? []).length}.${Number.isFinite(rec.pixelDiff) ? ` Pixels differing: ${(rec.pixelDiff * 100).toFixed(1)}%.` : ''}${rec.overflow ? ` Scrolls sideways by ${rec.overflow} px (a must fix, already counted).` : ''}`);
  if (rec.unchanged) lines.push(`Not shot again: its route's files did not change since round ${rec.unchanged.from}.`);
  lines.push('');
  lines.push(...list('Buttons missing:', missing));
  lines.push(...list('Buttons on the page that should be hidden:', leaked));
  if (designTexts && liveTexts) {
    const t = textDifferences(designTexts, liveTexts);
    lines.push(...list('Texts the design shows and the page does not:', t.onlyDesign));
    lines.push(...list('Texts the page shows and the design does not:', t.onlyLive));
  }
  lines.push(...list('Already sorted by datacheck (counted; do not write again):', [...(rec.lookup?.dataFault ?? []).map((x) => `data fault: ${x}`), ...(rec.lookup?.must ?? []).map((x) => `must fix: ${x}`)]));
  let out = `${lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')}\n`;
  while (Buffer.byteLength(out) > FACTS_MAX_BYTES) {
    const ls = out.trimEnd().split('\n');
    ls.splice(ls.length - 2, 1);
    out = `${ls.join('\n')}\n`;
    if (ls.length < 4) break;
  }
  return out;
}
