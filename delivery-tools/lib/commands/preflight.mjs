// delivery preflight: run probes P1-P16 and print one Needs-you list.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "preflight",
  summary: "Run probes P1-P16 and print one Needs-you list",
  usage: `usage: delivery preflight [--only <P1,P2,...>]

Run every probe (spec 4.1) and write .delivery/<feature>/preflight.json. A red repo
prerequisite becomes a wave-0 task; a red-circle item is printed with the device and
app where the founder fixes it, and the run waits for the fix or a named waiver.

options:
  --only <ids>       re-run only these probes

exit: 0 green or turned into tasks; 1 red; 3 a red-circle item is open

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
