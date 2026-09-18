// delivery ready: recompute readiness for the PR head and write ready.json.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "ready",
  summary: "Recompute readiness for the PR head and write ready.json",
  usage: `usage: delivery ready --pr N [--check]

Recompute every ready input for the PR's head SHA (CI, preview, M-checks, the capability
diff, findings under the severity policy, a spot re-capture) and write ready.json.

options:
  --pr N             required
  --check            what the pre-bash hook runs before gh pr ready: exit 0 only when
                     ready.json exists, is green, and matches the head SHA and every input hash

exit: 0 ready; 1 red; 4 CI or preview pending; 5 inconsistent

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
