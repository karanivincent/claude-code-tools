// delivery brief new: write a design brief from templates/design-brief.md (components-first spec
// §8.2, plan task 6).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeFileAtomic } from '../core/fs.mjs';
import { nextBriefPath, fillTemplate, briefComponents } from '../brief/brief.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default defineCommand({
  name: 'brief new',
  summary: 'Write a design brief from templates/design-brief.md',
  usage: `usage: delivery brief new <slug> [--title "<title>"]

Writes intent/briefs/NN-<slug>.md from templates/design-brief.md, NN one above the highest
existing brief: what changes and why; screens, each with a Desktop: and a Phone: line; the
components to use, named from docs/delivery/components.json (design entries by name, base entries
in one "Base components:" line); numbered behaviours (delivery rules reads these); data, using
generic names only (Acme Store, Summit Interiors, example.com).

--title defaults to the slug, titled ("first-look" -> "First Look").

exit: 0 done; 2 usage (a bad slug, or no run)

common options:
  --feature <slug>   the run to write the brief into (required)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { title: { type: 'string' } },
      positionals: { min: 1, max: 1, names: ['slug'] },
    });
    const slug = positionals[0];
    if (!SLUG_RE.test(slug)) throw new UsageError(`slug "${slug}" must match ${SLUG_RE} (lowercase words and hyphens)`);
    const paths = ctx.requirePaths();
    const { allComponents } = await briefComponents(ctx);
    const title = values.title ?? titleFromSlug(slug);
    const template = await readFile(join(ctx.pluginRoot, 'templates', 'design-brief.md'), 'utf8');
    const filled = fillTemplate(template, { title, components: allComponents });
    const rel = nextBriefPath(paths.intentDir, slug);
    const full = join(paths.intentDir, rel);
    await writeFileAtomic(full, filled);
    ctx.out.line(`wrote ${full}`);
    ctx.out.set('path', full);
    await ctx.journal({ command: `brief new ${slug}`, exit: EXIT.PASS, outputs: [full] });
    return EXIT.PASS;
  },
});
