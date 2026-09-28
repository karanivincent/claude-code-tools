// delivery brief pack: build the pack folder the send step uploads (components-first spec §8.2,
// plan task 6).

import { resolve, join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { packBrief, briefComponents } from '../brief/brief.mjs';

export default defineCommand({
  name: 'brief pack',
  summary: 'Build the pack folder (brief plus numbered images) the send step uploads',
  usage: `usage: delivery brief pack <file> [<image>...] [--out <dir>]

Runs the same checks as "delivery brief check" on the brief's text and the images' file names,
then copies the brief as 00-brief.md and each image as NN-<basename>, in the order given, into
--out (default .delivery/<feature>/pack/). Refuses (writes nothing) on any problem.

exit: 0 packed; 1 a check problem was found; 2 usage (no run)

common options:
  --feature <slug>   the run the pack belongs to (required)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { out: { type: 'string' } },
      positionals: { min: 1, max: -1, names: ['file'] },
    });
    const [file, ...images] = positionals;
    const paths = ctx.requirePaths();
    const briefPath = resolve(ctx.cwd, file);
    const imagePaths = images.map((i) => resolve(ctx.cwd, i));
    const { forbiddenNames, componentNames } = await briefComponents(ctx);
    const outDir = values.out ? resolve(ctx.cwd, values.out) : join(paths.runDir, 'pack');

    const { dir, files } = await packBrief(briefPath, imagePaths, outDir, { forbiddenNames, componentNames });
    ctx.out.line(`packed ${files.length} file(s) into ${dir}`);
    for (const f of files) ctx.out.line(`  ${f}`);
    ctx.out.set('dir', dir);
    ctx.out.set('files', files);
    await ctx.journal({ command: 'brief pack', exit: EXIT.PASS, outputs: files });
    return EXIT.PASS;
  },
});
