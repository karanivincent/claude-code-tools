// The size rule of the retro (C3): is a proposed change small enough to apply on its own, or large
// enough that only the founder decides? Pure: no files, no commands. Owner: slice A2.
//
// The rule is conservative by construction. A change is small ONLY when every test below holds.
// Anything the rule does not recognise, cannot measure or cannot read is large: "when unsure,
// treat it as large". Nothing large is ever applied.
//
// A change is { kind, ...fields }:
//   tunable        { key, from, to }                      one number in tunables.json
//   steer          { text }                               one line in a run's steers.md
//   brief-sentence { brief, text }                        one sentence appended to briefs/<brief>.md
//   warn-check     { description, onlyWarns: true }       a new check that can only warn
// and, for any kind, optional flags the author sets when true: deletes, loosens, addsCommand,
// addsAgent, changesIsolation, changesModel, reverses; and `paths`, the files it will touch.
// diffStats is { lines, files } from the real diff, once there is one.

import { loadTunables } from './tunables.mjs';

export const SMALL_KINDS = Object.freeze(['tunable', 'steer', 'brief-sentence', 'warn-check']);
export const MAX_SMALL_LINES = 50;

/** Files a small change may touch. Everything else (agents, skills, commands, schemas, seed code) is large. */
const ALLOWED_FILE = [
  /^tunables\.json$/,
  /^briefs\/[A-Za-z0-9._-]+\.md$/,
  /^docs\/delivery\/[a-z0-9-]+\/steers\.md$/,
  /^lib\/checks\/[A-Za-z0-9._-]+\.mjs$/,
  /^tests\/checks\/[A-Za-z0-9._-]+\.test\.mjs$/,
];

/** The seed-safety surface: the safety file and schema, guards, never-dial rules, seed code, hooks. */
const SEED_SAFETY_FILE = [
  /(^|\/)delivery-safety[^/]*$/i,
  /(^|\/)safety\.schema\.json$/i,
  /(^|\/)guards?([./_-]|\/|$)/i,
  /never[-_ ]?dial/i,
  /^lib\/seed\//,
  /^hooks\//,
];
const SEED_SAFETY_TEXT = /delivery-safety|safety (file|schema)|never[- ]?dial|seed[- ]safety|\bguards?\b|\bhooks?\b/i;
const ISOLATION_TEXT = /\bisolation\b|\bworktree isolation\b|^\s*model\s*:|\bmodel line\b|\bswitch(es)? (the )?model\b/im;
const LOOSEN_TEXT = /\b(skip|ignore|disable|waive|bypass|relax|loosen)\b[^.\n]*\b(check|gate|rule|review|audit|verification|guard)s?\b|\b(remove|delete|drop|stop)\b[^.\n]*\b(check|gate|rule|audit|guard)s?\b|\bno longer (check|require|need|run)\b/i;

/** "delivery-tools/lib/x" and "./lib/x" both mean "lib/x". */
export function normalisePath(p) {
  return String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^(\.\.\/)+/, '').replace(/^delivery-tools\//, '');
}

