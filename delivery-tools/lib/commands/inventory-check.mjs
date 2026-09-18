// delivery inventory check: gate for phase 2: every candidate mapped, every state rendered.
// Owner: slice B1 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "inventory check",
  summary: "Gate for phase 2: every candidate mapped, every state rendered",
  usage: `usage: delivery inventory check

Every mechanical candidate is mapped to a state or excluded with a reason; every state has
an id, a design reference, a render or an impossible reason, and at least one control or an
explicit none; every control has a target and an effect class; for a redesign, every
capability has a signature and file:line evidence.

exit: 0 green; 1 red

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B1"),
});
