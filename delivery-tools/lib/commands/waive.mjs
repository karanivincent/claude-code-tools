// delivery waive: record the founder's named waiver for a waivable probe.
// Owner: slice A1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "waive",
  summary: "Record the founder's named waiver for a waivable probe",
  usage: `usage: delivery waive <probe> --note "<text>"

Record a waiver for a waivable preflight probe (for example P13) in the journal.
The final report lists waivers first.

options:
  --note "<text>"    required: the founder's reason, in his words

exit: 0 recorded; 2 the probe is not waivable, or no --note

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A1"),
});
