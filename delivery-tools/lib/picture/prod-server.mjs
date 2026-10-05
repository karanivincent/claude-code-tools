// W6 (D9): the shoot pictures a production build, not the dev server. A dev server compiles each
// route on its first visit and serves slowly; a production build answers at once. The profile's
// commands.prodServer builds and serves one on {port}, in a build folder of its own, so the dev
// server the builder uses keeps running untouched (the consuming repo sets that folder up). A build
// that fails stops the shoot with the build's error lines and last lines: another page-load gate.
//
// The build goes through the profile's commands.heavy like every other build (2026-10-04: a shoot
// built outside the machine's heavy slots, left a half-written build folder with no
// prerender-manifest.json, and its log showed only the route list). With commands.prodServerBuild
// the build runs on its own first, wrapped in commands.heavy, and commands.prodServer only serves;
// without it the whole of commands.prodServer is wrapped. The build folder (picture.prodDistDir, or
// the one the command names with `cd <dir>` and NEXT_DIST_DIR=<name>) is removed before the build,
// so a build interrupted earlier cannot leave files the server then trips on.

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fillCommand } from '../core/profile.mjs';

const TAIL_LINES = 30;

/**
 * A2: the environment of the production build and server: the profile's commands.serverEnv, then
 * NODE_ENV=production over everything. A NODE_ENV that .env loading put into process.env (the main
 * checkout's development value) broke three shoot builds.
 * @param {object|undefined} extra commands.serverEnv and the like
 */
export function prodEnv(extra) {
  return { ...process.env, ...(extra ?? {}), NODE_ENV: 'production' };
}

/**
 * A2: one warning when the dev server command gives itself variables (leading VAR=value) that the
 * production server command does not, and the profile has no commands.serverEnv to carry them: the
 * shoot then pictures an app configured differently from the one the builder saw (a missing
 * VERCEL_ENV=development put a shoot on a public rate limit). Null when there is nothing to say.
 * @param {object} profile
 * @param {(cmd: string) => Record<string, string>} assignments
 */
export function prodEnvWarning(profile, assignments) {
  const c = profile?.commands ?? {};
  if (c.serverEnv) return null;
  const dev = assignments(c.devServer);
  const prodText = `${c.prodServerBuild ?? ''} ${c.prodServer ?? ''}`;
  const missing = Object.keys(dev).filter((k) => !new RegExp(`(^|[\\s;&|])${k}=`).test(prodText));
  if (!missing.length) return null;
  return `the dev server command sets ${missing.map((k) => `${k}=${dev[k]}`).join(', ')}, and the production server does not: add it to the profile's commands.serverEnv, or the shoot pictures an app configured differently`;
}
const ERROR_LINES = 20;
const ERROR_LINE = /\b(error|errors|failed|failure|cannot|ENOENT|EACCES|ELIFECYCLE|panic)\b|⨯|✗/i;

/**
 * Collects a process's output: the last TAIL_LINES lines, plus up to ERROR_LINES error-looking
 * lines that scrolled out of that tail (a build prints its route list after the error that broke
 * it, and the tail alone then shows only the routes).
 */
export function outputKeeper() {
  const tail = [];
  const errors = [];
  let n = 0;
  return {
    keep(buf) {
      for (const l of String(buf).split('\n')) {
        if (!l.trim()) continue;
        tail.push({ i: n, l });
        if (ERROR_LINE.test(l) && errors.length < ERROR_LINES) errors.push({ i: n, l });
        n++;
        if (tail.length > TAIL_LINES) tail.shift();
      }
    },
    text() {
      const first = tail.length ? tail[0].i : n;
      const early = errors.filter((e) => e.i < first).map((e) => e.l);
      return [...early, ...(early.length ? ['...'] : []), ...tail.map((t) => t.l)].join('\n');
    },
  };
}

/**
 * The build folder a production-server command writes, relative to the repo: `cd <dir>` joined
 * with NEXT_DIST_DIR=<name>, or null when the command names no NEXT_DIST_DIR.
 * @param {string} command
 */
