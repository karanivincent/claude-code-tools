// delivery smoke: open every route the map reaches, signed in, at each width, and fail at the first
// page that does not load (W2 of the 2026-09-30 improvement plan).

import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { resolvePlaywright } from '../core/playwright.mjs';
import { createDataAdapter } from '../../adapters/data/supabase.mjs';
import { readMap } from '../picture/map.mjs';
import { selectStates, withShootSlot } from '../picture/shoot.mjs';
import { ensureServer } from '../picture/serve.mjs';
import { probeServer, runSmoke, skeletonSelector, smokeFailureLine, smokeTargets, SKELETON_WAIT_MS } from '../picture/smoke.mjs';

export default defineCommand({
  name: 'smoke',
  summary: 'Open every route the map reaches, signed in, at each width; fail at the first that does not load',
  usage: `usage: delivery smoke [--base-url <url>] [<ITEM>|!<ITEM>]...

Picture mode's page-load gate. Opens each distinct route in map.json (the landing route and every
route a state's steps go to), signed in as a fixture user who reaches it, at each width the map
declares. It stops at the first page that:

  - answers with a status of 500 or more;
  - shows the Next.js error overlay (or Next's "Application error" text);
  - serves a replaced build output (a production build ran in the worktree while the dev server
    served it: "Cannot find module", missing chunks);
  - still shows a loading placeholder 10 seconds after it loaded: the profile's smoke.skeleton
    selectors, [aria-busy=true] and [data-skeleton] when it names none.

delivery shoot runs this first and pictures nothing when it fails. A builder or a fixer runs it
before reporting done. It reads the worlds as they are and changes no data.

options:
  --base-url <url>   the running app (a preview); default: the run's dev server (delivery serve --ensure)
  <ITEM>             only the routes these items reach (as shoot takes them); !<ITEM> leaves one out

exit: 0 every page loads; 1 a page is broken, or the dev server could not be started; 2 usage (no map)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { 'base-url': { type: 'string' } },
      positionals: { max: -1 },
    });
    let baseUrl = values['base-url'];
    if (baseUrl) { try { new URL(baseUrl); } catch { throw new UsageError(`--base-url "${baseUrl}" is not a URL`); } }
    const paths = ctx.requirePaths();
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json; run delivery map first'); return EXIT.USAGE; }
    const { items, unknown } = selectStates(map, positionals);
    if (unknown.length) throw new UsageError(`not states (or widths) in the map: ${unknown.join(', ')}`);
    const profile = await ctx.profile();
    // A1: no --base-url: the run's own dev server (delivery serve --ensure).
    if (!baseUrl) {
      const served = await ensureServer(ctx, { paths, profile });
      if (served.failure) { ctx.out.fail('server', served.failure); return EXIT.RED; }
      baseUrl = served.url;
    }

    const broken = await probeServer(ctx, baseUrl);
    if (broken) {
      ctx.out.fail('server-broken', broken);
      ctx.out.set('smoke', { ok: false, failure: { route: '/', why: broken }, checked: [] });
      await ctx.journal({ command: 'smoke', exit: EXIT.RED, counts: { checked: 0 } });
      return EXIT.RED;
    }
    const r = await smokeGate(ctx, { map, items, baseUrl, profile, paths });
    const exit = r.failure ? EXIT.RED : EXIT.PASS;
    if (!r.failure) ctx.out.line(`every page loads: ${r.checked.length} route(s) and width(s) on ${baseUrl}`);
    ctx.out.set('smoke', { ok: !r.failure, failure: r.failure, checked: r.checked });
    await ctx.journal({ command: 'smoke', exit, counts: { checked: r.checked.length, targets: smokeTargets(map, items).length } });
    return exit;
  },
});

/**
 * Run the smoke check for a command (smoke itself, and shoot before and after it pictures): sign-in
 * through the data adapter, the repo's Playwright, the profile's skeleton selector, inside a slot
 * of the machine-wide slot file (unless the caller holds one: inSlot). Prints each page, and the
 * failure unless quiet.
 * @returns {Promise<{ checked: object[], failure: object|null }>}
 */
export async function smokeGate(ctx, { map, items, baseUrl, profile, paths, db = null, chromium = null, inSlot = false, quiet = false }) {
  db ??= await createDataAdapter(ctx);
  chromium ??= (await resolvePlaywright({ repoRoot: ctx.repoRoot, e2eDir: profile.paths?.e2eDir ?? null })).chromium;
  const go = () => runSmoke({
    map, items, baseUrl, chromium,
    sessionsDir: join(paths.runDir, 'sessions'),
    magicLinkPath: profile.auth?.magicLinkPath ?? '/auth/confirm',
    auth: { signInHash: (email) => db.signInHash(email) },
    timeZone: profile.testData?.timeZone ?? null,
    selector: skeletonSelector(profile),
    waitMs: SKELETON_WAIT_MS,
    log: (l) => ctx.out.line(l),
  });
  const r = inSlot ? await go() : await withShootSlot(ctx, go);
  if (r.failure && !quiet) ctx.out.fail('page-broken', smokeFailureLine(r.failure, baseUrl));
  return r;
}
