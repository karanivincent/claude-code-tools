// delivery pr-body: regenerate the PR body's generated blocks.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { readPlan, readState, findRunPr } from '../lifecycle/run-info.mjs';
import { assemblePrBody } from '../lifecycle/prbody.mjs';
import { sameText } from '../github/write.mjs';

export default defineCommand({
  name: "pr-body",
  summary: "Regenerate the PR body's generated blocks",
  usage: `usage: delivery pr-body [--pr N] [--print]

Regenerate the PR body's blocks between markers, late changes first: Late changes, Coverage (N
states built, M cut with issues, K adapted, J invented), Removed capabilities (each with its Scope
line), Accepted differences (line by line), Owed after merge, the children (Closes #N for every
unit whose branch is merged, Refs #N for the rest), the handover's link, and the claimed-paths
block. Text outside the blocks is left alone. No agent writes these by hand.

options:
  --pr N             the PR (default: the run's)
  --print            print the body instead of updating the PR

exit: 0 updated (or already current)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { pr: { type: 'string' }, print: { type: 'boolean' } } });
    const paths = ctx.requirePaths();
    const profile = await ctx.profile();
    const plan = await readPlan(paths);
    const state = await readState(paths);
    const n = intFlag(values.pr, '--pr');
    const pr = n ? await ctx.gh.prGet(n) : await findRunPr(ctx, { profile, feature: paths.feature, state });
    if (n && !pr) throw new UsageError(`PR #${n} not found`);
    if (!pr && !values.print) throw new UsageError('the run has no PR yet (run delivery claims open), or pass --print');
    const { body, late } = await assemblePrBody(ctx, { paths, profile, plan, state, existing: pr?.body ?? '' });
    ctx.out.set('lateChanges', late.length);
    if (values.print) { ctx.out.line(body.trimEnd()); return EXIT.PASS; }
    const changed = !sameText(body, pr.body);
    if (changed) await ctx.gh.prEdit(pr.number, { body });
    ctx.out.line(`PR #${pr.number}: body ${changed ? 'updated' : 'already current'}${late.length ? `; ${late.length} late change${late.length === 1 ? '' : 's'} listed first` : ''}`);
    ctx.out.set('pr', pr.number);
    await ctx.journal({ command: 'pr-body', exit: 0, counts: { pr: pr.number, late: late.length, action: changed ? 'updated' : 'unchanged' }, inputs: { pr: pr.number }, outputs: { body } });
    return EXIT.PASS;
  },
});
