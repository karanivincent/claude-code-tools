// The only way the CLI starts an external process. Tests pass a stub (tests/helpers/runner-stub.mjs)
// so no real gh, git, database or build command ever runs from a unit test. A subprocess test of
// bin/delivery.mjs can set DELIVERY_RUNNER_STUB to an ESM module whose default export is the stub.

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ cmd: string, args: string[], cwd?: string, env?: Record<string, string>, input?: string|Buffer,
 *             shell?: boolean, timeoutMs?: number, encoding?: 'utf8'|'buffer' }} RunCall
 * @typedef {{ code: number, stdout: any, stderr: string, signal?: string|null, timedOut?: boolean }} RunResult
 *   stdout is a string, or a Buffer when encoding is "buffer"
 * @typedef {(call: RunCall) => RunResult|undefined|Promise<RunResult|undefined>} RunStub
 *   undefined means "not mine": the stub runner then refuses the call
 * @typedef {object} Runner
 * @property {(cmd: string, args?: string[], opts?: Omit<RunCall, 'cmd'|'args'>) => Promise<RunResult>} run
 *   never throws for a non-zero exit; a missing binary is code 127
 * @property {(command: string, opts?: Omit<RunCall, 'cmd'|'args'>) => Promise<RunResult>} sh
 *   a complete profile command string, run with /bin/sh -c
 * @property {RunCall[]} calls every call made, in order (tests assert on it)
 * @property {boolean} stubbed
 */

/**
 * @param {{ stub?: RunStub, cwd?: string, env?: Record<string, string> }} [opts]
 * @returns {Runner}
 */
export function createRunner(opts = {}) {
  const calls = [];
  const baseCwd = opts.cwd;
  const baseEnv = opts.env;
  async function exec(call) {
    const full = { ...call, cwd: call.cwd ?? baseCwd, args: call.args ?? [] };
    calls.push(full);
    if (opts.stub) {
      const r = await opts.stub(full);
      if (r === undefined) throw new Error(`runner stub has no answer for: ${describeCall(full)}`);
      return { code: 0, stdout: '', stderr: '', ...r };
    }
    return spawnCall(full, baseEnv);
  }
  return {
    calls,
    stubbed: Boolean(opts.stub),
    run: (cmd, args = [], o = {}) => exec({ ...o, cmd, args }),
    sh: (command, o = {}) => exec({ ...o, cmd: '/bin/sh', args: ['-c', command], shell: true }),
  };
}

/** "git rev-parse HEAD" style text for messages and stub matching. */
export function describeCall(call) {
  if (call.shell) return call.args[1];
  return [call.cmd, ...(call.args ?? [])].map((a) => (/^[A-Za-z0-9_./:=@%+,-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
}

function spawnCall(call, baseEnv) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...(baseEnv ?? {}), ...(call.env ?? {}) };
    let child;
    try {
      child = spawn(call.cmd, call.args, { cwd: call.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: 127, stdout: call.encoding === 'buffer' ? Buffer.alloc(0) : '', stderr: String(err.message) });
      return;
    }
    const out = [];
    const err = [];
    let timedOut = false;
    let timer = null;
    if (call.timeoutMs) {
      timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, call.timeoutMs);
    }
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: e.code === 'ENOENT' ? 127 : 1, stdout: call.encoding === 'buffer' ? Buffer.alloc(0) : '', stderr: String(e.message) });
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      const stdoutBuf = Buffer.concat(out);
      resolve({
        code: timedOut ? 124 : code ?? 1,
        signal,
        timedOut,
        stdout: call.encoding === 'buffer' ? stdoutBuf : stdoutBuf.toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    if (call.input !== undefined) child.stdin.end(call.input);
    else child.stdin.end();
  });
}

/**
 * The runner the CLI uses: real, unless DELIVERY_RUNNER_STUB names a stub module (tests only).
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, warn?: (m: string) => void }} [opts]
 * @returns {Promise<Runner>}
 */
export async function defaultRunner(opts = {}) {
  const env = opts.env ?? process.env;
  const stubPath = env.DELIVERY_RUNNER_STUB;
  if (!stubPath) return createRunner({ cwd: opts.cwd });
  const mod = await import(pathToFileURL(stubPath).href);
  opts.warn?.(`external commands are stubbed by ${stubPath}`);
  return createRunner({ cwd: opts.cwd, stub: mod.default });
}
