// delivery design candidates: list every candidate a design state could come from.
// Owner: slice C (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "design candidates",
  summary: "List every candidate a design state could come from",
  usage: `usage: delivery design candidates [--adapter claude-design|image-folder]

Run the design adapter over the snapshot and list every candidate: set targets and the
values they set, prop keys and enum values, dialog keys, shots, ternaries whose branches
show different text, and one empty candidate per list or table (for an image folder:
every image). Writes .delivery/<feature>/candidates.json.

exit: 0 written; 2 the snapshot is not one the adapter reads

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("C"),
});
