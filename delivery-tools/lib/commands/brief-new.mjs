// delivery brief new: write a design brief from templates/design-brief.md (components-first spec
// §8.2, plan task 6).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeFileAtomic, readJson } from '../core/fs.mjs';
import { featurePaths } from '../core/paths.mjs';
import { nextBriefPath, fillTemplate, fillSection, briefComponents } from '../brief/brief.mjs';
import { REVIEW_DIRNAME } from '../design/review.mjs';
import { backToDesignItems } from '../picture/review.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default defineCommand({
  name: 'brief new',
  summary: 'Write a design brief from templates/design-brief.md',
  usage: `usage: delivery brief new <slug> [--title "<title>"] [--from-review] [--from-run [<feature>]]

Writes intent/briefs/NN-<slug>.md from templates/design-brief.md, NN one above the highest
existing brief: what changes and why; screens, each with a Desktop: and a Phone: line; the
components to use, named from docs/delivery/components.json (design entries by name, base entries
in one "Base components:" line); numbered behaviours (delivery rules reads these); data, using
generic names only (Acme Store, Summit Interiors, example.com).

--title defaults to the slug, titled ("first-look" -> "First Look").

--from-review pre-fills "## What changes and why" with one bullet per finding of the latest
".delivery/<feature>/design-review/review.json" (written by "delivery design review"); refused
when there is no review yet.

--from-run pre-fills "## What changes and why" with one bullet per "design:" note from the last
compiled picture-mode round ("delivery review"): items the live page got right but the design got
wrong, or is missing something the product already has. Defaults to the current run; naming a
feature after the flag reads that run's rounds instead. Nothing to pre-fill leaves the section
untouched.

exit: 0 done; 2 usage (a bad slug, no run, or --from-review with no review yet)

common options:
  --feature <slug>   the run to write the brief into (required)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { title: { type: 'string' }, 'from-review': { type: 'boolean', default: false }, 'from-run': { type: 'boolean', default: false } },
      positionals: { min: 1, max: 2, names: ['slug', 'feature'] },
    });
    const slug = positionals[0];
    const runFeature = positionals[1];
    if (runFeature && !values['from-run']) throw new UsageError(`unexpected argument "${runFeature}"`);
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
    if (values['from-run']) {
      const profile = await ctx.profile();
      const runPaths = runFeature ? featurePaths(ctx.repoRoot, runFeature, profile.paths ?? {}) : paths;
      const items = backToDesignItems(runPaths);
      filled = fillSection(filled, 'What changes and why', items.map((i) => `${i.id}: ${i.note}`));
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
