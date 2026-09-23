// delivery wave end: push, wait for CI, resolve the preview for the wave capture.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { waveEnd } from '../lifecycle/wave.mjs';

export default defineCommand({
  name: "wave end",
  summary: "Push, wait for CI, resolve the preview for the wave capture",
  usage: `usage: delivery wave end [--final]

From the integration worktree: push the integration branch, look for duplicate PRs, wait for the
draft PR's CI with the profile's waiter (mergeable first), and resolve the preview serving the
pushed head SHA, for the wave capture and the wave audit. Where the repo has no previews, a local
production build stands in and the output says so. Waiting can take the waiter's full timeout:
run it in the background.

options:
  --final            before the last push of the run: first run the full local CI chain
                     (commands.gate) through the heavy wrapper, as the repo requires

exit: 0 ready for the wave capture; 1 CI red, conflicting, a duplicate, or the local chain failed;
      4 CI or the preview still pending

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { final: { type: 'boolean' } } });
    const res = await waveEnd(ctx, { final: Boolean(values.final) });
    for (const l of res.lines) ctx.out.line(l);
    for (const f of res.failures) ctx.out.fail(f.code, f.message);
    ctx.out.set('headSha', res.sha);
    ctx.out.set('previewUrl', res.url);
    return res.exit;
  },
});
