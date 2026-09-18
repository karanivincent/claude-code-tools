// delivery hook session-start: sessionStart hook: print status --brief for any active run.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "hook session-start",
  summary: "SessionStart hook: print status --brief for any active run",
  usage: `usage: delivery hook session-start

Called by hooks/session-start.sh. Prints delivery status --brief for any active run in this
repository's worktrees, so a compacted session resumes from NEXT. Silent when there is none.

exit: always 0

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
