// delivery shoot: picture each designed state's page area on a running app (picture mode).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { resolvePlaywright } from '../core/playwright.mjs';
import { createDataAdapter } from '../../adapters/data/supabase.mjs';
import { refreshWorld } from '../seed/scan.mjs';
import { liveWorldRows } from '../seed/db.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { designIds, readMap, validateMap } from '../picture/map.mjs';
import { discardRound, listRounds, nextRound, roundDir, roundInfo, WORK_ROUND } from '../picture/rounds.mjs';
import { dataGapItems, runShoot, selectStates, withShootSlot, writeShootJson } from '../picture/shoot.mjs';
import { readContract } from '../picture/contract.mjs';
import { changedGlobals, readGlobalHashes, readRecordedGlobals, readTableShapes, schemaChangeMessage, schemaChanges } from '../seed/drift.mjs';
import { hasPhone } from '../picture/widths.mjs';
import { probeServer } from '../picture/smoke.mjs';
import { smokeGate } from './smoke.mjs';

export { probeServer };

export default defineCommand({
  name: 'shoot',
  summary: 'Picture each state\'s page area on a running app, with the design cropped the same way',
  usage: `usage: delivery shoot --base-url <url> [--round <n|work>] [--no-reset] [<ITEM>|!<ITEM>]...
       delivery shoot --base-url <url> --only <ITEM,...|data-gaps> [--round <n>]

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

Same data in every picture. Right before a world's first shot, the shoot resets it to its seed
(the seed --refresh path: planned rows rewritten with relative dates moved to now, rows a click
added removed, then scanned), and again before a later shot once a data-changing shot touched it.
Each browser is frozen at the moment its world was seeded, in the profile's time zone
(testData.timeZone), so "2 min ago" reads as the design does. A world that cannot be reset safely
is not pictured: its items are not reached. --no-reset skips the reset (a builder's own look).

States reached by saving, discarding or adding are taken last. Between the desktop and phone shot
of a data-changing state, the world is re-seeded too.

After the shoot, a text the design shows that the page does not, which the data contract labels
data, is looked up in the world as seeded: the world lacks it (a data gap, for the seed worker) or
holds it and the page does not show it (a must fix). Both go into shoot.json as the item's lookup,
and review counts them.

The app must already be running: start the profile's dev server in the background first, or pass
a preview URL. Never click anything by hand to reach a state; fix the map instead.

Every page loads first. Before anything is pictured, the shoot runs delivery smoke on the routes
the chosen items reach, and stops at the first broken page (a status of 500 or more, the Next.js
error overlay, a replaced build output, a loading placeholder still there after 10 s). After the
shoot it checks again: when the server broke during the shoot, the new round's folder is deleted,
so the next shoot takes the same number (a re-shoot into an existing round keeps it).

options:
  --base-url <url>   the running app (a local dev server or a preview)
  --round <n|work>   where the pictures go: a numbered round (default: the next one) or "work",
                     a builder's own looking, which never counts as a round
  <ITEM>             take only these: <ID> is the state at every width, <ID>@phone or
                     <ID>@desktop one width; !<ITEM> leaves it out
  --only <items>     re-shoot these items into the latest round (not a new one), replacing their
                     pictures and records there: a comma list of items, or "data-gaps" for every
                     item the round found a data gap in. Then review --plan reviews just those.
  --no-reset         do not reset the worlds first (the pictures may show drifted data)

exit: 0 every item was reached; 1 a state was not reached, a page is broken, or the map has
      problems; 2 usage

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { 'base-url': { type: 'string' }, round: { type: 'string' }, only: { type: 'string' }, 'no-reset': { type: 'boolean' } },
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
    let picks = positionals;
    let defaultRound = String(nextRound(paths));
    if (values.only !== undefined) {
      if (positionals.length) throw new UsageError('give the items to re-shoot with --only, not as well as a list');
      const rounds = listRounds(paths);
      const target = values.round ?? (rounds.length ? String(rounds[rounds.length - 1]) : null);
      if (!target || !/^\d+$/.test(target)) throw new UsageError('--only re-shoots into a numbered round, and there is none yet');
      defaultRound = target;
      picks = values.only.trim() === 'data-gaps' ? dataGapItems(roundInfo(paths, Number(target))) : values.only.split(',').map((x) => x.trim()).filter(Boolean);
      if (!picks.length) { ctx.out.line(`nothing to re-shoot: round ${target} has no ${values.only.trim() === 'data-gaps' ? 'data gap' : 'item named'}`); return EXIT.PASS; }
    }
    const { items, states, unknown } = selectStates(map, picks);
    if (unknown.length) throw new UsageError(`not states (or widths) in the map: ${unknown.join(', ')}`);
    if (!items.length) { ctx.out.fail('no-states', 'no capture-reachable state was chosen'); return EXIT.USAGE; }
    const noun = hasPhone(map) ? 'item' : 'state';

    const round = values.round ?? defaultRound;
    if (round !== WORK_ROUND && !/^\d+$/.test(round)) throw new UsageError('--round is a number or "work"');
    const outDir = roundDir(paths, round);
    const newRound = round !== WORK_ROUND && !existsSync(outDir);
    const profile = await ctx.profile();
    const db = await createDataAdapter(ctx);
    const { chromium } = await resolvePlaywright({ repoRoot: ctx.repoRoot, e2eDir: profile.paths?.e2eDir ?? null });

    const broken = await probeServer(ctx, baseUrl);
    if (broken) { ctx.out.fail('server-broken', broken); return EXIT.RED; }
    const seedPlan = await readArtefact(paths, 'seedplan', { optional: true }).catch(() => null);
    const resetting = !values['no-reset'] && Boolean(seedPlan);
    if (!values['no-reset'] && !seedPlan) ctx.out.warn('no seedplan.json: the worlds are not reset before the shoot, so the pictures may show drifted data (delivery seed --plan)');
    const drift = seedPlan ? await driftWarnings(ctx, db, paths, seedPlan, [...new Set(items.map((i) => i.state.reach.world))]) : [];
    let contract = null;
    try { contract = readContract(paths); } catch (err) { ctx.out.warn(`contract.json does not parse (${err.message}); data differences are not looked up`); }
    // W2: every page the items reach loads before anything is pictured.
    let smoke = null;
    const report = await withShootSlot(ctx, async () => {
      smoke = await smokeGate(ctx, { map, items, baseUrl, profile, paths, db, chromium, inSlot: true });
      if (smoke.failure) return null;
      ctx.out.line(`${values.only !== undefined ? 're-' : ''}shooting ${items.length} ${noun}(s) on ${baseUrl} into ${outDir}`);
      return runShoot({
        map, items, baseUrl, outDir,
        timeZone: profile.testData?.timeZone ?? null,
        contract,
        at: () => ctx.clock.now().toISOString(),
        now: () => ctx.clock.now(),
        reset: resetting ? (worldId) => resetWorld(ctx, db, seedPlan, worldId) : undefined,
        designDir: paths.designRenders,
        sessionsDir: join(paths.runDir, 'sessions'),
        magicLinkPath: profile.auth?.magicLinkPath ?? '/auth/confirm',
        auth: { signInHash: (email) => db.signInHash(email) },
        chromium,
        log: (l) => ctx.out.line(l),
        // A state that changes data and is checked at both widths uses a freshly seeded world each
        // time: reuse the seed plan's own apply path (spec 7.4), the same one `seed --refresh` runs.
        reseed: async (worldId) => {
          const gate = await refreshWorld(ctx, worldId);
          if (!gate.ok) ctx.out.warn(`re-seeding ${worldId} before the next width's shot found problems: ${gate.failures.map((f) => f.message).join('; ')}`);
        },
      });
    });
    if (smoke?.failure) {
      ctx.out.line('nothing was pictured, and no round was used');
      ctx.out.set('shoot', { round, outDir, smoke: smoke.failure, reached: 0 });
      await ctx.journal({ command: `shoot --round ${round}`, exit: EXIT.RED, counts: { items: items.length, smokeFailed: 1 } });
      return EXIT.RED;
    }
    const doc = await writeShootJson(outDir, { baseUrl, at: ctx.clock.now().toISOString(), report, reshot: values.only !== undefined });
    // A build that ran while the shoot did can break the server halfway; its pictures are then of an
    // error page. Such a round never counts: its folder goes, and the next shoot takes its number.
    const brokeDuring = (await probeServer(ctx, baseUrl)) ?? (await smokeGate(ctx, { map, items, baseUrl, profile, paths, db, chromium, quiet: true })).failure;
    if (brokeDuring) {
      const why = typeof brokeDuring === 'string' ? brokeDuring : `${brokeDuring.route} at ${brokeDuring.width} is broken: ${brokeDuring.why}`;
      const discarded = newRound && discardRound(paths, round);
      ctx.out.fail('server-broken', `${why}. It broke during the shoot, so some pictures show an error page: ${discarded ? `round ${round} was deleted, and the next shoot takes its number again` : 'shoot this round again once it serves'}`);
      ctx.out.set('shoot', { round, outDir, brokeDuring: why, discarded });
      await ctx.journal({ command: `shoot --round ${round}`, exit: EXIT.RED, counts: { items: items.length, brokeDuring: 1, discarded: discarded ? 1 : 0 } });
      return EXIT.RED;
    }

    const notReached = Object.entries(report).filter(([, r]) => !r.reached).map(([id]) => id);
    const dirty = [...new Set(items.filter((i) => report[i.key]?.writes).map((i) => i.state.reach.world))];
    const sideways = Object.entries(report).filter(([, r]) => r.overflow).map(([key]) => key);
    ctx.out.line(`reached ${Object.keys(report).length - notReached.length} of ${Object.keys(report).length}${notReached.length ? `; not reached: ${notReached.join(', ')}` : ''}`);
    if (sideways.length) ctx.out.line(`scrolls sideways at phone width: ${sideways.join(', ')}`);
    if (dirty.length) ctx.out.line(resetting ? `these worlds changed: ${dirty.join(', ')} (the next shoot resets them itself)` : `these worlds changed; re-seed them before the next shoot: delivery seed ${dirty.map((w) => `--refresh ${w}`).join(' ')}`);
    const looked = Object.entries(report).filter(([, r]) => r.lookup);
    const gaps = looked.filter(([, r]) => r.lookup.dataGap.length).map(([k]) => k);
    const musts = looked.filter(([, r]) => r.lookup.must.length).map(([k]) => k);
    if (gaps.length) ctx.out.line(`data gaps found by lookup (the world lacks what the design shows; a seed-writer fixes the world file): ${gaps.join(', ')}`);
    if (musts.length) ctx.out.line(`must fix found by lookup (the world holds it, the page does not show it): ${musts.join(', ')}`);
    ctx.out.line(`pictures: ${outDir}`);
    if (values.only !== undefined) ctx.out.line(`next: delivery review --plan --round ${round} (it reviews only the ${items.length} re-shot ${noun}(s))`);
    ctx.out.set('shoot', { drift, round, outDir, reached: Object.keys(report).length - notReached.length, notReached, sideways, dirtyWorlds: dirty, states: Object.keys(doc.states).length, reset: resetting, reshot: values.only !== undefined, lookupDataGaps: gaps, lookupMust: musts });
    const exit = notReached.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: `shoot --round ${round}`, exit, counts: { states: states.length, items: items.length, notReached: notReached.length, lookupDataGaps: gaps.length, lookupMust: musts.length } });
    return exit;
  },
});

