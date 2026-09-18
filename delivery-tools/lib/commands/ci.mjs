// delivery ci: check mergeable first, then wait for CI with the profile's waiter.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { ciStatus } from '../github/ci.mjs';

export default defineCommand({
  name: "ci",
  summary: "Check mergeable first, then wait for CI with the profile's waiter",
  usage: `usage: delivery ci --pr N [--look]

Check the PR's mergeable state first and say it on the first line: a PR that conflicts with its
base gets no Actions runs at all, so there is nothing to wait for until the base is merged in.
Then wait for the head SHA's checks with the profile's CI waiter (commands.ciWait), which gates
on runs for that SHA; never gh pr checks, where a workflow that has not registered yet looks the
same as one that passed. Waiting can take the waiter's full timeout: run it in the background
and wait on its output.

options:
  --pr N             required
  --look             one short look instead of waiting (pending stays pending)

exit: 0 green; 1 red or conflicting; 4 pending

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { pr: { type: 'string' }, look: { type: 'boolean' } } });
    const pr = intFlag(values.pr, '--pr', { required: true });
    const res = await ciStatus(ctx, { pr, wait: !values.look });
    ctx.out.set('state', res.state);
    ctx.out.set('mergeable', res.mergeable);
    ctx.out.set('headSha', res.headSha);
    let exit;
    if (res.state === 'conflicting') {
      ctx.out.fail('mergeable', res.detail);
      exit = EXIT.RED;
    } else {
      ctx.out.line(`mergeable: ${res.mergeable} (PR #${pr}, head ${String(res.headSha).slice(0, 7)})`);
      if (res.state === 'green') { ctx.out.line(res.detail); exit = EXIT.PASS; }
      else if (res.state === 'pending') { ctx.out.fail('pending', res.detail); exit = EXIT.WAIT; }
      else { ctx.out.fail('ci', res.detail); exit = EXIT.RED; }
    }
    await ctx.journal({ command: `ci --pr ${pr}`, exit, counts: { state: res.state, mergeable: res.mergeable, sha: String(res.headSha).slice(0, 12) }, inputs: { pr }, outputs: res });
    return exit;
  },
});
