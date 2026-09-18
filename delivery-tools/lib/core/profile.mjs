// The project profile and the founder-authored safety file (spec 18). The safety file is
// read-only to the CLI: nothing in this plugin writes it, and loadSafety never creates it.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigError, DeliveryError, EXIT } from './exit.mjs';
import { validateAgainst } from './schema.mjs';
import { sha256 } from './hash.mjs';

export const PROFILE_PATH = '.claude/delivery-profile.json';
export const PLACEHOLDERS = Object.freeze(['port', 'sha', 'pr', 'spec', 'dir', 'cmd', 'epic', 'slug', 'date', 'project', 'n']);
const PLACEHOLDER_RE = /(?<!\$)\{([a-z][a-zA-Z]*)\}/g;

/**
 * Placeholders a template uses, in order of first appearance. `${VAR}` shell expansions are ignored.
 * @param {string} template
 */
export function commandPlaceholders(template) {
  const seen = [];
  for (const m of String(template).matchAll(PLACEHOLDER_RE)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/**
 * Every string in the profile that may carry placeholders, as [jsonPath, template] pairs.
 * @param {object} profile
 */
export function profileTemplates(profile) {
  const out = [];
  const c = profile.commands ?? {};
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === 'string') out.push([`/commands/${k}`, v]);
  }
  if (c.review) out.push(['/commands/review/args', c.review.args]);
  if (c.loopTest) {
    out.push(['/commands/loopTest/command', c.loopTest.command]);
    out.push(['/commands/loopTest/stagingCommand', c.loopTest.stagingCommand]);
  }
  const d = profile.decisions ?? {};
  for (const k of ['file', 'looseEnd', 'handoverPattern']) if (typeof d[k] === 'string') out.push([`/decisions/${k}`, d[k]]);
  if (typeof profile.release?.tagFormat === 'string') out.push(['/release/tagFormat', profile.release.tagFormat]);
  return out;
}

/**
 * Schema issues plus the P1 extras: only known placeholders, and every regex compiles.
 * @param {unknown} profile
 * @returns {{ path: string, message: string }[]}
 */
export function validateProfile(profile) {
  const { errors } = validateAgainst('profile', profile);
  if (errors.length) return errors;
  const issues = [];
  for (const [path, template] of profileTemplates(profile)) {
    for (const p of commandPlaceholders(template)) {
      if (!PLACEHOLDERS.includes(p)) issues.push({ path, message: `unknown placeholder {${p}}; allowed: ${PLACEHOLDERS.map((x) => `{${x}}`).join(' ')}` });
    }
    if (/<[A-Za-z][^<>]*>/.test(template)) issues.push({ path, message: 'contains an unfilled <...> value' });
  }
  return issues;
}

/**
 * Load and validate .claude/delivery-profile.json. Exit 2 when missing or invalid, one failure per issue.
 * @param {string} repoRoot
 * @returns {Promise<object>} the profile
 */
export async function loadProfile(repoRoot) {
  const path = join(repoRoot, PROFILE_PATH);
  let text;
  try { text = await readFile(path, 'utf8'); } catch (err) {
    if (err.code === 'ENOENT') throw new ConfigError(`no profile at ${PROFILE_PATH}; run "delivery init" to draft one`);
    throw err;
  }
  let profile;
  try { profile = JSON.parse(text); } catch (err) { throw new ConfigError(`${PROFILE_PATH} is not valid JSON (${err.message})`); }
  const issues = validateProfile(profile);
  if (issues.length) {
    throw new ConfigError(`${PROFILE_PATH} is invalid (${issues.length} issue(s))`, {
      failures: issues.map((i) => ({ code: 'profile', message: `${PROFILE_PATH}${i.path === '/' ? '' : i.path}: ${i.message}` })),
    });
  }
  return profile;
}

/**
 * Schema issues plus: every regex compiles, and the fake-number sample matches its own pattern.
 * @param {unknown} safety
 */
export function validateSafety(safety) {
  const { errors } = validateAgainst('safety', safety);
  if (errors.length) return errors;
  const issues = [];
  for (const [path, pattern] of [['/fakeNumbers/pattern', safety.fakeNumbers.pattern], ['/fixtureUserPattern', safety.fixtureUserPattern]]) {
    try { new RegExp(pattern); } catch (err) { issues.push({ path, message: `not a valid regular expression (${err.message})` }); }
  }
  if (!issues.length && !new RegExp(safety.fakeNumbers.pattern).test(safety.fakeNumbers.sample)) {
    issues.push({ path: '/fakeNumbers/sample', message: 'does not match fakeNumbers.pattern' });
  }
  return issues;
}

/**
 * Read the safety file named by the profile. Read-only: never written, never created.
 * Returns the parsed value and the exact bytes' hash (P2 compares those bytes with origin/<base>).
 * @param {string} repoRoot
 * @param {object} profile
 * @returns {Promise<{ safety: object, bytes: Buffer, sha256: string, path: string }>}
 */
export async function loadSafety(repoRoot, profile) {
  const rel = profile.safetyFile;
  const path = join(repoRoot, rel);
  let bytes;
  try { bytes = await readFile(path); } catch (err) {
    if (err.code === 'ENOENT') throw new DeliveryError(EXIT.BLOCKED, `no safety file at ${rel}; the founder authors it (spec 7, 18)`, { code: 'P2' });
    throw err;
  }
  let safety;
  try { safety = JSON.parse(bytes.toString('utf8')); } catch (err) { throw new ConfigError(`${rel} is not valid JSON (${err.message})`); }
  const issues = validateSafety(safety);
  if (issues.length) {
    throw new ConfigError(`${rel} is invalid (${issues.length} issue(s))`, {
      failures: issues.map((i) => ({ code: 'safety', message: `${rel}${i.path === '/' ? '' : i.path}: ${i.message}` })),
    });
  }
  return { safety: Object.freeze(deepFreeze(safety)), bytes, sha256: sha256(bytes), path };
}

function deepFreeze(v) {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) deepFreeze(x); Object.freeze(v); }
  return v;
}

const SAFE_RAW = /^[A-Za-z0-9_./:@%+=,-]+$/;

/**
 * Fill a profile template. Values inside single quotes have their quotes escaped; values outside
 * quotes are inserted raw when shell-safe and single-quoted otherwise. A placeholder with no value,
 * or one outside the allowed set, is a configuration error.
 * @param {string} template
 * @param {Partial<Record<'port'|'sha'|'pr'|'spec'|'dir'|'cmd'|'epic'|'slug'|'date'|'project'|'n', string|number>>} values
 */
export function fillCommand(template, values) {
  return String(template).replace(PLACEHOLDER_RE, (match, name, offset, whole) => {
    if (!PLACEHOLDERS.includes(name)) throw new ConfigError(`unknown placeholder {${name}} in "${template}"`);
    const v = values?.[name];
    if (v === undefined || v === null) throw new ConfigError(`no value for {${name}} in "${template}"`);
    const s = String(v);
    const quoted = whole[offset - 1] === "'" && whole[offset + match.length] === "'";
    if (quoted) return s.replace(/'/g, `'\\''`);
    return SAFE_RAW.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
  });
}

/** The heavy-slot wrapped form of a command (spec 16: everything heavy goes through commands.heavy). */
export function wrapHeavy(profile, cmd) {
  return fillCommand(profile.commands.heavy, { cmd });
}
