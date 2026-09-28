// delivery brief new: write a design brief from templates/design-brief.md (components-first spec
// §8.2, plan task 6).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeFileAtomic, readJson } from '../core/fs.mjs';
import { nextBriefPath, fillTemplate, fillSection, briefComponents } from '../brief/brief.mjs';
import { REVIEW_DIRNAME } from '../design/review.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default defineCommand({
  name: 'brief new',
  summary: 'Write a design brief from templates/design-brief.md',
  usage: `usage: delivery brief new <slug> [--title "<title>"] [--from-review]

Writes intent/briefs/NN-<slug>.md from templates/design-brief.md, NN one above the highest
existing brief: what changes and why; screens, each with a Desktop: and a Phone: line; the
components to use, named from docs/delivery/components.json (design entries by name, base entries
in one "Base components:" line); numbered behaviours (delivery rules reads these); data, using
generic names only (Acme Store, Summit Interiors, example.com).

--title defaults to the slug, titled ("first-look" -> "First Look").

--from-review pre-fills "## What changes and why" with one bullet per finding of the latest
".delivery/<feature>/design-review/review.json" (written by "delivery design review"); refused
when there is no review yet.

exit: 0 done; 2 usage (a bad slug, no run, or --from-review with no review yet)

common options:
  --feature <slug>   the run to write the brief into (required)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { title: { type: 'string' }, 'from-review': { type: 'boolean', default: false } },
      positionals: { min: 1, max: 1, names: ['slug'] },
    });
    const slug = positionals[0];
    if (!SLUG_RE.test(slug)) throw new UsageError(`slug "${slug}" must match ${SLUG_RE} (lowercase words and hyphens)`);
    const paths = ctx.requirePaths();
    const { allComponents } = await briefComponents(ctx);
    const title = values.title ?? titleFromSlug(slug);
    const template = await readFile(join(ctx.pluginRoot, 'templates', 'design-brief.md'), 'utf8');
    let filled = fillTemplate(template, { title, components: allComponents });
    if (values['from-review']) {
      const reviewPath = join(paths.runDir, REVIEW_DIRNAME, 'review.json');
      const review = await readJson(reviewPath, { optional: true });
      if (!review) throw new UsageError(`no design review yet at ${reviewPath}; run "delivery design review <export>" first`);
      filled = fillSection(filled, 'What changes and why', review.findings ?? []);
    }
    const rel = nextBriefPath(paths.intentDir, slug);
    const full = join(paths.intentDir, rel);
    await writeFileAtomic(full, filled);
    ctx.out.line(`wrote ${full}`);
    ctx.out.set('path', full);
    await ctx.journal({ command: `brief new ${slug}`, exit: EXIT.PASS, outputs: [full] });
    return EXIT.PASS;
  },
});
