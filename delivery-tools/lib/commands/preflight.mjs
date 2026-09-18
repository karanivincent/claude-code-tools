// delivery preflight: run probes P1-P16 and print one Needs-you list.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { PROBES, runProbes, preflightExit, probeLine } from '../lifecycle/preflight.mjs';

export default defineCommand({
  name: "preflight",
  summary: "Run probes P1-P16 and print one Needs-you list",
  usage: `usage: delivery preflight [--only <P1,P2,...>]

Run every probe (spec 4.1) and write .delivery/<feature>/preflight.json. A red repo
prerequisite becomes a wave-0 task (T-capture, T-version, T-bootstrap, ...); a red-circle item
is printed with what to fix and where, and the run waits for the fix or, where the probe is
waivable, a named waiver (delivery waive <probe> --note "..."). Run it after intake, while the
founder is present: it is the only point where a question to him is expected.

options:
  --only <ids>       re-run only these probes, keeping the others' last results

exit: 0 green or turned into tasks; 1 red; 3 a red-circle item is open

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { only: { type: 'string' } } });
    const only = values.only ? values.only.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
    for (const id of only ?? []) if (!PROBES.some((p) => p.id === id)) throw new UsageError(`--only: unknown probe ${id} (P1 to P16)`);
    ctx.requirePaths();
    const { doc } = await runProbes(ctx, { only });
    const exit = preflightExit(doc.probes);
    const needs = doc.probes.filter((p) => p.status === 'red');
    const blocking = needs.filter((p) => p.blocking);
    const other = needs.filter((p) => !p.blocking);
    ctx.out.line(blocking.length ? 'Needs you:' : 'Needs you: nothing.');
    for (const p of blocking) ctx.out.fail(p.id, `🔴 ${probeLine(p)}`);
    if (other.length) {
      ctx.out.line('Red, not blocking:');
      for (const p of other) ctx.out.fail(p.id, probeLine(p));
    }
    if (doc.tasks.length) {
      ctx.out.line('Wave-0 tasks (a builder makes them before any screen):');
      for (const t of doc.tasks) ctx.out.line(`  ${t.id} (${t.probe}) ${t.title}${t.issue ? ` #${t.issue}` : ''}`);
    }
    const warn = doc.probes.filter((p) => p.status === 'warning');
    if (warn.length) { ctx.out.line('Warnings, recorded:'); for (const p of warn) ctx.out.line(`  ${p.id} ${p.detail}`); }
    const waived = doc.probes.filter((p) => p.status === 'waived');
    if (waived.length) ctx.out.line(`Waived by the founder: ${waived.map((p) => p.id).join(', ')}`);
    const ok = doc.probes.filter((p) => p.status === 'green' || p.status === 'not-applicable');
    if (ok.length) ctx.out.line(`Green: ${ok.map((p) => p.id).join(', ')}`);
    ctx.out.set('probes', doc.probes);
    ctx.out.set('tasks', doc.tasks);
    await ctx.journal({
      command: 'preflight', exit,
      counts: { red: needs.length, blocking: needs.filter((p) => p.blocking).length, tasks: doc.tasks.length, waived: waived.length, only: only ? only.join(',') : 'all' },
      inputs: { profile: doc.profileSha256, safety: doc.safetySha256 }, outputs: doc.probes.map((p) => [p.id, p.status]),
    });
    return exit;
  },
});
