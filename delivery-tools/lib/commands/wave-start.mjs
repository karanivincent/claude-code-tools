// delivery wave start: merge the base, class new capabilities, re-read Scope, check claims.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { waveStart } from '../lifecycle/wave.mjs';

export default defineCommand({
  name: "wave start",
  summary: "Merge the base, class new capabilities, re-read Scope, check claims",
  usage: `usage: delivery wave start [<wave>]

From the integration worktree, for the given wave (default: the lowest wave with a unit not yet
merged):
  1. merge origin/<base> without committing, then run the baseline refresh (redesigns): every
     capability that landed on the base since the run began needs a plan row before the merge
     completes. A modify/delete conflict on a file this branch deleted is settled only then,
     keeping the deletion: it is a plan decision, never a merge detail. Any other conflict is
     left for you to resolve; run wave start again after git add.
  2. apply the founder's Scope replies (scope read);
  3. claims verify and dupes;
  4. run the profile's flight and tried commands, write one unit file per unit of the wave, and
     record each dispatch, then print one NEXT line per builder to dispatch.
Refuses to finish while any new capability is unclassed.

exit: 0 started; 1 red (unclassed capability, conflict, unmapped Scope reply, claim, duplicate)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { positionals } = parseCommandArgs(argv, { positionals: { min: 0, max: 1, names: ['wave'] } });
    let wave = null;
    if (positionals[0] !== undefined) {
      if (!/^\d+$/.test(positionals[0])) throw new UsageError(`<wave> must be a number, got "${positionals[0]}"`);
      wave = Number(positionals[0]);
    }
    const res = await waveStart(ctx, { wave });
    for (const l of res.lines) ctx.out.line(l);
    for (const f of res.failures) ctx.out.fail(f.code, f.message);
    ctx.out.set('wave', res.wave);
    ctx.out.set('units', res.units.map((u) => ({ unit: u.unit.id, brief: u.file, report: u.report, branch: u.branch })));
    return res.exit;
  },
});
