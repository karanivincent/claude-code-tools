// delivery inventory check: gate for phase 2: every candidate mapped, every state rendered.
// Owner: slice B1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { inventoryGate } from '../plan/inventory-check.mjs';

export default defineCommand({
  name: 'inventory check',
  summary: 'Gate for phase 2: every candidate mapped, every state rendered',
  usage: `usage: delivery inventory check

Every mechanical candidate is mapped to a state or excluded with a reason; every state has
an id, a design reference, a render or an impossible reason, and at least one control or an
explicit none (one control whose role is "none"); every control has a target and an effect
class; for a redesign, every capability has a signature and file:line evidence. The
inventory must be for the design tree the candidates came from.

exit: 0 green; 1 red

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const r = await inventoryGate(ctx);
    for (const f of r.failures) ctx.out.fail(f.code, f.message);
    const exit = r.ok ? EXIT.PASS : r.exit ?? EXIT.RED;
    if (r.ok) ctx.out.line('inventory check: green');
    ctx.out.set('failures', r.failures.length);
    await ctx.journal({ command: 'inventory check', exit, counts: { failures: r.failures.length } });
    return exit;
  },
});
