// delivery hook session-start: sessionStart hook: print status --brief for any active run.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { findRuns } from '../run/context.mjs';
import { hookCtx, hookStderr, readPayload } from '../run/hooks.mjs';
import { statusReport } from '../run/status.mjs';

export default defineCommand({
  name: 'hook session-start',
  summary: 'SessionStart hook: print status --brief for any active run',
  usage: `usage: delivery hook session-start < payload.json

Called by hooks/session-start.sh on startup, resume, compact and clear when a run may be
active. Prints delivery status --brief for every active run in this repository's worktrees,
so a compacted session resumes from NEXT (SessionStart output is added to the context).
Silent when there is none. Never fails the session.

exit: always 0

common options:
  --help             this text`,
  async run(ctx, argv) {
    try {
      parseCommandArgs(argv, {});
      const payload = await readPayload(ctx);
      const hctx = await hookCtx(ctx, payload);
      const runs = await findRuns(hctx);
      if (!runs.length) return 0;
      ctx.out.line(`delivery: ${runs.length === 1 ? 'a delivery run is' : `${runs.length} delivery runs are`} active in this repository. To resume, do NEXT; if memory and NEXT disagree, NEXT wins.`);
      for (const run of runs) {
        const report = await statusReport(hctx, run, { brief: true });
        for (const l of report.lines) ctx.out.line(l);
      }
    } catch (err) {
      hookStderr(ctx).write(`delivery: session-start hook error: ${err?.message ?? err}\n`);
    }
    return 0;
  },
});
