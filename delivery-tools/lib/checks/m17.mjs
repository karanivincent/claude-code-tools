// M17: performance per capture (spec 8.1): request count and load time, against the same state's
// newest baseline capture when there is one, else against fixed ceilings. Always P3, never
// blocking. First-load JavaScript per route needs build output and is not measured here.

import { join } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { readJson } from '../core/fs.mjs';
import { newestCaptureRun } from './env.mjs';
import { inScopeByLog } from './m10.mjs';

export const CEILINGS = Object.freeze({ requestCount: 150, loadMs: 5000 });
// Worse than the baseline by both this factor and this amount.
const GROWTH = { factor: 1.5, requestCount: 10, loadMs: 500 };

async function baselinePerf(env) {
  const runId = await newestCaptureRun(env.paths, { mode: 'baseline' });
  if (!runId || runId === env.capture.runId) return new Map();
  const doc = await readArtefact(env.paths, 'capture', { key: runId, optional: true }).catch(() => null);
  const out = new Map();
  for (const item of doc?.items ?? []) {
    if (!item.files.errors || out.has(item.state)) continue;
    const log = await readJson(join(env.paths.captureDir(runId), item.files.errors), { optional: true }).catch(() => null);
    if (log?.perf) out.set(item.state, log.perf);
  }
  return out;
}

export default {
  id: 'M17',
  needsCapture: true,
  async run(env) {
    const base = await baselinePerf(env);
    const findings = [];
    const seen = new Set();
    for (const it of env.capture.items) {
      if (env.rows.get(it.item.state)?.class === 'cut') continue;
      const perf = (await it.errors())?.perf;
      if (!perf) continue;
      const b = base.get(it.item.state);
      for (const [metric, rule] of [['requestCount', 'request-count'], ['loadMs', 'load-time']]) {
        const v = perf[metric];
        const over = b ? v > b[metric] * GROWTH.factor && v - b[metric] > GROWTH[metric] : v > CEILINGS[metric];
        if (!over) continue;
        const key = JSON.stringify([it.item.state, rule]);
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(env.finding('M17', {
          rule,
          state: it.item.state,
          where: `${it.item.files.errors}#${rule}`,
          design: b ? `about the baseline's ${Math.round(b[metric])}` : `under ${CEILINGS[metric]}`,
          live: `${Math.round(v)} ${metric === 'loadMs' ? 'ms' : 'requests'}`,
        }));
      }
    }
    return { findings, failures: [], notes: ['M17: first-load JavaScript per route is not measured (it needs build output)'], inScope: inScopeByLog(env) };
  },
};
