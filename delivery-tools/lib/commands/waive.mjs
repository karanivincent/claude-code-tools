// delivery waive: record the founder's named waiver for a waivable probe.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { formatEvent, updateState } from '../core/state.mjs';
import { PROBES } from '../lifecycle/preflight.mjs';
import { dep } from '../run/compose.mjs';
import { requireRunState } from '../run/context.mjs';

export default defineCommand({
  name: 'waive',
  summary: "Record the founder's named waiver for a waivable probe",
  usage: `usage: delivery waive <probe> --note "<text>"

Record the founder's waiver for a red preflight probe that the spec lets him waive (for
example P13, the observer user), in state.json and the journal. The phase-1 gate then
treats that probe as waived, and the final report lists every waiver first. A probe that
cannot be waived (P2, the safety file, among others) is refused, and so is a probe that is
not red in preflight.json. Waiving the same probe again replaces the note.

options:
  --note "<text>"    required: the founder's reason, in his words

exit: 0 recorded; 2 unknown or unwaivable probe, no --note, no run, or nothing to waive

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { note: { type: 'string' } },
      positionals: { min: 1, max: 1, names: ['probe'] },
    });
    const probeId = String(positionals[0]).toUpperCase();
    const probes = dep(ctx, 'PROBES', PROBES);
    const probe = probes.find((p) => p.id === probeId);
    if (!probe) throw new UsageError(`unknown probe "${positionals[0]}"; one of: ${probes.map((p) => p.id).join(', ')}`);
    if (!probe.waivable) throw new UsageError(`${probe.id} cannot be waived (${probe.title}); fix it instead (spec 4.1)`);
    const note = String(values.note ?? '').trim();
    if (!note) throw new UsageError(`--note "<the founder's reason>" is required`);

    const { paths } = await requireRunState(ctx);
    const preflight = await readArtefact(paths, 'preflight', { optional: true });
    if (!preflight) throw new UsageError('no preflight.json yet; run delivery preflight first, then waive what it leaves red');
    const row = preflight.probes.find((p) => p.id === probe.id);
    if (row && ['green', 'not-applicable'].includes(row.status)) {
      throw new UsageError(`${probe.id} is ${row.status} in preflight.json; there is nothing to waive`);
    }

    const at = ctx.clock.now().toISOString();
    const waiver = { probe: probe.id, note, at };
    await updateState(paths, (s) => ({ ...s, waivers: [...s.waivers.filter((w) => w.probe !== probe.id), waiver] }), {
      at, event: formatEvent({ command: `waive ${probe.id}`, exit: 0, counts: { status: row?.status ?? 'unknown' } }),
      inputs: { probe: probe.id, note }, outputs: waiver,
    });
    ctx.out.line(`waived ${probe.id} (${probe.title}): ${note}`);
    ctx.out.line('the final report lists this waiver first');
    ctx.out.set('waiver', waiver);
    return 0;
  },
});
