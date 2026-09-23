// M8: message-file lint for every key the plan names, in every locale the profile lists (spec 8.1).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lintMessages } from './message-lint.mjs';
import { BUILD_CLASSES } from '../plan/check.mjs';
import { excerpt } from './text.mjs';

const EXPECT = {
  'missing-key': 'the key in every locale',
  'invalid-icu': 'a message that parses',
  'count-outside-plural': 'every count inside an ICU plural',
  'plural-missing': 'an ICU plural, as the plan says',
  'banned-word': "the product's own word",
  'identical-to-primary': 'a translation',
  'extra-key': 'no key the primary locale lacks',
};

/** The plan's copy keys (built rows only), which of them are plural, and the first row naming each. */
export function planKeys(plan) {
  const keys = [];
  const plural = new Set();
  const owner = new Map();
  for (const r of plan?.rows ?? []) {
    if (!BUILD_CLASSES.has(r.class)) continue;
    for (const c of r.copy ?? []) {
      if (!owner.has(c.key)) { owner.set(c.key, r.id); keys.push(c.key); }
      if (c.plural) plural.add(c.key);
    }
  }
  return { keys, plural, owner };
}

/**
 * @param {object} env loadCheckEnv()
 * @param {{ locale: string, file: string, messages: object }[]} locales
 */
export function messageFindings(env, locales) {
  const { keys, plural, owner } = planKeys(env.plan);
  const audit = env.profile.audit ?? {};
  const hits = lintMessages({
    locales, primary: env.primaryLocale, keys, pluralKeys: plural,
    bannedWords: audit.bannedWords ?? {}, sameAsPrimaryOk: audit.sameAsEnglishOk ?? [],
  });
  return hits.map((h) => env.finding('M8', {
    rule: h.rule,
    state: owner.get(h.key) ?? h.key,
    where: `${h.file}#${h.key}${h.placeholder ? `:{${h.placeholder}}` : ''}`,
    design: EXPECT[h.rule],
    live: h.value === null ? '(missing)' : excerpt(h.value),
    cause: h.detail,
  }));
}

/**
 * Read the profile's message files from a directory (the working tree), or from a git ref.
 * @returns {Promise<{ locales: object[], failures: { code: string, message: string }[] }>}
 */
export async function readMessageFiles(env, { ref = null } = {}) {
  const locales = [];
  const failures = [];
  for (const m of env.profile.paths?.messages ?? []) {
    let text = null;
    if (ref) {
      const buf = await env.ctx.git.show(ref, m.file);
      text = buf === null ? null : buf.toString('utf8');
    } else {
      try { text = await readFile(join(env.paths.repoRoot, m.file), 'utf8'); } catch { text = null; }
    }
    if (text === null) { failures.push({ code: 'M8', message: `message file ${m.file} (${m.locale}) is missing${ref ? ` at ${ref}` : ''}` }); continue; }
    try { locales.push({ locale: m.locale, file: m.file, messages: JSON.parse(text) }); } catch (err) {
      failures.push({ code: 'M8', message: `message file ${m.file} is not valid JSON: ${err.message}` });
    }
  }
  return { locales, failures };
}

export default {
  id: 'M8',
  needsCapture: false,
  async run(env) {
    if (!env.plan) return { findings: [], failures: [{ code: 'M8', message: 'no plan.json: M8 lints the keys the plan names' }] };
    const { locales, failures } = await readMessageFiles(env);
    return { findings: messageFindings(env, locales), failures, inScope: () => true };
  },
};
