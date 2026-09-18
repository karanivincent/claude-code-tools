// M10: console errors and failed requests per capture (spec 8.1), from each item's capture log.
// A request the plan intercepts, or one the real-org guard aborts on purpose, is never a finding.
// The founder's organisation is checked by M12.

import { sha256 } from '../core/hash.mjs';
import { excerpt } from './text.mjs';

const short = (s) => sha256(String(s)).slice(0, 10);
// Query strings carry ids and timestamps; the same failing endpoint is one problem.
const endpoint = (url) => String(url).replace(/[?#].*$/, '').replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n');

/**
 * @param {object} env
 * @param {import('./env.mjs').ItemEnv[]} items
 * @param {{ check: string, rulePrefix?: string }} opts
 * @returns {Promise<{ findings: object[], notes: string[] }>}
 */
export async function errorFindings(env, items, { check, rulePrefix = '' }) {
  const findings = [];
  const notes = [];
  const seen = new Set();
  let noLog = 0;
  for (const it of items) {
    if (env.rows.get(it.item.state)?.class === 'cut') continue;
    const log = await it.errors();
    if (!log) { noLog++; continue; }
    const logFile = it.item.files.errors ?? it.item.files.txt;
    const add = (rule, message, cause) => {
      const key = JSON.stringify([it.item.state, rule, message]);
      if (seen.has(key)) return;
      seen.add(key);
      findings.push(env.finding(check, {
        rule: `${rulePrefix}${rule}`,
        state: it.item.state,
        where: `${logFile}#${rule}:${short(message)}`,
        design: 'no console error and no failed request',
        live: excerpt(message, 400),
        ...(cause ? { cause: excerpt(cause, 300) } : {}),
      }));
    };
    for (const c of log.console ?? []) {
      if (c.type === 'error' || c.type === 'pageerror') add('console-error', `${c.type}: ${c.text}`, c.location);
    }
    for (const r of log.requests ?? []) {
      if (r.intercepted || r.aborted) continue;
      if ((r.status !== null && r.status >= 400) || r.failure) {
        add('failed-request', `${r.method} ${endpoint(r.url)} ${r.failure ? `failed: ${r.failure}` : `answered ${r.status}`}`, r.url);
      }
    }
  }
  if (noLog) notes.push(`${check}: ${noLog} capture item(s) have no readable capture log; their errors were not checked`);
  return { findings, notes };
}

/** Findings located in a capture log (or its txt) of this run are in scope. */
export function inScopeByLog(env) {
  const files = new Set((env.capture?.items ?? []).map((i) => i.item.files.errors ?? i.item.files.txt));
  return (f) => files.has(String(f.where).replace(/#.*$/, ''));
}

export default {
  id: 'M10',
  needsCapture: true,
  async run(env) {
    const items = env.capture.items.filter((i) => !env.isRealOrg(i.item));
    const { findings, notes } = await errorFindings(env, items, { check: 'M10' });
    return { findings, failures: [], notes, inScope: inScopeByLog(env) };
  },
};
