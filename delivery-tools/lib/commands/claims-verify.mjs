// delivery claims verify: fail if the pool planner still queues a claimed child.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { verifyClaims } from '../github/claims.mjs';

export default defineCommand({
  name: "claims verify",
  summary: "Fail if the pool planner still queues a claimed child",
  usage: `usage: delivery claims verify

Run the profile's planner (commands.planner) and fail if any claimed child, printed as #N, is
still in its queue: the draft PR's claim is not holding. Run at wave 0 and at every wave start.
Labels are never relied on.

exit: 0 no claimed child queued; 1 a claimed child is queued, or the planner failed;
      4 the planner timed out

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const res = await verifyClaims(ctx);
    if (res.skipped) { ctx.out.line(res.detail); return EXIT.PASS; }
    for (const q of res.queued) ctx.out.fail('claims', `the planner still queues #${q.issue} (${q.unit}): the draft PR's claim is not holding`);
    if (res.ok) ctx.out.line('no claimed child is in the planner\'s queue');
    ctx.out.set('queued', res.queued);
    const exit = res.ok ? EXIT.PASS : EXIT.RED;
    await ctx.journal({ command: 'claims verify', exit, counts: { queued: res.queued.length }, inputs: {}, outputs: res.queued });
    return exit;
  },
});
