// delivery capture: capture states for a mode and validate every capture.
// Owner: slice C (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "capture",
  summary: "Capture states for a mode and validate every capture",
  usage: `usage: delivery capture --mode baseline|branch|wave|full|staging|real-org [--states <ID,...>] [--base-url <url>] [--sha <sha>] [--unit <unit>]

Run the committed capture spec through the heavy wrapper over the mode's matrix of worlds,
widths, roles, locales and themes (spec 9). Each capture is validated: required markers
present, no forbidden marker, not identical to a sibling, served SHA as expected, no console
error or failed request, seed data not drifted; otherwise the state is not-reached.
Writes .delivery/<feature>/captures/<run>/capture.json. real-org is read-only by interception.

options:
  --mode <mode>      required
  --states <ids>     only these states
  --base-url <url>   where to capture (default: resolved from the mode)
  --sha <sha>        the expected served SHA (default: the head)
  --unit <unit>      branch mode: the unit whose states and dev server to use

exit: 0 every state reached; 1 a state not reached; 4 preview not ready

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("C"),
});
