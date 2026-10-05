// delivery serve: the run's own dev server, kept outside any tool call. A dev server started with a
// tool call's run_in_background dies when the tool's time limit ends (two hours), mid-run; started
// here it runs in a process group and session of its own, its output in .delivery/<f>/server.log,
// and .delivery/<f>/server.json records { pid, port, url, startedAt }. `ensure` asks it once and
// restarts it when it is gone or answers 500, so every shoot and every agent can call it freely.
// The port is a free one the first time and the same one after that.

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillCommand } from '../core/profile.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';
import { freePort } from '../capture/run.mjs';
import { probeServer } from './smoke.mjs';
import { tunable } from '../retro/tunables.mjs';

export const SERVE_HOST = '127.0.0.1';

/** @param {{ runDir: string }} paths */
export function serverJsonPath(paths) { return join(paths.runDir, 'server.json'); }
/** @param {{ runDir: string }} paths */
export function serverLogPath(paths) { return join(paths.runDir, 'server.log'); }

/** The recorded server, or null. */
export function readServer(paths) {
  try { return JSON.parse(readFileSync(serverJsonPath(paths), 'utf8')); } catch { return null; }
}

/** Whether a process with this pid is alive (signal 0 only asks). */
export function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
}

/**
 * Leading `VAR=value` assignments of a shell command, after an optional `cd <dir> &&`: the
 * environment the command gives itself. `VERCEL_ENV=development pnpm dev` gives { VERCEL_ENV: 'development' }.
 * @param {string} command
 * @returns {Record<string, string>}
 */
export function leadingAssignments(command) {
  let rest = String(command ?? '').trim().replace(/^cd\s+\S+\s*&&\s*/, '');
  const out = {};
  for (;;) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=("([^"]*)"|'([^']*)'|(\S*))\s+/.exec(rest);
    if (!m) break;
    out[m[1]] = m[3] ?? m[4] ?? m[5] ?? '';
    rest = rest.slice(m[0].length);
  }
  return out;
}

/**
 * Is the recorded server serving? Not when its process is gone, when nothing answers at its URL,
 * or when it answers 500 or its build output is replaced (probeServer).
 * @returns {Promise<{ ok: boolean, why: string|null }>}
 */
export async function serverHealth(ctx, rec, { kill = process.kill } = {}) {
  if (!rec?.pid || !rec?.url) return { ok: false, why: 'no dev server is recorded' };
  if (!pidAlive(rec.pid, kill)) return { ok: false, why: `its process ${rec.pid} is gone` };
  try {
    await ctx.fetch(rec.url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  } catch {
    return { ok: false, why: `nothing answers at ${rec.url}` };
  }
  const broken = await probeServer(ctx, rec.url);
  return broken ? { ok: false, why: broken } : { ok: true, why: null };
}

/** Stop a recorded server's whole process group: TERM, then KILL after five seconds. */
export async function stopServer(rec, { kill = process.kill, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!rec?.pid || !pidAlive(rec.pid, kill)) return false;
  const signal = (s) => { try { kill(-rec.pid, s); } catch { try { kill(rec.pid, s); } catch { /* gone */ } } };
  signal('SIGTERM');
  for (let i = 0; i < 50 && pidAlive(rec.pid, kill); i++) await sleep(100);
  if (pidAlive(rec.pid, kill)) signal('SIGKILL');
  return true;
}

/**
 * Start the profile's commands.devServer detached: its own process group and session (so the tool
 * call that ran `delivery serve` can end, or be killed, without it), stdin closed, output appended
 * to server.log. commands.serverEnv is added to the environment. Returns the child (unref'd).
 */
export function spawnDevServer({ profile, port, cwd, logFile, spawnFn = spawn }) {
  const command = fillCommand(profile.commands.devServer, { port, dir: cwd });
  mkdirSync(join(logFile, '..'), { recursive: true });
  const fd = openSync(logFile, 'a');
  try {
    const child = spawnFn('sh', ['-c', command], {
      cwd, detached: true, stdio: ['ignore', fd, fd],
      env: { ...process.env, ...(profile.commands.serverEnv ?? {}), PORT: String(port) },
    });
    child.unref?.();
    return { child, command };
  } finally { closeSync(fd); }
}

/**
 * The run's dev server, serving: reuse the recorded one when it answers, else stop what is left of
 * it and start the profile's commands.devServer on the recorded port (a free one the first time),
 * and wait until it answers below 500.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ paths: object, profile: object, spawnFn?: typeof spawn, kill?: typeof process.kill, timeoutMs?: number, now?: () => number }} o
 * @returns {Promise<{ url: string, port: number, pid: number, started: boolean, why: string|null } | { failure: string }>}
 */
export async function ensureServer(ctx, o) {
  const { paths, profile } = o;
  const kill = o.kill ?? process.kill;
  const now = o.now ?? (() => Date.now());
  const timeoutMs = o.timeoutMs ?? tunable('capture.devServerTimeoutMs');
  const rec = readServer(paths);
  const health = rec?.pid ? await serverHealth(ctx, rec, { kill }) : { ok: false, why: null };
  if (health.ok) return { url: rec.url, port: rec.port, pid: rec.pid, started: false, why: null };
  if (!profile.commands?.devServer) return { failure: 'the profile has no commands.devServer to start' };
  if (rec?.pid) await stopServer(rec, { kill, sleep: ctx.sleep });
  const port = Number.isInteger(rec?.port) ? rec.port : await freePort();
  const url = `http://${SERVE_HOST}:${port}`;
  const { child, command } = spawnDevServer({ profile, port, cwd: ctx.repoRoot, logFile: serverLogPath(paths), spawnFn: o.spawnFn });
  let exited = null;
  child.on?.('exit', (code, signal) => { exited = { code, signal }; });
  child.on?.('error', (err) => { exited = { code: -1, signal: err.message }; });
  const record = { schemaVersion: 1, pid: child.pid, port, url, startedAt: ctx.clock.now().toISOString(), command };
  await writeJsonAtomic(serverJsonPath(paths), record);
  const start = now();
  for (;;) {
    if (exited) return { failure: `the dev server exited (${exited.code ?? exited.signal}) before it served: ${command}; its output is in ${serverLogPath(paths)}` };
    try {
      const res = await ctx.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if (res.status < 500) break;
    } catch { /* not listening yet */ }
    if (now() - start > timeoutMs) {
      await stopServer(record, { kill, sleep: ctx.sleep });
      return { failure: `the dev server did not answer on ${url} within ${Math.round(timeoutMs / 1000)} s: ${command}; its output is in ${serverLogPath(paths)}` };
    }
    await ctx.sleep(1000);
  }
  return { url, port, pid: child.pid, started: true, why: rec?.pid ? health.why : null };
}
