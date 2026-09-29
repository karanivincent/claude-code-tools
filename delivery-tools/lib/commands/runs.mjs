// delivery runs: the cross-run table from the runs ledger. Read-only. Owner: slice A2.

import { join, resolve } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { DEFAULT_ROOTS } from '../core/paths.mjs';
import { readLedger } from '../retro/ledger.mjs';
import { runRows, modelRows, roleRows, runsReport } from '../retro/runs.mjs';

export default defineCommand({
  name: 'runs',
  summary: 'Print the cross-run table from the runs ledger: phases, models, cost, rounds to green',
  usage: `usage: delivery runs [--ledger <file>] [--only <slug>]...

Reads docs/delivery/runs.jsonl (the profile's deliveryRoot) and prints, over every run:
time by phase in % of the run's own minutes, founder and slot waits, estimated cost; rounds, the
round the page went green (nothing to fix, nothing unreached) and the match rate of each round;
time and cost by model (agents, and the main session's own minutes and tokens); and time and cost
by role. Costs are estimates from models.json's prices. Lines a backfill wrote are marked (est.).
Writes nothing, and needs no run.

options:
  --ledger <file>     another ledger file
  --only <slug>       only this run (repeatable)

exit: 0; 5 when a ledger line is not valid

common options:
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { ledger: { type: 'string' }, only: { type: 'string', multiple: true } } });
    let file;
    if (values.ledger) file = resolve(ctx.cwd, values.ledger);
    else {
      const profile = await ctx.profile().catch(() => null);
      file = join(ctx.repoRoot, profile?.paths?.deliveryRoot ?? DEFAULT_ROOTS.deliveryRoot, 'runs.jsonl');
    }
    let records = await readLedger(file);
    if (values.only?.length) records = records.filter((r) => values.only.includes(r.feature));
    for (const l of runsReport(records)) ctx.out.line(l);
    ctx.out.set('runs', runRows(records));
    ctx.out.set('models', modelRows(records));
    ctx.out.set('roles', roleRows(records));
    return 0;
  },
});
