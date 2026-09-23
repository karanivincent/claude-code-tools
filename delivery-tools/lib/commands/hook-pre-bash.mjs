// delivery hook pre-bash: preToolUse Bash hook: gate gh pr ready and raw seed commands.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { decidePreBash, hookStderr, readPayload } from '../run/hooks.mjs';

export default defineCommand({
  name: 'hook pre-bash',
  summary: 'PreToolUse Bash hook: gate gh pr ready and raw seed commands',
  usage: `usage: delivery hook pre-bash < payload.json

Called by hooks/pre-bash.sh when the command mentions gh pr ready, a gh api call that marks
a PR ready for review, or a seed, and a run may be active. The command is lexed like a shell
would (quotes, heredocs, $(...), sh -c and eval are looked into):
  - gh pr ready for a run's PR (by number, URL, branch, or the current branch) runs the
    ready --check logic: refused when ready.json is missing, stale (another head SHA, or any
    input hash changed), red, or not written by delivery ready;
  - a gh api call with ready_for_review or markPullRequestReadyForReview is checked against
    every active run's PR;
  - a raw seed command (a seed script, a seed package script, a seed subcommand) is refused
    while a run is active: only delivery seed writes fixture rows.
Anything else, and everything when no run is active, is allowed.

exit: 0 allow; 2 refuse, with the reason on stderr

common options:
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const payload = await readPayload(ctx);
    let decision;
    try {
      decision = await decidePreBash(ctx, payload);
    } catch (err) {
      // Only a ready check fails closed (inside decidePreBash); an unexpected error elsewhere must
      // never block ordinary work.
      hookStderr(ctx).write(`delivery: pre-bash hook error, allowing: ${err?.message ?? err}\n`);
      return 0;
    }
    if (decision.allow) return 0;
    hookStderr(ctx).write(`${decision.reason}\n`);
    return 2;
  },
});
