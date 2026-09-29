// C2: compare this run with the earlier ones and turn what repeats into proposals. Pure. Owner: slice A2.
//
// A phase is a problem when its minutes are at least 30% over the median of the runs before it in
// two or more runs (this one included), or when this run alone is more than an hour over that
// median. The same improvement written up in two or more runs is a problem too. What the retro can
// author itself is small: a tunable one step, or a steer. Anything else is described and left to
// the size rule, which calls it large.

import { createHash } from 'node:crypto';
import { changeKey } from './size.mjs';
import { PHASES } from './record.mjs';
import { loadTunables } from './tunables.mjs';
import { loadModels } from './models.mjs';

export const SLOW_RATIO = 1.3;
export const SLOW_ALONE_MINUTES = 60;

export function median(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** An improvement entry with the words that vary between runs (numbers, punctuation, case) taken out. */
export function normaliseEntry(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The number a change is judged by, from one record. Names: phases.<phase>, ciFailures,
 * founder.waitMinutes, rounds.toFix (the to-fix count summed over the rounds), rounds.count.
 * @returns {number|null}
 */
export function metricValue(record, name) {
  if (!record) return null;
  const [head, tail] = String(name).split('.');
  if (head === 'phases' && PHASES.includes(tail)) return record.phases?.[tail] ?? null;
  if (name === 'ciFailures') return (record.ciAfterPr ?? []).length;
  if (name === 'founder.waitMinutes') return record.founder ? record.founder.waitMinutes : null;
  if (name === 'rounds.toFix') return record.rounds?.length ? record.rounds.reduce((n, r) => n + r.toFix, 0) : null;
  if (name === 'rounds.count') return record.rounds?.length ? record.rounds.length : null;
  // cost.total, cost.<role>, notDone.<role>: from the record's agents (and main session, for the total).
  const agents = record.agents ?? [];
  if (name === 'cost.total') return agents.length || record.main ? round2(agents.reduce((n, a) => n + (a.costUsd ?? 0), 0) + (record.main?.costUsd ?? 0)) : null;
  if (head === 'cost' && tail) { const mine = agents.filter((a) => a.role === tail); return mine.length ? round2(mine.reduce((n, a) => n + (a.costUsd ?? 0), 0)) : null; }
  if (head === 'notDone' && tail) { const mine = agents.filter((a) => a.role === tail); return mine.length ? mine.filter((a) => a.outcome !== 'done').length : null; }
  return null;
}

const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

/** A stable id for a change: the same change always gets the same id, so a re-run finds it in the ledger. */
export function idFor(change) {
  const key = changeKey(change) + (change.kind === 'tunable' ? `>${change.to}` : '');
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 8);
  const label = slug(change.key ?? change.brief ?? (change.kind === 'model' ? change.role : null) ?? change.text ?? change.description ?? change.kind) || 'change';
  return `${change.kind === 'brief-sentence' ? 'brief' : change.kind === 'warn-check' ? 'warn' : change.kind}-${label}-${hash}`.replace(/^-+/, '');
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const EFFORT_UP = { low: 'medium', medium: 'high', high: 'xhigh' };
export const NOT_DONE_LIMIT = 2;
export const OPUS_COST_FLOOR = 10;

/**
 * Model and effort changes the ledger's agents argue for, always as proposals (kind "model", never
 * small): a Sonnet role with two or more agents in this run that did not finish ("blocked",
 * "failed") goes up one effort step, or to Opus from high; an Opus role (the main session
 * excepted) whose agents all finished in this run and the one before, at $10 or more in this run,
 * is proposed for a trial on Sonnet at medium. Estimated lines never count. Pure.
 */
export function modelProposals(runs, current, models = loadModels()) {
  const out = [];
  if (current.estimate) return out;
  const prev = [...runs].reverse().find((r) => r.feature !== current.feature && !r.estimate && (r.agents ?? []).length);
  for (const [role, cfg] of Object.entries(models.roles)) {
    if (role === 'main') continue;
    const mine = (current.agents ?? []).filter((a) => a.role === role);
    if (!mine.length) continue;
    const notDone = mine.filter((a) => a.outcome !== 'done');
    if (cfg.model === 'sonnet' && notDone.length >= NOT_DONE_LIMIT) {
      const to = EFFORT_UP[cfg.effort] && cfg.effort !== 'high' ? { model: 'sonnet', effort: EFFORT_UP[cfg.effort] } : { model: 'opus', effort: 'high' };
      out.push({
        evidence: [{ feature: current.feature, phase: cfg.phase ?? 'none', minutesLost: round1(notDone.reduce((n, a) => n + (a.minutes ?? 0), 0)) }],
        change: { kind: 'model', role, from: { model: cfg.model, effort: cfg.effort }, to, changesModel: true, paths: ['models.json', 'agents/'], description: `models.json: move the ${role} role from ${cfg.model} at ${cfg.effort} to ${to.model} at ${to.effort}; ${notDone.length} of its ${mine.length} agents in ${current.feature} did not finish (${notDone.map((a) => a.outcome).join(', ')})` },
        metric: { name: `notDone.${role}`, baseline: notDone.length, better: 'lower' },
      });
    }
    const cost = mine.reduce((n, a) => n + (a.costUsd ?? 0), 0);
    const prevMine = (prev?.agents ?? []).filter((a) => a.role === role);
    if (cfg.model === 'opus' && cost >= OPUS_COST_FLOOR && !notDone.length && prevMine.length && prevMine.every((a) => a.outcome === 'done')) {
      out.push({
        evidence: [{ feature: current.feature, phase: cfg.phase ?? 'none', minutesLost: 0 }, { feature: prev.feature, phase: cfg.phase ?? 'none', minutesLost: 0 }],
        change: { kind: 'model', role, from: { model: cfg.model, effort: cfg.effort }, to: { model: 'sonnet', effort: 'medium' }, changesModel: true, paths: ['models.json', 'agents/'], description: `models.json: try the ${role} role on sonnet at medium for one run; on opus it finished every time in ${prev.feature} and ${current.feature} and cost $${round2(cost)} in ${current.feature}` },
        metric: { name: `cost.${role}`, baseline: round2(cost), better: 'lower' },
      });
    }
  }
  return out;
}

/**
 * @param {object[]} earlier  the ledger's other runs, oldest first
 * @param {object} current    this run's record
 * @param {{ tunables?: object, history?: object[] }} [opts] history: every autoChange already in the ledger
 * @returns {{ id: string, evidence: { feature: string, phase: string, minutesLost: number }[], change: object, metric: { name: string, baseline: number|null, better: 'lower'|'higher' } }[]}
 */
export function compare(earlier, current, opts = {}) {
  const tunables = opts.tunables ?? loadTunables();
  const known = new Set((opts.history ?? []).map((h) => h.id));
  const runs = [...earlier.filter((r) => r.feature !== current.feature), current];
  const out = [];

  for (const phase of PHASES) {
    const cur = current.phases?.[phase];
    if (typeof cur !== 'number') continue;
    const over = [];
    for (let i = 1; i < runs.length; i++) {
      const v = runs[i].phases?.[phase];
      const m = median(runs.slice(0, i).map((r) => r.phases?.[phase]));
      if (typeof v === 'number' && m !== null && m > 0 && v >= m * SLOW_RATIO) over.push({ feature: runs[i].feature, phase, minutesLost: round1(v - m) });
    }
    const base = median(runs.slice(0, -1).map((r) => r.phases?.[phase]));
    if (base === null) continue;
    const currentOver = over.some((e) => e.feature === current.feature);
    const aloneLost = cur - base;
    if (!((currentOver && over.length >= 2) || aloneLost > SLOW_ALONE_MINUTES)) continue;
    const evidence = currentOver ? over : [...over, { feature: current.feature, phase, minutesLost: round1(aloneLost) }];
    out.push({ evidence, change: authorPhaseFix(phase, cur, base, current.feature, tunables), metric: { name: `phases.${phase}`, baseline: base, better: 'lower' } });
  }

  // The same improvement in two or more runs, this one included.
  const seen = new Map();
  for (const r of runs) {
    for (const entry of r.improvements ?? []) {
      const k = normaliseEntry(entry);
      if (!k) continue;
      if (!seen.has(k)) seen.set(k, { entry, features: new Set() });
      seen.get(k).features.add(r.feature);
    }
  }
  const baselineFix = median(runs.slice(0, -1).map((r) => metricValue(r, 'rounds.toFix')));
  for (const [k, { features }] of seen) {
    if (features.size < 2 || !features.has(current.feature)) continue;
    const entry = (current.improvements ?? []).find((e) => normaliseEntry(e) === k);
    if (!entry) continue;
    out.push({
      evidence: [...features].map((feature) => ({ feature, phase: 'improvement', minutesLost: 0 })),
      change: { kind: 'steer', text: entry },
      metric: { name: 'rounds.toFix', baseline: baselineFix, better: 'lower' },
    });
  }

  out.push(...modelProposals(runs, current, opts.models));

  const ids = new Set();
  return out.map((p) => ({ id: idFor(p.change), ...p })).filter((p) => !known.has(p.id) && !ids.has(p.id) && ids.add(p.id));
}

/** What the retro itself can author for a slow phase: raise the review batch one step; otherwise describe it. */
function authorPhaseFix(phase, minutes, base, feature, tunables) {
  if (phase === 'review') {
    const t = tunables['review.maxBatchItems'];
    if (t && Number.isFinite(t.value)) {
      const to = Math.min(t.value + (t.step ?? 1), t.max ?? t.value);
      if (to > t.value) return { kind: 'tunable', key: 'review.maxBatchItems', from: t.value, to };
    }
  }
  const pct = Math.round((minutes / base - 1) * 100);
  return { kind: 'other', description: `The ${phase} phase took ${minutes} minutes in ${feature}, ${pct}% over the median of ${base}. Find what made it slow and decide the fix.` };
}

/**
 * Proposals a person or the session hands in with `retro --propose <file.json>`: one object or an
 * array of { change, evidence?, metric?, id? }. Checked for shape only; the size rule decides the rest.
 * @returns {{ id: string, evidence: object[], change: object, metric: object }[]}
 */
export function proposalsFromInput(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map((p, i) => {
    if (!p || typeof p !== 'object' || !p.change || typeof p.change !== 'object' || typeof p.change.kind !== 'string') {
      throw new Error(`proposal ${i + 1}: needs a change with a kind`);
    }
    const metric = p.metric && typeof p.metric.name === 'string' && ['lower', 'higher'].includes(p.metric.better)
      ? { name: p.metric.name, baseline: Number.isFinite(p.metric.baseline) ? p.metric.baseline : null, better: p.metric.better }
      : { name: 'rounds.toFix', baseline: null, better: 'lower' };
    return { id: p.id && /^[a-z0-9][a-z0-9-]*$/.test(p.id) ? p.id : idFor(p.change), evidence: Array.isArray(p.evidence) ? p.evidence : [], change: p.change, metric };
  });
}
