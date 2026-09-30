// W4 (D7): when the picture loop stops. There is no fixed number of rounds: the loop goes on while
// the real-bug count (items to fix plus items not reached) falls, ships at zero, and stops after
// `rounds.stallRounds` rounds in a row with no fall, or at the `rounds.ceiling` safety ceiling.
// NEXT and ready both read roundDecision, so they always agree. Only rounds that were shot and
// compiled count; a round the server broke during (W2) was deleted and never counts.

import { listRounds, roundInfo } from './rounds.mjs';
import { tunable } from '../retro/tunables.mjs';

export const STALL_ROUNDS = tunable('rounds.stallRounds');
export const ROUND_CEILING = tunable('rounds.ceiling');

const OPEN = new Set(['must', 'not-reached']);

/**
 * The real-bug count after each compiled round: each item's newest verdict up to and including
 * that round (a round that re-shot a few items leaves the rest at their earlier verdict), counting
 * must and not-reached.
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @returns {{ round: number, open: number, items: string[] }[]}
 */
export function openByRound(paths) {
  const latest = new Map();
  const out = [];
  for (const n of listRounds(paths)) {
    const info = roundInfo(paths, n);
    if (!info.shoot || !info.review) continue;
    for (const [key, s] of Object.entries(info.review.states ?? {})) if (s.verdict !== 'not-shot') latest.set(key, s.verdict);
    const items = [...latest].filter(([, v]) => OPEN.has(v)).map(([k]) => k);
    out.push({ round: n, open: items.length, items });
  }
  return out;
}

/**
 * The decision after the rounds so far, from their real-bug counts in order.
 *   ship  the newest count is zero
 *   stop  the ceiling is reached, or the count has not fallen for `stall` rounds in a row
 *   fix   otherwise: another fix round
 * @param {number[]} counts
 * @param {{ stall?: number, ceiling?: number }} [o]
 * @returns {{ decision: 'ship'|'fix'|'stop', why: string, flat: number }}
 */
export function roundDecision(counts, { stall = STALL_ROUNDS, ceiling = ROUND_CEILING } = {}) {
  if (!counts.length) return { decision: 'fix', why: 'no round compiled yet', flat: 0 };
  const last = counts[counts.length - 1];
  let flat = 0;
  for (let i = counts.length - 1; i > 0 && counts[i] >= counts[i - 1]; i--) flat += 1;
  if (last === 0) return { decision: 'ship', why: `nothing to fix after ${counts.length} round(s)`, flat };
  if (counts.length >= ceiling) return { decision: 'stop', why: `the ceiling of ${ceiling} rounds is reached with ${last} still open`, flat };
  if (flat >= stall) return { decision: 'stop', why: `${last} still open and the count has not fallen for ${flat} round(s) (${counts.join(' > ')})`, flat };
  return { decision: 'fix', why: `${last} still open (${counts.join(' > ')})`, flat };
}

/** roundDecision over a run's own rounds. */
export function runDecision(paths, o) {
  const byRound = openByRound(paths);
  return { ...roundDecision(byRound.map((r) => r.open), o), byRound };
}

/**
 * The items stuck when the loop stops: open in each of the last `stall + 1` compiled rounds, with
 * every note the reviewers wrote about them in those rounds, oldest first.
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {number} [stall]
 * @returns {{ key: string, rounds: { round: number, verdict: string, notes: string[] }[] }[]}
 */
export function stuckItems(paths, stall = STALL_ROUNDS) {
  const compiled = listRounds(paths).map((n) => ({ n, info: roundInfo(paths, n) })).filter((r) => r.info.shoot && r.info.review);
  const recent = compiled.slice(-(stall + 1));
  const open = openByRound(paths);
  const last = open[open.length - 1]?.items ?? [];
  const out = [];
  for (const key of last) {
    const history = recent.map(({ n, info }) => {
      const s = info.review.states?.[key];
      return s ? { round: n, verdict: s.verdict, notes: [...(s.must ?? []), ...(s.small ?? [])] } : null;
    }).filter(Boolean);
    if (history.filter((h) => OPEN.has(h.verdict) || h.verdict === 'not-shot').length >= Math.min(recent.length, stall + 1)) out.push({ key, rounds: history });
  }
  return out;
}

/** stuck.md: the founder's list when the loop stops, one section per stuck item. */
export function renderStuck(items, decision) {
  const lines = ['# Stuck items', '', `The picture loop stopped: ${decision.why}. These items did not move.`, ''];
  for (const it of items) {
    lines.push(`## ${it.key}`, '');
    for (const h of it.rounds) {
      lines.push(`- round ${h.round}: ${h.verdict}`);
      for (const n of h.notes) lines.push(`  - ${n}`);
    }
    const notes = it.rounds.map((h) => h.notes.join(' | '));
    const same = notes.length > 1 && notes.every((x) => x && x === notes[0]);
    lines.push('', same ? 'Why it did not move: the reviewers wrote the same problem every round, so each fix missed it.' : 'Why it did not move: the notes changed from round to round, so each fix moved the problem rather than closing it.', '');
  }
  return `${lines.join('\n')}\n`;
}
