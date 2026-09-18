// delivery claims verify: fail if the pool planner still queues a claimed child.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "claims verify",
  summary: "Fail if the pool planner still queues a claimed child",
  usage: `usage: delivery claims verify

Run the profile's planner and fail if any claimed child is still in its queue.

exit: 0 no claimed child queued; 1 a claimed child is queued

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
