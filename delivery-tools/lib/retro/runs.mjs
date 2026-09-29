// The cross-run view of the runs ledger (`delivery runs`): time by phase in %, time and cost by
// model, rounds to green and match rate per round. Pure: records in, rows and lines out.

import { PHASES } from './record.mjs';

const r1 = (n) => Math.round(n * 10) / 10;
const pct = (part, whole) => (whole > 0 && part !== null ? Math.round((part / whole) * 100) : null);

/** The first round with nothing to fix and nothing unreached; null when no round got there. */
export function roundsToGreen(rounds) {
  const g = (rounds ?? []).find((r) => r.toFix === 0 && r.notReached === 0);
  return g ? g.round : null;
}

/** Each round's share of items that matched, in %. */
export function matchRates(rounds) {
  return (rounds ?? []).map((r) => {
    const all = r.match + r.small + r.toFix + r.notReached;
    return all ? Math.round((r.match / all) * 100) : null;
  });
}

const totalMinutes = (rec) => PHASES.reduce((n, p) => n + (rec.phases?.[p] ?? 0), 0);
const agentCost = (rec) => (rec.agents ?? []).reduce((n, a) => n + (a.costUsd ?? 0), 0);

/** One row per run. */
export function runRows(records) {
  return records.map((rec) => {
    const total = totalMinutes(rec);
    const cost = agentCost(rec) + (rec.main?.costUsd ?? 0);
    const priced = (rec.agents ?? []).length > 0 || rec.main;
    return {
      feature: rec.feature,
      estimate: Boolean(rec.estimate),
      endedAt: rec.endedAt,
      minutes: r1(total),
      phasePct: Object.fromEntries(PHASES.map((p) => [p, pct(rec.phases?.[p] ?? null, total)])),
      founderWait: rec.founder?.waitMinutes ?? null,
      slotWait: rec.slotWaits?.minutes ?? null,
      rounds: (rec.rounds ?? []).length,
      roundsToGreen: roundsToGreen(rec.rounds),
      matchRates: matchRates(rec.rounds),
      // R13 of stable picture data: data gaps per round, the plan's measure of success (near zero from round 1).
      dataGaps: (rec.rounds ?? []).map((r) => (Number.isFinite(r.dataGap) ? r.dataGap : null)),
      // R12: masks are counted so they cannot spread unseen.
      masked: (rec.rounds ?? []).map((r) => (Number.isFinite(r.masked) ? r.masked : null)),
      costUsd: priced ? Math.round(cost * 100) / 100 : null,
    };
  });
}

/**
 * Time and cost by model over the runs: agent minutes and count per model, and the main session's
 * minutes (the run's own clock) under its model.
 */
export function modelRows(records) {
  const by = new Map();
  const row = (m) => { if (!by.has(m)) by.set(m, { model: m, agents: 0, agentMinutes: 0, mainMinutes: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0, costUsd: 0 }); return by.get(m); };
  for (const rec of records) {
    for (const a of rec.agents ?? []) {
      const x = row(a.model);
      x.agents += 1; x.agentMinutes += a.minutes ?? 0;
      x.tokensIn += a.tokensIn ?? 0; x.tokensCached += a.tokensCached ?? 0; x.tokensOut += a.tokensOut ?? 0;
      x.costUsd += a.costUsd ?? 0;
    }
    if (rec.main) {
      const x = row(rec.main.model);
      x.mainMinutes += totalMinutes(rec);
      x.tokensIn += rec.main.tokensIn; x.tokensCached += rec.main.tokensCached; x.tokensOut += rec.main.tokensOut;
      x.costUsd += rec.main.costUsd ?? 0;
    }
  }
  const rows = [...by.values()].map((x) => ({ ...x, agentMinutes: r1(x.agentMinutes), mainMinutes: r1(x.mainMinutes), costUsd: Math.round(x.costUsd * 100) / 100 }));
  const all = rows.reduce((n, x) => n + x.costUsd, 0);
  const allMin = rows.reduce((n, x) => n + x.agentMinutes, 0);
  return rows
    .map((x) => ({ ...x, costPct: pct(x.costUsd, all), agentTimePct: pct(x.agentMinutes, allMin) }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

/** Time and cost by role over the runs, so a routing change can be read role by role. */
export function roleRows(records) {
  const by = new Map();
  for (const rec of records) {
    for (const a of rec.agents ?? []) {
      const k = `${a.role}|${a.model}`;
      const x = by.get(k) ?? { role: a.role, model: a.model, agents: 0, minutes: 0, costUsd: 0, notDone: 0 };
      x.agents += 1; x.minutes += a.minutes ?? 0; x.costUsd += a.costUsd ?? 0;
      if (a.outcome !== 'done') x.notDone += 1;
      by.set(k, x);
    }
  }
  return [...by.values()].map((x) => ({ ...x, minutes: r1(x.minutes), costUsd: Math.round(x.costUsd * 100) / 100 })).sort((a, b) => b.costUsd - a.costUsd);
}

function table(head, rows) {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ').trimEnd();
  return [line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)];
}

const dash = (v, suffix = '') => (v === null || v === undefined ? '-' : `${v}${suffix}`);
const money = (v) => (v === null || v === undefined ? '-' : `$${v.toFixed(2)}`);

/** The report `delivery runs` prints. */
export function runsReport(records) {
  if (!records.length) return ['no runs in the ledger yet: delivery retro (land runs it) writes one line per run; delivery backfill-run records an earlier one'];
  const runs = runRows(records);
  const out = ['Time by phase (% of the run\'s own minutes; founder waits taken out)', ''];
  out.push(...table(
    ['run', 'min', ...PHASES, 'founder', 'slots', 'cost'],
    runs.map((r) => [`${r.feature}${r.estimate ? ' (est.)' : ''}`, r.minutes, ...PHASES.map((p) => dash(r.phasePct[p], '%')), dash(r.founderWait, 'm'), dash(r.slotWait, 'm'), money(r.costUsd)]),
  ));
  out.push('', 'Rounds', '');
  out.push(...table(
    ['run', 'rounds', 'to green', 'match rate per round', 'data gaps per round', 'masked'],
    runs.map((r) => [r.feature, r.rounds, r.roundsToGreen ?? (r.rounds ? `not after ${r.rounds}` : '-'), r.matchRates.length ? r.matchRates.map((m) => dash(m, '%')).join(' > ') : '-', r.dataGaps.length ? r.dataGaps.map((g) => dash(g)).join(' > ') : '-', r.masked.some((m) => m !== null) ? r.masked.map((m) => dash(m)).join(' > ') : '-']),
  ));
  const models = modelRows(records);
  out.push('', 'Time and cost by model (all runs)', '');
  out.push(...(models.length ? table(
    ['model', 'agents', 'agent min', 'agent time', 'main min', 'tokens in', 'cached', 'out', 'cost', 'share'],
    models.map((m) => [m.model, m.agents, m.agentMinutes, dash(m.agentTimePct, '%'), m.mainMinutes, m.tokensIn, m.tokensCached, m.tokensOut, money(m.costUsd), dash(m.costPct, '%')]),
  ) : ['no agent or main-session numbers recorded yet']));
  const roles = roleRows(records);
  if (roles.length) {
    out.push('', 'By role (all runs)', '');
    out.push(...table(['role', 'model', 'agents', 'min', 'cost', 'not done'], roles.map((x) => [x.role, x.model, x.agents, x.minutes, money(x.costUsd), x.notDone])));
  }
  if (runs.some((r) => r.estimate)) out.push('', '(est.) lines were written after the run from its journal and transcripts: phase minutes and costs are estimates, and effort was not recorded.');
  return out;
}
