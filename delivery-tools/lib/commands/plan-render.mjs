// delivery plan render: render spec.md from plan.json.
// Owner: slice B1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "plan render",
  summary: "Render spec.md from plan.json",
  usage: `usage: delivery plan render [--check]

Render docs/delivery/<feature>/spec.md from plan.json so the two cannot drift.

options:
  --check            exit 1 when spec.md differs from a fresh render, without writing

exit: 0 rendered (or current); 1 stale with --check

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B1"),
});
