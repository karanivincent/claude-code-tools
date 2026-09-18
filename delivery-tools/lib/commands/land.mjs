// delivery land: after the merge: prove on staging, close the epic, write the release block.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "land",
  summary: "After the merge: prove on staging, close the epic, write the release block",
  usage: `usage: delivery land --epic N [--check]

After the founder's merge: the staging deploy, migrations applied and owed none, E2E staging
green, the health guards quiet, backfills verified, the owed loop test, the staging audit,
teardown, children closed, the epic closed on evidence, and the release block posted.

options:
  --epic N           required
  --check            the epic's evidence command: recompute and exit 0 only when every step holds

exit: 0 landed; 1 red; 4 a deploy, workflow or allowance is pending

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
