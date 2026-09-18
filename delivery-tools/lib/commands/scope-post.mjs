// delivery scope post: post the Scope issue and snapshot the plan's classes.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { postScope } from '../github/scope.mjs';

export default defineCommand({
  name: "scope post",
  summary: "Post the Scope issue and snapshot the plan's classes",
  usage: `usage: delivery scope post [--resnapshot] [--dry-run]

Post or update the Scope issue: title "Scope for #<epic>: <feature>", the profile's scope label
while any line is unanswered, at most five lines, each with its default, the wave it applies at
and the reply that changes it ("S1 build"). The first post takes the Scope snapshot: every row's
class, kept inside the issue and hashed into plan.scopeSnapshot. A row whose class changes after
that is a late change, listed first in the report and the PR body; later posts keep the snapshot
and only update the lines. With no line, the issue is created closed and unlabelled, and reopens
if a later change adds one.

options:
  --resnapshot       take a new snapshot (late changes before it are then not listed)
  --dry-run          print what would change; write nothing

exit: 0 posted; 1 more than five lines; 5 the stored snapshot does not match plan.scopeSnapshot

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { resnapshot: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } });
    const res = await postScope(ctx, { resnapshot: Boolean(values.resnapshot), dryRun: Boolean(values['dry-run']) });
    ctx.out.line(`scope${res.number ? ` #${res.number}` : ''}: ${values['dry-run'] ? `would be ${res.action}` : res.action}; ${res.openLines} line${res.openLines === 1 ? '' : 's'} waiting for a reply; snapshot ${String(res.snapshot ?? 'none').slice(0, 12)}`);
    ctx.out.set('issue', res.number);
    ctx.out.set('snapshot', res.snapshot);
    if (!values['dry-run']) {
      await ctx.journal({ command: 'scope post', exit: 0, counts: { issue: res.number, open: res.openLines, snapshot: String(res.snapshot ?? 'none').slice(0, 12) }, inputs: { resnapshot: Boolean(values.resnapshot) }, outputs: { issue: res.number, snapshot: res.snapshot } });
    }
    return EXIT.PASS;
  },
});
