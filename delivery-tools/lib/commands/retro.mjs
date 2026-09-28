// delivery retro: record the run, find what repeats, apply small fixes, ask about large ones.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { runRetro, reportLines } from '../retro/retro.mjs';

export default defineCommand({
  name: 'retro',
  summary: 'Record the run in the runs ledger, find what repeats, apply small fixes and ask about large ones',
  usage: `usage: delivery retro [--dry-run]

Run at the end of a run (delivery land calls it; NEXT names it once ready is green). It writes one
line for this run to docs/delivery/runs.jsonl (phase minutes, founder waiting, per-round counts,
reviewer cost, CI failures after the PR, the run's workflow-improvements.md). Commit that file
with the run. A re-run replaces the run's line.

It runs only in the delivery session: no schedule, no cron. It never touches production, never
dials, never seeds and never opens a database.

options:
  --dry-run          build the record and print the report; write nothing

exit: 0 always for a run it could read; 2 when there is no run

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { 'dry-run': { type: 'boolean' } } });
    const paths = ctx.requirePaths();
    const res = await runRetro(ctx, paths, { dryRun: Boolean(values['dry-run']) });
    for (const l of reportLines(res)) ctx.out.line(l);
    ctx.out.set('retro', { ledger: res.ledger, wrote: res.wrote, changed: res.changed, reverted: res.reverted, needsYou: res.needsYou, record: res.record });
    if (res.wrote) await ctx.journal({ command: 'retro', exit: 0, counts: { changed: res.changed.length, reverted: res.reverted.length, needs: res.needsYou.length } });
    return 0;
  },
});
