// delivery rules: check that every behaviour the briefs state has a proof.

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { readMap } from '../picture/map.mjs';
import { briefFiles, ruleFacts, rulesPath } from '../picture/rules.mjs';

export default defineCommand({
  name: 'rules',
  summary: 'Check that every rule the briefs state is shown by a design state, proved by a test, or cut',
  usage: `usage: delivery rules [--ready]

A picture run builds and grades what the design pictures show. A decision made in a brief and never
drawn (an undo instead of a confirm, a field that is read-only when it came from another system)
would never be checked. docs/delivery/<feature>/rules.json closes that gap: the rules agent
(briefs/rules.md) writes one rule per behaviour the briefs in intent/ state, each with one proof:

  picture       a design state shows it; the rule names those states (reviewers check it there)
  test          no picture can show it; the builder writes a test named "R<n>: ..." and lists its file
  cut           it is out of this run; the rule quotes the Scope line the founder saw
  owed-design   the design has not drawn it yet; send it to the design, then map it

This command checks the file against map.json and prints each gap. delivery map writes the rules
into checklist.md under their states. delivery ready runs the --ready check.

options:
  --ready   also require every test rule's test file to exist and carry its "R<n>:" name

exit: 0 every rule has a proof; 1 a rule has none, or the file has problems (each is printed);
      2 there is no rules.json

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { ready: { type: 'boolean' } } });
    const paths = ctx.requirePaths();
    const map = readMap(paths);
    const stage = values.ready ? 'ready' : 'plan';
    const f = ruleFacts(paths, { stateIds: map ? map.states.map((s) => s.id) : undefined, stage });
    if (!f.exists) {
      const briefs = briefFiles(paths);
      ctx.out.fail('no-rules', `${rulesPath(paths)} does not exist; ${briefs.length ? `dispatch the rules agent (briefs/rules.md) to write it from ${briefs.length} brief(s) in intent/` : 'there are no briefs in intent/ either, so there is nothing to write rules from'}`);
      return EXIT.USAGE;
    }
    if (!map) ctx.out.line('note: no map.json yet, so state names are not checked');
    for (const p of f.problems) ctx.out.fail('rule', p);
    const c = f.counts;
    if (c) ctx.out.line(`rules: ${c.total} (${c.picture} shown by a state, ${c.test} proved by a test, ${c.cut} cut, ${c['owed-design']} owed to the design)`);
    ctx.out.set('rules', { stage, counts: c, problems: f.problems.length });
    const exit = f.problems.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'rules', exit, counts: { rules: c?.total ?? 0, problems: f.problems.length } });
    if (!f.problems.length) ctx.out.line(stage === 'ready' ? 'every rule has its proof, and every test it names exists' : 'every rule has a proof');
    return exit;
  },
});
