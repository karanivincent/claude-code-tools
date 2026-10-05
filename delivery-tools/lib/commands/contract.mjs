// delivery contract: build the run's data contract from the design renders' DOM (picture mode).

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';
import { readMap } from '../picture/map.mjs';
import { DECISIONS, contractPath, contractSummary, contractTodoPath, decideNone, readContract, rebuildContractFile } from '../picture/contract.mjs';
import { worldsGuardsToApprove } from '../picture/next.mjs';
import { listRounds, roundDir } from '../picture/rounds.mjs';

function readJsonFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export default defineCommand({
  name: 'contract',
  summary: 'Build the data contract (every text each design state shows, labelled data or fixed words)',
  usage: `usage: delivery contract
       delivery contract --questions
       delivery contract --decide <build|drop|design> --state <ID|all> [--text "<text>"] [--note "<why>"]

Picture mode. Reads every state's design render (<ID>.dom.json, and <ID>@phone.dom.json at phone
width), takes each text it shows in the page area, and writes docs/delivery/<feature>/contract.json:
per state, every text with its label. The texts come from the render's DOM, never from a model.

Labels come from the labeller (a delivery-extractor, Role: contract, briefs/contract-labeller.md).
It has no shell, so it writes batch files, docs/delivery/<feature>/contract-labels-<n>.json, and
this command folds in contract-labels.json and every batch file, a later file winning. A label may
be keyed by its text alone ("texts": { "<text>": { ... } }), for every state that shows it; a
state's own entry still wins. This command writes .delivery/<feature>/contract-todo.json: each text
still to label or fix, with its states, and the batch file to write next. Labels: "data" (a value the seeded world must
hold, with the table and column, a count, a date or time, or a fixture user's name), "fixed" (the
page's own words) or "random" (an id or an avatar; masked, never seeded). This command folds that
file in. A text keeps its label across rebuilds, a text labelled fixed in one state is fixed in
every state, and a new text is unlabelled until the labeller sees it. design render rebuilds the
contract itself, so a new export never leaves it stale.

A state whose design contradicts itself (counts that do not add up, a date after today) is marked
"inconsistent" by the labeller: it goes to Claude Design (design-send), and seed --check skips it.

seed --check then refuses a plan whose worlds lack a data value, before anything is built.

A text labelled "none" is a value the design shows that the product does not store (D6). It is
never seeded or checked. The founder decides each once, before the build, from one list:
  --questions   print the list and write docs/delivery/<feature>/questions.md: every undecided
                "none" value, every traced column no query in the code selects (after a shoot),
                and every table the worlds write that no guard covers, to send the founder in
                one message
  --decide      record the founder's answer: build (it becomes a rule: the product gains it), drop
                (a cut rule) or design (back to Claude Design); --text picks one text, without it
                every undecided value of the state (or of every state, with --state all). A decided
                value is closed; an undecided one keeps ready red.

exit: 0 every text is labelled and every label can be checked; 1 texts to label or labels that
      cannot be checked; 2 no map.json

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { questions: { type: 'boolean' }, decide: { type: 'string' }, state: { type: 'string' }, text: { type: 'string' }, note: { type: 'string' } } });
    const paths = ctx.requirePaths();
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json; the mapper writes it first'); return EXIT.USAGE; }
    if (values.decide !== undefined) return decide(ctx, paths, values);
    if (values.questions) return questions(ctx, paths, map);
    const r = await rebuildContractFile(paths, map, ctx.clock.now().toISOString());
    const s = r.summary;
    const rel = (p) => relative(ctx.repoRoot, p);
    ctx.out.line(`contract: ${s.states} state(s), ${s.texts} text(s): ${s.data} data, ${s.fixed} fixed, ${s.random} random, ${s.unlabelled.length} to label -> ${rel(contractPath(paths))}`);
    if (r.changed.length) ctx.out.line(`the design changed ${r.changed.length} state(s): ${r.changed.join(', ')} (${r.added} new text(s), ${r.removed} gone)`);
    for (const x of s.invalid) ctx.out.fail('contract-label', `${x.state} "${x.text}": ${x.why}`);
    if (s.unlabelled.length) {
      const states = [...new Set(s.unlabelled.map((u) => u.state))];
      ctx.out.fail('contract-unlabelled', `${s.unlabelled.length} text(s) in ${states.length} state(s) to label (${states.slice(0, 8).join(', ')}${states.length > 8 ? ', ...' : ''}): dispatch the labeller (Role: contract, briefs/contract-labeller.md, Todo: ${rel(contractTodoPath(paths))}), then run this again`);
    }
    if (s.unlabelled.length || s.invalid.length) ctx.out.line(`todo: ${rel(contractTodoPath(paths))} lists each text to label or fix, with its states, and the file the labeller writes next (${JSON.parse(readFileSync(contractTodoPath(paths), 'utf8')).write})`);
    // R12: a random value is masked by test id in the map, or it differs in every picture.
    const masked = new Set((map.states ?? []).filter((st) => st.mask?.length).map((st) => st.id));
    for (const [id, st] of Object.entries(r.contract.states)) {
      const random = (st.texts ?? []).filter((e) => e.label === 'random').map((e) => `"${e.text}"`);
      if (random.length && !masked.has(id)) ctx.out.line(`${id} shows random value(s) ${random.join(', ')} and masks nothing: give the map's state a mask ([{ "testid": ..., "why": ... }]) for each`);
    }
    for (const x of s.inconsistent) ctx.out.line(`inconsistent design: ${x.state}: ${x.why} (send it to Claude Design with design-send; seed --check skips it)`);
    if (s.undecided.length) ctx.out.line(`${s.undecided.length} value(s) the product does not store wait for the founder: delivery contract --questions`);
    if (!s.unlabelled.length && !s.invalid.length) ctx.out.line('next: delivery seed --from-trace, then --plan and --check (it refuses a data value no world holds)');
    ctx.out.set('contract', { states: s.states, texts: s.texts, data: s.data, fixed: s.fixed, random: s.random, none: s.none, undecided: s.undecided.length, unlabelled: s.unlabelled.length, invalid: s.invalid.length, inconsistent: s.inconsistent, changed: r.changed });
    const exit = s.unlabelled.length || s.invalid.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'contract', exit, counts: { states: s.states, texts: s.texts, data: s.data, unlabelled: s.unlabelled.length, invalid: s.invalid.length, inconsistent: s.inconsistent.length } });
    return exit;
  },
});

