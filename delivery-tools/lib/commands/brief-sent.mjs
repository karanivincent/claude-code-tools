// delivery brief sent: record that a brief was sent to Claude Design (components-first spec §8.3,
// plan task 7). Refuses the same problems `delivery brief check` would.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { briefProblems, briefComponents, recordSent } from '../brief/brief.mjs';

export default defineCommand({
  name: 'brief sent',
  summary: 'Record that a brief was sent to Claude Design',
  usage: `usage: delivery brief sent <file> --chat <url>

Appends one entry to intent/briefs/sent.json: the file, the chat link, the time, and the sha256 of
the brief's bytes. Runs the same checks as "delivery brief check" on the file first and refuses
(writes nothing) on any problem.

exit: 0 recorded; 1 a check problem was found; 2 usage (no run, no --chat)

common options:
  --feature <slug>   the run the brief belongs to (required)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { chat: { type: 'string' } },
      positionals: { min: 1, max: 1, names: ['file'] },
    });
    if (!values.chat) throw new UsageError('--chat <url> is required');
    const paths = ctx.requirePaths();
    const file = resolve(ctx.cwd, positionals[0]);
    const { forbiddenNames, componentNames } = await briefComponents(ctx);
    const text = await readFile(file, 'utf8');
    const problems = briefProblems(text, { forbiddenNames, componentNames });
    if (problems.length) {
      for (const p of problems) ctx.out.fail('brief', p);
      ctx.out.set('problems', problems.length);
      await ctx.journal({ command: 'brief sent', exit: EXIT.RED, counts: { problems: problems.length } });
      return EXIT.RED;
    }

    await recordSent(paths.intentDir, { file, chat: values.chat, at: ctx.clock.now().toISOString() });
    ctx.out.line(`recorded ${file} sent to ${values.chat}`);
    ctx.out.set('file', file);
    ctx.out.set('chat', values.chat);
    await ctx.journal({ command: 'brief sent', exit: EXIT.PASS, outputs: [file] });
    return EXIT.PASS;
  },
});
