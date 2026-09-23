// M12: the founder's organisation, read-only (spec 8.1, 9): M7 and M10 on every state reached
// there, plus the plan's invariants, which are also checked in the messy world the suite seeds on
// purpose. A broken invariant is P1; the rest keep M7's and M10's severities.

import { copyLintFindings, inScopeByFile } from './m7.mjs';
import { errorFindings } from './m10.mjs';
import { parseInvariant, evaluateInvariant } from './invariants.mjs';
import { parseElements, excerpt } from './text.mjs';

export default {
  id: 'M12',
  needsCapture: true,
  async run(env) {
    const messy = new Set((env.plan?.worlds ?? []).filter((w) => w.kind === 'messy').map((w) => w.id));
    const real = env.capture.items.filter((i) => env.isRealOrg(i.item));
    const findings = [
      ...(await copyLintFindings(env, real, { check: 'M12', rulePrefix: 'copy:' })),
      ...(await errorFindings(env, real, { check: 'M12', rulePrefix: 'errors:' })).findings,
    ];
    const failures = [];
    const seen = new Set();
    for (const it of env.capture.items) {
      if (!(env.isRealOrg(it.item) || messy.has(it.item.world)) || it.item.status !== 'reached') continue;
      const row = env.rows.get(it.item.state);
      if (!row || row.class === 'cut' || !(row.invariants ?? []).length) continue;
      const txt = await it.txt();
      if (txt === null) continue;
      const els = parseElements(txt);
      for (const text of row.invariants) {
        const inv = parseInvariant(text);
        if (!inv) {
          const k = `unparsed|${row.id}|${text}`;
          if (!seen.has(k)) { seen.add(k); failures.push({ code: 'M12', message: `${row.id}: invariant "${text}" is not machine-checkable (plan check says how to write it)` }); }
          continue;
        }
        const res = evaluateInvariant(inv, els);
        const k = `${row.id}|${text}|${it.item.world}`;
        if (res.ok || seen.has(k)) continue;
        seen.add(k);
        findings.push(env.finding('M12', {
          rule: 'invariant', state: row.id, where: `${it.item.files.txt}#invariant:${excerpt(text, 80)}`,
          design: text, live: `${res.detail} in ${it.item.world}`,
        }));
      }
    }
    if (!real.length) {
      return { findings, failures, notes: ['M12: this capture has no item of the founder\'s organisation (world "real-org"); only invariants in the messy world were checked'], inScope: scope(env) };
    }
    return { findings, failures, inScope: scope(env) };
  },
};

function scope(env) {
  const byFile = inScopeByFile(env);
  const logs = new Set(env.capture.items.map((i) => i.item.files.errors ?? i.item.files.txt));
  return (f) => byFile(f) || logs.has(String(f.where).replace(/#.*$/, '')) || env.capture.items.some((i) => String(f.where).startsWith(`${i.item.files.txt}#`));
}
