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
  return null;
}

const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

/** A stable id for a change: the same change always gets the same id, so a re-run finds it in the ledger. */
export function idFor(change) {
  const key = changeKey(change) + (change.kind === 'tunable' ? `>${change.to}` : '');
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 8);
  const label = slug(change.key ?? change.brief ?? change.text ?? change.description ?? change.kind) || 'change';
  return `${change.kind === 'brief-sentence' ? 'brief' : change.kind === 'warn-check' ? 'warn' : change.kind}-${label}-${hash}`.replace(/^-+/, '');
}

const round1 = (n) => Math.round(n * 10) / 10;

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
