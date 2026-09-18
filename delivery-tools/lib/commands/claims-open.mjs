// delivery claims open: open the run's draft PR that claims every child.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "claims open",
  summary: "Open the run's draft PR that claims every child",
  usage: `usage: delivery claims open

Push the integration branch and open (or update) one draft PR against the base whose body
lists Refs #N for every claimed child (build units and backend pieces; never cut follow-ups
or the polish issue), the claimed-paths block, the run label and the generated blocks.

exit: 0 open; 1 GitHub refused

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
