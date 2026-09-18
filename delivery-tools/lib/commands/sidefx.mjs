// delivery sidefx: derive the side-effect map from worker code and migrations.
// Owner: slice B2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "sidefx",
  summary: "Derive the side-effect map from worker code and migrations",
  usage: `usage: delivery sidefx

Build .delivery/<feature>/sidefx.json from the code, every run: .from('<table>') chains with
literal filters in the safety file's worker globs, the where clauses of the latest SQL
definition of every .rpc() function they call, the test database's scheduled jobs, and the
safety file's hand-listed forbidden states. Every predicate is actionable by default.

exit: 0 derived; 1 a scheduled job could not be parsed and is not hand-listed

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B2"),
});
