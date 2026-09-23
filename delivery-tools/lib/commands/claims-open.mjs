// delivery claims open: open the run's draft PR that claims every child.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { openClaims } from '../github/claims.mjs';

export default defineCommand({
  name: "claims open",
  summary: "Open the run's draft PR that claims every child",
  usage: `usage: delivery claims open [--dry-run]

From the integration worktree: push the integration branch and open (or update) one draft PR
against the base whose body carries, between markers, Refs #N for every build unit and backend
unit (never the cut follow-ups or the polish issue), the claimed-paths block the repo's scope
check reads, and the generated blocks pr-body keeps current; plus the run label. Run it in wave 0
before the first builder: the pool skips any issue an open PR references.

options:
  --dry-run          print what would change; push and write nothing

exit: 0 open; 1 GitHub refused, or a unit has no issue yet (run issues sync)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { 'dry-run': { type: 'boolean' } } });
    const res = await openClaims(ctx, { dryRun: Boolean(values['dry-run']) });
    if (res.skipped) { ctx.out.line('claims are off in this repo (profile.claims.mode none)'); return EXIT.PASS; }
    ctx.out.line(`PR${res.pr ? ` #${res.pr}` : ''}: ${values['dry-run'] ? `would be ${res.action}` : res.action}; claims ${res.claimed.map((n) => `#${n}`).join(', ') || 'no child'} and ${res.paths.length} path${res.paths.length === 1 ? '' : 's'}`);
    ctx.out.set('pr', res.pr);
    ctx.out.set('claimed', res.claimed);
    if (!values['dry-run']) await ctx.journal({ command: 'claims open', exit: 0, counts: { pr: res.pr, children: res.claimed.length, paths: res.paths.length }, inputs: { claimed: res.claimed }, outputs: { pr: res.pr } });
    return EXIT.PASS;
  },
});
