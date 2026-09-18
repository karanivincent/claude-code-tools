// delivery wave merge: merge a unit whose gate is green into the integration branch.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { waveMerge } from '../lifecycle/wave.mjs';

export default defineCommand({
  name: "wave merge",
  summary: "Merge a unit whose gate is green into the integration branch",
  usage: `usage: delivery wave merge <unit>

From the integration worktree: refuse unless the unit's gate is green for its branch head
(recomputed from files), then merge the unit's branch (<integration branch>--<unit>) with --no-ff,
push the integration branch, and clear the unit's in-flight record. A conflict aborts the merge
and names the files: the builder merges origin/<integration branch> into its branch and resolves
them. A unit already merged is a no-op.

exit: 0 merged and pushed (or already merged); 1 gate red or merge conflict

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { positionals } = parseCommandArgs(argv, { positionals: { min: 1, max: 1, names: ['unit'] } });
    const res = await waveMerge(ctx, { unit: positionals[0] });
    for (const l of res.lines) ctx.out.line(l);
    for (const f of res.failures) ctx.out.fail(f.code, f.message);
    ctx.out.set('unit', res.unit);
    ctx.out.set('merged', res.merged);
    if (res.failures.length) {
      await ctx.journal({ command: `wave merge ${res.unit}`, exit: res.exit ?? EXIT.RED, counts: { failures: res.failures.length }, inputs: { unit: res.unit }, outputs: res.failures });
      return res.exit ?? EXIT.RED;
    }
    return EXIT.PASS;
  },
});
