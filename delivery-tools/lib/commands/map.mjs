// delivery map: check the button map (picture mode) and render the checklist from it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { checklistPath, clockProblems, designIds, mapFromPlan, mapPath, readMap, renderChecklist, validateMap } from '../picture/map.mjs';
import { worldFilePath } from '../seed/plan.mjs';
import { likelyRetiredIds } from '../lifecycle/prepush.mjs';
import { overlapLines } from '../lifecycle/overlap.mjs';
import { hasPhone, mapItems, mapWidths } from '../picture/widths.mjs';
import { readRules } from '../picture/rules.mjs';
import { fixtureForbiddenTables, forbiddenTableProblems } from '../seed/forbidden.mjs';
import { readContract } from '../picture/contract.mjs';

export default defineCommand({
  name: 'map',
  summary: 'Check the button map (picture mode) and render checklist.md from it',
  usage: `usage: delivery map [--from-plan]

Picture mode's one plan. docs/delivery/<feature>/map.json lists every designed state: its screen
and name, how the capture reaches it (test world, role and steps, or the component test that
renders it), its buttons, the state each button opens, which buttons a member must not see, and
each button's effect. The mapper agent writes it from the design renders (briefs/mapper.md).

This command checks the map against the design renders and the safety rules (no reach step clicks
a metered, dialling or destructive control without an intercept), and refuses a fixed date or time
in the world of a state marked "clock": true (one that looks as designed only at some times of
day: its times are written relative to the shoot, {"$rel": ...}), and, when the profile names
testData.timeOfDayTables, a clock state's world that writes no row to one of them (its hours are
written relative to the shoot, {"$minuteOfDay": "now-60"}). It also refuses a world that writes a
table the safety file's probes say no fixture organisation may hold (a plain count over the table
expecting 0), and a state that shows data from one with no reach.intercept: answer it with an
intercept. Then it writes checklist.md next
to it, which builders and reviewers read. When rules.json exists, each rule is written under the
states that show it, so builders and reviewers see it next to the picture. A valid map switches the run to picture mode: status
then follows the picture loop.

Two warnings, never refusals, so they can be acted on while the build runs: test ids the base
branch's e2e specs name (skipped tests left out) that the page's code has today (the map's route
sources) and the map does not keep, so the PR that skips those specs can go up now; and other open
runs (PRs on the profile's branch prefix) that change the same files: a database function both
redefine, the message files or the profile's paths.sharedFiles (the navigation config), or files
under this run's routes.

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
    const worldFiles = {};
    for (const w of map.worlds ?? []) {
      try { worldFiles[w.id] = JSON.parse(readFileSync(worldFilePath(paths, w.id), 'utf8')); } catch { worldFiles[w.id] = null; }
    }
    const timeOfDayTables = (await ctx.profile().catch(() => null))?.testData?.timeOfDayTables ?? [];
    const problems = [...validateMap(map, { designed }), ...clockProblems(map, worldFiles, { timeOfDayTables }), ...await forbiddenProblems(ctx, paths, map, worldFiles)];
    for (const p of problems) ctx.out.fail('map', p);
    if (problems.length) {
      await ctx.journal({ command: 'map', exit: EXIT.RED, counts: { problems: problems.length } });
      return EXIT.RED;
    }
    let rules = null;
    try { rules = readRules(paths); } catch (err) { ctx.out.fail('rules', err.message); }
    await writeFile(checklistPath(paths), renderChecklist(map, { rules }));
    const reachable = map.states.filter((s) => !s.reach?.test).length;
    const buttons = map.states.reduce((n, s) => n + (s.buttons ?? []).length, 0);
    ctx.out.line(`map: ${map.states.length} state(s) (${reachable} reached by the capture, ${map.states.length - reachable} by component tests), ${buttons} button(s), ${map.worlds.length} world(s)`);
    if (hasPhone(map)) ctx.out.line(`widths: ${mapWidths(map).join(', ')}; ${mapItems(map).length} item(s), a state at a width`);
    if (rules) ctx.out.line(`rules: ${(rules.rules ?? []).length} written into the checklist; check them with delivery rules`);
    ctx.out.line(`checklist: ${checklistPath(paths)}`);
    // W8: what the run can find out now rather than at prepush. Warnings only.
    const profile = await ctx.profile().catch(() => null);
    let retired = [];
    let overlap = [];
    if (profile && ctx.git) {
      try {
        const r = await likelyRetiredIds(ctx, { profile, map });
        retired = r.ids;
        if (r.note) ctx.out.line(`note: ${r.note}`);
        for (const x of retired) ctx.out.warn(`test id "${x.id}" is named by ${x.spec} on the base branch, is in the page's code today, and the map does not keep it: open the PR that skips or updates that spec now, while the build runs`);
      } catch (err) { ctx.out.line(`note: could not look for retired test ids (${String(err?.message ?? err).split('\n')[0]})`); }
      if (ctx.gh) {
        overlap = await overlapLines(ctx, { profile, map });
        for (const l of overlap) ctx.out.warn(l);
      }
    }
    ctx.out.set('map', { states: map.states.length, reachable, buttons, worlds: map.worlds.length, widths: mapWidths(map), items: mapItems(map).length, retiredTestIds: retired, overlap });
    await ctx.journal({ command: 'map', exit: EXIT.PASS, counts: { states: map.states.length, buttons } });
    return EXIT.PASS;
  },
});

/**
 * B1: tables the safety file's probes say no fixture organisation may hold. A world that writes
 * one, or a state that shows one with no intercept, is a problem. No safety file: nothing to say.
 */
async function forbiddenProblems(ctx, paths, map, worldFiles) {
  let tables = [];
  try { tables = fixtureForbiddenTables((await ctx.safety()).safety); } catch { return []; }
  let contract = null;
  try { contract = readContract(paths); } catch { contract = null; }
  return forbiddenTableProblems(map, worldFiles, tables, contract);
}

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
