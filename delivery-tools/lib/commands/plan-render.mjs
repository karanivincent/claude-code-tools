// delivery plan render: render spec.md from plan.json.
// Owner: slice B1 (docs/ARCHITECTURE.md).

import { readFile } from 'node:fs/promises';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { writeFileAtomic } from '../core/fs.mjs';
import { sha256 } from '../core/hash.mjs';
import { renderSpec } from '../plan/render.mjs';

export default defineCommand({
  name: 'plan render',
  summary: 'Render spec.md from plan.json',
  usage: `usage: delivery plan render [--check]

Render docs/delivery/<feature>/spec.md from plan.json so the two cannot drift. The same plan
always renders the same bytes.

options:
  --check            exit 1 when spec.md differs from a fresh render, without writing

exit: 0 rendered (or current); 1 stale with --check

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { check: { type: 'boolean', default: false } } });
    const paths = ctx.requirePaths();
    const plan = await readArtefact(paths, 'plan');
    const text = renderSpec(plan);
    let current = null;
    try { current = await readFile(paths.spec, 'utf8'); } catch { current = null; }
    ctx.out.set('sha256', sha256(text));
    if (values.check) {
      if (current === text) { ctx.out.line(`${paths.spec} is current`); return EXIT.PASS; }
      ctx.out.fail('stale', `${paths.spec} ${current === null ? 'does not exist' : 'differs from plan.json'}; run delivery plan render`);
      return EXIT.RED;
    }
    if (current !== text) await writeFileAtomic(paths.spec, text);
    ctx.out.line(`${current === text ? 'unchanged' : 'wrote'} ${paths.spec} (${plan.rows.length} rows, ${plan.units.length} units)`);
    await ctx.journal({ command: 'plan render', exit: 0, counts: { rows: plan.rows.length, units: plan.units.length }, inputs: plan, outputs: sha256(text) });
    return EXIT.PASS;
  },
});
