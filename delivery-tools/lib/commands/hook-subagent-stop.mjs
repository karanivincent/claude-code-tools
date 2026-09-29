// delivery hook subagent-stop: SubagentStop hook: record the agent that just finished in the run's
// journal (role, model, effort, minutes, tokens, cost, outcome), for the runs ledger.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { featurePaths } from '../core/paths.mjs';
import { updateState, formatEvent } from '../core/state.mjs';
import { findRuns } from '../run/context.mjs';
import { hookCtx, hookStderr, readPayload } from '../run/hooks.mjs';
import { agentFromPayload, agentEvent } from '../retro/log.mjs';

const within = (dir, root) => dir === root || String(dir).startsWith(`${root}/`);

export default defineCommand({
  name: 'hook subagent-stop',
  summary: 'SubagentStop hook: record the finished agent in the active run\'s journal',
  usage: `usage: delivery hook subagent-stop < payload.json

Called by hooks/subagent-stop.sh when a subagent stops while a delivery run may be active. Reads
the agent's transcript (the payload's agent_transcript_path, or the one beside the session's own)
and adds an agent line to the run's journal: its role (a "Role:" line in its prompt, else its
agent type as models.json lists it), model, effort, minutes, tokens, estimated cost and outcome
(an "Outcome:" line in its last message, else done). The run is the one whose worktree holds the
session's cwd, else the only active run; with several and none matching, nothing is written.
Never fails the session.

exit: always 0

common options:
  --help             this text`,
  async run(ctx, argv) {
    try {
      parseCommandArgs(argv, {});
      const payload = await readPayload(ctx);
      const hctx = await hookCtx(ctx, payload);
      const runs = (await findRuns(hctx)).filter((r) => r.state);
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : hctx.cwd;
      const run = runs.find((r) => within(cwd, r.worktree)) ?? (runs.length === 1 ? runs[0] : null);
      if (!run) return 0;
      const a = agentFromPayload(payload, hctx.env);
      if (!a) return 0;
      const profile = await hctx.profile().catch(() => null);
      const paths = featurePaths(run.worktree, run.feature, profile?.paths ?? {});
      await updateState(paths, (s) => s, { at: hctx.clock.now().toISOString(), event: formatEvent(agentEvent(a)) });
    } catch (err) {
      hookStderr(ctx).write(`delivery: subagent-stop hook error: ${err?.message ?? err}\n`);
    }
    return 0;
  },
});
