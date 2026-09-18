// delivery status: re-validate the run and print exactly one NEXT line.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { cliPrefix, findRuns } from '../run/context.mjs';
import { statusReport } from '../run/status.mjs';

/**
 * Which run status reports on: --feature, else the one run in this worktree, else the one run in
 * the repository. Anything else is a NEXT line that says how to choose.
 * @returns {{ run: object|null, next: string|null, exit: number }}
 */
export function selectRun(runs, { feature, repoRoot, cli }) {
  if (feature) {
    const named = runs.filter((r) => r.feature === feature);
    const run = named.find((r) => r.worktree === repoRoot) ?? named[0] ?? null;
    if (run) return { run, next: null, exit: EXIT.PASS };
    const known = runs.map((r) => r.feature).join(', ') || 'none';
    return { run: null, next: `NEXT: no run named ${feature} in this repository (runs: ${known}); start one with /deliver-from-design <archive> "<one sentence of intent>" (skill: deliver-from-design)`, exit: EXIT.USAGE };
  }
  const here = runs.filter((r) => r.worktree === repoRoot);
  const pool = here.length ? here : runs;
  if (pool.length === 1) return { run: pool[0], next: null, exit: EXIT.PASS };
  if (pool.length === 0) {
    return { run: null, next: 'NEXT: no active delivery run in this repository; start one with /deliver-from-design <archive> "<one sentence of intent>" (skill: deliver-from-design)', exit: EXIT.PASS };
  }
  const list = pool.map((r) => `${r.feature} (${r.worktree})`).join(', ');
  return { run: null, next: `NEXT: ${pool.length} runs are active: ${list}; run ${cli} status --feature <slug> for the one you are resuming`, exit: EXIT.PASS };
}

export default defineCommand({
  name: 'status',
  summary: 'Re-validate the run and print exactly one NEXT line',
  usage: `usage: delivery status [--brief]

Find the run by scanning git worktree list for .delivery/*/state.json, re-validate every
finished phase from its sources (as advance does), check in-flight builders (report file:
done; commits and no report: continue on its branch; nothing: dispatch fresh; a finished unit
is never dispatched again) and GitHub by marker (epic, PR, head SHA, mergeable, CI), then
print exactly one NEXT line, naming the skill that drives it. If memory and NEXT disagree,
NEXT wins. Writes nothing.

options:
  --brief            at most 12 lines: run, phase, what is red, NEXT

exit: 0 printed NEXT; 2 --feature names no run; 5 broken journal or tampered artefact

common options:
  --feature <slug>   the run (default: the single run in this worktree, else in the repository)
  --json             machine output: one JSON object on stdout (data.next, data.gates, data.units)
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { brief: { type: 'boolean' } } });
    const runs = await findRuns(ctx, { includeClosed: Boolean(ctx.flags.feature) });
    const choice = selectRun(runs, { feature: ctx.flags.feature, repoRoot: ctx.repoRoot, cli: cliPrefix(ctx.repoRoot, ctx.pluginRoot) });
    if (!choice.run) {
      ctx.out.line(choice.next);
      ctx.out.set('next', { text: choice.next.replace(/^NEXT: /, ''), skill: null });
      ctx.out.set('runs', runs.map((r) => ({ feature: r.feature, worktree: r.worktree, phase: r.state?.phase ?? null })));
      return choice.exit;
    }
    const report = await statusReport(ctx, choice.run, { brief: Boolean(values.brief) });
    for (const l of report.lines) ctx.out.line(l);
    for (const [k, v] of Object.entries(report.data)) ctx.out.set(k, v);
    if (report.exit === EXIT.INCONSISTENT) {
      const why = report.data.inconsistent ?? report.data.gates?.find((g) => g.exit === EXIT.INCONSISTENT)?.failures[0]?.message ?? 'inconsistent run';
      ctx.out.fail('inconsistent', why);
    }
    return report.exit;
  },
});
