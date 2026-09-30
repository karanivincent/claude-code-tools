// delivery datacheck: look for every traced data value in a round's live text (picture mode, W3).

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { intFlag, parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { readMap } from '../picture/map.mjs';
import { listRounds, roundDir, roundInfo } from '../picture/rounds.mjs';
import { readContract } from '../picture/contract.mjs';
import { readSwaps } from '../seed/trace.mjs';
import { readQuerySources, selectedColumns, sourceProblems } from '../picture/sources.mjs';
import { datacheckRound, lookupOf, writeDatacheck } from '../picture/datacheck.mjs';

export default defineCommand({
  name: 'datacheck',
  summary: 'Look for every traced data value in a round\'s live text, before any reviewer',
  usage: `usage: delivery datacheck [--round <n>]

Picture mode. The shoot runs this itself; run it again after the data contract changed (a label
fixed, a value swapped) to re-sort a round without shooting it again. It costs seconds and no tokens.

For every item of the round, each value the data contract labels data is looked for in the page's
own text (<ITEM>.live.txt): a row value or a count exactly, a date or time by its format, a value
the product generates by its shape. A value the page lacks is sorted by the world's rows as the
shoot's reset read them (seeded.json):
  data fault   the world lacks it: a seed-writer fixes the world file, then
               delivery shoot --only data-faults re-shoots the item, before any reviewer sees it
  must fix     the world holds it and the page does not show it
A round from before seeded.json existed is sorted by the traced row instead: a miss in a row the
page otherwise shows is a data fault, one in a row it does not show at all goes to the reviewers.

It rewrites each item's lookup in the round's shoot.json and writes datacheck.json, the
seed-writer's Problem file.

options:
  --round <n>        the round (default: the latest)

exit: 0 no data fault; 1 data faults to fix; 2 no map, no contract or no round

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { round: { type: 'string' } } });
    const paths = ctx.requirePaths();
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json'); return EXIT.USAGE; }
    const contract = readContract(paths);
    if (!contract) { ctx.out.fail('no-contract', 'there is no contract.json: delivery contract, then the labeller'); return EXIT.USAGE; }
    const rounds = listRounds(paths);
    const round = values.round !== undefined ? intFlag(values.round, '--round') : rounds[rounds.length - 1];
    if (round === undefined || !rounds.includes(round)) throw new UsageError(round === undefined ? 'no round has been shot yet' : `round ${round} does not exist`);
    const info = roundInfo(paths, round);
    if (!info.shoot) { ctx.out.fail('not-shot', `round ${round} has no shoot.json`); return EXIT.USAGE; }
    const dir = roundDir(paths, round);
    const r = datacheckRound({ map, contract, shoot: info.shoot, roundDir: dir, swaps: readSwaps(paths) });
    const shoot = { ...info.shoot, states: { ...info.shoot.states } };
    for (const [key, res] of Object.entries(r.items)) {
      const lookup = lookupOf(res);
      const { lookup: _old, ...rest } = shoot.states[key];
      shoot.states[key] = { ...rest, ...(lookup ? { lookup } : {}), datacheck: { checked: res.checked, faults: res.faults.length, page: res.page.length } };
    }
    await writeFile(join(dir, 'shoot.json'), JSON.stringify(shoot, null, 1) + '\n');
    const sources = sourceProblems(contract, selectedColumns(await readQuerySources(ctx.repoRoot)));
    const doc = await writeDatacheck(dir, shoot, ctx.clock.now().toISOString(), sources);
    for (const x of sources) ctx.out.line(`no source? ${x.table}.${x.column} (${x.states.slice(0, 4).join(', ')}): ${x.why}; it goes to the founder with delivery contract --questions`);
    const noLive = Object.keys(info.shoot.states ?? {}).filter((k) => info.shoot.states[k]?.reached && !r.items[k]).length;
    ctx.out.line(`round ${round}: ${r.checked} traced value(s) looked for in ${Object.keys(r.items).length} item(s); ${r.faults} data fault(s) in ${doc.faults} item(s), ${r.page} value(s) the page does not show in ${doc.must} item(s)${noLive ? `; ${noLive} reached item(s) have no live text (shot before 0.19): shoot them again to check them` : ''}`);
    if (!existsSync(join(dir, 'seeded.json'))) ctx.out.line('no seeded.json in this round: misses were sorted by their traced row, not by the world');
    for (const [k, v] of Object.entries(doc.items)) for (const t of v.dataFault) ctx.out.line(`  ${k}: data fault: ${t}`);
    if (doc.faults) ctx.out.line(`next: dispatch the seed-writer (Problem: ${relative(ctx.repoRoot, join(dir, 'datacheck.json'))}), then delivery seed --plan and --check, then delivery shoot --base-url <url> --only data-faults`);
    ctx.out.set('datacheck', { round, checked: r.checked, faults: r.faults, page: r.page, faultItems: doc.faults, mustItems: doc.must });
    const exit = doc.faults ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: `datacheck --round ${round}`, exit, counts: { checked: r.checked, faults: r.faults, page: r.page } });
    return exit;
  },
});
