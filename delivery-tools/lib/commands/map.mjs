// delivery map: check the button map (picture mode) and render the checklist from it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { checklistPath, designIds, mapFromPlan, mapPath, readMap, renderChecklist, validateMap } from '../picture/map.mjs';

export default defineCommand({
  name: 'map',
  summary: 'Check the button map (picture mode) and render checklist.md from it',
  usage: `usage: delivery map [--from-plan]

Picture mode's one plan. docs/delivery/<feature>/map.json lists every designed state: its screen
and name, how the capture reaches it (test world, role and steps, or the component test that
renders it), its buttons, the state each button opens, which buttons a member must not see, and
each button's effect. The mapper agent writes it from the design renders (briefs/mapper.md).

This command checks the map against the design renders and the safety rules (no reach step clicks
a metered, dialling or destructive control without an intercept), then writes checklist.md next
to it, which builders and reviewers read. A valid map switches the run to picture mode: status
then follows the picture loop.

options:
  --from-plan   write map.json from the run's coverage plan first (a run that began in full mode);
                refuses to overwrite an existing map.json

exit: 0 the map is valid and checklist.md is written; 1 the map has problems (each is printed);
      2 there is no map.json (or no plan.json for --from-plan)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { 'from-plan': { type: 'boolean' } } });
    const paths = ctx.requirePaths();
    const designed = designIds(paths);

    if (values['from-plan']) {
      if (existsSync(mapPath(paths))) {
        ctx.out.fail('map-exists', `${mapPath(paths)} already exists; edit it instead`);
        return EXIT.USAGE;
      }
      if (!existsSync(paths.plan)) {
        ctx.out.fail('no-plan', `${paths.plan} does not exist`);
        return EXIT.USAGE;
      }
      const plan = JSON.parse(readFileSync(paths.plan, 'utf8'));
      const map = mapFromPlan(plan, { designed, names: extractNames(paths) });
      await writeFile(mapPath(paths), JSON.stringify(map, null, 2) + '\n');
      ctx.out.line(`wrote ${mapPath(paths)} from the plan: ${map.states.length} state(s), ${map.worlds.length} world(s)`);
    }

    const map = readMap(paths);
    if (!map) {
      ctx.out.fail('no-map', `${mapPath(paths)} does not exist; the mapper agent writes it (briefs/mapper.md), or run delivery map --from-plan`);
      return EXIT.USAGE;
    }
    const problems = validateMap(map, { designed });
    for (const p of problems) ctx.out.fail('map', p);
    if (problems.length) {
      await ctx.journal({ command: 'map', exit: EXIT.RED, counts: { problems: problems.length } });
      return EXIT.RED;
    }
    await writeFile(checklistPath(paths), renderChecklist(map));
    const reachable = map.states.filter((s) => !s.reach?.test).length;
    const buttons = map.states.reduce((n, s) => n + (s.buttons ?? []).length, 0);
    ctx.out.line(`map: ${map.states.length} state(s) (${reachable} reached by the capture, ${map.states.length - reachable} by component tests), ${buttons} button(s), ${map.worlds.length} world(s)`);
    ctx.out.line(`checklist: ${checklistPath(paths)}`);
    ctx.out.set('map', { states: map.states.length, reachable, buttons, worlds: map.worlds.length });
    await ctx.journal({ command: 'map', exit: EXIT.PASS, counts: { states: map.states.length, buttons } });
    return EXIT.PASS;
  },
});

/** Screen and state names from the design extraction, when the run has one. */
function extractNames(paths) {
  const names = {};
  const dir = join(paths.runDir, 'extract');
  if (!existsSync(dir)) return names;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try {
      for (const s of JSON.parse(readFileSync(join(dir, f), 'utf8')).states ?? []) {
        if (s.id && s.name) names[s.id] = { screen: s.screen ?? s.id, name: s.name };
      }
    } catch { /* a file that is not a group extract */ }
  }
  return names;
}
