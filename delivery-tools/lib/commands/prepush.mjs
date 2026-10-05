// delivery prepush: the checks to run before the first push of a branch.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { intFlag, parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';
import { prepushProblems } from '../lifecycle/prepush.mjs';
import { roundDir } from '../picture/rounds.mjs';

const SECURITY_TIMEOUT_MS = 15 * 60 * 1000;
const SECURITY_TAIL_LINES = 20;

export default defineCommand({
  name: 'prepush',
  summary: 'Check the branch before its first push: base-branch names, org lists, behind base, components',
  usage: `usage: delivery prepush [--round <n>]

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

With --round <n> (picture mode, after a round's review is compiled and before the next fixer):
the same checks, then the profile's commands.security when it is set, and the result is recorded in
.delivery/<f>/rounds/<n>/prepush.json, so the fixer fixes what they found in that round and NEXT
does not ask for them again. A failed security scan is one FAIL line with the scan's last lines.

options:
  --round <n>   record the result in that round's folder, and run commands.security too

exit: 0 clean; 1 a problem was found; 2 usage or config

common options:
  --feature <slug>   the run (default: the single run in this worktree; rule 4 needs one)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { round: { type: 'string' } } });
    const round = intFlag(values.round, '--round');
    let dir = null;
    if (round !== undefined && round !== null) {
      dir = roundDir(ctx.requirePaths(), round);
      if (!existsSync(dir)) throw new UsageError(`round ${round} has no folder yet; run delivery shoot first`);
    }
    const problems = await prepushProblems(ctx);
    // A5: a round's shipping checks include the repo's security scan, when the profile names one.
    let security = null;
    if (dir) {
      const command = (await ctx.profile()).commands?.security ?? null;
      if (command) {
        const r = await ctx.runner.sh(command, { cwd: ctx.repoRoot, timeoutMs: SECURITY_TIMEOUT_MS });
        const tail = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').filter((l) => l.trim()).slice(-SECURITY_TAIL_LINES).join('\n');
        security = { command, exit: r.code, tail };
        if (r.code !== 0) problems.push({ code: 'security', message: `${command} exited ${r.code}:\n${tail}` });
      }
    }
    for (const p of problems) ctx.out.fail(p.code, p.message);
    ctx.out.set('problems', problems);
    if (!problems.length) ctx.out.line(`prepush: clean${security ? `, and ${security.command} passed` : ''}`);
    const exit = problems.length ? EXIT.RED : EXIT.PASS;
    if (dir) {
      const head = await ctx.git.revParse('HEAD').catch(() => null);
      await writeJsonAtomic(join(dir, 'prepush.json'), { schemaVersion: 1, round, at: ctx.clock.now().toISOString(), head, ok: !problems.length, problems, security });
      ctx.out.line(`recorded in ${join(dir, 'prepush.json')}${problems.length ? ': the fixer fixes these in the next round, with the review' : ''}`);
    }
    await ctx.journal({ command: dir ? `prepush --round ${round}` : 'prepush', exit, counts: { problems: problems.length } });
    return exit;
  },
});
