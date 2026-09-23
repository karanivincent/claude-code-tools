// delivery issues sync: create or update the epic, children and Scope issue by marker.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { syncIssues } from '../github/issues.mjs';

export default defineCommand({
  name: "issues sync",
  summary: "Create or update the epic, children and Scope issue by marker",
  usage: `usage: delivery issues sync [--epic-only] [--epic N] [--dry-run]

Create or update, by marker, the epic, one child per build unit and per backend unit (sub-issues
of the epic, claimed later by the draft PR), one follow-up per cut row (unclaimed, referencing the
epic), the polish issue once P3 findings exist, and the Scope issue's lines; post spec.md to the
epic as one comment, updated in place. Before creating anything it looks for the number the run
recorded, then searches open and closed issues for the marker. It updates only the generated part
of a body, never retitles, never deletes: an issue whose unit or cut left the plan is closed with
a comment. The numbers it finds are written back to plan.json. Running it twice creates nothing.

options:
  --epic-only        only find, adopt or create the epic (intake uses this)
  --epic N           adopt issue N as the epic
  --dry-run          print what would change; write nothing

exit: 0 in sync; 1 a write failed; 2 no plan (without --epic-only); 4 GitHub unavailable

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: { 'epic-only': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, epic: { type: 'string' } },
    });
    const dryRun = Boolean(values['dry-run']);
    const res = await syncIssues(ctx, { epicOnly: Boolean(values['epic-only']), adopt: intFlag(values.epic, '--epic'), dryRun });
    for (const l of res.lines) ctx.out.line(l);
    ctx.out.set('epic', res.epic);
    ctx.out.set('counts', res.counts);
    if (!dryRun) {
      await ctx.journal({ command: values['epic-only'] ? 'issues sync --epic-only' : 'issues sync', exit: 0, counts: res.counts, inputs: { epic: res.epic }, outputs: res.lines });
    }
    return EXIT.PASS;
  },
});
