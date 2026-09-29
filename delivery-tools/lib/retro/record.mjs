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
import { projectDirFor, scanAgents, scanMain } from './usage.mjs';
import { costOf } from './models.mjs';

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
/** Journal lines that record something rather than finish a step: they never end a phase's time. */
const RECORDS = ['agent', 'wait'];
const isRecord = (command) => RECORDS.some((w) => command === w || command.startsWith(`${w} `));
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

/** The pieces of [a,b), each marked whether it lies inside one of the (merged, sorted) windows. */
function split(a, b, windows) {
  const out = [];
  let t = a;
  for (const [s, e] of windows) {
    if (e <= t || s >= b) continue;
    if (s > t) out.push([t, s, false]);
    out.push([Math.max(s, t), Math.min(e, b), true]);
    t = Math.min(e, b);
  }
  if (t < b) out.push([t, b, false]);
  return out;
}

/**
 * Minutes per phase and the founder's waiting, from a run's journal. Pure.
 * The time up to a journal line belongs to the phase of its command, except time inside a build
 * agent's window (`buildWindows`, [start, end] in ms): that is build time whichever command ends
 * the gap, since a picture run's builder works in the background between two commands.
 * @param {{ at: string, event: string }[]} journal
 * @param {{ buildWindows?: [number, number][] }} [opts]
 * @returns {{ phases: Record<string, number|null>, founder: { waitMinutes: number, questions: number }|null }}
 */
export function phasesFromJournal(journal, { buildWindows = [] } = {}) {
  const all = (journal ?? []).map((e) => ({ t: Date.parse(e.at), ...parseEvent(e.event) }));
  const entries = all.filter((e) => !isRecord(e.command));
  const waits = [];
  let open = null;
  let questions = 0;
  for (const e of entries) {
    if (ASKS.some((w) => startsWith(e.command, w))) { questions += 1; if (open === null) open = e.t; }
    else if (ANSWERS.some((w) => startsWith(e.command, w)) && open !== null) { waits.push([open, e.t]); open = null; }
  }
  // A founder wait logged by hand (`delivery log-wait --founder`) ends at its own time.
  let logged = 0;
  for (const e of all) {
    if (e.command !== 'wait founder') continue;
    const m = Number(e.counts.minutes);
    if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(e.t)) continue;
    waits.push([e.t - m * 60000, e.t]);
    logged += 1;
  }
  const phases = Object.fromEntries(PHASES.map((p) => [p, null]));
  const builds = mergeIntervals(buildWindows.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a));
  for (let i = 1; i < entries.length; i++) {
    const phase = phaseOfCommand(entries[i].command);
    if (!Number.isFinite(entries[i].t) || !Number.isFinite(entries[i - 1].t)) continue;
    for (const [a, b, inBuild] of split(entries[i - 1].t, entries[i].t, builds)) {
      const p = inBuild ? 'build' : phase;
      if (p) phases[p] = (phases[p] ?? 0) + outside(a, b, waits);
    }
  }
  for (const p of PHASES) if (phases[p] !== null) phases[p] = minutes(phases[p]);
  const seen = questions > 0 || waits.length > 0;
  const merged = mergeIntervals(waits);
  const founder = seen ? { waitMinutes: minutes(merged.reduce((n, [s, e]) => n + (e - s), 0)), questions: questions + logged } : null;
  return { phases, founder, slotWaits: slotWaitsFromJournal(journal) };
}

