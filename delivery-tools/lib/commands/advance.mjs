// delivery advance: re-run every earlier gate from its sources, then record the new phase.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "advance",
  summary: "Re-run every earlier gate from its sources, then record the new phase",
  usage: `usage: delivery advance <phase>

<phase> is the phase to enter: preflight, inventory, plan, wave0, build, pr, ready,
merged, landed or closed. Re-runs the gate of every earlier phase from its sources
(never from a recorded verdict), then the gate of the phase being left, and only then
records the new phase. A red earlier gate moves the run back to that phase.

exit: 0 advanced; 1 a gate is red (status names it as NEXT); 5 inconsistent

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