/** D6: one list for the founder, sent once, before the build. */
async function questions(ctx, paths, map) {
  const s = contractSummary(readContract(paths));
  let guards = [];
  try { guards = worldsGuardsToApprove(paths, map, (await ctx.safety()).safety); } catch { guards = []; }
  const lines = [`# Questions before the build: ${paths.feature}`, ''];
  if (s.undecided.length) {
    lines.push('## Values the design shows that the product does not store', '', 'For each: build it (the product gains it), drop it, or send it back to the design.', '');
    for (const u of s.undecided) lines.push(`- ${u.state}: "${u.text}"${u.why ? ` (${u.why})` : ''}`);
    lines.push('');
  }
  // Spike S2: traced columns no query in the code selects, from the latest round's datacheck.
  const rounds = listRounds(paths);
  const sources = rounds.length ? (readJsonFile(join(roundDir(paths, rounds[rounds.length - 1]), 'datacheck.json'))?.sources ?? []) : [];
  if (sources.length) {
    lines.push('## Values the page may have no source for', '', 'The design shows these, and no query in the code reads them. Is there a source (build it), or should the design drop them?', '');
    for (const x of sources) lines.push(`- ${x.table}.${x.column}: ${x.why} (${x.states.slice(0, 4).join(', ')}: ${x.texts.map((t) => `"${t}"`).join(', ')})`);
    lines.push('');
  }
  if (guards.length) {
    lines.push('## Guards to approve', '', 'The worlds write these tables and no guard in the safety file covers them. Approve the drafted guard, or say "intercept" to answer the call in the browser instead.', '');
    for (const t of guards) lines.push(`- ${t}`);
    lines.push('');
  }
  if (!s.undecided.length && !guards.length && !sources.length) lines.push('Nothing to ask.');
  const file = join(paths.deliveryDir, 'questions.md');
  await writeFile(file, `${lines.join('\n')}\n`);
  // What was asked, so NEXT asks again only about values that are new since.
  await writeJsonAtomic(join(paths.deliveryDir, 'questions.json'), { schemaVersion: 1, at: ctx.clock.now().toISOString(), values: s.undecided.map((u) => `${u.state}\0${u.text}`), guards });
  for (const l of lines.slice(2)) if (l) ctx.out.line(l);
  ctx.out.line(`-> ${relative(ctx.repoRoot, file)}: send it to the founder in one message; record each answer with delivery contract --decide`);
  ctx.out.set('questions', { undecided: s.undecided, guards, sources });
  await ctx.journal({ command: 'contract --questions', exit: EXIT.PASS, counts: { undecided: s.undecided.length, guards: guards.length } });
  return EXIT.PASS;
}

async function decide(ctx, paths, values) {
  if (!DECISIONS.includes(values.decide)) throw new UsageError(`--decide takes ${DECISIONS.join(', ')}`);
  if (!values.state) throw new UsageError('--decide needs --state <ID|all>');
  const contract = readContract(paths);
  if (!contract) throw new UsageError('no contract.json: run delivery contract first');
  const n = decideNone(contract, { state: values.state, text: values.text ?? null, decision: values.decide, note: values.note ?? null });
  if (!n) { ctx.out.fail('contract-decide', `no undecided "none" value${values.text ? ` "${values.text}"` : ''} in ${values.state}`); return EXIT.RED; }
  await writeJsonAtomic(contractPath(paths), contract);
  const next = { build: 'add a rule for it to rules.json (the rules agent), so the builder gives the product that value', drop: 'add a cut rule to rules.json, with the founder\'s Scope line', design: 'send it to Claude Design with design-send' }[values.decide];
  ctx.out.line(`decided ${n} value(s): ${values.decide}; ${next}`);
  await ctx.journal({ command: `contract --decide ${values.decide}`, exit: EXIT.PASS, counts: { decided: n } });
  return EXIT.PASS;
}
