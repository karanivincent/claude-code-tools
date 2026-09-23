#!/usr/bin/env node
// delivery <command> [<sub>] [options]: dispatches to lib/commands/<command>.mjs or
// lib/commands/<command>-<sub>.mjs. Verifies MANIFEST.sha256 first when it exists.

import { extractGlobalFlags } from '../lib/core/args.mjs';
import { createOutput } from '../lib/core/output.mjs';
import { EXIT } from '../lib/core/exit.mjs';
import { helpText, resolveCommand } from '../lib/core/command.mjs';
import { verifyManifest } from '../lib/core/manifest.mjs';
import { createCtx, PLUGIN_ROOT, pluginVersion } from '../lib/core/ctx.mjs';
import { defaultRunner } from '../lib/core/run.mjs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string[]} argv
 * @param {{ stdout?: any, stderr?: any, env?: object, cwd?: string, runner?: any, gh?: any, clock?: any,
 *           pluginRoot?: string, commandsDir?: string }} [io] test seams; the CLI passes none
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let out = createOutput({ json: argv.includes('--json'), stdout, stderr });
  try {
    const { global, rest } = extractGlobalFlags(argv);
    out = createOutput({ json: global.json, stdout, stderr });

    const manifest = await verifyManifest(io.pluginRoot ?? PLUGIN_ROOT);
    if (!manifest.ok) {
      for (const m of manifest.mismatches) out.fail('manifest', `${m.file}: ${m.reason}`);
      out.fail('manifest', 'plugin files differ from MANIFEST.sha256; reinstall the plugin');
      return out.finish(EXIT.INCONSISTENT);
    }

    if (rest.length === 0) {
      if (global.help) { out.line(await helpText(io.commandsDir)); return out.finish(EXIT.PASS); }
      out.fail('usage', 'no command given; run "delivery --help"');
      return out.finish(EXIT.USAGE);
    }

    const { module, rest: args } = await resolveCommand(rest, io.commandsDir);
    if (global.help) { out.line(module.usage); return out.finish(EXIT.PASS); }

    const runner = io.runner ?? (await defaultRunner({ env: io.env ?? process.env, warn: (m) => out.warn(m) }));
    const ctx = await createCtx({
      cwd: io.cwd, env: io.env, flags: global, runner, out, gh: io.gh, clock: io.clock,
      cli: { version: pluginVersion(), manifestSha256: manifest.manifestSha256 },
    });
    const code = await module.run(ctx, args);
    return out.finish(typeof code === 'number' ? code : out.failures().length ? EXIT.RED : EXIT.PASS);
  } catch (err) {
    if (err && typeof err.exit === 'number') {
      for (const f of err.failures ?? [{ code: err.code, message: err.message }]) out.fail(f.code, f.message);
      return out.finish(err.exit);
    }
    out.fail('internal', err?.message ?? String(err));
    if ((io.env ?? process.env).DELIVERY_DEBUG) stderr.write(`${err?.stack ?? err}\n`);
    return out.finish(EXIT.RED);
  }
}

function invokedDirectly() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (invokedDirectly()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
