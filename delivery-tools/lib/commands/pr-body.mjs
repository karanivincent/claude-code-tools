// delivery pr-body: regenerate the PR body's generated blocks.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "pr-body",
  summary: "Regenerate the PR body's generated blocks",
  usage: `usage: delivery pr-body [--pr N] [--print]

Regenerate the PR body's blocks between markers: Coverage, Late changes, Removed
capabilities, Accepted differences, Owed after merge, and Closes #N for every built unit and
backend child. Text outside the blocks is left alone.

options:
  --pr N             the PR (default: the run's)
  --print            print the body instead of updating the PR

exit: 0 updated

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
