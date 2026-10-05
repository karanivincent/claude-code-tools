// delivery serve: keep the run's dev server running outside any tool call (picture mode).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';
import { ensureServer, readServer, serverHealth, serverJsonPath, serverLogPath, stopServer } from '../picture/serve.mjs';

export default defineCommand({
  name: 'serve',
  summary: "Keep the run's dev server running on its own, outside any tool call",
  usage: `usage: delivery serve --ensure | --stop | --status

The run's dev server (the profile's commands.devServer, with commands.serverEnv added to its
environment), started detached: its own process group and session, its output in
.delivery/<f>/server.log. A dev server started with a tool call's run_in_background dies when the
tool's time limit ends; this one runs until delivery serve --stop. .delivery/<f>/server.json
records { pid, port, url, startedAt }. {port} is a free port the first time, and the same port after.

options:
  --ensure   make sure it serves: reuse the recorded server when it answers, else restart it (its
             process is gone, nothing answers, or it answers 500 or lost its build output). Prints
             the URL. Safe to run any number of times; delivery shoot runs it itself.
  --stop     stop it (the whole process group). Run it before the full CI chain: a production
             build and a dev server share the build folder.
  --status   print the recorded server and whether it serves

exit: 0 it serves (or was stopped); 1 it could not be started, or (--status) it does not serve;
      2 usage

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { ensure: { type: 'boolean' }, stop: { type: 'boolean' }, status: { type: 'boolean' } } });
    const picked = ['ensure', 'stop', 'status'].filter((k) => values[k]);
    if (picked.length !== 1) throw new UsageError('give exactly one of --ensure, --stop or --status');
    const paths = ctx.requirePaths();
    const rec = readServer(paths);

    if (values.status) {
      if (!rec?.pid) {
        ctx.out.line(rec?.port ? `not running (stopped; it starts again on port ${rec.port})` : 'not running: delivery serve --ensure starts it');
        ctx.out.set('server', { running: false, port: rec?.port ?? null });
        return EXIT.RED;
      }
      const h = await serverHealth(ctx, rec);
      ctx.out.line(h.ok ? `serving on ${rec.url} (pid ${rec.pid}, since ${rec.startedAt}); output in ${serverLogPath(paths)}` : `not serving: ${h.why}; delivery serve --ensure restarts it`);
      ctx.out.set('server', { running: h.ok, ...rec, why: h.why });
      return h.ok ? EXIT.PASS : EXIT.RED;
    }

    if (values.stop) {
      const stopped = await stopServer(rec, { sleep: ctx.sleep });
      if (rec) await writeJsonAtomic(serverJsonPath(paths), { ...rec, pid: null, stoppedAt: ctx.clock.now().toISOString() });
      ctx.out.line(stopped ? `stopped the dev server (pid ${rec.pid})` : 'no dev server was running');
      ctx.out.set('server', { running: false, port: rec?.port ?? null });
      await ctx.journal({ command: 'serve --stop', exit: EXIT.PASS, counts: { stopped: stopped ? 1 : 0 } });
      return EXIT.PASS;
    }

    const profile = await ctx.profile();
    const r = await ensureServer(ctx, { paths, profile });
    if (r.failure) {
      ctx.out.fail('server', r.failure);
      await ctx.journal({ command: 'serve --ensure', exit: EXIT.RED, counts: { started: 0 } });
      return EXIT.RED;
    }
    ctx.out.line(r.started ? `started the dev server on ${r.url} (pid ${r.pid})${r.why ? `; the last one was not serving: ${r.why}` : ''}` : `the dev server serves on ${r.url} (pid ${r.pid})`);
    ctx.out.set('server', { running: true, url: r.url, port: r.port, pid: r.pid, started: r.started });
    if (r.started) await ctx.journal({ command: 'serve --ensure', exit: EXIT.PASS, counts: { started: 1, restarted: r.why ? 1 : 0 } });
    return EXIT.PASS;
  },
});
