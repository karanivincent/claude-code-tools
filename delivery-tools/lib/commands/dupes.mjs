// delivery dupes: find other PRs touching the run's children or paths.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { formatEvent, updateState } from '../core/state.mjs';
import { requireRunState } from '../run/context.mjs';
import { findDupes, undecided } from '../github/dupes.mjs';

export default defineCommand({
  name: "dupes",
  summary: "Find other PRs touching the run's children or paths",
  usage: `usage: delivery dupes [--decide <pr> --note "<text>"]

List PRs that are not the run's, open or merged since the run began, that reference a claimed
child (Refs, Closes, Fixes or Resolves #N in the body, or the number in the branch name) or touch
a claimed path. Any hit is red: the affected unit stops merging, the main session records a Tier 1
decision (adopt the other branch, or ask for it to be closed), and baseline --refresh classes
anything it added. Runs at every wave start, every wave end and before ready.

--decide records that Tier 1 decision for one PR, in the main session's own words, against that
PR's head SHA. The hit is still found and still listed, and the run continues past it; a new
commit on that PR is a new SHA, so the decision expires and the hit is red again. It is for an
overlap the protocol says to decide rather than build away - two features appending to one shared
registry file, most often - never for a PR that is building the run's own child.

options:
  --decide <pr>      record the decision for this PR number
  --note "<text>"    required with --decide: what was decided, and why

exit: 0 none, or every hit decided; 1 a duplicate is undecided

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: { decide: { type: 'string' }, note: { type: 'string' } },
    });
    if (values.decide !== undefined) return decide(ctx, values);

    const hits = await findDupes(ctx);
    const red = undecided(hits);
    for (const h of red) ctx.out.fail('dupe', h.reason);
    for (const h of hits) if (h.decided) ctx.out.line(`decided #${h.pr} (${h.sha.slice(0, 7)}): ${h.note}`);
    if (!hits.length) ctx.out.line('no other PR references a claimed child or touches a claimed path');
    ctx.out.set('dupes', hits);
    const exit = red.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'dupes', exit, counts: { hits: hits.length, decided: hits.length - red.length }, inputs: {}, outputs: hits });
    return exit;
  },
});

/** Record the Tier 1 decision for one hit, pinned to that PR's head SHA. */
async function decide(ctx, values) {
  const pr = Number(values.decide);
  if (!Number.isInteger(pr) || pr < 1) throw new UsageError(`--decide takes a PR number, not "${values.decide}"`);
  const note = String(values.note ?? '').trim();
  if (!note) throw new UsageError('--note "<what was decided, and why>" is required with --decide');

  const { paths } = await requireRunState(ctx);
  const hit = (await findDupes(ctx)).find((h) => h.pr === pr);
  if (!hit) throw new UsageError(`PR #${pr} is not a duplicate of this run; there is nothing to decide`);
  if (!hit.sha) throw new UsageError(`PR #${pr} has no head SHA, so a decision cannot be pinned to it`);

  const at = ctx.clock.now().toISOString();
  const decision = { pr, sha: hit.sha, note, units: hit.units, at };
  await updateState(paths, (s) => ({ ...s, dupeDecisions: [...(s.dupeDecisions ?? []).filter((d) => d.pr !== pr), decision] }), {
    at, event: formatEvent({ command: `dupes --decide ${pr}`, exit: 0, counts: { units: hit.units.length } }),
    inputs: { pr, sha: hit.sha, note }, outputs: decision,
  });
  ctx.out.line(`decided #${pr} at ${hit.sha.slice(0, 7)}${hit.units.length ? ` (affects ${hit.units.join(', ')})` : ''}: ${note}`);
  ctx.out.set('decision', decision);
  return EXIT.PASS;
}
