// delivery plan check: gate for phase 3 (M1): coverage, owners, cuts, budgets, file overlap.
// Owner: slice B1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "plan check",
  summary: "Gate for phase 3 (M1): coverage, owners, cuts, budgets, file overlap",
  usage: `usage: delivery plan check

M1: every inventory state and baseline capability has exactly one row; every row a class,
and every build row an owner, a reach and markers; every cut a reason code, an issue and
budget; every remove and every cut of a requested item a Scope line (at most five); the
prop and unseedable share within its cap; no two same-wave units share a file (message
files belong to the words unit); every missing backend piece has a unit.

exit: 0 green; 1 red

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B1"),
});
