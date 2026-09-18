// delivery seed: plan, check, write, scan, refresh and tear down fixture worlds.
// Owner: slice B2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "seed",
  summary: "Plan, check, write, scan, refresh and tear down fixture worlds",
  usage: `usage: delivery seed --plan | --check | --apply | --scan | --refresh <world> | --teardown

The only writer of fixture rows.

modes:
  --plan             write seedplan.json from the plan's worlds (deterministic ids)
  --check            run the safety layers on seedplan.json (M13)
  --apply            refuse production and any project but the test project, write, then scan
  --scan             evaluate every row in every fixture world as it is now, and every guard probe
  --refresh <world>  re-apply one world right before its captures
  --teardown         delete the run's rows by id, then scan

exit: 0 safe; 1 refused by a safety layer; 2 wrong project or no safety file

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B2"),
});
