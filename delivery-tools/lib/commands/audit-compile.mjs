// delivery audit compile: compile the punch-list page from findings and captures.
// Owner: slice C (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "audit compile",
  summary: "Compile the punch-list page from findings and captures",
  usage: `usage: delivery audit compile

Write .delivery/<feature>/punch-list.html (findings with design and live side by side) for
the main session to publish as a private Artifact.

exit: 0 written

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("C"),
});
