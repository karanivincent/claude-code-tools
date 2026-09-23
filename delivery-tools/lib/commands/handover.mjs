// delivery handover: regenerate the handover's generated sections.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { writeHandover } from '../lifecycle/handover.mjs';

export default defineCommand({
  name: "handover",
  summary: "Regenerate the handover's generated sections",
  usage: `usage: delivery handover [--print]

Regenerate the integration branch's one handover (the file matching the profile's handover
pattern that this branch added; created from the pattern and today's date when there is none):
Verification performed, in the past tense, from the journal (each command's last exit code and
counts); Migrations added on the branch; Known limitations as prose (accepted P2s, cuts, owed
items, waivers). Only the sections between markers change; the main session writes the rest.
Commit the file afterwards.

options:
  --print            print the file instead of writing it

exit: 0 written

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { print: { type: 'boolean' } } });
    const res = await writeHandover(ctx, { print: Boolean(values.print) });
    ctx.out.set('path', res.path);
    if (values.print) { ctx.out.line(res.text.trimEnd()); return EXIT.PASS; }
    ctx.out.line(`${res.created ? 'created' : 'updated'} ${res.path}: Verification performed, Migrations, Known limitations`);
    await ctx.journal({ command: 'handover', exit: 0, counts: { created: res.created ? 1 : 0 }, inputs: {}, outputs: { path: res.path } });
    return EXIT.PASS;
  },
});
