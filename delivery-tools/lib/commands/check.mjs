// delivery check: run mechanical checks M1-M17 and record findings.
// Owner: slice B1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "check",
  summary: "Run mechanical checks M1-M17 and record findings",
  usage: `usage: delivery check <id|all> [--capture <runId>]

Run one mechanical check (M1 to M17) or all of them on the plan, renders, captures and
message files, and record findings with source check:<id> and the severity by rule.
M5 and M6 report as hints until the replay proves them.

options:
  --capture <runId>  the capture run to check (default: the newest)

exit: 0 no open finding from these checks; 1 findings

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B1"),
});
