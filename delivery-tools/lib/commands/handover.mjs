// delivery handover: regenerate the handover's generated sections.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "handover",
  summary: "Regenerate the handover's generated sections",
  usage: `usage: delivery handover [--print]

Regenerate the integration branch's handover sections: Verification performed (past tense,
from the journal: commands, exit codes, counts), migrations, and known limitations
(accepted P2s, cuts, owed items).

options:
  --print            print the sections instead of writing the file

exit: 0 written

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
