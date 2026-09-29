// Which model and effort each role uses, and what a model costs (models.json at the plugin root).
// The skills dispatch by role; the ledger prices agents with it. The retro may propose a change to
// the file but never makes one. Pure apart from reading the file once.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODELS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'models.json');

/** @returns {{ roles: Record<string, { model: string, effort: string, phase: string|null, edits: boolean, agentTypes?: string[], check?: string }>, models: Record<string, { id: string, match: string, inPerMTok: number, outPerMTok: number }>, cacheReadFactor: number }} */
export function loadModels(file = MODELS_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const CURRENT = loadModels();

/** The family key ("opus", "sonnet", "haiku") of a model id such as "claude-sonnet-5-5"; null when unknown. */
export function familyOf(model, cfg = CURRENT) {
  const m = String(model ?? '').toLowerCase();
  if (cfg.models[m]) return m;
  for (const [key, v] of Object.entries(cfg.models)) if (m.includes(v.match)) return key;
  return null;
}

/**
 * Estimated dollars for some tokens on one model. Cache writes count as input; cache reads at the
 * file's cacheReadFactor. An unknown model costs null, never a guess.
 * @param {{ tokensIn?: number, tokensCached?: number, tokensOut?: number }} t
 */
export function costOf(model, t, cfg = CURRENT) {
  const fam = familyOf(model, cfg);
  if (!fam) return null;
  const p = cfg.models[fam];
  const usd = ((t.tokensIn ?? 0) * p.inPerMTok + (t.tokensCached ?? 0) * p.inPerMTok * cfg.cacheReadFactor + (t.tokensOut ?? 0) * p.outPerMTok) / 1e6;
  return Math.round(usd * 100) / 100;
}

/** The role's settings; an unknown role is an error, not a default. */
export function roleConfig(role, cfg = CURRENT) {
  const r = cfg.roles[role];
  if (!r) throw new Error(`unknown role ${role} (models.json names ${Object.keys(cfg.roles).join(', ')})`);
  return r;
}

export const ROLES = Object.freeze(Object.keys(CURRENT.roles));

const DESCRIPTION_ROLES = [
  [/\bfix(es|ing)?\b.*\bround\b|\bround \d+ fix|\bbuilder fix/i, 'fix-builder'],
  [/\breview(er)?\b.*\b(round|states?|group|batch)\b|\bbatch \d+/i, 'reviewer'],
  [/\bmap\b|\bmapper\b/i, 'mapper'],
  [/\bseed\b|\bworlds?\b/i, 'seed-writer'],
  [/\brules?\b/i, 'rules'],
  [/\bci\b|\bfailing (check|test|job)/i, 'ci-fixer'],
  [/\baudit|\brefute\b/i, 'auditor'],
  [/\bstates\b|\bwords\b|\bextract|\binventory|\bintent\b|\bsweep\b/i, 'extractor'],
  [/\bbuild\b.*\bpage\b/i, 'builder'],
];

/**
 * The role of an agent: a "Role: <role>" line in its prompt wins, then its agent type as models.json
 * lists it, then words in its description. Unknown agents are "other".
 * @param {{ prompt?: string, agentType?: string, description?: string }} a
 */
export function roleOf(a, cfg = CURRENT) {
  const m = String(a.prompt ?? '').match(/^\s*Role:\s*([a-z-]+)/im);
  if (m && cfg.roles[m[1].toLowerCase()]) return m[1].toLowerCase();
  const desc = String(a.description ?? '');
  for (const [role, r] of Object.entries(cfg.roles)) {
    if (!(r.agentTypes ?? []).includes(a.agentType ?? '')) continue;
    return role;
  }
  for (const [re, role] of DESCRIPTION_ROLES) if (re.test(desc)) return role;
  return 'other';
}
