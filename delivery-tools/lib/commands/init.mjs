// delivery init: draft a project profile for review; never the safety file.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { PROFILE_PATH } from '../core/profile.mjs';
import { exists, writeFileAtomic } from '../core/fs.mjs';
import { EXIT, DeliveryError } from '../core/exit.mjs';
import { draftProfile, readRepoFacts, draftIssues, unfilled } from '../lifecycle/init.mjs';

export default defineCommand({
  name: "init",
  summary: "Draft a project profile for review; never the safety file",
  usage: `usage: delivery init [--print]

Draft .claude/delivery-profile.json from the repo's package.json, lockfile, git remote and the
commands its CLAUDE.md names, for a person to review in the profile PR. Anything it cannot
infer is written as "<fill in: ...>", which preflight P1 reports until someone fills it.
Never writes the safety file: the founder authors .claude/delivery-safety.json.

options:
  --print            print the draft instead of writing it

exit: 0 drafted; 2 a profile already exists (use --print to compare)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { print: { type: 'boolean' } } });
    const draft = draftProfile(await readRepoFacts(ctx));
    const issues = draftIssues(draft);
    if (issues.length) throw new DeliveryError(EXIT.RED, `the draft does not match the profile schema: ${issues[0].path} ${issues[0].message}`, { code: 'internal' });
    const todo = unfilled(draft);
    const text = `${JSON.stringify(draft, null, 2)}\n`;
    ctx.out.set('unfilled', todo);
    if (values.print) {
      ctx.out.line(text.trimEnd());
      ctx.out.set('profile', draft);
      return EXIT.PASS;
    }
    const target = join(ctx.repoRoot, PROFILE_PATH);
    if (await exists(target)) {
      ctx.out.fail('exists', `${PROFILE_PATH} already exists; run delivery init --print to compare with a fresh draft`);
      return EXIT.USAGE;
    }
    await writeFileAtomic(target, text);
    ctx.out.set('path', PROFILE_PATH);
    ctx.out.line(`drafted ${PROFILE_PATH}; ${todo.length} value${todo.length === 1 ? '' : 's'} to fill in before the profile PR:`);
    for (const p of todo) ctx.out.line(`  ${p}`);
    ctx.out.line('The safety file is not drafted: the founder writes .claude/delivery-safety.json and merges it with the profile.');
    return EXIT.PASS;
  },
});
