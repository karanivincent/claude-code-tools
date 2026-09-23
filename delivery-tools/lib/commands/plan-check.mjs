// delivery plan check: gate for phase 3 (M1): coverage, owners, cuts, budgets, file overlap.
// Owner: slice B1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { planGate } from '../plan/check.mjs';

export default defineCommand({
  name: 'plan check',
  summary: 'Gate for phase 3 (M1): coverage, owners, cuts, budgets, file overlap',
  usage: `usage: delivery plan check

M1: every inventory state and baseline capability has exactly one row; every row a class,
and every build row an owner, a reach and markers; every cut a reason code (money, dials,
production, new-vendor, over-size), an issue and budget (limits.maxCuts); every remove and
every cut of a requested item a Scope line (at most five lines); the prop and unseedable
share within limits.maxPropOrUnseedablePct; no two same-wave units share a file (message
files belong to the words unit alone); every missing table, column or route has a unit;
wave 0 has the contract unit; every invariant is machine-checkable; every item the founder
requested is on a row.

exit: 0 green; 1 red

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const r = await planGate(ctx);
    for (const f of r.failures) ctx.out.fail(f.code, f.message);
    const exit = r.ok ? EXIT.PASS : r.exit ?? EXIT.RED;
    if (r.ok) ctx.out.line('plan check: green');
    ctx.out.set('failures', r.failures.length);
    await ctx.journal({ command: 'plan check', exit, counts: { failures: r.failures.length } });
    return exit;
  },
});
