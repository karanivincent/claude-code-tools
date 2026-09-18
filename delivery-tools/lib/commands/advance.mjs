// delivery advance: re-run every earlier gate from its sources, then record the new phase.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { formatEvent, updateState } from '../core/state.mjs';
import { requireRunState } from '../run/context.mjs';
import { evaluateRun, verdictLine } from '../run/gates.mjs';
import { PHASES, nextPhase, phaseIndex } from '../run/phases.mjs';

export default defineCommand({
  name: 'advance',
  summary: 'Re-run every earlier gate from its sources, then record the new phase',
  usage: `usage: delivery advance <phase>

<phase> is the next phase: preflight, inventory, plan, wave0, build, pr, ready, merged,
landed or closed, one at a time. Re-runs the gate of every earlier phase from its sources
(never from a recorded verdict), then the gate of the phase being left, and only then records
the new phase. A red earlier gate (exit 1, or 3 when it waits on the founder) moves the run
back to that phase, and status then names it as NEXT. After the merge only the gates from
"pr" on are re-run, and nothing moves back. Naming the current phase re-validates the
earlier gates without advancing.

  phase left   gate that must be green
  intake       0: snapshot hashed, intent valid, epic found by marker, state initialised
  preflight    1: every probe green, a wave-0 task, or waived where waivable
  inventory    2: candidates mapped or excluded, states rendered, baseline for a redesign
  plan         3: plan check, issues synced, Scope issue posted and snapshotted
  wave0        4: contract unit gated, worlds seeded and scanned, capture smoke, claims
  build        5: every unit gated, the wave sync clean, CI green
  pr           6: ready.json green for the PR head
  ready        6: the PR is merged (the founder's merge), its head ready-green
  merged       7: staging proof (land --check)
  landed       7: the epic is closed

exit: 0 advanced; 1 a gate is red; 2 usage, or a gate cannot be evaluated; 3 a gate waits
on the founder; 4 wait and retry (CI pending); 5 inconsistent

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { positionals } = parseCommandArgs(argv, { positionals: { min: 1, max: 1, names: ['phase'] } });
    const target = positionals[0];
    if (!PHASES.includes(target)) throw new UsageError(`unknown phase "${target}"; one of: ${PHASES.slice(1).join(', ')}`);
    const { paths, state } = await requireRunState(ctx);
    const cur = state.phase;
    if (cur === 'closed') throw new UsageError('the run is closed; there is nothing to advance to');
    const ci = phaseIndex(cur);
    const ti = phaseIndex(target);
    if (ti < ci) throw new UsageError(`advance moves forward only; the run is at ${cur}, and the next phase is ${nextPhase(cur)}`);
    if (ti > ci + 1) throw new UsageError(`advance one phase at a time; the run is at ${cur}, and the next phase is ${nextPhase(cur)}`);
    const already = ti === ci;

    const evaluation = await evaluateRun(ctx, state, { leaving: !already });
    const verdicts = [...evaluation.earlier, ...(evaluation.leaving ? [evaluation.leaving] : [])];
    let red = 0;
    for (const v of verdicts) {
      ctx.out.line(verdictLine(v));
      for (const f of v.failures) { ctx.out.fail(f.code, `${v.gate}: ${f.message}`); red++; }
    }
    const summary = verdicts.map((v) => ({ gate: v.gate, ok: v.ok, exit: v.exit, failures: v.failures.length }));
    const at = ctx.clock.now().toISOString();
    ctx.out.set('gates', verdicts.map((v) => ({ gate: v.gate, phase: v.step.phase, ok: v.ok, exit: v.exit, failures: v.failures })));

    if (evaluation.backTo) {
      await updateState(paths, (s) => ({ ...s, phase: evaluation.backTo }), {
        at, event: formatEvent({ command: `advance ${target}`, exit: evaluation.exit, counts: { from: cur, back: evaluation.backTo, red } }),
        inputs: { from: cur, target }, outputs: summary,
      });
      ctx.out.line(`moved back to ${evaluation.backTo}: its gate is red again; delivery status names what to do`);
      ctx.out.set('phase', evaluation.backTo);
      return evaluation.exit;
    }
    if (evaluation.exit === EXIT.PASS) {
      if (already) {
        await ctx.journal({ command: `advance ${target}`, exit: 0, counts: { from: cur, already: true }, inputs: { from: cur, target }, outputs: summary });
        ctx.out.line(`already at ${target}; every earlier gate is green`);
      } else {
        await updateState(paths, (s) => ({ ...s, phase: target }), {
          at, event: formatEvent({ command: `advance ${target}`, exit: 0, counts: { from: cur, gates: verdicts.length } }),
          inputs: { from: cur, target }, outputs: summary,
        });
        ctx.out.line(`advanced to ${target}`);
      }
      ctx.out.set('phase', target);
      return EXIT.PASS;
    }
    await ctx.journal({ command: `advance ${target}`, exit: evaluation.exit, counts: { from: cur, red }, inputs: { from: cur, target }, outputs: summary });
    ctx.out.line(`stays at ${cur}`);
    ctx.out.set('phase', cur);
    return evaluation.exit;
  },
});
