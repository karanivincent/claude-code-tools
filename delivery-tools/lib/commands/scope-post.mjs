// delivery scope post: post the Scope issue and snapshot the plan's hash.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "scope post",
  summary: "Post the Scope issue and snapshot the plan's hash",
  usage: `usage: delivery scope post

Post or update the Scope issue (title "Scope for #<epic>: <feature>", the profile's scope
label, at most five lines each with its default and the wave it applies at) and record the
plan's hash as the Scope snapshot. A row whose class changes afterwards is a late change.

exit: 0 posted; 1 more than five lines

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
