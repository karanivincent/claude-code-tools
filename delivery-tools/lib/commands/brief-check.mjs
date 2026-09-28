// delivery brief check: check a design brief for a leaked name, a screen with no phone section, a
// component described in words, or an unnumbered behaviour (components-first spec §8.2, plan task 6).

import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { briefFiles } from '../picture/rules.mjs';
import { briefProblems, briefComponents } from '../brief/brief.mjs';

export default defineCommand({
  name: 'brief check',
  summary: 'Check a design brief for a leaked name, a missing Phone: line, or an unnumbered behaviour',
  usage: `usage: delivery brief check [<file>]

With a file, checks it wherever it is (no run needed). With none, checks every file in intent/ and
intent/briefs/ (needs a run).

Red on:
  - a name from the profile's design.forbiddenNames, case-insensitive and whole-word (a multi-word
    name matches across whitespace, "-" or "_"), in the brief's text or in the checked file's name;
  - a "### Screen:" heading whose section has no "Phone:" line;
  - a component named in docs/delivery/components.json (design entries only) described in words
    instead of named (e.g. "date picker" or "date-picker" for DatePicker), unless the exact name
    also appears;
  - a non-blank line under "## Behaviours" that is not a numbered item ("1.").

Forbidden names come from profile.design.forbiddenNames; with none configured, that rule is off.

exit: 0 no problems; 1 a problem was found; 2 usage (no run, with no file given)

common options:
  --feature <slug>   the run to check (only used when no file is given)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { positionals } = parseCommandArgs(argv, { positionals: { max: 1, names: ['file'] } });
    const { forbiddenNames, componentNames } = await briefComponents(ctx);

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
  },
});
