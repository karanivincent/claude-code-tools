// delivery issues sync: create or update the epic, children and Scope issue by marker.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "issues sync",
  summary: "Create or update the epic, children and Scope issue by marker",
  usage: `usage: delivery issues sync [--epic-only] [--dry-run]

Create or update, by marker, the epic, the build-unit and backend children, the cut
follow-ups (unclaimed), the polish issue and the Scope issue, and post spec.md to the epic
as one comment updated in place. Searches open and closed issues before creating anything,
updates bodies that drifted, never deletes (a row that disappears closes its issue with a
comment). Running it twice creates nothing.

options:
  --epic-only        only find, adopt or create the epic (intake uses this)
  --dry-run          print what would change; write nothing

exit: 0 in sync; 1 a write failed; 4 GitHub unavailable

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
