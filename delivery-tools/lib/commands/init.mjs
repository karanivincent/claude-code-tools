// delivery init: draft a project profile for review; never the safety file.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "init",
  summary: "Draft a project profile for review; never the safety file",
  usage: `usage: delivery init [--print]

Draft .claude/delivery-profile.json from the repo's CLAUDE.md and package.json,
for a person to review in the profile PR. Never writes the safety file.

options:
  --print            print the draft instead of writing it

exit: 0 drafted; 2 a profile already exists (use --print to compare)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
