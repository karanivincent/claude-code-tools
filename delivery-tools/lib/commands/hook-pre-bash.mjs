// delivery hook pre-bash: preToolUse Bash hook: gate gh pr ready and raw seed commands.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "hook pre-bash",
  summary: "PreToolUse Bash hook: gate gh pr ready and raw seed commands",
  usage: `usage: delivery hook pre-bash < payload.json

Called by hooks/pre-bash.sh on a match. gh pr ready (or a ready_for_review API call) for a
run's PR runs ready --check; a raw seed command during a run is refused.

exit: 0 allow; 2 refuse, with the reason on stderr

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
