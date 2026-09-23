// delivery land: after the merge: prove on staging, close the epic, write the release block.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { landEvidence, landResult, runLand, withRun } from '../lifecycle/land.mjs';

export default defineCommand({
  name: "land",
  summary: "After the merge: prove on staging, close the epic, write the release block",
  usage: `usage: delivery land --epic N [--check]

After the founder's merge, for the run's merged PR: the staging deploy of the merge commit
(commands.stagingDeployWait), no migration owed (commands.migrationsOwed), every workflow run for
the merge commit green (migrations apply, staging E2E, guards), no revert of it and no open issue
naming it, the owed loop test on staging (run once per merge commit), the staging audit's
captures re-validated and re-checked (M3, M7, M10; M12 on the founder's organisation), no rows
left behind (M14), every claimed child closed, a green ready record for the PR's head, and the
release block on the epic and in the handover (migrations pending production, the tag, the prod:
title and the merge method). When all of that holds, the epic closes through commands.epicClose
and the Scope issue closes. The release itself stays with the founder.

The epic may be given without a run in this worktree: the feature is read from its marker.

options:
  --epic N           required
  --check            the epic's evidence command: recompute every step, write nothing to GitHub,
                     exit 0 only when every step holds (the epic being closed is not a step)

exit: 0 landed (or, with --check, every step holds); 1 red; 4 a deploy, workflow or the call
      allowance is pending; 5 an artefact is inconsistent

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { epic: { type: 'string' }, check: { type: 'boolean' } } });
    const epic = intFlag(values.epic, '--epic', { required: true });
    let res;
    let ev;
    if (values.check) {
      ev = await landEvidence(ctx, { epic, mode: 'check' });
      res = { ...landResult(ev.checks), closed: false };
    } else {
      res = await runLand(ctx, { epic });
      ev = res;
    }
    for (const c of ev.checks) {
      if (c.ok) ctx.out.line(`ok ${c.id}: ${c.detail}`);
      else ctx.out.fail(c.id, c.detail);
    }
    if (!values.check) {
      for (const f of res.failures.filter((x) => !ev.checks.some((c) => c.id === x.code))) ctx.out.fail(f.code, f.message);
      if (res.closed) ctx.out.line(`closed #${epic} through the profile's epic-close command; run the general-tools loose-ends audit for the handover's manual steps`);
    }
    ctx.out.set('checks', ev.checks);
    ctx.out.set('mergeSha', ev.mergeSha ?? null);
    const run = ev.paths ? withRun(ctx, ev.paths) : ctx;
    await run.journal({
      command: values.check ? `land --check --epic ${epic}` : `land --epic ${epic}`,
      exit: res.exit,
      counts: { ok: ev.checks.filter((c) => c.ok).length, red: ev.checks.filter((c) => !c.ok).length, sha: String(ev.mergeSha ?? 'none').slice(0, 12), closed: res.closed ? 1 : 0 },
      inputs: { epic }, outputs: ev.checks.map((c) => [c.id, c.ok]),
    });
    return res.exit;
  },
});
