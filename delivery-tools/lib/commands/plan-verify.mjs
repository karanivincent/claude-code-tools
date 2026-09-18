// delivery plan verify: check every exists claim in the plan mechanically.
// Owner: slice B1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "plan verify",
  summary: "Check every exists claim in the plan mechanically",
  usage: `usage: delivery plan verify

Check each exists claim in plan.json: columns against the generated database types,
routes against the route files, API discriminators against the route handler's parser.
Prints the claims left for general-tools:verify-spec.

exit: 0 every mechanical claim holds; 1 a claim is false

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B1"),
});
