// delivery design review: compare a new Claude Design export against the run's current snapshot
// (components-first spec §8.4, plan task 8).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { reviewExport, REVIEW_DIRNAME } from '../design/review.mjs';

export default defineCommand({
  name: 'design review',
  summary: "Compare a new design export against the run's current snapshot",
  usage: `usage: delivery design review <export-dir-or-zip>

Compares a new export with the run's current snapshot (docs/design/<feature>/): components and
screens whose hash changed, and states added or removed. Renders the changed states (a state
whose last render named a changed component, or every state of a changed screen) into
.delivery/<feature>/${REVIEW_DIRNAME}/after/, copies the matching current renders into
${REVIEW_DIRNAME}/before/, and writes ${REVIEW_DIRNAME}/review.json and
${REVIEW_DIRNAME}/compare.html (before and after, desktop and phone, side by side).

Also lists: numbered behaviours from the briefs with no design state yet (delivery rules' gaps,
when the run has a rules.json), and forbidden names (profile.design.forbiddenNames) found in the
rendered text.

With no Playwright resolvable from the target repo, the pictures are skipped (review.json and the
compare page are still written, and the output says so); this is not a failure on its own.

Findings feed the next brief: "delivery brief new <slug> --from-review".

exit: 0 no forbidden names and no rules gaps; 1 a forbidden name or a rules gap was found

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { positionals } = parseCommandArgs(argv, { positionals: { min: 1, max: 1, names: ['export'] } });
    const review = await reviewExport(ctx, { exportDir: positionals[0] });

    for (const n of review.diff.componentsAdded) ctx.out.line(`component added: ${n}`);
    for (const n of review.diff.componentsRemoved) ctx.out.line(`component removed: ${n}`);
    for (const n of review.diff.componentsChanged) ctx.out.line(`component changed: ${n}`);
    for (const s of review.diff.screensChanged) ctx.out.line(`screen changed: ${s}`);
    ctx.out.line(`${review.changedStates.length} state(s) need re-rendering: ${review.changedStates.join(', ') || 'none'}`);
    if (review.pictures.skippedWhy) ctx.out.warn(`pictures skipped: ${review.pictures.skippedWhy}`);
    else ctx.out.line(`rendered ${review.pictures.rendered.desktop.length} desktop, ${review.pictures.rendered.phone.length} phone`);
    for (const g of review.rulesGaps) ctx.out.fail('rule', g);
    for (const f of review.forbiddenNames) ctx.out.fail('forbidden-name', `"${f.name}" appears in ${f.state}${f.width === 'phone' ? '@phone' : ''}.txt`);

    ctx.out.set('review', review);
    const exit = review.rulesGaps.length || review.forbiddenNames.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({
      command: 'design review', exit,
      counts: { changedStates: review.changedStates.length, rulesGaps: review.rulesGaps.length, forbiddenNames: review.forbiddenNames.length },
      outputs: review,
    });
    return exit;
  },
});
