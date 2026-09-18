// delivery design render: render every design state to png, txt and dom.json.
// Owner: slice C (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "design render",
  summary: "Render every design state to png, txt and dom.json",
  usage: `usage: delivery design render [--states <ID,...>] [--port <n>]

Serve the snapshot on a local port (runtime unzipped under .delivery/<feature>/design-serve/)
and render each inventory state by its click path, or from a temporary copy with a prop's
default changed, to <ID>.png, <ID>.txt and <ID>.dom.json under .delivery/<feature>/design/.
Words are read from the rendered page, never from source. Uses the target repo's Playwright.

options:
  --states <ids>     render only these states
  --port <n>         port for the static server (default: a free one)

exit: 0 rendered; 1 a state failed to render; 2 Playwright not found

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("C"),
});
