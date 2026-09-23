// delivery plan verify: check every exists claim in the plan mechanically.
// Owner: slice B1 (docs/ARCHITECTURE.md).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { verifyPlanClaims } from '../plan/verify.mjs';

export default defineCommand({
  name: 'plan verify',
  summary: 'Check every exists claim in the plan mechanically',
  usage: `usage: delivery plan verify

Check each exists claim in plan.json against this worktree: columns against the generated
database types (profile paths.databaseTypes); API routes against the route files
(paths.apiRouteGlobs), the method the file exports, and a discriminator's literal in the
handler or a module it imports. A claim of "missing" that already exists is also false.
Prints the claims marked verifiedBy verify-spec, for general-tools:verify-spec.

exit: 0 every mechanical claim holds; 1 a claim is false

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const paths = ctx.requirePaths();
    const profile = await ctx.profile();
    const plan = await readArtefact(paths, 'plan');
    let typesText = null;
    try { typesText = await readFile(join(paths.repoRoot, profile.paths.databaseTypes), 'utf8'); } catch { typesText = null; }
    const files = (await ctx.git.ok(['ls-files'])).split('\n').filter(Boolean);
    const res = await verifyPlanClaims({ plan, repoRoot: paths.repoRoot, files, profile, typesText });
    for (const f of res.failures) ctx.out.fail(f.code, f.message);
    if (res.left.length) {
      ctx.out.line(`${res.left.length} claim(s) left for general-tools:verify-spec:`);
      for (const l of res.left) ctx.out.line(`  ${l}`);
    }
    ctx.out.line(`plan verify: ${res.checked} claim(s) checked, ${res.failures.length} false, ${res.left.length} left for verify-spec`);
    ctx.out.set('left', res.left);
    const exit = res.failures.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'plan verify', exit, counts: { checked: res.checked, false: res.failures.length, left: res.left.length } });
    return exit;
  },
});
