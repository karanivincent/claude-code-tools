// delivery wave merge: merge a unit whose gate is green into the integration branch.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "wave merge",
  summary: "Merge a unit whose gate is green into the integration branch",
  usage: `usage: delivery wave merge <unit>

Merge the unit's branch into the integration branch with --no-ff, then push.
Refuses a unit whose gate is not green for the branch head.

exit: 0 merged and pushed; 1 gate red or merge conflict

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
