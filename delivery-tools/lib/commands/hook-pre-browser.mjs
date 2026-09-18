// delivery hook pre-browser: preToolUse browser hook: refuse subagent browser calls in a run.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "hook pre-browser",
  summary: "PreToolUse browser hook: refuse subagent browser calls in a run",
  usage: `usage: delivery hook pre-browser < payload.json

Called by hooks/pre-browser.sh. Refuses a browser tool call that carries an agent_id (a
subagent) while a run is active.

exit: 0 allow; 2 refuse, with the reason on stderr

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
