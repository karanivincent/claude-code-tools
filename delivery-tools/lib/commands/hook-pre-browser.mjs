// delivery hook pre-browser: preToolUse browser hook: refuse subagent browser calls in a run.
// Owner: slice A1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { decidePreBrowser, hookStderr, readPayload } from '../run/hooks.mjs';

export default defineCommand({
  name: 'hook pre-browser',
  summary: 'PreToolUse browser hook: refuse subagent browser calls in a run',
  usage: `usage: delivery hook pre-browser < payload.json

Called by hooks/pre-browser.sh for mcp__Claude_Browser__*, mcp__claude-in-chrome__* and
mcp__computer-use__* calls that carry an agent_id. Refuses the call when it comes from a
subagent (a non-empty agent_id) while a delivery run is active in this repository: every
browser action by a subagent would ask the founder for approval. The main session's own
calls, and every call when no run is active, are allowed.

exit: 0 allow; 2 refuse, with the reason on stderr

common options:
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const payload = await readPayload(ctx);
    let decision;
    try {
      decision = await decidePreBrowser(ctx, payload);
    } catch (err) {
      // The shell script only calls here for a subagent while a run may be active: refuse.
      hookStderr(ctx).write(`delivery: a subagent's browser call is refused while a delivery run may be active (the hook could not confirm: ${err?.message ?? err})\n`);
      return 2;
    }
    if (decision.allow) return 0;
    hookStderr(ctx).write(`${decision.reason}\n`);
    return 2;
  },
});