export function inferDistDir(command) {
  const dist = /\bNEXT_DIST_DIR=(['"]?)([^\s'"]+)\1/.exec(String(command ?? ''));
  if (!dist) return null;
  const cd = /(?:^|&&|;)\s*cd\s+(['"]?)([^\s'"&;]+)\1/.exec(String(command));
  return cd ? join(cd[2], dist[2]) : dist[2];
}

/**
 * Remove the build folder before a build. Refuses a folder outside the repo and the repo itself;
 * no folder named, nothing removed. Returns the folder removed (relative), or null.
 * @param {string} repoRoot
 * @param {string|null|undefined} dir relative to repoRoot
 */
export async function clearDistDir(repoRoot, dir, rmFn = rm) {
  if (!dir) return null;
  const abs = resolve(repoRoot, dir);
  const rel = relative(repoRoot, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`the build folder ${dir} is not inside the repo; nothing was removed or built`);
  await rmFn(abs, { recursive: true, force: true });
  return rel;
}

/**
 * Run a command to its end (the build half). Resolves { ok: true, output } on exit 0, otherwise
 * { failure, output }.
 * @param {{ command: string, cwd: string, timeoutMs: number, env?: object, spawnFn?: typeof spawn }} o
 */
export function runBuild(o) {
  const run = o.spawnFn ?? spawn;
  const out = outputKeeper();
  return new Promise((done) => {
    const child = run('sh', ['-c', o.command], { cwd: o.cwd, env: prodEnv(o.env), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', out.keep);
    child.stderr?.on('data', out.keep);
    let settled = false;
    let timer = null;
    const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); done(r); } };
    timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
      finish({ failure: `the production build did not finish within ${Math.round(o.timeoutMs / 1000)} s: ${o.command}`, output: out.text() });
    }, o.timeoutMs);
    timer.unref?.();
    child.on('error', (err) => { out.keep(err.message); finish({ failure: `the production build could not start: ${o.command}`, output: out.text() }); });
    child.on('exit', (code, signal) => {
      if (code === 0) finish({ ok: true, output: out.text() });
      else finish({ failure: `the production build failed (${code ?? signal}): ${o.command}`, output: out.text() });
    });
  });
}

/**
 * Start commands.prodServer on a port and wait until it answers below 500. Resolves
 * { baseUrl, stop } once it serves, or { failure } when the command exits first or the wait times
 * out. `wrap` turns the filled command into the one run (commands.heavy). `spawnFn` and `fetchFn`
 * are injectable for tests.
 * @param {{ command: string, port: number, cwd: string, timeoutMs: number, host?: string, env?: object (added, then NODE_ENV=production),
 *           wrap?: (cmd: string) => string,
 *           spawnFn?: typeof spawn, fetchFn?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} o
 * @returns {Promise<{ baseUrl: string, stop: () => Promise<void>, output: () => string } | { failure: string, output: string }>}
 */
export async function startProdServer(o) {
  const host = o.host ?? '127.0.0.1';
  const baseUrl = `http://${host}:${o.port}`;
  const filled = fillCommand(o.command, { port: o.port });
  const cmd = o.wrap ? o.wrap(filled) : filled;
  const run = o.spawnFn ?? spawn;
  const fetchFn = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const out = outputKeeper();
  const child = run('sh', ['-c', cmd], { cwd: o.cwd, env: { ...prodEnv(o.env), PORT: String(o.port) }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', out.keep);
  child.stderr?.on('data', out.keep);
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  child.on('error', (err) => { exited = { code: -1, signal: null }; out.keep(err.message); });
  const stop = async () => {
    if (exited) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } }
    for (let i = 0; i < 50 && !exited; i++) await sleep(100);
    if (!exited) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }
  };
  const start = now();
  for (;;) {
    if (exited) return { failure: `the production build or server exited (${exited.code ?? exited.signal}) before it served: ${cmd}`, output: out.text() };
    try {
      const res = await fetchFn(baseUrl, { redirect: 'manual' });
      if (res.status < 500) return { baseUrl, stop, output: () => out.text() };
    } catch { /* not listening yet */ }
    if (now() - start > o.timeoutMs) {
      await stop();
      return { failure: `the production server did not answer on ${baseUrl} within ${Math.round(o.timeoutMs / 1000)} s: ${cmd}`, output: out.text() };
    }
    await sleep(1000);
  }
}

/**
 * The shoot's production server, end to end: clear the build folder, build through commands.heavy
 * (commands.prodServerBuild on its own when set), then serve. Same result shape as startProdServer.
 * @param {{ profile: object, repoRoot: string, port: number, timeoutMs: number, wrap: (cmd: string) => string,
 *           log?: (line: string) => void, rmFn?: typeof rm, spawnFn?: typeof spawn, fetchFn?: typeof fetch,
 *           sleep?: (ms: number) => Promise<void>, now?: () => number }} o
 */
export async function shootProdServer(o) {
  const c = o.profile.commands ?? {};
  const distDir = o.profile.picture?.prodDistDir ?? inferDistDir(c.prodServerBuild ?? c.prodServer);
  let cleared;
  try { cleared = await clearDistDir(o.repoRoot, distDir, o.rmFn); } catch (err) { return { failure: err.message, output: '' }; }
  if (cleared) o.log?.(`removed the previous build folder ${cleared}`);
  const serve = { command: c.prodServer, port: o.port, cwd: o.repoRoot, timeoutMs: o.timeoutMs, env: c.serverEnv, spawnFn: o.spawnFn, fetchFn: o.fetchFn, sleep: o.sleep, now: o.now };
  if (!c.prodServerBuild) return startProdServer({ ...serve, wrap: o.wrap });
  const b = await runBuild({ command: o.wrap(c.prodServerBuild), cwd: o.repoRoot, timeoutMs: o.timeoutMs, env: c.serverEnv, spawnFn: o.spawnFn });
  if (b.failure) return b;
  return startProdServer(serve);
}
