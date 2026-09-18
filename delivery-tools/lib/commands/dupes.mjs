// delivery dupes: find other PRs touching the run's children or paths.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { findDupes } from '../github/dupes.mjs';

export default defineCommand({
  name: "dupes",
  summary: "Find other PRs touching the run's children or paths",
  usage: `usage: delivery dupes

List PRs that are not the run's, open or merged since the run began, that reference a claimed
child (Refs, Closes, Fixes or Resolves #N in the body, or the number in the branch name) or touch
a claimed path. Any hit is red: the affected unit stops merging, the main session records a Tier 1
decision (adopt the other branch, or ask for it to be closed), and baseline --refresh classes
anything it added. Runs at every wave start, every wave end and before ready.

exit: 0 none; 1 a duplicate exists

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const hits = await findDupes(ctx);
    for (const h of hits) ctx.out.fail('dupe', h.reason);
    if (!hits.length) ctx.out.line('no other PR references a claimed child or touches a claimed path');
    ctx.out.set('dupes', hits);
    const exit = hits.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'dupes', exit, counts: { hits: hits.length }, inputs: {}, outputs: hits });
    return exit;
  },
});
