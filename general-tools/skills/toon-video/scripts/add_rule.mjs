#!/usr/bin/env node
// The only way a rule enters references/rules.md (rule X-12). It gives the rule the next free id in its stage, refuses
// a rule with no stage, proof or reason, refuses a near-duplicate of a live rule, retires a rule it replaces (struck
// through, id kept, so old citations still resolve), and logs the change in references/rules-log.md.
//
//   node add_rule.mjs --stage S3 --section "Sound" --text "..." --proof "check levels.mjs: ceiling" \
//        --why "..." --source "elijah-widow-2d, Vincent's note 11 Nov 2026" [--replaces S3-153] [--differs S3-12 "why"] [--dry-run]
//   node add_rule.mjs --unbuilt        lists every rule whose check is marked (new), i.e. not built yet
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REG = path.resolve(HERE, '../references/rules.md');
const LOG = path.resolve(HERE, '../references/rules-log.md');

// A rule sentence over 30 words is two rules or an essay; the register's own lines run 10-25 words.
const MAX_WORDS = 30;
// Word-overlap share above which two rules are treated as the same rule. 0.6 caught every duplicate pair the
// 11 Nov 2026 audit found (mittens, blur, hard cuts) without flagging rules that only share stage words.
const DUP_SHARE = 0.6;
// A short rule shares 60% with anything after two common words ("Bible", "Clay"), so a match needs 3 shared words.
const DUP_MIN_WORDS = 3;
const STAGES = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'X'];
const PROOF = /^(check critic: .+|check .+|file .+|owner .+)$/;
const STOP = new Set('a an the and or of to in on at for by with is are be it its this that from as each every never always only one no not'.split(' '));

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const has = (k) => args.includes(k);
const fail = (msg) => { console.error(`add_rule: ${msg}`); process.exit(1); };

if (!fs.existsSync(REG)) fail(`no register at ${REG}`);
const text0 = fs.readFileSync(REG, 'utf8');
const lines = text0.split('\n');
const RULE = /^- (~~)?\*\*((?:S[0-6]|X)-\d+)\*\*(.*)$/;
const rules = lines.map((l, i) => { const m = l.match(RULE); return m && { i, id: m[2], live: !m[1], body: m[3] }; }).filter(Boolean);

if (has('--unbuilt')) {
  const open = rules.filter(r => r.live && /\(new/.test(r.body));
  for (const r of open) console.log(`${r.id}\t${r.body.replace(/^\s*/, '').slice(0, 140)}`);
  console.log(`${open.length} rules wait for a check to be built.`);
  process.exit(0);
}

const stage = opt('--stage'), section = opt('--section'), rule = opt('--text')?.trim(), proof = opt('--proof')?.trim(),
  why = opt('--why')?.trim(), source = opt('--source')?.trim(), replaces = opt('--replaces'), differs = opt('--differs');
if (!STAGES.includes(stage)) fail(`--stage must be one of ${STAGES.join(', ')}: the stage where the rule is met.`);
if (!rule) fail('--text is required: the rule in one plain sentence.');
if (rule.split(/\s+/).length > MAX_WORDS) fail(`the rule has ${rule.split(/\s+/).length} words; keep it under ${MAX_WORDS} or split it.`);
if (!proof || !PROOF.test(proof)) fail('--proof is required: "check <script or kit fn>", "file <path>", "owner <button>" or "check critic: <area>". Mark a check that does not exist yet with "(new)".');
if (!why) fail('--why is required: the reason in under 12 words, usually the fault that taught it.');
if (!source) fail('--source is required: the story and whose note or which finding taught it.');
if (/check critic:/.test(proof)) console.warn('add_rule: a critic proof is the weakest kind; name the script that could see this if one can.');

// near-duplicates of live rules
const words = (s) => new Set(s.toLowerCase().replace(/[`*~.,;:()'"]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/s$/, '')));
const mine = words(rule);
const similar = rules.filter(r => r.live && r.id !== replaces).map(r => {
  const theirs = words(r.body.split(' Proof:')[0]);
  const shared = [...mine].filter(w => theirs.has(w)).length;
  return { r, shared, share: shared / Math.max(1, Math.min(mine.size, theirs.size)) };
}).filter(x => x.share >= DUP_SHARE && x.shared >= DUP_MIN_WORDS).sort((a, b) => b.share - a.share);
const differsOk = differs && similar.every(x => x.r.id === differs);
if (similar.length && !differsOk) {
  console.error('add_rule: this looks like a rule already in the register:');
  for (const { r, share } of similar.slice(0, 5)) console.error(`  ${r.id} (${Math.round(share * 100)}% shared)${r.body}`);
  fail('change that rule with --replaces <id>, or pass --differs <id> "<how it differs>" if it is truly new.');
}

// next id in the stage, never reused (struck rules count)
const nums = rules.filter(r => r.id.startsWith(stage + '-')).map(r => +r.id.split('-')[1]);
const id = `${stage}-${(nums.length ? Math.max(...nums) : 0) + 1}`;
const line = `- **${id}** ${rule.replace(/\.?$/, '.')} Proof: ${proof.replace(/\.?$/, '.')} Why: ${why.replace(/\.?$/, '.')}`;

// where it goes: the end of the named section, else the end of the stage
const heading = lines.findIndex(l => /^## /.test(l) && l.replace(/^## /, '').startsWith(stage === 'X' ? 'X ' : stage + ' '));
if (heading < 0) fail(`no "## ${stage} ..." heading in the register.`);
const stageEnd = (() => { for (let i = heading + 1; i < lines.length; i++) if (/^## /.test(lines[i])) return i; return lines.length; })();
let from = heading;
if (section) {
  const s = lines.findIndex((l, i) => i > heading && i < stageEnd && /^### /.test(l) && l.slice(4).toLowerCase() === section.toLowerCase());
  if (s < 0) fail(`no "### ${section}" under ${stage}; sections there: ${lines.slice(heading, stageEnd).filter(l => /^### /.test(l)).map(l => l.slice(4)).join(', ') || 'none'}.`);
  from = s;
}
let at = from + 1;
for (let i = from + 1; i < stageEnd && !/^#{2,3} /.test(lines[i]); i++) if (RULE.test(lines[i])) at = i + 1;

const out = [...lines];
if (replaces) {
  const old = rules.find(r => r.id === replaces);
  if (!old) fail(`--replaces ${replaces}: no such rule.`);
  if (!old.live) fail(`--replaces ${replaces}: already retired.`);
  out[old.i] = `- ~~**${old.id}**${old.body}~~ Replaced by ${id}.`;
}
out.splice(at, 0, line);

const today = new Date().toISOString().slice(0, 10);
const logLine = `| ${today} | ${id} | ${replaces ? `replaces ${replaces}` : differs ? `new, differs from ${differs}: ${args[args.indexOf('--differs') + 2] ?? ''}` : 'new'} | ${source} |`;
if (has('--dry-run')) { console.log(line); console.log(logLine); process.exit(0); }
fs.writeFileSync(REG, out.join('\n'));
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, '# Rule register log\n\nEvery rule added or replaced, newest last. Written by `scripts/add_rule.mjs`; never edited by hand.\n\n| Date | Id | Change | Source |\n|---|---|---|---|\n');
fs.appendFileSync(LOG, logLine + '\n');
console.log(`added ${id}${replaces ? `, retired ${replaces}` : ''}`);
console.log('Next: cite the id where the skill mentions it, build the check if it is marked (new), and run lint_rules.mjs.');
