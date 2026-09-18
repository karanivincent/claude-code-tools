// delivery wave end: push, wait for CI, resolve the preview for the wave capture.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "wave end",
  summary: "Push, wait for CI, resolve the preview for the wave capture",
  usage: `usage: delivery wave end

Push the integration branch, wait for CI with the profile's waiter (mergeable first), and
resolve the preview for the pushed head SHA for the wave capture and audit.

exit: 0 ready for the wave capture; 1 CI red or conflicting; 4 CI or preview pending

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
