#!/usr/bin/env node
// Lint the toon skills against the rule register (toon-video/references/rules.md).
//
//   node lint_rules.mjs <skills-root>
//
// <skills-root> is the folder holding toon-video/, toon-world/ and toon-story-video/
// (general-tools/skills in the claude-code-tools repo).
//
// Fails (exit 1) when:
//   - a line in a skill's SKILL.md or references/*.md says must, never, always, every or only and cites no rule id;
//   - rules.md defines an id twice;
//   - a skill line cites an id that rules.md does not define.
// Exit 2 on a usage error or a missing file. Exit 0 when clean.
import fs from 'node:fs';
import path from 'node:path';

// The three skills the register covers. toon-replicate is left out: it is the practice loop, and the rewrite spec
// changes only its stop rule and its "contact sheet first" line.
const SKILLS = ['toon-video', 'toon-world', 'toon-story-video'];

// Where the register lives, relative to <skills-root>.
const REGISTER = path.join('toon-video', 'references', 'rules.md');

// Reference files the lint skips: the register itself (it states the rules), the findings table (a history of faults
// in the words of the time) and why.md (history moved out of the skill bodies).
const SKIP = new Set(['rules.md', 'rules-log.md', 'findings.md', 'why.md', 'reviewer-brief.md', 'judge-brief.md']);  // the two briefs are prompts sent to agents, not skill text  // rules-log.md is add_rule.mjs's own record

// Words that make a line a rule. Word boundaries, so "everything", "everyone" and "onlyx" do not count; the flag `i`
// catches "Never" and "ALWAYS" at a sentence start or in a heading.
const RULE_WORDS = /\b(must|never|always|every|only)\b/i;

// A rule id: a stage (S0 to S6) or X for any stage, a hyphen, a number. The same pattern finds citations in the skills.
const ID = /\b(S[0-6]|X)-\d+\b/g;

// A register line that defines an id: a list item that opens with the id in bold, as rules.md writes every rule.
const DEFINE = /^- \*\*((?:S[0-6]|X)-\d+)\*\*/;

// A line ending with this comment is let through: for a word used in its plain sense ("only the first frame") where
// no rule is meant. Use it rarely; the reason belongs beside it.
const ESCAPE = /<!--\s*lint-ok\s*-->\s*$/;

// A markdown table's separator row (|---|:--:|). It holds no words, but the brief names it, so skip it explicitly.
const TABLE_RULE = /^\s*\|[\s:|-]+\|?\s*$/;

// A fenced code block opens and closes on a line that starts with three backticks or three tildes.
const FENCE = /^\s*(```|~~~)/;

function usage(msg) {
  console.error(`lint_rules: ${msg}`);
  console.error('usage: node lint_rules.mjs <skills-root>   (the folder holding toon-video/, toon-world/, toon-story-video/)');
  process.exit(2);
}

const root = process.argv[2];
if (!root) usage('no skills root given.');
if (!fs.existsSync(root)) usage(`${root} does not exist.`);

const registerPath = path.join(root, REGISTER);
if (!fs.existsSync(registerPath)) usage(`no register at ${registerPath}.`);

// 1. Read the register: every defined id, and where.
const defined = new Map(); // id -> first line number
const problems = [];
fs.readFileSync(registerPath, 'utf8').split('\n').forEach((line, i) => {
  const m = line.match(DEFINE);
  if (!m) return;
  const id = m[1];
  if (defined.has(id)) problems.push(`${REGISTER}:${i + 1}: rule ${id} is defined twice (first at line ${defined.get(id)}); give the new rule the next free id.`);
  else defined.set(id, i + 1);
});
if (defined.size === 0) usage(`${registerPath} defines no rules (expected lines like "- **S3-12** ...").`);

// 2. The files to scan: each skill's SKILL.md and references/*.md, less the skipped ones.
const files = [];
for (const skill of SKILLS) {
  const dir = path.join(root, skill);
  if (!fs.existsSync(dir)) usage(`skill folder ${dir} is missing.`);
  const main = path.join(dir, 'SKILL.md');
  if (fs.existsSync(main)) files.push(main);
  else problems.push(`${path.relative(root, main)}: missing; every skill needs a SKILL.md.`);
  const refs = path.join(dir, 'references');
  if (fs.existsSync(refs))
    for (const f of fs.readdirSync(refs).sort())
      if (f.endsWith('.md') && !SKIP.has(f)) files.push(path.join(refs, f));
}

// 3. Scan each line outside code fences.
let uncited = 0, unknown = 0;
for (const file of files) {
  const rel = path.relative(root, file);
  let inFence = false;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (FENCE.test(line)) { inFence = !inFence; return; }
    if (inFence || TABLE_RULE.test(line) || ESCAPE.test(line)) return;
    const cited = [...line.matchAll(ID)].map(m => m[0]);
    for (const id of cited)
      if (!defined.has(id)) { unknown++; problems.push(`${rel}:${i + 1}: cites ${id}, which ${REGISTER} does not define.`); }
    const word = line.match(RULE_WORDS);
    if (word && cited.length === 0) {
      uncited++;
      const text = line.trim().slice(0, 100);
      problems.push(`${rel}:${i + 1}: "${word[1]}" with no rule id: ${text}${line.trim().length > 100 ? '...' : ''}`);
    }
  });
}

if (problems.length) {
  for (const p of problems) console.error(p);
  const dupes = problems.length - uncited - unknown;
  console.error(`\nlint_rules: ${problems.length} problem(s) in ${files.length} files: ${uncited} rule line(s) without an id, ${unknown} unknown id(s), ${dupes} other.`);
  console.error(`Cite the rule's id from ${REGISTER} (e.g. "(S3-12)"), add the rule there, or end a plain-sense line with <!-- lint-ok -->.`);
  process.exit(1);
}
console.log(`lint_rules: clean. ${files.length} files, ${defined.size} rules in the register.`);