function mergeIntervals(list) {
  const out = [];
  for (const [s, e] of [...list].sort((a, b) => a[0] - b[0])) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Time spent waiting for a machine slot (shoots, e2e), from `wait slot` lines. Null when none. Pure. */
export function slotWaitsFromJournal(journal) {
  let count = 0, total = 0;
  for (const e of journal ?? []) {
    const p = parseEvent(e.event);
    if (p.command !== 'wait slot') continue;
    const m = Number(p.counts.minutes);
    if (!Number.isFinite(m)) continue;
    count += 1; total += m;
  }
  return count ? { count, minutes: Math.round(total * 10) / 10 } : null;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * The agents the journal recorded (`agent` lines from the SubagentStop hook or `delivery log-agent`),
 * one per id: a later line for the same id fills in or overrides fields (an outcome, say). Pure.
 */
export function agentsFromJournal(journal) {
  const byId = new Map();
  for (const e of journal ?? []) {
    const p = parseEvent(e.event);
    if (p.command !== 'agent') continue;
    const c = p.counts;
    const id = c.id ?? `j${e.seq ?? byId.size}`;
    const prev = byId.get(id) ?? { id, role: 'other', phase: null, model: 'unknown', effort: null, minutes: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0, costUsd: null, outcome: 'done', endedAt: e.at ?? null };
    const next = { ...prev };
    if (c.role) next.role = c.role;
    if ('phase' in c) next.phase = c.phase === 'none' ? null : c.phase;
    if (c.model) next.model = c.model;
    if (c.effort) next.effort = c.effort === 'none' ? null : c.effort;
    for (const [k, f] of [['minutes', 'minutes'], ['in', 'tokensIn'], ['cached', 'tokensCached'], ['out', 'tokensOut']]) if (num(c[k]) !== null) next[f] = num(c[k]);
    if (c.outcome) next.outcome = c.outcome;
    next.costUsd = num(c.cost) ?? costOf(next.model, next) ?? prev.costUsd;
    byId.set(id, next);
  }
  // A hook line is written when the agent stops: it started `minutes` before.
  return [...byId.values()].map((a) => ({ ...a, startedAt: a.endedAt ? new Date(Date.parse(a.endedAt) - (a.minutes ?? 0) * 60000).toISOString() : null }));
}

/** The windows the build-phase agents worked in, [start, end] in ms. */
export function buildWindowsOf(agents) {
  return agents.filter((a) => a.phase === 'build' && a.startedAt && a.minutes > 0).map((a) => { const s = Date.parse(a.startedAt); return [s, s + a.minutes * 60000]; });
}

/** Per phase: the models its agents used, their minutes, tokens and estimated cost. Pure. */
export function phaseCost(agents) {
  const out = {};
  for (const a of agents) {
    if (!a.phase) continue;
    const p = (out[a.phase] ??= { models: [], agentMinutes: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0, costUsd: 0 });
    if (!p.models.includes(a.model)) p.models.push(a.model);
    p.agentMinutes += a.minutes ?? 0;
    p.tokensIn += a.tokensIn ?? 0; p.tokensCached += a.tokensCached ?? 0; p.tokensOut += a.tokensOut ?? 0;
    p.costUsd += a.costUsd ?? 0;
  }
  for (const p of Object.values(out)) { p.agentMinutes = Math.round(p.agentMinutes * 10) / 10; p.costUsd = Math.round(p.costUsd * 100) / 100; }
  return out;
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

/** The shadow grader's totals over every round's shadow.json, or null when no round has one. */
export function shadowTotals(paths) {
  let found = false;
  const t = { answered: 0, errors: 0 };
  for (const n of listRounds(paths)) {
    const file = join(roundsDir(paths), String(n), 'shadow.json');
    if (!existsSync(file)) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    found = true;
    for (const a of doc.answers ?? []) { if (a.error) t.errors += 1; else t.answered += 1; }
  }
  return found ? t : null;
}

/**
 * The agents of a run: every one the journal recorded, plus any the run's transcripts show that the
 * journal missed (a hook that did not fire). Transcript entries carry no effort: nothing records it.
 */
export function mergeAgents(fromJournal, fromTranscripts) {
  const ids = new Set(fromJournal.map((a) => a.id));
  return [...fromJournal, ...fromTranscripts.filter((a) => !ids.has(a.id))];
}

/** Drop the fields the ledger does not keep. */
const ledgerAgent = ({ id, role, phase, model, effort, minutes: m, tokensIn, tokensCached, tokensOut, costUsd, outcome }) => ({ id, role, phase, model, effort, minutes: m, tokensIn, tokensCached, tokensOut, costUsd, outcome });

/**
 * The run's record. `previous` is this feature's earlier line, whose autoChanges are kept.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {{ previous?: object|null, ciFailures?: { check: string, cause: string }[], estimate?: boolean, endedAt?: string, transcripts?: string|false }} [opts]
 *   transcripts: Claude Code's folder of this worktree's sessions (default: found from the worktree
 *   path), or false to read the journal only
 */
export async function buildRecord(ctx, paths, opts = {}) {
  const state = await loadState(paths.state, { optional: true });
  const journal = state?.journal ?? [];
  const file = join(paths.deliveryDir, 'workflow-improvements.md');
  const improvements = existsSync(file) ? parseImprovements(readFileSync(file, 'utf8')) : [];
  const shadow = shadowTotals(paths);
  const endedAt = opts.endedAt ?? ctx.clock.now().toISOString();
  const times = journal.map((e) => Date.parse(e.at)).filter(Number.isFinite);
  const window = { from: times.length ? Math.min(...times) : -Infinity, to: Date.parse(endedAt) };
  const dir = opts.transcripts === false ? null : (opts.transcripts ?? projectDirFor(paths.repoRoot, ctx.env ?? process.env));
  const found = mergeAgents(agentsFromJournal(journal), dir ? scanAgents(dir, window) : []);
  const { phases, founder, slotWaits } = phasesFromJournal(journal, { buildWindows: buildWindowsOf(found) });
  const agents = found.map(ledgerAgent);
  const main = dir ? scanMain(dir, window) : null;
  return {
    schemaVersion: 2,
    feature: paths.feature,
    endedAt,
    pluginVersion: ctx.cli?.version ?? '0.0.0-dev',
    estimate: Boolean(opts.estimate),
    phases,
    phaseCost: phaseCost(agents),
    founder,
    slotWaits,
    main,
    agents,
    rounds: roundRecords(paths),
    reviewers: reviewerRecords(paths),
    ciAfterPr: opts.ciFailures ?? ciFailuresFromJournal(journal),
    ...(shadow ? { shadow } : {}),
    improvements,
    autoChanges: opts.previous?.autoChanges ?? [],
  };
}
