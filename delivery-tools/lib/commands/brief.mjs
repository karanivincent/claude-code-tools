// delivery brief: write, check and pack design briefs (components-first spec §8.2, plan task 6).

import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeFileAtomic } from '../core/fs.mjs';
import { componentsMapPath, readComponentsMap } from '../components/map.mjs';
import { briefFiles } from '../picture/rules.mjs';
import { nextBriefPath, fillTemplate, briefProblems, packBrief } from '../brief/brief.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function designComponents(ctx) {
  const profile = await ctx.profile();
  const mapPath = componentsMapPath(ctx.repoRoot, profile);
  const map = await readComponentsMap(mapPath);
  return {
    forbiddenNames: profile.design?.forbiddenNames ?? [],
    allComponents: map?.components ?? [],
    componentNames: (map?.components ?? []).filter((c) => c.kind === 'design').map((c) => c.name),
  };
}

async function runNew(ctx, argv) {
  const { values, positionals } = parseCommandArgs(argv, {
    options: { title: { type: 'string' } },
    positionals: { min: 1, max: 1, names: ['slug'] },
  });
  const slug = positionals[0];
  if (!SLUG_RE.test(slug)) throw new UsageError(`slug "${slug}" must match ${SLUG_RE} (lowercase words and hyphens)`);
  const paths = ctx.requirePaths();
  const { allComponents } = await designComponents(ctx);
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
}

async function runCheck(ctx, argv) {
  const { positionals } = parseCommandArgs(argv, { positionals: { max: 1, names: ['file'] } });
  const { forbiddenNames, componentNames } = await designComponents(ctx);

  let targets;
  if (positionals[0]) {
    targets = [resolve(ctx.cwd, positionals[0])];
  } else {
    const paths = ctx.requirePaths();
    targets = briefFiles(paths).map((f) => join(paths.intentDir, f));
    if (!targets.length) {
      ctx.out.line('no briefs in intent/ or intent/briefs/');
      ctx.out.set('checked', 0);
      ctx.out.set('problems', 0);
      return EXIT.PASS;
    }
  }

  let problemCount = 0;
  for (const t of targets) {
    let text;
    try {
      text = await readFile(t, 'utf8');
    } catch (err) {
      ctx.out.fail('brief', `${t}: ${err.code === 'ENOENT' ? 'does not exist' : err.message}`);
      problemCount += 1;
      continue;
    }
    const problems = briefProblems(text, { forbiddenNames, componentNames, fileNames: [basename(t)] });
    for (const p of problems) {
      ctx.out.fail('brief', `${t}: ${p}`);
      problemCount += 1;
    }
  }
  if (!problemCount) ctx.out.line(`${targets.length} brief(s) checked, no problems`);
  ctx.out.set('checked', targets.length);
  ctx.out.set('problems', problemCount);
  const exit = problemCount ? EXIT.RED : EXIT.PASS;
  await ctx.journal({ command: 'brief check', exit, counts: { checked: targets.length, problems: problemCount } });
  return exit;
}

async function runPack(ctx, argv) {
  const { values, positionals } = parseCommandArgs(argv, {
    options: { out: { type: 'string' } },
    positionals: { min: 1, max: -1, names: ['file'] },
  });
  const [file, ...images] = positionals;
  const paths = ctx.requirePaths();
  const briefPath = resolve(ctx.cwd, file);
  const imagePaths = images.map((i) => resolve(ctx.cwd, i));
  const { forbiddenNames, componentNames } = await designComponents(ctx);
  const outDir = values.out ? resolve(ctx.cwd, values.out) : join(paths.runDir, 'pack');

  const { dir, files } = await packBrief(briefPath, imagePaths, outDir, { forbiddenNames, componentNames });
  ctx.out.line(`packed ${files.length} file(s) into ${dir}`);
  for (const f of files) ctx.out.line(`  ${f}`);
  ctx.out.set('dir', dir);
  ctx.out.set('files', files);
  await ctx.journal({ command: 'brief pack', exit: EXIT.PASS, outputs: files });
  return EXIT.PASS;
}

export default defineCommand({
  name: 'brief',
  summary: 'Write, check and pack a design brief for Claude Design',
  usage: `usage: delivery brief new <slug> [--title "<title>"]
       delivery brief check [<file>]
       delivery brief pack <file> [<image>...] [--out <dir>]

A brief is what a Claude Design chat is sent (components-first spec §8.2): what changes and why;
screens, each with a Desktop: and a Phone: line; the components to use, named from
docs/delivery/components.json; numbered behaviours (delivery rules reads these); data, using
generic names only (Acme Store, Summit Interiors, example.com).

brief new <slug>       writes intent/briefs/NN-<slug>.md from templates/design-brief.md, NN one
                        above the highest existing brief. --title defaults to the slug, titled.
brief check [<file>]   with a file, checks it wherever it is (no run needed); with none, checks
                        every file in intent/ and intent/briefs/. Red on: a name from the profile's
                        design.forbiddenNames in the text or the file name; a "### Screen:" with no
                        "Phone:" line; a mapped component described in words instead of named; a
                        line under "## Behaviours" that is not numbered.
brief pack <file> [<image>...]
                        runs the same checks on the brief and the images' file names, then copies
                        the brief as 00-brief.md and each image as NN-<basename> into --out (default
                        .delivery/<feature>/pack/), for the send step to upload. Refuses on any
                        problem.

Forbidden names come from profile.design.forbiddenNames; with none configured, that rule is off.

exit: 0 done, or check found nothing; 1 check (or pack's check) found a problem; 2 usage

common options:
  --feature <slug>   the run ("new", "check" with no file, and "pack" all need one)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const [sub, ...rest] = argv;
    if (sub === 'new') return runNew(ctx, rest);
    if (sub === 'check') return runCheck(ctx, rest);
    if (sub === 'pack') return runPack(ctx, rest);
    throw new UsageError(`"delivery brief" needs a subcommand: new, check, pack${sub ? ` (got "${sub}")` : ''}`);
  },
});
