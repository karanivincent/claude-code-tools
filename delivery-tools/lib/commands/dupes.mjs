// delivery dupes: find other PRs touching the run's children or paths.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "dupes",
  summary: "Find other PRs touching the run's children or paths",
  usage: `usage: delivery dupes

List PRs that are not the run's, open or merged since the run began, that reference a
claimed child or touch a claimed path. Any hit is red.

exit: 0 none; 1 a duplicate exists

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
