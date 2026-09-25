// Picture-mode rounds: each build or fix round's pictures, button results, reviews and comparison
// page live in .delivery/<feature>/rounds/<n>/. A builder's own looking goes in rounds/work/,
// which never counts as a round.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const WORK_ROUND = 'work';

/** @param {{ runDir: string }} paths */
export function roundsDir(paths) { return join(paths.runDir, 'rounds'); }

/** @param {{ runDir: string }} paths @param {string|number} name */
export function roundDir(paths, name) { return join(roundsDir(paths), String(name)); }

/** Numbered rounds, oldest first. */
export function listRounds(paths) {
  const dir = roundsDir(paths);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
}

/** The next round's number: one past the latest. */
export function nextRound(paths) {
  const all = listRounds(paths);
  return all.length ? all[all.length - 1] + 1 : 1;
}

/** What a round holds so far. */
export function roundInfo(paths, n) {
  const dir = roundDir(paths, n);
  const read = (f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } };
  const files = existsSync(dir) ? readdirSync(dir) : [];
  return {
    round: n,
    dir,
    shoot: read('shoot.json'),
    reviews: files.filter((f) => /^review-.+\.md$/.test(f)),
    review: read('review.json'),
    compare: files.includes('compare.html') ? join(dir, 'compare.html') : null,
  };
}
