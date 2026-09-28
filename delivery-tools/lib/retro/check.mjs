// C4: did an automatic change help? Every retro looks at the changes earlier runs made and judges
// each by the number it named, on the runs recorded after it. Pure. Owner: slice A2.
//
// Worse than the baseline in each of the last two later runs: undo it. Otherwise: kept (never worse)
// or mixed. Fewer than one later run, or no baseline to compare with: nothing to say yet.

import { metricValue } from './compare.mjs';

const CHECKED = new Set(['applied', 'kept', 'mixed']);

export const isWorse = (better, value, baseline) => (better === 'lower' ? value > baseline : value < baseline);

/**
 * @param {object[]} records every record in the ledger (the run being retro'd included)
 * @param {string} current  the feature being retro'd: its own record never counts as a later run
 * @returns {{ updates: { feature: string, id: string, status: string, measured: object[] }[], reverts: { feature: string, entry: object }[] }}
 */
export function assessChanges(records, current) {
  const ordered = [...records].sort((a, b) => String(a.endedAt).localeCompare(String(b.endedAt)));
  const updates = [];
  const reverts = [];
  for (const rec of records) {
    for (const entry of rec.autoChanges ?? []) {
      if (entry.size !== 'small' || !CHECKED.has(entry.status)) continue;
      const later = ordered.filter((r) => r.feature !== rec.feature && String(r.endedAt) > String(entry.at));
      const measured = later.map((r) => ({ feature: r.feature, value: metricValue(r, entry.metric.name) })).filter((m) => m.value !== null);
      if (!measured.length || entry.metric.baseline === null || entry.metric.baseline === undefined) continue;
      const worse = measured.map((m) => isWorse(entry.metric.better, m.value, entry.metric.baseline));
      const lastTwoWorse = worse.length >= 2 && worse[worse.length - 1] && worse[worse.length - 2];
      if (lastTwoWorse) { reverts.push({ feature: rec.feature, entry: { ...entry, measured } }); continue; }
      updates.push({ feature: rec.feature, id: entry.id, status: worse.some(Boolean) ? 'mixed' : 'kept', measured });
    }
  }
  return { updates, reverts };
}
