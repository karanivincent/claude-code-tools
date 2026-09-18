// delivery scope read: apply the founder's replies on the Scope issue.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { readScope } from '../github/scope.mjs';
import { clip } from '../lifecycle/run-info.mjs';

export default defineCommand({
  name: "scope read",
  summary: "Apply the founder's replies on the Scope issue",
  usage: `usage: delivery scope read [--apply "<S1 build>" --comment <id>] [--ignore <id>]... [--dry-run]

Read the comments by the founder's GitHub login on the Scope issue. A reply in the fixed form
("S2 keep", one per line; quoted lines are skipped) applies directly: the line's rows take the
class the word gives, the line records the reply, and the Scope snapshot moves with it, because
his decision is what he has seen. The latest reply to a line wins; a reply after its wave started
still applies at the next wave.

Any other comment is listed for the scope-reply extractor. Its mapping comes back through
--apply (with --comment naming the comment it came from); a comment it cannot map is set aside
with --ignore, its line keeps the default, and the journal records it for the report.

options:
  --apply "<Sn word>"  apply one line decision (repeatable), as mapped from a free-text reply
  --comment <id>       the comment the --apply decisions came from (marks it handled)
  --ignore <id>        set a comment aside as not understood (repeatable)
  --dry-run            print what would change; write nothing

exit: 0 applied (or nothing to apply); 1 a reply is not in the fixed form and not yet mapped

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: { apply: { type: 'string', multiple: true }, comment: { type: 'string' }, ignore: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean' } },
    });
    const apply = values.apply ?? [];
    const comment = intFlag(values.comment, '--comment');
    if (apply.length && !comment) throw new UsageError('--apply needs --comment <id>: the reply it was mapped from');
    const ignore = (values.ignore ?? []).map((v) => intFlag(v, '--ignore'));
    const res = await readScope(ctx, { apply, comment, ignore, dryRun: Boolean(values['dry-run']) });
    for (const a of res.applied) {
      ctx.out.line(`${a.line} ${a.word}: ${a.rows.length ? a.rows.map((r) => `${r.id} ${r.from} → ${r.to}`).join(', ') : 'no class change'}`);
    }
    for (const id of res.ignored) ctx.out.line(`comment ${id} set aside as not understood; its line keeps the default`);
    if (!res.applied.length && !res.unmapped.length && !res.ignored.length) ctx.out.line(`Scope #${res.issue}: no new reply`);
    for (const u of res.unmapped) {
      ctx.out.fail('scope-reply', `comment ${u.id} is not in the fixed form ("${clip(u.body, 80)}"); map it with the scope-reply extractor, then scope read --apply "<Sn word>" --comment ${u.id}, or --ignore ${u.id}`);
    }
    ctx.out.set('applied', res.applied);
    ctx.out.set('unmapped', res.unmapped.map((u) => ({ id: u.id, body: u.body })));
    const exit = res.unmapped.length ? EXIT.RED : EXIT.PASS;
    if (!values['dry-run']) {
      await ctx.journal({
        command: 'scope read', exit,
        counts: {
          applied: res.applied.map((a) => `${a.line}:${a.word}`).join(',') || 'none',
          ...(res.ignored.length ? { notUnderstood: res.ignored.join(',') } : {}),
          unmapped: res.unmapped.length,
        },
        inputs: { issue: res.issue }, outputs: { snapshot: res.snapshot },
      });
    }
    return exit;
  },
});
