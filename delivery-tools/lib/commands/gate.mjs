// delivery gate: unit gate: branch capture, M3 M4 M7 M9 M10, component tests, unit check.
// Owner: slice B1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "gate",
  summary: "Unit gate: branch capture, M3 M4 M7 M9 M10, component tests, unit check",
  usage: `usage: delivery gate <unit>

Capture the unit's own states in branch mode on its dev server (Playwright webServer, through
the heavy wrapper), run M3, M4 (design world), M7, M9 and M10 on those captures, check the
component render tests (markers present, passing, failing on an empty component), and re-run
the unit check. Writes findings; red means the builder gets the failure file.

exit: 0 green; 1 red

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B1"),
});
