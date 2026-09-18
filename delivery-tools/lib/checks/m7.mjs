// M7: copy lint on every captured text element, per element, in every locale (spec 8.1). The word
// lists come from the profile (audit.bannedWords per locale, audit.developerPhrases, audit.dateShape).
// The founder's organisation is linted by M12, not here.

import { makeCopyLinter, M7_RULES } from './copy-lint.mjs';
import { parseElements, elementLocation, excerpt } from './text.mjs';

/**
 * Lint the given capture items; one finding per state, locale, rule and element text (the same
 * leak at two widths or themes is one problem), located at the first item in the env's order.
 * @param {object} env loadCheckEnv()
 * @param {import('./env.mjs').ItemEnv[]} items
 * @param {{ check: string, rulePrefix?: string }} opts
 */
export async function copyLintFindings(env, items, { check, rulePrefix = '' }) {
  const audit = env.profile.audit ?? {};
  const namespaces = await env.namespaces();
  const linters = new Map();
  const linterFor = (locale) => {
    if (!linters.has(locale)) {
      const lang = locale.split('-')[0];
      linters.set(locale, makeCopyLinter({
        locale,
        bannedWords: audit.bannedWords?.[locale] ?? audit.bannedWords?.[lang] ?? [],
        developerPhrases: audit.developerPhrases ?? [],
        dateShape: audit.dateShape,
        namespaces,
      }));
    }
    return linters.get(locale);
  };
  const seen = new Set();
  const findings = [];
  for (const it of items) {
    if (env.rows.get(it.item.state)?.class === 'cut') continue;
    const txt = await it.txt();
    if (txt === null) continue;
    const lint = linterFor(it.item.locale);
    for (const el of parseElements(txt)) {
      const hits = lint(el.text);
      const byRule = new Map();
      for (const h of hits) byRule.set(h.rule, [...(byRule.get(h.rule) ?? []), h.match]);
      for (const [rule, matches] of byRule) {
        const key = JSON.stringify([it.item.state, it.item.locale, rule, el.text]);
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(env.finding(check, {
          rule: `${rulePrefix}${rule}`,
          state: it.item.state,
          where: `${it.item.files.txt}:${elementLocation(el)}`,
          design: M7_RULES[rule].expect,
          live: `${excerpt(el.text)} [${[...new Set(matches)].map((m) => JSON.stringify(m)).join(', ')}]`,
        }));
      }
    }
  }
  return findings;
}

/** Findings of a text check are in scope when their capture file is part of this run. */
export function inScopeByFile(env) {
  const files = new Set((env.capture?.items ?? []).map((i) => i.item.files.txt));
  return (f) => files.has(String(f.where).replace(/:[^:]*$/, ''));
}

export default {
  id: 'M7',
  needsCapture: true,
  async run(env) {
    const items = env.capture.items.filter((i) => !env.isRealOrg(i.item));
    return { findings: await copyLintFindings(env, items, { check: 'M7' }), failures: [], inScope: inScopeByFile(env) };
  },
};
