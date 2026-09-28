// C1: turn one finished run into one record. The parts that read the journal or text are pure;
// buildRecord reads the run's files. Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Phase minutes come from the gaps between journal events: the time up to an event belongs to the
// phase of the command that finished it, minus any time the run spent waiting on the founder.
// A phase none of the run's commands belong to stays null.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadState, parseEvent } from '../core/state.mjs';
import { listRounds, roundInfo, roundsDir } from '../picture/rounds.mjs';

export const PHASES = Object.freeze(['intake', 'render', 'map', 'seed', 'build', 'shoot', 'review', 'ci']);

/** First matching prefix wins. A command not listed here (status, advance, waive, ...) belongs to no phase. */
const PHASE_OF = [
  ['intake', ['init', 'intake', 'preflight']],
  ['render', ['design ', 'inventory check']],
  ['map', ['map', 'rules', 'components', 'baseline', 'brief ', 'plan ', 'issues sync', 'claims ', 'dupes']],
  ['seed', ['sidefx', 'seed', 'sign-in']],
  ['build', ['wave ', 'gate']],
  ['shoot', ['shoot', 'slot', 'capture', 'audit compile']],
  ['review', ['review']],
  ['ci', ['ci', 'prepush', 'ready', 'pr-body', 'handover', 'land']],
];
const ASKS = ['question', 'scope post'];
const ANSWERS = ['answer', 'scope read'];

const startsWith = (command, word) => command === word.trim() || command.startsWith(word.endsWith(' ') ? word : `${word} `) || command.startsWith(`${word}--`);

/** @param {string} command "shoot --round 2" -> "shoot" */
export function phaseOfCommand(command) {
  const c = String(command).trim();
  for (const [phase, words] of PHASE_OF) if (words.some((w) => startsWith(c, w))) return phase;
  return null;
}

const minutes = (ms) => Math.round((ms / 60000) * 10) / 10;

/** The length of [a,b) that lies outside every interval. */
function outside(a, b, intervals) {
  let len = b - a;
  for (const [s, e] of intervals) len -= Math.max(0, Math.min(b, e) - Math.max(a, s));
  return Math.max(0, len);
}

/**
 * Minutes per phase and the founder's waiting, from a run's journal. Pure.
 * @param {{ at: string, event: string }[]} journal
 * @returns {{ phases: Record<string, number|null>, founder: { waitMinutes: number, questions: number }|null }}
 */
export function phasesFromJournal(journal) {
  const entries = (journal ?? []).map((e) => ({ t: Date.parse(e.at), command: parseEvent(e.event).command }));
  const waits = [];
  let open = null;
  let questions = 0;
  for (const e of entries) {
    if (ASKS.some((w) => startsWith(e.command, w))) { questions += 1; if (open === null) open = e.t; }
    else if (ANSWERS.some((w) => startsWith(e.command, w)) && open !== null) { waits.push([open, e.t]); open = null; }
  }
  const phases = Object.fromEntries(PHASES.map((p) => [p, null]));
  for (let i = 1; i < entries.length; i++) {
    const phase = phaseOfCommand(entries[i].command);
    if (!phase || !Number.isFinite(entries[i].t) || !Number.isFinite(entries[i - 1].t)) continue;
    phases[phase] = (phases[phase] ?? 0) + outside(entries[i - 1].t, entries[i].t, waits);
  }
  for (const p of PHASES) if (phases[p] !== null) phases[p] = minutes(phases[p]);
  const seen = questions > 0 || waits.length > 0;
  return { phases, founder: seen ? { waitMinutes: minutes(waits.reduce((n, [s, e]) => n + (e - s), 0)), questions } : null };
}

/** CI failures the journal saw: every `ci` event that exited non-zero, with what it said. Pure. */
export function ciFailuresFromJournal(journal) {
  const out = [];
  for (const e of journal ?? []) {
    const p = parseEvent(e.event);
    if (!startsWith(p.command, 'ci') || !p.exit) continue;
    out.push({ check: p.counts.check ?? 'ci', cause: (p.counts.state ?? p.counts.cause ?? 'unknown').replace(/_/g, ' ') });
  }
  return out;
}

/** The bullets of workflow-improvements.md as short single-line entries. Pure. */
export function parseImprovements(md) {
  const out = [];
  let cur = null;
  for (const raw of String(md ?? '').split('\n')) {
    const m = raw.match(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/);
    if (m) { if (cur) out.push(cur); cur = m[1]; }
    else if (cur && /^\s{2,}\S/.test(raw)) cur += ` ${raw.trim()}`;
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out
    .map((t) => t.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => (t.length > 160 ? `${t.slice(0, 157)}...` : t));
}

/** One line per round from rounds/<n>/review.json and review-plan.json. */
export function roundRecords(paths) {
  const out = [];
  for (const n of listRounds(paths)) {
    const info = roundInfo(paths, n);
    const c = info.review?.counts;
    if (!c) continue;
    const states = Object.values(info.review.states ?? {});
    out.push({
      round: n,
      match: c.match ?? 0, small: c.small ?? 0, toFix: c.must ?? 0, notReached: c.notReached ?? 0,
      dataGap: c.dataGap ?? 0,
      carried: states.filter((s) => s.carried).length,
    });
  }
  return out;
}

/** Reviewer cost per batch, only where batches.json recorded any. */
export function reviewerRecords(paths) {
  const out = [];
  for (const n of listRounds(paths)) {
    const file = join(roundsDir(paths), String(n), 'batches.json');
    if (!existsSync(file)) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    for (const b of doc.batches ?? []) {
      const tokens = Number.isFinite(b.tokens) ? b.tokens : null;
      const mins = Number.isFinite(b.minutes) ? b.minutes : null;
      if (tokens === null && mins === null) continue;
      out.push({ round: n, batch: b.id, tokens, minutes: mins });
    }
  }
  return out;
}

/**
 * The run's record. `previous` is this feature's earlier line, whose autoChanges are kept.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {{ previous?: object|null, ciFailures?: { check: string, cause: string }[] }} [opts]
 */
export async function buildRecord(ctx, paths, opts = {}) {
  const state = await loadState(paths.state, { optional: true });
  const journal = state?.journal ?? [];
  const { phases, founder } = phasesFromJournal(journal);
  const file = join(paths.deliveryDir, 'workflow-improvements.md');
  const improvements = existsSync(file) ? parseImprovements(readFileSync(file, 'utf8')) : [];
  return {
    schemaVersion: 1,
    feature: paths.feature,
    endedAt: ctx.clock.now().toISOString(),
    pluginVersion: ctx.cli?.version ?? '0.0.0-dev',
    phases,
    founder,
    rounds: roundRecords(paths),
    reviewers: reviewerRecords(paths),
    ciAfterPr: opts.ciFailures ?? ciFailuresFromJournal(journal),
    improvements,
    autoChanges: opts.previous?.autoChanges ?? [],
  };
}

