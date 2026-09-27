// Rule coverage. Every behaviour the run's briefs and spec state is a numbered rule in
// docs/delivery/<feature>/rules.json, and each rule has one proof: a design state that shows it
// (picture), a test named after it (test), or a cut the founder saw (cut). A rule the design has
// not drawn yet is owed to the design. A rule with no proof is a gap, and a gap keeps ready red:
// the pictures only check what the pictures show, so a decision made in a brief and never drawn
// was, before this file, simply never checked.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseItemKey } from './widths.mjs';

export const RULES_FILE = 'rules.json';
export const PROOFS = Object.freeze(['picture', 'test', 'cut', 'owed-design']);
const RULE_ID = /^R[1-9]\d*$/;

export function rulesPath(paths) { return join(paths.deliveryDir, RULES_FILE); }

/** rules.json, or null when the run has none. Throws with the file named when it does not parse. */
export function readRules(paths) {
  const p = rulesPath(paths);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (err) { throw new Error(`${p} does not parse: ${err.message}`); }
}

/** The briefs a run keeps: every Markdown or text file directly in intent/ (not uploads/, rounds/ or intake's sentence.txt). */
export function briefFiles(paths) {
  if (!existsSync(paths.intentDir)) return [];
  return readdirSync(paths.intentDir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(md|txt)$/i.test(e.name) && e.name !== 'sentence.txt')
    .map((e) => e.name)
    .sort();
}

/** The text a test must carry for it to prove a rule: the rule's id, then a colon ("R7: ..."). */
export const testMarker = (id) => `${id}:`;

/**
 * Problems with a rules document. At the plan stage a `test` rule only has to say so; at the ready
 * stage every test it names must exist and carry its marker. `owed-design` is a problem at both
 * stages, because nothing can check a behaviour the design never drew and no test proves.
 * @param {object} doc
 * @param {{ stateIds?: Iterable<string>, stage?: 'plan'|'ready', repoRoot?: string, read?: (p: string) => string|null }} [opts]
 * @returns {string[]}
 */
export function validateRules(doc, opts = {}) {
  const problems = [];
  const stage = opts.stage ?? 'plan';
  const known = opts.stateIds ? new Set(opts.stateIds) : null;
  const read = opts.read ?? ((p) => { try { return readFileSync(join(opts.repoRoot ?? '.', p), 'utf8'); } catch { return null; } });
  const rules = doc?.rules;
  if (!Array.isArray(rules) || !rules.length) return ['rules.json has no rules; write one per behaviour the briefs state'];
  const seen = new Set();
  for (const [i, r] of rules.entries()) {
    const id = typeof r?.id === 'string' ? r.id : `rules[${i}]`;
    if (!RULE_ID.test(r?.id ?? '')) problems.push(`${id}: the id must be R followed by a number (R1, R2, ...)`);
    else if (seen.has(r.id)) problems.push(`${id}: the id is used twice`);
    seen.add(r?.id);
    if (!r?.text?.trim?.()) problems.push(`${id}: no text; say the behaviour in one plain sentence`);
    if (!r?.source?.trim?.()) problems.push(`${id}: no source; name the brief or spec it came from`);
    if (!PROOFS.includes(r?.proof)) {
      problems.push(`${id}: proof must be one of ${PROOFS.join(', ')} (it is ${JSON.stringify(r?.proof ?? null)})`);
      continue;
    }
    const states = Array.isArray(r.states) ? r.states : [];
    if (known) {
      for (const s of states) if (!known.has(parseItemKey(s).id)) problems.push(`${id}: names state ${s}, which is not in map.json`);
    }
    if (r.proof === 'picture' && !states.length) problems.push(`${id}: proof is picture but it names no state; name the states whose design shows it`);
    if (r.proof === 'cut' && !r.cut?.trim?.()) problems.push(`${id}: proof is cut but there is no cut reason; quote the Scope line the founder saw`);
    if (r.proof === 'owed-design') problems.push(`${id} is owed to the design: send "${r.text}" to the design, then map it to the new state (${r.source})`);
    if (r.proof === 'test' && stage === 'ready') {
      const tests = Array.isArray(r.tests) ? r.tests : [];
      if (!tests.length) problems.push(`${id}: proof is test but no test is named; the builder writes one whose name starts "${testMarker(r.id)}" and lists its file in tests`);
      for (const t of tests) {
        const body = read(t);
        if (body === null) problems.push(`${id}: its test file ${t} does not exist`);
        else if (!body.includes(testMarker(r.id))) problems.push(`${id}: ${t} has no test named "${testMarker(r.id)} ..."`);
      }
    }
  }
  return problems;
}

/** Counts by proof, for status and ready lines. */
export function ruleCounts(doc) {
  const c = { total: 0, picture: 0, test: 0, cut: 0, 'owed-design': 0 };
  for (const r of doc?.rules ?? []) { c.total += 1; if (c[r.proof] !== undefined) c[r.proof] += 1; }
  return c;
}

/** The rules that name a state (bare id or any of its items), in file order. */
export function rulesForState(doc, stateId) {
  return (doc?.rules ?? []).filter((r) => (r.states ?? []).some((s) => parseItemKey(s).id === stateId));
}

/** Rules no state carries (test and cut rules without states), for the checklist's own section. */
export function stateless(doc) {
  return (doc?.rules ?? []).filter((r) => !(r.states ?? []).length);
}

/** One checklist line for a rule. */
export function ruleLine(r) {
  const how = r.proof === 'test' ? ' (proved by a test named "' + testMarker(r.id) + ' ...")'
    : r.proof === 'cut' ? ` (cut: ${r.cut})`
      : r.proof === 'owed-design' ? ' (owed to the design)' : '';
  return `- Rule ${r.id}: ${r.text}${how}`;
}

/**
 * Where a picture run stands on its rules, for status and ready.
 * @returns {{ briefs: number, exists: boolean, error: string|null, problems: string[], counts: ReturnType<typeof ruleCounts>|null }}
 */
export function ruleFacts(paths, { stateIds, stage = 'plan' } = {}) {
  const briefs = briefFiles(paths).length;
  let doc = null;
  try { doc = readRules(paths); } catch (err) { return { briefs, exists: true, error: err.message, problems: [err.message], counts: null }; }
  if (!doc) return { briefs, exists: false, error: null, problems: [], counts: null };
  const problems = validateRules(doc, { stateIds, stage, repoRoot: paths.repoRoot });
  return { briefs, exists: true, error: null, problems, counts: ruleCounts(doc) };
}
