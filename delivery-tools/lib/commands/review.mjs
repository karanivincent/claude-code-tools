// delivery review: compile a round's reviewer notes into review.json and the comparison page.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { intFlag, parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { readMap } from '../picture/map.mjs';
import { listRounds, roundDir, roundInfo } from '../picture/rounds.mjs';
import { parseReview, renderCompare, summarise } from '../picture/review.mjs';

export default defineCommand({
  name: 'review',
  summary: 'Compile a round\'s reviewer notes into review.json and the comparison page',
  usage: `usage: delivery review [--round <n>] [--before <n>]

Picture mode. Reviewer agents (briefs/reviewer-picture.md) each write review-<group>.md into the
round's folder: one "## <STATE-ID>" section per state with a problem, one bullet per problem, each
starting "must fix:" or "small:". This command reads them with the round's shoot.json and writes:

  review.json    every state's verdict: match, small, must, not-reached or test-only, with notes
  compare.html   design, an earlier round and this round side by side, with the notes; the
                 pictures it shows are copied into the round's folder so the folder publishes whole

A state with no section in any review matches. Only states the reviewers were given count: run it
after every group's reviewer has written its file.

options:
  --round <n>    the round (default: the latest numbered round)
  --before <n>   the earlier round shown next to it (default: round 1, when this is a later round)

exit: 0 compiled, nothing left to fix; 1 compiled, and states are still to fix or not reached;
      2 no round, no shoot.json or no review file

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { round: { type: 'string' }, before: { type: 'string' } } });
    const paths = ctx.requirePaths();
    const rounds = listRounds(paths);
    const round = intFlag(values.round, '--round') ?? rounds[rounds.length - 1];
    if (!round) { ctx.out.fail('no-round', 'no numbered round yet; run delivery shoot first'); return EXIT.USAGE; }
    const info = roundInfo(paths, round);
    if (!info.shoot) { ctx.out.fail('no-shoot', `round ${round} has no shoot.json; run delivery shoot --round ${round}`); return EXIT.USAGE; }
    if (!info.reviews.length) { ctx.out.fail('no-review', `round ${round} has no review-*.md; dispatch the reviewers (briefs/reviewer-picture.md)`); return EXIT.USAGE; }
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json'); return EXIT.USAGE; }

    const notes = {};
    for (const f of info.reviews) {
      for (const [id, n] of Object.entries(parseReview(readFileSync(join(info.dir, f), 'utf8'), map.states.map((s) => s.id)))) {
        notes[id] ??= { must: [], small: [] };
        notes[id].must.push(...n.must);
        notes[id].small.push(...n.small);
      }
    }
    const summary = summarise({ map, shoot: info.shoot, notes });

    const before = intFlag(values.before, '--before') ?? (round > 1 && rounds.includes(1) ? 1 : null);
    const beforeDir = before ? roundDir(paths, before) : null;
    if (beforeDir) mkdirSync(join(info.dir, 'before'), { recursive: true });
    const pictures = (id) => {
      const design = existsSync(join(info.dir, `${id}.design.png`)) ? `${id}.design.png` : null;
      const now = existsSync(join(info.dir, `${id}.live.png`)) ? `${id}.live.png` : null;
      let prev = null;
      if (beforeDir && existsSync(join(beforeDir, `${id}.live.png`))) {
        copyFileSync(join(beforeDir, `${id}.live.png`), join(info.dir, 'before', `${id}.live.png`));
        prev = `before/${id}.live.png`;
      }
      return { design, before: prev, now };
    };
    const title = `${map.title ?? map.feature}: round ${round}`;
    await writeFile(join(info.dir, 'compare.html'), renderCompare({ title, round, beforeRound: before, map, summary, pictures }));
    const doc = { schemaVersion: 1, round, before, at: ctx.clock.now().toISOString(), counts: summary.counts, states: summary.states };
    await writeFile(join(info.dir, 'review.json'), JSON.stringify(doc, null, 1) + '\n');

    const c = summary.counts;
    ctx.out.line(`round ${round}: ${c.match} match, ${c.small} small differences only, ${c.must} to fix, ${c.notReached} not reached, ${c.testOnly} unit tests only`);
    for (const [id, s] of Object.entries(summary.states)) {
      if (s.verdict === 'must') ctx.out.line(`  ${id}: ${s.must.length} to fix`);
      if (s.verdict === 'not-reached') ctx.out.line(`  ${id}: not reached`);
    }
    ctx.out.line(`comparison page: ${join(info.dir, 'compare.html')}`);
    ctx.out.set('review', { round, before, counts: c, compare: join(info.dir, 'compare.html') });
    const exit = c.must || c.notReached ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: `review --round ${round}`, exit, counts: c });
    return exit;
  },
});
