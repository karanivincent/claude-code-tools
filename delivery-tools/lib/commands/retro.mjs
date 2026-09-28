// delivery retro: record the run, find what repeats, apply small fixes, ask about large ones.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readJson } from '../core/fs.mjs';
import { resolve } from 'node:path';
import { runRetro, reportLines } from '../retro/retro.mjs';

export default defineCommand({
  name: 'retro',
  summary: 'Record the run in the runs ledger, find what repeats, apply small fixes and ask about large ones',
  usage: `usage: delivery retro [--dry-run] [--propose <file.json>]

Run at the end of a run (delivery land calls it; NEXT names it once ready is green). It writes one
line for this run to docs/delivery/runs.jsonl (phase minutes, founder waiting, per-round counts,
reviewer cost, CI failures after the PR, the run's workflow-improvements.md). Commit that file
with the run. A re-run replaces the run's line.

It runs only in the delivery session: no schedule, no cron. It never touches production, never
dials, never seeds and never opens a database.

A slow phase or a repeated improvement becomes a proposal, and the size rule (lib/retro/size.mjs)
sorts it. Small: a tunable in tunables.json, a steer in the run's steers.md, a sentence in a brief,
a new check that only warns. A small change to the plugin goes through a PR on the plugin checkout
named by DELIVERY_PLUGIN_REPO (or the profile's retro.pluginRepo) and merges once the plugin's
tests pass; without one it is written as a proposal. Large: anything else, or anything unsure. It
is written to docs/delivery/<feature>/proposals/<id>.md, filed as a needs-decision issue, listed
under "Needs you" and never applied. Every earlier automatic change is checked against the number
it named; one that got worse in two runs in a row is reverted through a PR. The report lists
"Changed automatically", "Reverted" and "Needs you"; put "Needs you" in the run's final report.

options:
  --dry-run              build the record and print the report; write and change nothing
  --propose <file.json>  add proposals of your own: one { change, evidence?, metric? } or an array

exit: 0 always for a run it could read; 2 when there is no run

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { 'dry-run': { type: 'boolean' }, propose: { type: 'string' } } });
    const paths = ctx.requirePaths();
    const propose = values.propose ? await readJson(resolve(ctx.cwd, values.propose)) : undefined;
    const res = await runRetro(ctx, paths, { dryRun: Boolean(values['dry-run']), propose });
    for (const l of reportLines(res)) ctx.out.line(l);
    ctx.out.set('retro', { ledger: res.ledger, wrote: res.wrote, changed: res.changed, reverted: res.reverted, checked: res.checked, needsYou: res.needsYou, notes: res.notes, record: res.record });
    if (res.wrote) await ctx.journal({ command: 'retro', exit: 0, counts: { changed: res.changed.length, reverted: res.reverted.length, needs: res.needsYou.length } });
    return 0;
  },
});
