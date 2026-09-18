// delivery intake: snapshot a design export, draft the intent, create the epic and the run.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { runIntake } from '../lifecycle/intake.mjs';

export default defineCommand({
  name: "intake",
  summary: "Snapshot a design export, draft the intent, create the epic and the run",
  usage: `usage: delivery intake <archive.zip|design-dir> [--intent "<sentence>"] [--epic N] [--brief <file>]... [--adapter claude-design|image-folder]

Check and hash the export, find or create the epic by marker (or adopt --epic N), create the
integration branch and worktree from origin/<base>, snapshot the design there under
docs/design/<feature>/ (runtime scripts zipped into runtime.zip, a README with the hashes), keep
the intent inputs under docs/delivery/<feature>/intent/ (uploads/, every --brief, the sentence),
write state.json and commit. Idempotent on the archive hash; a new archive for an existing
feature replaces the snapshot and starts a re-inventory.

The intent is drafted by one extractor agent between two runs: the first run ends with NEXT naming
it; run intake again once docs/delivery/<feature>/intent.json exists, and it fixes the file's
mechanical fields, renders intent.md, updates the epic and commits both.

The feature defaults to the design project's name as a slug; pass --feature to choose it.

options:
  --intent "<sentence>"  the founder's one sentence of intent (kept for later runs)
  --epic N               adopt issue N as the epic instead of finding or creating one
  --brief <file>         a design-round brief to keep (repeatable)
  --adapter <name>       claude-design (default) or image-folder for a folder of PNGs

exit: 0 done or already done; 1 intent.json not drafted yet (NEXT names the extractor);
      2 not a recognised export, or intent.json invalid

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { intent: { type: 'string' }, epic: { type: 'string' }, brief: { type: 'string', multiple: true }, adapter: { type: 'string' } },
      positionals: { min: 1, max: 1, names: ['archive'] },
    });
    if (values.adapter && !['claude-design', 'image-folder'].includes(values.adapter)) throw new UsageError(`--adapter must be claude-design or image-folder, not "${values.adapter}"`);
    const res = await runIntake(ctx, {
      source: positionals[0], sentence: values.intent ?? null, epic: intFlag(values.epic, '--epic'),
      briefs: values.brief ?? [], adapter: values.adapter ?? null,
    });
    for (const l of res.lines) ctx.out.line(l);
    for (const f of res.failures) ctx.out.fail(f.code, f.message);
    if (res.next) ctx.out.line(res.next);
    ctx.out.set('feature', res.feature);
    ctx.out.set('epic', res.epic);
    ctx.out.set('worktree', res.worktree);
    ctx.out.set('branch', res.branch);
    if (res.next) ctx.out.set('next', res.next);
    return res.exit;
  },
});
