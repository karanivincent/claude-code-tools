// delivery status: re-validate the run and print exactly one NEXT line.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "status",
  summary: "Re-validate the run and print exactly one NEXT line",
  usage: `usage: delivery status [--brief]

Find the run by scanning git worktree list for .delivery/*/state.json, re-validate every
finished phase from its sources, check in-flight builders (report file: done; commits and
no report: continue on its branch; nothing: dispatch fresh) and GitHub by marker, then
print exactly one NEXT line. If memory and NEXT disagree, NEXT wins.

options:
  --brief            at most 12 lines: run, phase, what is red, NEXT

exit: 0 printed NEXT; 5 broken journal or tampered artefact

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
