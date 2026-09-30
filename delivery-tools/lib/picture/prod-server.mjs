// W6 (D9): the shoot pictures a production build, not the dev server. A dev server compiles each
// route on its first visit and serves slowly; a production build answers at once. The profile's
// commands.prodServer builds and serves one on {port}, in a build folder of its own, so the dev
// server the builder uses keeps running untouched (the consuming repo sets that folder up). A build
// that fails stops the shoot with the build's last lines: another page-load gate. The shoot holds
// the machine's heavy slot while this runs, so the build is counted as heavy work.

import { spawn } from 'node:child_process';
import { fillCommand } from '../core/profile.mjs';

const TAIL_LINES = 30;

/**
 * Start commands.prodServer on a port and wait until it answers below 500. Resolves
 * { baseUrl, stop } once it serves, or { failure } when the command exits first or the wait times
 * out. `spawnFn` and `fetchFn` are injectable for tests.
 * @param {{ command: string, port: number, cwd: string, timeoutMs: number, host?: string, env?: object,
 *           spawnFn?: typeof spawn, fetchFn?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} o
 * @returns {Promise<{ baseUrl: string, stop: () => Promise<void>, output: () => string } | { failure: string, output: string }>}
 */
export async function startProdServer(o) {
  const host = o.host ?? '127.0.0.1';
  const baseUrl = `http://${host}:${o.port}`;
  const cmd = fillCommand(o.command, { port: o.port });
  const run = o.spawnFn ?? spawn;
  const fetchFn = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const lines = [];
  const keep = (buf) => { for (const l of String(buf).split('\n')) if (l.trim()) { lines.push(l); if (lines.length > TAIL_LINES) lines.shift(); } };
  const child = run('sh', ['-c', cmd], { cwd: o.cwd, env: { ...process.env, ...(o.env ?? {}), PORT: String(o.port) }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  child.on('error', (err) => { exited = { code: -1, signal: null }; keep(err.message); });
  const stop = async () => {
    if (exited) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } }
    for (let i = 0; i < 50 && !exited; i++) await sleep(100);
    if (!exited) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }
  };
  const start = now();
  for (;;) {
    if (exited) return { failure: `the production build or server exited (${exited.code ?? exited.signal}) before it served: ${cmd}`, output: lines.join('\n') };
    try {
      const res = await fetchFn(baseUrl, { redirect: 'manual' });
      if (res.status < 500) return { baseUrl, stop, output: () => lines.join('\n') };
    } catch { /* not listening yet */ }
    if (now() - start > o.timeoutMs) {
      await stop();
      return { failure: `the production server did not answer on ${baseUrl} within ${Math.round(o.timeoutMs / 1000)} s: ${cmd}`, output: lines.join('\n') };
    }
    await sleep(1000);
  }
}
