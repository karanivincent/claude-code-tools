// delivery shoot: picture each designed state's page area on a running app (picture mode).

import { copyFileSync, existsSync } from 'node:fs';
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
import { readSwaps } from '../seed/trace.mjs';
import { readQuerySources, selectedColumns, sourceProblems } from '../picture/sources.mjs';
import { writeDatacheck } from '../picture/datacheck.mjs';
import { changedGlobals, readGlobalHashes, readRecordedGlobals, readTableShapes, schemaChangeMessage, schemaChanges } from '../seed/drift.mjs';
import { hasPhone, roundFiles } from '../picture/widths.mjs';
import { changedSince, unchangedItems } from '../picture/changed.mjs';
import { latestVerdicts } from '../picture/next.mjs';
import { probeServer } from '../picture/smoke.mjs';
import { shootProdServer } from '../picture/prod-server.mjs';
import { ensureServer } from '../picture/serve.mjs';
import { wrapHeavy } from '../core/profile.mjs';
import { freePort } from '../capture/run.mjs';
import { tunable } from '../retro/tunables.mjs';
import { smokeGate } from './smoke.mjs';

export { probeServer };

export default defineCommand({
  name: 'shoot',
  summary: 'Picture each state\'s page area on a running app, with the design cropped the same way',
  usage: `usage: delivery shoot [--base-url <url> | --prod] [--round <n|work>] [--no-reset] [<ITEM>|!<ITEM>]...
       delivery shoot [--base-url <url> | --prod] --only <ITEM,...|data-faults> [--round <n>]

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

States reached by saving, discarding or adding are taken last, each in its own browser context,
and the world is reset before every one of them: a save never leaks into the next state.

After the shoot, datacheck looks for every value the data contract labels data in the page's own
text (saved as <ITEM>.live.txt): exactly for a row value or a count, by format for a date or time,
by shape for a value the product generates. A value the page lacks is looked up in the world as
seeded (saved in seeded.json): the world lacks it (a data fault, for the seed-writer, fixed and
re-shot before any reviewer looks) or holds it and the page does not show it (a must fix). Both go
into shoot.json as the item's lookup and into datacheck.json; review counts them. delivery
datacheck runs the same check again from those files.

With no --base-url and no --prod, the shoot pictures the run's own dev server: it runs delivery
serve --ensure first (started detached, or restarted when it is gone or answers 500), so a builder's
shoot --round work <ID> needs no URL. --base-url pictures another running app (a preview), and
--prod a production build. Worlds are shot side by side (tunables shoot.parallelWorlds), one
browser context each; a world is never in two contexts at once. Never click anything by hand to reach a state; fix the map instead.

Every page loads first. Before anything is pictured, the shoot runs delivery smoke on the routes
the chosen items reach, and stops at the first broken page (a status of 500 or more, the Next.js
error overlay, a replaced build output, a loading placeholder still there after 10 s). After the
shoot it checks again: when the server broke during the shoot, the new round's folder is deleted,
so the next shoot takes the same number (a re-shoot into an existing round keeps it).

options:
  --base-url <url>   the running app (a preview); default: the run's dev server (delivery serve)
  --prod             instead of --base-url: build and serve a production build with the profile's
                     commands.prodServer ({port}; its own build folder, so the dev server keeps
                     running), shoot it, and stop it. The build runs through commands.heavy after
                     its build folder is removed (picture.prodDistDir, or the cd + NEXT_DIST_DIR the
                     command names); commands.prodServerBuild, when set, builds on its own first and
                     prodServer only serves. A dev server compiles each route on its first visit; a
                     production build answers at once. A build that fails stops the shoot with its
                     error lines and last lines, and no round is used.
  --round <n|work>   where the pictures go: a numbered round (default: the next one) or "work",
                     a builder's own looking, which never counts as a round
  <ITEM>             take only these: <ID> is the state at every width, <ID>@phone or
                     <ID>@desktop one width; !<ITEM> leaves it out
  --only <items>     re-shoot these items into the latest round (not a new one), replacing their
                     pictures and records there: a comma list of items, or "data-faults" (also
                     "data-gaps") for every item the round found a data fault or gap in. Then
                     review --plan reviews just those.
  --no-reset         do not reset the worlds first (the pictures may show drifted data)
  --all              shoot every item, also those a fix round would keep (see below)

A new fix round shoots only what can have changed: an item the last reviewed round passed (match
or small) keeps that round's pictures and record when no file under its route's sources (map.json
"sources", "<route>": [globs]) changed since that round was shot. Any changed file outside every
route's sources, or a map with no sources, means every item is shot.

exit: 0 every item was reached; 1 a state was not reached, a page is broken, or the map has
      problems; 2 usage

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { 'base-url': { type: 'string' }, round: { type: 'string' }, only: { type: 'string' }, 'no-reset': { type: 'boolean' }, all: { type: 'boolean' }, prod: { type: 'boolean' } },
      positionals: { max: -1 },
    });
    let baseUrl = values['base-url'];
    if (values.prod && baseUrl) throw new UsageError('give --prod or --base-url, not both');
    if (baseUrl) { try { new URL(baseUrl); } catch { throw new UsageError(`--base-url "${baseUrl}" is not a URL`); } }
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
      const dataOnly = ['data-gaps', 'data-faults'].includes(values.only.trim());
      picks = dataOnly ? dataGapItems(roundInfo(paths, Number(target))) : values.only.split(',').map((x) => x.trim()).filter(Boolean);
      if (!picks.length) { ctx.out.line(`nothing to re-shoot: round ${target} has no ${dataOnly ? 'data fault' : 'item named'}`); return EXIT.PASS; }
    }
    const selected = selectStates(map, picks);
    const { states, unknown } = selected;
    let { items } = selected;
    if (unknown.length) throw new UsageError(`not states (or widths) in the map: ${unknown.join(', ')}`);
    if (!items.length) { ctx.out.fail('no-states', 'no capture-reachable state was chosen'); return EXIT.USAGE; }
    const noun = hasPhone(map) ? 'item' : 'state';

    const round = values.round ?? defaultRound;
    if (round !== WORK_ROUND && !/^\d+$/.test(round)) throw new UsageError('--round is a number or "work"');
    const outDir = roundDir(paths, round);
    const newRound = round !== WORK_ROUND && !existsSync(outDir);
    // W5: a new fix round shoots only what can have changed; the rest keep the last round's record.
    let unchanged = { skip: {}, why: null };
    let prevRound = null;
    if (newRound && values.only === undefined && !positionals.length && !values.all) {
      prevRound = listRounds(paths).filter((n) => n < Number(round) && roundInfo(paths, n).review).pop() ?? null;
      const prevShoot = prevRound ? roundInfo(paths, prevRound).shoot : null;
      if (prevShoot) {
        unchanged = unchangedItems({ map, items, verdicts: latestVerdicts(paths), prevShoot, changed: await changedSince(ctx.git, prevShoot.head ?? null) });
        const n = Object.keys(unchanged.skip).length;
        if (n && n < items.length) {
          items = items.filter((i) => !unchanged.skip[i.key]);
          ctx.out.line(`${n} ${noun}(s) passed round ${prevRound} and none of their route's files changed: they keep round ${prevRound}'s pictures (--all shoots them too)`);
        } else {
          unchanged = { skip: {}, why: unchanged.why };
          if (unchanged.why) ctx.out.line(`every ${noun} is shot: ${unchanged.why}`);
        }
      }
    }
    const profile = await ctx.profile();
    // A1: no --base-url and no --prod: the run's own dev server (delivery serve), started or
    // restarted here when it is not serving, so `shoot --round work <ID>` needs nothing more.
    if (!baseUrl && !values.prod) {
      const served = await ensureServer(ctx, { paths, profile });
      if (served.failure) { ctx.out.fail('server', `${served.failure}; nothing was pictured`); return EXIT.RED; }
      baseUrl = served.url;
      ctx.out.line(`${served.started ? 'started the run\'s dev server' : 'the run\'s dev server serves'} on ${baseUrl} (delivery serve)`);
    }
    const db = await createDataAdapter(ctx);
    const { chromium } = await resolvePlaywright({ repoRoot: ctx.repoRoot, e2eDir: profile.paths?.e2eDir ?? null });

    // W6 (D9): a production build of the page, built while the shoot holds the heavy slot.
    let prod = null;
    if (values.prod) {
      if (!profile.commands?.prodServer) throw new UsageError('--prod needs the profile\'s commands.prodServer: a command that builds and serves a production build on {port} without touching the dev server\'s build folder');
      ctx.out.line('building and starting a production server (commands.prodServer) for the shoot');
      const r = await withShootSlot(ctx, async () => shootProdServer({
        profile, repoRoot: ctx.repoRoot, port: await freePort(), timeoutMs: tunable('capture.prodBuildTimeoutMs'),
        wrap: (cmd) => wrapHeavy(profile, cmd), log: (l) => ctx.out.line(l),
      }));
      if (r.failure) {
        ctx.out.fail('build-failed', `${r.failure}; nothing was pictured, and no round was used`);
        // The error lines that scrolled out of the tail come first, then the tail: a build's route
        // list is printed after the error that broke it.
        if (r.output) ctx.out.line(r.output.split('\n').map((l) => `  ${l}`).join('\n'));
        await ctx.journal({ command: `shoot --round ${round}`, exit: EXIT.RED, counts: { items: items.length, buildFailed: 1 } });
        return EXIT.RED;
      }
      prod = r;
      baseUrl = r.baseUrl;
      ctx.out.line(`production server up on ${baseUrl}`);
    }
    try {
      const broken = await probeServer(ctx, baseUrl);
      if (broken) { ctx.out.fail('server-broken', broken); return EXIT.RED; }
      const seedPlan = await readArtefact(paths, 'seedplan', { optional: true }).catch(() => null);
      const resetting = !values['no-reset'] && Boolean(seedPlan);
      if (!values['no-reset'] && !seedPlan) ctx.out.warn('no seedplan.json: the worlds are not reset before the shoot, so the pictures may show drifted data (delivery seed --plan)');
      const drift = seedPlan ? await driftWarnings(ctx, db, paths, seedPlan, [...new Set(items.map((i) => i.state.reach.world))]) : [];
      let contract = null;
      try { contract = readContract(paths); } catch (err) { ctx.out.warn(`contract.json does not parse (${err.message}); data differences are not looked up`); }
      const swaps = readSwaps(paths);
      // W2: every page the items reach loads before anything is pictured.
      let smoke = null;
      const report = await withShootSlot(ctx, async () => {
        smoke = await smokeGate(ctx, { map, items, baseUrl, profile, paths, db, chromium, inSlot: true });
        if (smoke.failure) return null;
        ctx.out.line(`${values.only !== undefined ? 're-' : ''}shooting ${items.length} ${noun}(s) on ${baseUrl} into ${outDir}`);
        return runShoot({
          map, items, baseUrl, outDir,
          timeZone: profile.testData?.timeZone ?? null,
        tabBar: profile.picture?.tabBar ?? null,
        keepPhoneHeader: Boolean(profile.picture?.keepPhoneHeader),
          themeStorageKey: profile.ui?.themeStorageKey ?? null,
          contract,
          swaps,
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
      // The skipped items' records and pictures are copied from the round before, which holds them
      // (shot there, or copied there in turn); `unchanged.from` names the round that shot them.
      const prevStates = prevRound ? roundInfo(paths, prevRound).shoot?.states ?? {} : {};
      for (const key of Object.keys(unchanged.skip)) {
        const rec = prevStates[key];
        if (!rec) continue;
        const src = roundDir(paths, prevRound);
        for (const f of [...Object.values(roundFiles(key)), `${key}.live.txt`]) if (existsSync(join(src, f))) copyFileSync(join(src, f), join(outDir, f));
        report[key] = { ...rec, unchanged: { from: rec.unchanged?.from ?? prevRound } };
      }
      const why = values.only === undefined ? null : ['data-gaps', 'data-faults'].includes(values.only.trim()) ? 'data-faults' : 'items';
      const head = await ctx.git.revParse('HEAD').catch(() => null);
      const doc = await writeShootJson(outDir, { baseUrl, at: ctx.clock.now().toISOString(), report, reshot: values.only !== undefined, why, head });
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
      const rateLimited = Object.entries(report).filter(([, r]) => r.rateLimited).map(([id]) => id);
      if (rateLimited.length) ctx.out.warn(`rate limited: ${rateLimited.join(', ')} not reached because the app answered HTTP 429 (too many requests), not because of the page; wait for the limit to reset and shoot them again`);
      if (sideways.length) ctx.out.line(`scrolls sideways at phone width: ${sideways.join(', ')}`);
      if (dirty.length) ctx.out.line(resetting ? `these worlds changed: ${dirty.join(', ')} (the next shoot resets them itself)` : `these worlds changed; re-seed them before the next shoot: delivery seed ${dirty.map((w) => `--refresh ${w}`).join(' ')}`);
      const looked = Object.entries(report).filter(([, r]) => r.lookup);
      const gaps = looked.filter(([, r]) => r.lookup.dataFault?.length).map(([k]) => k);
      const musts = looked.filter(([, r]) => r.lookup.must?.length).map(([k]) => k);
      const checked = Object.values(report).reduce((n, r) => n + (r.datacheck?.checked ?? 0), 0);
      if (contract) ctx.out.line(`datacheck: ${checked} traced value(s) looked for; ${gaps.length} item(s) with a data fault, ${musts.length} with a value the world holds and the page does not show`);
      if (gaps.length) ctx.out.line(`data faults (the world lacks what the design shows; a seed-writer fixes the world file, then shoot --only data-faults, before any reviewer): ${gaps.join(', ')}`);
      if (musts.length) ctx.out.line(`must fix found by datacheck (the world holds it, the page does not show it): ${musts.join(', ')}`);
      if (contract && round !== WORK_ROUND) {
        const sources = sourceProblems(contract, selectedColumns(await readQuerySources(ctx.repoRoot)));
        await writeDatacheck(outDir, doc, ctx.clock.now().toISOString(), sources);
        if (sources.length) ctx.out.line(`${sources.length} traced column(s) no query in the code selects (a "no source" question for the founder, in delivery contract --questions): ${sources.slice(0, 5).map((x) => `${x.table}.${x.column}`).join(', ')}`);
      }
      ctx.out.line(`pictures: ${outDir}`);
      if (values.only !== undefined) ctx.out.line(`next: delivery review --plan --round ${round} (it reviews only the ${items.length} re-shot ${noun}(s))`);
      ctx.out.set('shoot', { drift, round, outDir, reached: Object.keys(report).length - notReached.length, notReached, sideways, dirtyWorlds: dirty, states: Object.keys(doc.states).length, reset: resetting, reshot: values.only !== undefined, rateLimited, lookupDataGaps: gaps, lookupMust: musts });
      const exit = notReached.length ? EXIT.RED : EXIT.PASS;
      await ctx.journal({ command: `shoot --round ${round}`, exit, counts: { states: states.length, items: items.length, notReached: notReached.length, lookupDataGaps: gaps.length, lookupMust: musts.length } });
      return exit;
    } finally {
      if (prod) await prod.stop();
    }
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
