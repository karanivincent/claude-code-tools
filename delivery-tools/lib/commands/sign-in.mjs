// delivery sign-in: print a one-time sign-in link as one of a world's fixture users.

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { createDataAdapter } from '../../adapters/data/supabase.mjs';
import { readMap } from '../picture/map.mjs';
import { signInUrl, userFor } from '../picture/shoot.mjs';
import { existsSync } from 'node:fs';

export default defineCommand({
  name: 'sign-in',
  summary: 'Print a one-time sign-in link as a world\'s fixture user, for a person to try the page',
  usage: `usage: delivery sign-in <world> --base-url <url> [--role <role>] [--next <path>]

Prints a link that signs whoever opens it in as the world's fixture user and lands on the page.
The world's users come from map.json (or, in full mode, plan.json). The link is minted on the test
project only, and only for an address matching the safety file's fixtureUserPattern, so it can
never open a real person's account. It works once and expires after about an hour: a link
preview or a second click spends it, and running this again gives a new one.

Re-seed the world first (delivery seed --refresh <world>) when its data should look as designed:
a capture or an earlier visit may have changed it.

options:
  --base-url <url>   the deployment to sign in to (a preview, or a local dev server)
  --role <role>      which of the world's users (default: admin)
  --next <path>      where to land (default: the map's route)

exit: 0 a link was printed; 2 usage, an unknown world or role, or a refused address

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { 'base-url': { type: 'string' }, role: { type: 'string' }, next: { type: 'string' } },
      positionals: { min: 1, max: 1 },
    });
    const [world] = positionals;
    const baseUrl = values['base-url'];
    if (!baseUrl) throw new UsageError('--base-url is required: the deployment to sign in to');
    try { new URL(baseUrl); } catch { throw new UsageError(`--base-url "${baseUrl}" is not a URL`); }
    const role = values.role ?? 'admin';

    const paths = ctx.requirePaths();
    const map = readMap(paths);
    const worlds = map ? { worlds: map.worlds ?? [] } : existsSync(paths.plan) ? await readArtefact(paths, 'plan') : null;
    if (!worlds) { ctx.out.fail('no-worlds', 'there is no map.json or plan.json to read the worlds from'); return EXIT.USAGE; }
    const known = (worlds.worlds ?? []).map((w) => w.id);
    if (!known.includes(world)) throw new UsageError(`"${world}" is not a world; the worlds are: ${known.join(', ')}`);
    const user = userFor(worlds, world, role);
    if (!user) {
      const roles = worlds.worlds.find((w) => w.id === world).users?.map((u) => u.role) ?? [];
      throw new UsageError(`world ${world} has no ${role} user; its roles are: ${roles.join(', ')}`);
    }

    const next = values.next ?? map?.route ?? '/';
    if (!next.startsWith('/')) throw new UsageError('--next is a path on the site, starting with /');
    const profile = await ctx.profile();
    const db = await createDataAdapter(ctx);
    const hash = await db.signInHash(user.email);
    const url = signInUrl(baseUrl, profile.auth?.magicLinkPath ?? '/auth/confirm', hash, next);

    ctx.out.line(`signs in as ${user.name ?? user.email} (${role}, world ${world}), lands on ${next}`);
    ctx.out.line(url);
    ctx.out.line('works once, expires in about an hour');
    ctx.out.set('signIn', { world, role, email: user.email, next, url });
    return EXIT.PASS;
  },
});
