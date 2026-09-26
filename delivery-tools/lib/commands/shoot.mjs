// delivery shoot: picture each designed state's page area on a running app (picture mode).

import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { resolvePlaywright } from '../core/playwright.mjs';
import { createDataAdapter } from '../../adapters/data/supabase.mjs';
import { designIds, readMap, validateMap } from '../picture/map.mjs';
import { nextRound, roundDir, WORK_ROUND } from '../picture/rounds.mjs';
import { runShoot, selectStates, writeShootJson } from '../picture/shoot.mjs';
import { hasPhone } from '../picture/widths.mjs';

export default defineCommand({
  name: 'shoot',
  summary: 'Picture each state\'s page area on a running app, with the design cropped the same way',
  usage: `usage: delivery shoot --base-url <url> [--round <n|work>] [<ITEM>|!<ITEM>]...

Picture mode's capture. For each state in map.json that the capture can reach, at each width the
map declares (desktop 1440 x 900, phone 390 x 844): sign in as the state's fixture user (a one-time
link for a fixture address, on the test project only), walk its reach steps (reach.phone's at
phone width, when it has them), grow the window to the page's full height, and save a picture of
the page's own area (the sidebar and top bar are cropped away; an open side panel keeps its
header). Next to it, the design picture cropped the same way. Also records which of the state's
buttons are on the page, whether a member sees one the map hides from members, and, at phone
width, whether the page scrolls sideways.

An item is a state at a width. Desktop pictures keep the state's id (<ID>.live.png); phone ones
add @phone (<ID>@phone.live.png). The phone is shot in its own browser context, as a touch device.

States reached by saving, discarding or adding are taken last, and the worlds they change are
named at the end: re-seed them (delivery seed --refresh) before the next shoot.

The app must already be running: start the profile's dev server in the background first, or pass
a preview URL. Never click anything by hand to reach a state; fix the map instead.

options:
  --base-url <url>   the running app (a local dev server or a preview)
  --round <n|work>   where the pictures go: a numbered round (default: the next one) or "work",
                     a builder's own looking, which never counts as a round
  <ITEM>             take only these: <ID> is the state at every width, <ID>@phone or
                     <ID>@desktop one width; !<ITEM> leaves it out

exit: 0 every item was reached; 1 a state was not reached or the map has problems; 2 usage

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { 'base-url': { type: 'string' }, round: { type: 'string' } },
      positionals: { max: -1 },
    });
    const baseUrl = values['base-url'];
    if (!baseUrl) throw new UsageError('--base-url is required: the running app to picture');
    try { new URL(baseUrl); } catch { throw new UsageError(`--base-url "${baseUrl}" is not a URL`); }
    const paths = ctx.requirePaths();
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json; run delivery map first'); return EXIT.USAGE; }
    const problems = validateMap(map, { designed: designIds(paths) });
    if (problems.length) {
      for (const p of problems) ctx.out.fail('map', p);
      return EXIT.RED;
    }
    const { items, states, unknown } = selectStates(map, positionals);
    if (unknown.length) throw new UsageError(`not states (or widths) in the map: ${unknown.join(', ')}`);
    if (!items.length) { ctx.out.fail('no-states', 'no capture-reachable state was chosen'); return EXIT.USAGE; }
    const noun = hasPhone(map) ? 'item' : 'state';

    const round = values.round ?? String(nextRound(paths));
    if (round !== WORK_ROUND && !/^\d+$/.test(round)) throw new UsageError('--round is a number or "work"');
    const outDir = roundDir(paths, round);
    const profile = await ctx.profile();
    const db = await createDataAdapter(ctx);
    const { chromium } = await resolvePlaywright({ repoRoot: ctx.repoRoot, e2eDir: profile.paths?.e2eDir ?? null });

    ctx.out.line(`shooting ${items.length} ${noun}(s) on ${baseUrl} into ${outDir}`);
    const report = await runShoot({
      map, items, baseUrl, outDir,
      designDir: paths.designRenders,
      sessionsDir: join(paths.runDir, 'sessions'),
      magicLinkPath: profile.auth?.magicLinkPath ?? '/auth/confirm',
      auth: { signInHash: (email) => db.signInHash(email) },
      chromium,
      log: (l) => ctx.out.line(l),
    });
    const doc = await writeShootJson(outDir, { baseUrl, at: ctx.clock.now().toISOString(), report });

    const notReached = Object.entries(report).filter(([, r]) => !r.reached).map(([id]) => id);
    const dirty = [...new Set(items.filter((i) => report[i.key]?.writes).map((i) => i.state.reach.world))];
    const sideways = Object.entries(report).filter(([, r]) => r.overflow).map(([key]) => key);
    ctx.out.line(`reached ${Object.keys(report).length - notReached.length} of ${Object.keys(report).length}${notReached.length ? `; not reached: ${notReached.join(', ')}` : ''}`);
    if (sideways.length) ctx.out.line(`scrolls sideways at phone width: ${sideways.join(', ')}`);
    if (dirty.length) ctx.out.line(`these worlds changed; re-seed them before the next shoot: delivery seed ${dirty.map((w) => `--refresh ${w}`).join(' ')}`);
    ctx.out.line(`pictures: ${outDir}`);
    ctx.out.set('shoot', { round, outDir, reached: Object.keys(report).length - notReached.length, notReached, sideways, dirtyWorlds: dirty, states: Object.keys(doc.states).length });
    const exit = notReached.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: `shoot --round ${round}`, exit, counts: { states: states.length, items: items.length, notReached: notReached.length } });
    return exit;
  },
});
