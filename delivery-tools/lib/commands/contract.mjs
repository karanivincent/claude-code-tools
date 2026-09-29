// delivery contract: build the run's data contract from the design renders' DOM (picture mode).

import { relative } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { readMap } from '../picture/map.mjs';
import { contractPath, labelsPath, rebuildContractFile } from '../picture/contract.mjs';

export default defineCommand({
  name: 'contract',
  summary: 'Build the data contract (every text each design state shows, labelled data or fixed words)',
  usage: `usage: delivery contract

Picture mode. Reads every state's design render (<ID>.dom.json, and <ID>@phone.dom.json at phone
width), takes each text it shows in the page area, and writes docs/delivery/<feature>/contract.json:
per state, every text with its label. The texts come from the render's DOM, never from a model.

Labels come from the labeller (a delivery-extractor, Role: contract, briefs/contract-labeller.md),
which writes docs/delivery/<feature>/contract-labels.json: "data" (a value the seeded world must
hold, with the table and column, a count, a date or time, or a fixture user's name), "fixed" (the
page's own words) or "random" (an id or an avatar; masked, never seeded). This command folds that
file in. A text keeps its label across rebuilds, a text labelled fixed in one state is fixed in
every state, and a new text is unlabelled until the labeller sees it. design render rebuilds the
contract itself, so a new export never leaves it stale.

A state whose design contradicts itself (counts that do not add up, a date after today) is marked
"inconsistent" by the labeller: it goes to Claude Design (design-send), and seed --check skips it.

seed --check then refuses a plan whose worlds lack a data value, before anything is built.

exit: 0 every text is labelled and every label can be checked; 1 texts to label or labels that
      cannot be checked; 2 no map.json

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, { options: {} });
    const paths = ctx.requirePaths();
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json; the mapper writes it first'); return EXIT.USAGE; }
    const r = await rebuildContractFile(paths, map, ctx.clock.now().toISOString());
    const s = r.summary;
    const rel = (p) => relative(ctx.repoRoot, p);
    ctx.out.line(`contract: ${s.states} state(s), ${s.texts} text(s): ${s.data} data, ${s.fixed} fixed, ${s.random} random, ${s.unlabelled.length} to label -> ${rel(contractPath(paths))}`);
    if (r.changed.length) ctx.out.line(`the design changed ${r.changed.length} state(s): ${r.changed.join(', ')} (${r.added} new text(s), ${r.removed} gone)`);
    for (const x of s.invalid) ctx.out.fail('contract-label', `${x.state} "${x.text}": ${x.why}`);
    if (s.unlabelled.length) {
      const states = [...new Set(s.unlabelled.map((u) => u.state))];
      ctx.out.fail('contract-unlabelled', `${s.unlabelled.length} text(s) in ${states.length} state(s) to label (${states.slice(0, 8).join(', ')}${states.length > 8 ? ', ...' : ''}): dispatch the labeller (Role: contract, briefs/contract-labeller.md, Write: ${rel(labelsPath(paths))}), then run this again`);
    }
    // R12: a random value is masked by test id in the map, or it differs in every picture.
    const masked = new Set((map.states ?? []).filter((st) => st.mask?.length).map((st) => st.id));
    for (const [id, st] of Object.entries(r.contract.states)) {
      const random = (st.texts ?? []).filter((e) => e.label === 'random').map((e) => `"${e.text}"`);
      if (random.length && !masked.has(id)) ctx.out.line(`${id} shows random value(s) ${random.join(', ')} and masks nothing: give the map's state a mask ([{ "testid": ..., "why": ... }]) for each`);
    }
    for (const x of s.inconsistent) ctx.out.line(`inconsistent design: ${x.state}: ${x.why} (send it to Claude Design with design-send; seed --check skips it)`);
    if (!s.unlabelled.length && !s.invalid.length) ctx.out.line('next: delivery seed --plan, then --check (it refuses a data value no world holds)');
    ctx.out.set('contract', { states: s.states, texts: s.texts, data: s.data, fixed: s.fixed, random: s.random, unlabelled: s.unlabelled.length, invalid: s.invalid.length, inconsistent: s.inconsistent, changed: r.changed });
    const exit = s.unlabelled.length || s.invalid.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'contract', exit, counts: { states: s.states, texts: s.texts, data: s.data, unlabelled: s.unlabelled.length, invalid: s.invalid.length, inconsistent: s.inconsistent.length } });
    return exit;
  },
});
