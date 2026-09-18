// delivery report: print the founder's report in the tldr format.
// Owner: slice C (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "report",
  summary: "Print the founder's report in the tldr format",
  usage: `usage: delivery report

Print the founder's report (TL;DR, Needs you with tiers, Went wrong, Done, depth linked)
from ready.json, findings, the plan and the journal. The first line is the ready verdict for
the head SHA; late changes, waivers and accepted P2s come first.

exit: 0 printed

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("C"),
});
