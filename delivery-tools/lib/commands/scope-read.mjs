// delivery scope read: apply the founder's replies on the Scope issue.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "scope read",
  summary: "Apply the founder's replies on the Scope issue",
  usage: `usage: delivery scope read

Read new comments by the founder's GitHub login on the Scope issue. A reply in the fixed
form ("S2 keep") applies directly; any other reply is listed for the scope-reply extractor,
and its line keeps its default until mapped. Updates plan.json and the journal.

exit: 0 applied; 1 a reply could not be mapped

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
