// delivery intake: snapshot a design export, draft the intent, create the epic and the run.
// Owner: slice A2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "intake",
  summary: "Snapshot a design export, draft the intent, create the epic and the run",
  usage: `usage: delivery intake <archive.zip|design-dir> [--intent "<sentence>"] [--epic N] [--brief <file>]... [--adapter claude-design|image-folder]

Check and hash the export, snapshot it under docs/design/<feature>/ (runtime zipped),
keep the intent inputs under docs/delivery/<feature>/intent/, create the integration
branch and worktree, create or adopt the epic by marker, and write state.json.
Idempotent on the archive hash; a new hash on an existing feature starts a re-inventory.

options:
  --intent "<sentence>"  the founder's one sentence of intent
  --epic N               adopt issue N as the epic instead of finding or creating one
  --brief <file>         a design-round brief to keep (repeatable)
  --adapter <name>       claude-design (default) or image-folder for a folder of PNGs

exit: 0 done or already done; 2 not a recognised export

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("A2"),
});
