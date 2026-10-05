// delivery design candidates: list every candidate a design state could come from (spec 4.2 step 1).
// Owner: slice C (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { exists } from '../core/fs.mjs';
import { UsageError } from '../core/exit.mjs';
import { getDesignAdapter, designTreeSha256 } from '../../adapters/design/index.mjs';
import { join } from 'node:path';
import { outOfScopeOnly } from '../design/scope.mjs';
import { candidateGroups, DEFAULT_MAX_GROUP } from '../design/groups.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';

export default defineCommand({
  name: "design candidates",
  summary: "List every candidate a design state could come from",
  usage: `usage: delivery design candidates [--adapter claude-design|image-folder] [--groups [--max <n>]]

Run the design adapter over the snapshot and list every candidate: set targets and the
values they set, prop keys and enum values, dialog keys, shots, ternaries whose branches
show different text, and one empty candidate per list or table (for an image folder:
every image). Writes .delivery/<feature>/candidates.json.

Candidate ids: prop:<key>:<value>, set:<key>:<value>, dialog:<key>:<value>,
ternary:<line>, list:<expression>, shot:<file>. Every one must end mapped to a state
or excluded with a reason in inventory.json (delivery inventory check).

With --groups it also writes .delivery/<feature>/candidate-groups.json: which extractor reads
which candidates. One group per in-scope design screen, plus one "shared" group for what several
screens show or what cannot be placed. A candidate tied to one screen goes to that screen's group;
an untied one goes to the screen whose markup reads the values it feeds, when that is one screen.
A group over --max splits by the <sc-if> sections of its screen (tabs, panels, dialogs). Each group
lists its candidate ids and a suggested id prefix; out-of-scope candidates are in no group.

options:
  --adapter <name>   read the snapshot with this adapter (default: intent.json's, else claude-design)
  --groups           also write candidate-groups.json (see above)
  --max <n>          the most candidates in one group (default ${DEFAULT_MAX_GROUP}); needs --groups

exit: 0 written; 2 the snapshot is not one the adapter reads

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { adapter: { type: 'string' }, groups: { type: 'boolean' }, max: { type: 'string' } } });
    if (values.max !== undefined && !values.groups) throw new UsageError('--max needs --groups');
    const max = values.max === undefined ? DEFAULT_MAX_GROUP : intFlag(values.max, '--max');
    const paths = ctx.requirePaths();
    if (!(await exists(paths.designSnapshot))) throw new UsageError(`no design snapshot at ${paths.designSnapshot}; run intake first`);
    const intent = await readArtefact(paths, 'intent', { optional: true });
    const adapter = await getDesignAdapter(paths.designSnapshot, { adapter: values.adapter ?? intent?.design?.adapter });
    const hints = values.groups ? new Map() : null;
    const candidates = await adapter.candidates(paths.designSnapshot, hints ? { hints } : {});
    const screens = adapter.screens ? await adapter.screens(paths.designSnapshot) : null;
    const doc = {
      schemaVersion: 1,
      feature: paths.feature,
      adapter: adapter.name,
      designTreeSha256: await designTreeSha256(paths.designSnapshot),
      ...(screens ? { screens } : {}),
      candidates,
    };
    const written = await writeArtefact(paths, 'candidates', doc);
    const counts = {};
    for (const c of candidates) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    ctx.out.line(`${candidates.length} candidates from the ${adapter.name} design: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`);
    if (screens) {
      const out = outOfScopeOnly(candidates, intent);
      ctx.out.line(`screens (${screens.key}): ${screens.values.join(', ')}; ${candidates.filter((c) => c.screens).length} candidates tied to particular screens`);
      if (out.unnamed.length) ctx.out.line(`intent.json names no design screen for ${out.unnamed.join(', ')}: add designScreens to its inScope and outOfScope entries`);
      if (out.count) ctx.out.line(`${out.count} candidates show only on out-of-scope screens; the inventory assembler excludes them`);
      ctx.out.set('screens', screens);
      ctx.out.set('outOfScope', out.count);
    }
    ctx.out.line(`wrote ${written}`);
    if (values.groups) {
      const doc = candidateGroups({ candidates, screens, hints, intent, max, feature: paths.feature });
      const groupsPath = join(paths.runDir, 'candidate-groups.json');
      await writeJsonAtomic(groupsPath, doc);
      for (const g of doc.groups) ctx.out.line(`group ${g.slug} (prefix ${g.prefix}): ${g.candidates.length} candidates${g.sections.length ? `; sections ${g.sections.slice(0, 4).join(', ')}${g.sections.length > 4 ? ', ...' : ''}` : ''}`);
      ctx.out.line(`${doc.groups.length} groups, ${doc.outOfScope.length} candidates out of scope; wrote ${groupsPath}`);
      ctx.out.set('groups', doc.groups.map((g) => ({ slug: g.slug, prefix: g.prefix, candidates: g.candidates.length })));
      ctx.out.set('groupsPath', groupsPath);
    }
    ctx.out.set('candidates', candidates.length);
    ctx.out.set('counts', counts);
    ctx.out.set('path', written);
    await ctx.journal({ command: 'design candidates', exit: 0, counts: { candidates: candidates.length, ...counts }, inputs: { tree: doc.designTreeSha256 }, outputs: doc });
    return 0;
  },
});
