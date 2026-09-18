// delivery ci: check mergeable first, then wait for CI with the profile's waiter.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "ci",
  summary: "Check mergeable first, then wait for CI with the profile's waiter",
  usage: `usage: delivery ci --pr N

Check the PR's mergeable state first (a conflicting PR gets no Actions runs at all), then
wait for the head SHA's checks with the profile's CI waiter. Never gh pr checks.

options:
  --pr N             required

exit: 0 green; 1 red or conflicting; 4 pending

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
