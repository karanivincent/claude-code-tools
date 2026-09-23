// delivery design candidates: list every candidate a design state could come from (spec 4.2 step 1).
// Owner: slice C (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { exists } from '../core/fs.mjs';
import { UsageError } from '../core/exit.mjs';
import { getDesignAdapter, designTreeSha256 } from '../../adapters/design/index.mjs';

export default defineCommand({
  name: "design candidates",
  summary: "List every candidate a design state could come from",
  usage: `usage: delivery design candidates [--adapter claude-design|image-folder]

Run the design adapter over the snapshot and list every candidate: set targets and the
values they set, prop keys and enum values, dialog keys, shots, ternaries whose branches
show different text, and one empty candidate per list or table (for an image folder:
every image). Writes .delivery/<feature>/candidates.json.

Candidate ids: prop:<key>:<value>, set:<key>:<value>, dialog:<key>:<value>,
ternary:<line>, list:<expression>, shot:<file>. Every one must end mapped to a state
or excluded with a reason in inventory.json (delivery inventory check).

options:
  --adapter <name>   read the snapshot with this adapter (default: intent.json's, else claude-design)

exit: 0 written; 2 the snapshot is not one the adapter reads

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { adapter: { type: 'string' } } });
    const paths = ctx.requirePaths();
    if (!(await exists(paths.designSnapshot))) throw new UsageError(`no design snapshot at ${paths.designSnapshot}; run intake first`);
    const intent = await readArtefact(paths, 'intent', { optional: true });
    const adapter = await getDesignAdapter(paths.designSnapshot, { adapter: values.adapter ?? intent?.design?.adapter });
    const candidates = await adapter.candidates(paths.designSnapshot);
    const doc = {
      schemaVersion: 1,
      feature: paths.feature,
      adapter: adapter.name,
      designTreeSha256: await designTreeSha256(paths.designSnapshot),
      candidates,
    };
    const written = await writeArtefact(paths, 'candidates', doc);
    const counts = {};
    for (const c of candidates) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    ctx.out.line(`${candidates.length} candidates from the ${adapter.name} design: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`);
    ctx.out.line(`wrote ${written}`);
    ctx.out.set('candidates', candidates.length);
    ctx.out.set('counts', counts);
    ctx.out.set('path', written);
    await ctx.journal({ command: 'design candidates', exit: 0, counts: { candidates: candidates.length, ...counts }, inputs: { tree: doc.designTreeSha256 }, outputs: doc });
    return 0;
  },
});
