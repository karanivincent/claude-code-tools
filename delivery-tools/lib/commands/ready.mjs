// delivery ready: recompute readiness for the PR head and write ready.json.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { intFlag, parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { checkReady, shortSha } from '../run/ready.mjs';

export default defineCommand({
  name: 'ready',
  summary: 'Recompute readiness for the PR head and write ready.json',
  usage: `usage: delivery ready --pr N [--check]

Recompute every ready input for the PR's head SHA and write .delivery/<feature>/ready.json:
the baseline refreshed against the base (5.4), local HEAD pushed and clean, CI green,
the preview resolved by SHA and serving the head, no duplicate PRs, the loop test when a
changed path matches loopTest.when (run here once per head; exit 6 is owed after the
merge), the newest full capture of the head re-validated, every M-check, a spot re-capture,
and the severity policy over the findings. Records the file's sha256 in the journal and in
state.readyRecords; only then may gh pr ready run.

options:
  --pr N             required
  --check            what the pre-bash hook runs before gh pr ready, and fast: exit 0 only when
                     ready.json was written by delivery ready (journal), is green, is for the
                     PR's current head SHA, and no input hash changed since (plan, inventory,
                     baseline, capture, findings, safety). Recomputes nothing.

exit: 0 ready; 1 red, missing or stale; 2 usage, or a slice cannot answer; 4 CI, the
preview or the loop-test allowance pending; 5 ready.json not written by delivery ready,
or an inconsistent run

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { pr: { type: 'string' }, check: { type: 'boolean' } } });
    const pr = intFlag(values.pr, '--pr', { required: true });
    if (values.check) {
      const r = await checkReady(ctx, { pr });
      ctx.out.set('headSha', r.headSha);
      ctx.out.set('ok', r.ok);
      if (r.ok) {
        ctx.out.line(`ready.json is green for PR #${pr} at ${shortSha(r.headSha)}, and nothing changed since`);
        return EXIT.PASS;
      }
      for (const f of r.failures) ctx.out.fail(f.code, f.message);
      return r.exit ?? EXIT.RED;
    }
    // Loaded here so --check, which the hook runs, never loads the other slices' modules.
    const { computeReady } = await import('../run/ready-compute.mjs');
    const { ready, exit, notes } = await computeReady(ctx, { pr });
    ctx.out.line(`ready.json for PR #${pr} at ${shortSha(ready.headSha)} is ${ready.ok ? 'green' : 'red'} (${ready.checks.filter((c) => c.ok).length} of ${ready.checks.length} checks green)`);
    for (const c of ready.checks) if (!c.ok) ctx.out.fail(c.id, c.detail);
    for (const n of notes) ctx.out.line(`note: ${n}`);
    for (const w of ready.waivers) ctx.out.line(`waived ${w}`);
    for (const l of ready.lateChanges) ctx.out.line(`late change ${l}`);
    for (const o of ready.owedAfterMerge) ctx.out.line(`owed after merge: ${o}`);
    ctx.out.set('ready', ready);
    return exit;
  },
});