/**
 * R7 and fix 9 of stable picture data, before anything is pictured: a shared table a world depends
 * on that changed since seed --apply, and a table the worlds write whose columns changed since
 * seed --plan. Warnings, not refusals: the pictures still show the page, but a difference may be
 * data, and the reviewer should know. A database that cannot be read says so in one line.
 * @returns {Promise<string[]>}
 */
export async function driftWarnings(ctx, db, paths, seedPlan, worlds) {
  const out = [];
  try {
    const recorded = await readRecordedGlobals(paths);
    if (recorded) {
      for (const c of changedGlobals(recorded, await readGlobalHashes(db, seedPlan, worlds))) {
        out.push(`world ${c.world} depends on ${c.key}, which changed since the world was seeded (${c.since}): a picture that differs there may be data, not code`);
      }
    }
    if (seedPlan.schema) for (const c of schemaChanges(seedPlan, await readTableShapes(db, seedPlan))) out.push(schemaChangeMessage(c));
  } catch (err) {
    out.push(`could not check the worlds' global dependencies and tables (${String(err?.message ?? err).split('\n')[0]})`);
  }
  for (const w of out) ctx.out.warn(w);
  return out;
}

/**
 * Fixes 3 and 4 of stable picture data: restore one world to its seed right before its shots, and
 * read what it now holds for the lookup. The moment is taken before the write, so the browser's
 * frozen clock and the seed's relative dates name the same moment (to within the write's seconds).
 * A refresh the safety scan refuses throws: that world is not pictured.
 * @returns {Promise<{ at: Date, rows: object[]|null, users: object[] }>}
 */
export async function resetWorld(ctx, db, seedPlan, worldId) {
  const at = ctx.clock.now();
  const gate = await refreshWorld(ctx, worldId);
  if (!gate.ok) throw new Error(gate.failures.map((f) => f.message).join('; '));
  const scoped = {
    ...seedPlan,
    worlds: seedPlan.worlds.filter((w) => w.id === worldId),
    users: seedPlan.users.filter((u) => u.world === worldId),
    rows: seedPlan.rows.filter((r) => r.world === worldId),
  };
  let rows = null;
  try { rows = await liveWorldRows(db, scoped); } catch { rows = null; }
  return { at, rows, users: scoped.users };
}
