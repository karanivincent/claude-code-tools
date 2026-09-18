// delivery wave start: merge the base, class new capabilities, re-read Scope, check claims.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "wave start",
  summary: "Merge the base, class new capabilities, re-read Scope, check claims",
  usage: `usage: delivery wave start [<wave>]

Merge origin/<base> into the integration branch; before resolving any conflict, baseline
--refresh classes every capability that landed since the run began. Re-read the Scope issue,
run claims verify and dupes, and the profile's flight and tried commands for the unit paths.
Refuses to finish while a new capability is unclassed.

exit: 0 started; 1 red; 3 a modify/delete conflict needs a plan decision

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
