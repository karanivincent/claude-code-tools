// Running the hook scripts the way Claude Code does: the payload on stdin, the plugin root in
// CLAUDE_PLUGIN_ROOT, wall-clock time measured around the whole process.

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HOOKS = join(ROOT, 'hooks');
export const STUB = join(ROOT, 'tests', 'fixtures', 'run', 'runner-stub.mjs');

/**
 * @param {'session-start'|'pre-bash'|'pre-browser'} name
 * @param {object|string} payload
 * @param {{ cwd?: string, env?: object }} [opts]
 */
export function hook(name, payload, opts = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, ...(opts.env ?? {}) };
  delete env.DELIVERY_RUNNER_STUB;
  if (opts.env?.DELIVERY_RUNNER_STUB) env.DELIVERY_RUNNER_STUB = opts.env.DELIVERY_RUNNER_STUB;
  const t0 = process.hrtime.bigint();
  const r = spawnSync('/bin/sh', [join(HOOKS, `${name}.sh`)], { input, cwd: opts.cwd, encoding: 'utf8', env, timeout: 60_000 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ms };
}

/** The median wall time of n runs, and the last result. */
export function timed(n, fn) {
  const times = [];
  let last;
  for (let i = 0; i < n; i++) { last = fn(); times.push(last.ms); }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(n / 2)], last };
}

export const bashPayload = (cwd, command) => ({
  session_id: 'session-1', transcript_path: '/tmp/transcript.jsonl', cwd, permission_mode: 'default',
  hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command, description: 'a command' }, tool_use_id: 'toolu_1',
});

export const browserPayload = (cwd, agent) => ({
  session_id: 'session-1', transcript_path: '/tmp/transcript.jsonl', cwd, hook_event_name: 'PreToolUse',
  tool_name: 'mcp__claude-in-chrome__navigate', tool_input: { url: 'https://preview.example.invalid' }, tool_use_id: 'toolu_2',
  ...(agent === undefined ? {} : { agent_id: agent, agent_type: 'delivery-builder' }),
});

export const startPayload = (cwd, source = 'compact') => ({
  session_id: 'session-1', transcript_path: '/tmp/transcript.jsonl', cwd, hook_event_name: 'SessionStart', source,
});