/** The identity of a change, for the ledger: the same key means the same thing being changed again. */
export function changeKey(change) {
  switch (change?.kind) {
    case 'tunable': return `tunable:${change.key}`;
    case 'steer': return `steer:${norm(change.text)}`;
    case 'brief-sentence': return `brief:${change.brief}:${norm(change.text)}`;
    case 'warn-check': return `warn:${norm(change.description)}`;
    case 'model': return `model:${change.role}>${change.to?.model}:${change.to?.effort}`;
    default: return `${change?.kind ?? 'unknown'}:${norm(change?.description ?? change?.text ?? '')}`;
  }
}
const norm = (t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {object} change
 * @param {{ lines?: number, files?: string[] }|null} [diffStats] from the real diff, when there is one
 * @param {{ history?: object[], tunables?: object }} [opts] history: the ledger's earlier autoChanges and decisions
 * @returns {{ size: 'small'|'large', reasons: string[] }}
 */
export function classify(change, diffStats = null, opts = {}) {
  const reasons = [];
  try {
    check(change, diffStats, opts, reasons);
  } catch (err) {
    reasons.push(`could not classify it (${err.message}); when unsure, it is large`);
  }
  return { size: reasons.length ? 'large' : 'small', reasons };
}

function check(change, diffStats, opts, reasons) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) { reasons.push('the change is not an object; when unsure, it is large'); return; }

  // 1. The kind.
  if (change.kind === 'command' || change.kind === 'agent') reasons.push(`adds ${change.kind === 'agent' ? 'an' : 'a'} ${change.kind}`);
  else if (!SMALL_KINDS.includes(change.kind)) reasons.push(`kind "${change.kind}" is not one the retro can apply on its own (${SMALL_KINDS.join(', ')})`);

  // 2. Seed safety: by path, by declared touch, by what the text says.
  const files = [...(Array.isArray(change.paths) ? change.paths : []), ...(Array.isArray(diffStats?.files) ? diffStats.files : [])].map(normalisePath);
  const seedFile = files.find((f) => SEED_SAFETY_FILE.some((re) => re.test(f)));
  if (seedFile) reasons.push(`touches the seed-safety surface (${seedFile})`);
  const text = [change.text, change.description, change.key, change.brief].filter((x) => typeof x === 'string').join('\n');
  if (SEED_SAFETY_TEXT.test(text)) reasons.push('names the seed-safety surface (safety file, guards, never-dial rules, hooks)');

  // 3. Deleting or loosening a check or gate.
  if (change.deletes === true) reasons.push('deletes something');
  if (change.loosens === true) reasons.push('loosens a check or gate');
  if (LOOSEN_TEXT.test(text)) reasons.push('reads as deleting or loosening a check or gate');

  // 4. A new command or agent, or a change to agent isolation or model.
  if (change.addsCommand === true) reasons.push('adds a command');
  if (change.addsAgent === true) reasons.push('adds an agent');
  if (change.changesIsolation === true || change.changesModel === true) reasons.push('changes an agent\'s isolation or model line');
  if (ISOLATION_TEXT.test(text)) reasons.push('mentions agent isolation or the model line');
  for (const f of files) {
    if (/^lib\/commands\//.test(f) && !/^lib\/commands\/retro\.mjs$/.test(f)) reasons.push(`touches a command (${f})`);
    if (/^agents\//.test(f)) reasons.push(`touches an agent (${f})`);
  }
  if (files.some((f) => !ALLOWED_FILE.some((re) => re.test(f)))) {
    const other = files.filter((f) => !ALLOWED_FILE.some((re) => re.test(f)));
    reasons.push(`touches files outside the small surface (${[...new Set(other)].slice(0, 3).join(', ')})`);
  }

  // Kind-specific facts.
  if (change.kind === 'tunable') checkTunable(change, opts.tunables ?? loadTunables(), reasons);
  if (change.kind === 'steer' && !isText(change.text)) reasons.push('the steer has no text');
  if (change.kind === 'brief-sentence') {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(change.brief ?? ''))) reasons.push('the brief is not named as a plain brief file');
    if (!isText(change.text)) reasons.push('the sentence has no text');
  }
  if (change.kind === 'warn-check') {
    if (change.onlyWarns !== true) reasons.push('a new check must say it only warns; this one does not');
    if (!isText(change.description)) reasons.push('the check has no description');
  }

  // 5. Size of the diff.
  const lines = diffLines(change, diffStats);
  if (lines === null) reasons.push('the size of the diff is not known');
  else if (lines > MAX_SMALL_LINES) reasons.push(`the diff is ${lines} lines (more than ${MAX_SMALL_LINES})`);

  // 6. Reversing an earlier decision.
  if (change.reverses === true) reasons.push('reverses an earlier decision');
  const why = reversal(change, opts.history ?? []);
  if (why) reasons.push(why);
}

const isText = (t) => typeof t === 'string' && t.trim().length > 0;

function checkTunable(change, tunables, reasons) {
  const def = tunables?.[change.key];
  if (!def) { reasons.push(`"${change.key}" is not a tunable in tunables.json`); return; }
  const { from, to } = change;
  if (![from, to].every((n) => typeof n === 'number' && Number.isFinite(n))) { reasons.push('from and to must be numbers'); return; }
  if (from !== def.value) reasons.push(`from (${from}) is not the current value (${def.value})`);
  if (to === from) reasons.push('the value does not change');
  if (typeof def.min === 'number' && to < def.min) reasons.push(`${to} is below the lowest sane value (${def.min})`);
  if (typeof def.max === 'number' && to > def.max) reasons.push(`${to} is above the highest sane value (${def.max})`);
  if (def.loosens === 'higher') { if (to > from) reasons.push(`raising ${change.key} loosens a check`); }
  else if (def.loosens === 'lower') { if (to < from) reasons.push(`lowering ${change.key} loosens a check`); }
  else if (def.loosens !== 'never') reasons.push(`${change.key} does not say which way loosens it`);
}

/** The lines the change touches: the real diff's, else a count for the kinds whose size is fixed by construction. */
function diffLines(change, diffStats) {
  if (diffStats && diffStats.lines !== undefined) return Number.isFinite(diffStats.lines) && diffStats.lines >= 0 ? diffStats.lines : null;
  if (change.kind === 'tunable') return 2;
  if ((change.kind === 'steer' || change.kind === 'brief-sentence') && isText(change.text)) return String(change.text).split('\n').length + 2;
  return null;
}

/** A ledger entry that moved the same thing the other way, was reverted or was declined. */
function reversal(change, history) {
  const key = changeKey(change);
  for (const h of history) {
    const c = h?.change ?? h;
    if (changeKey(c) !== key) continue;
    if (h.status === 'reverted' || h.reverted === true) return `an earlier change to the same thing was reverted (${key})`;
    if (h.decision === 'rejected' || h.decision === 'declined') return `the founder declined an earlier change to the same thing (${key})`;
    if (change.kind === 'tunable' && typeof c.from === 'number' && typeof c.to === 'number') {
      if (Math.sign(c.to - c.from) !== Math.sign(change.to - change.from)) return `an earlier change moved ${change.key} the other way (${c.from} to ${c.to})`;
    }
  }
  return null;
}
