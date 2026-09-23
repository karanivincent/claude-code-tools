// M16: accessibility, from the axe results the capture records on desktop captures (spec 8.1):
// serious or critical P2, moderate P3, minor not reported. One finding per state, rule and theme.

import { inScopeByLog } from './m10.mjs';

const RULE = { critical: 'axe-critical', serious: 'axe-serious', moderate: 'axe-moderate' };

export default {
  id: 'M16',
  needsCapture: true,
  async run(env) {
    const findings = [];
    const seen = new Set();
    let ran = 0;
    for (const it of env.capture.items) {
      if (env.rows.get(it.item.state)?.class === 'cut') continue;
      const log = await it.errors();
      if (!Array.isArray(log?.axe)) continue;
      ran++;
      for (const v of log.axe) {
        const rule = RULE[v.impact];
        if (!rule) continue;
        const key = JSON.stringify([it.item.state, v.id, it.item.theme]);
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(env.finding('M16', {
          rule,
          state: it.item.state,
          where: `${it.item.files.errors}#axe:${v.id}:${it.item.theme}`,
          design: 'no serious or critical accessibility violation',
          live: `${v.id} (${v.impact}, ${v.nodes} node${v.nodes === 1 ? '' : 's'}): ${v.help}`,
        }));
      }
    }
    const notes = ran ? [] : ['M16: no capture item carries axe results; accessibility was not checked'];
    return { findings, failures: [], notes, inScope: inScopeByLog(env) };
  },
};
