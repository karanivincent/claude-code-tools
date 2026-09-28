// delivery prepush: the checks to run before the first push of a branch.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { prepushProblems } from '../lifecycle/prepush.mjs';

export default defineCommand({
  name: 'prepush',
  summary: 'Check the branch before its first push: base-branch names, org lists, behind base, components',
  usage: `usage: delivery prepush

Run this before the first push. It fails, one FAIL line per problem, when:
  1. the branch removes or renames a test id or visible text that the base branch's design plans
     (<deliveryRoot>/replay/**/plan.json) or e2e specs (paths.e2eDir) name. The design gate and E2E
     read those from the base branch, so the pull request cannot fix them itself. Plans and specs
     are read from origin/<base> with git; the names are searched for in the paths.componentGlobs,
     paths.appRouteGlobs and message files at the branch's merge base and at HEAD.
  2. a migration the branch adds (paths.migrationsGlob) creates a table with the org column
     (paths.orgColumn, default organization_id) that is missing from a list in paths.orgScopedLists.
     Skipped when the profile has no orgScopedLists.
  3. the branch is behind origin/<base> after a fetch.
  4. the components rule that ready runs after CI, for a picture-mode run.

exit: 0 clean; 1 a problem was found; 2 usage or config

common options:
  --feature <slug>   the run (default: the single run in this worktree; rule 4 needs one)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, { options: {} });
    const problems = await prepushProblems(ctx);
    for (const p of problems) ctx.out.fail(p.code, p.message);
    ctx.out.set('problems', problems);
    if (!problems.length) ctx.out.line('prepush: clean');
    const exit = problems.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'prepush', exit, counts: { problems: problems.length } });
    return exit;
  },
});
