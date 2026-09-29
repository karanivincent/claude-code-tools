// delivery log-wait: record time the run spent waiting, on the founder or for a machine slot, in its
// journal, for the runs ledger. Slot waits inside delivery shoot are recorded on their own.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { waitEvent } from '../retro/log.mjs';

export default defineCommand({
  name: 'log-wait',
  summary: 'Record time the run waited on the founder or for a machine slot, for the runs ledger',
  usage: `usage: delivery log-wait (--founder | --slot) --minutes <n>

Adds a wait line to the run's journal, ending now. A founder wait is taken out of the phase
minutes, like the time between a Scope question and its answer; a slot wait stays in its phase and
is reported on its own. delivery shoot records its own slot waits; use --slot for a heavy job run
another way (an e2e suite through commands.heavy, say) and --founder for a question asked in chat.

options:
  --founder          the run waited on the founder
  --slot             the run waited for a free machine slot
  --minutes <n>      how long, in minutes (more than 0)

exit: 0 recorded; 2 usage or no run

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values: v } = parseCommandArgs(argv, { options: { founder: { type: 'boolean' }, slot: { type: 'boolean' }, minutes: { type: 'string' } } });
    ctx.requirePaths();
    if (Boolean(v.founder) === Boolean(v.slot)) throw new UsageError('give exactly one of --founder or --slot');
    const minutes = Number(v.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new UsageError('--minutes <n> needs a number above 0');
    const kind = v.founder ? 'founder' : 'slot';
    await ctx.journal(waitEvent(kind, minutes));
    ctx.out.line(`logged a ${minutes} min ${kind} wait`);
    ctx.out.set('wait', { kind, minutes });
    return 0;
  },
});
