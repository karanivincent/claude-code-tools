// A runner that answers from rules and refuses anything unmatched, so no test can reach a real
// gh, database or build by accident. Real git on a temp repo is opt-in with { passthrough: ['git'] }.

import { createRunner, describeCall } from '../../lib/core/run.mjs';

/**
 * @typedef {{ match: string|RegExp|((call: import('../../lib/core/run.mjs').RunCall, text: string) => boolean),
 *             result?: Partial<import('../../lib/core/run.mjs').RunResult>
 *                     | ((call: any, text: string) => Partial<import('../../lib/core/run.mjs').RunResult>|Promise<any>),
 *             times?: number }} StubRule
 *   match: a string is a prefix of the call's text ("gh api", "git rev-parse"); a RegExp tests the text
 */

/**
 * @param {StubRule[]} [rules] first match wins; a rule with times is used at most that often
 * @param {{ passthrough?: string[] }} [opts] commands (by binary name) that run for real
 * @returns {import('../../lib/core/run.mjs').Runner & { rules: StubRule[], texts: () => string[] }}
 */
export function createStubRunner(rules = [], opts = {}) {
  const real = createRunner();
  const passthrough = new Set(opts.passthrough ?? []);
  const used = new Map();
  const runner = createRunner({
    stub: async (call) => {
      const text = describeCall(call);
      for (const rule of runner.rules) {
        if (!matches(rule.match, call, text)) continue;
        const n = used.get(rule) ?? 0;
        if (rule.times !== undefined && n >= rule.times) continue;
        used.set(rule, n + 1);
        const r = typeof rule.result === 'function' ? await rule.result(call, text) : rule.result;
        return { code: 0, stdout: call.encoding === 'buffer' ? Buffer.alloc(0) : '', stderr: '', ...(r ?? {}) };
      }
      if (passthrough.has(call.cmd)) {
        return call.shell ? real.sh(call.args[1], call) : real.run(call.cmd, call.args, call);
      }
      return undefined; // the runner turns this into "runner stub has no answer for: ..."
    },
  });
  runner.rules = [...rules];
  runner.texts = () => runner.calls.map(describeCall);
  return runner;
}

function matches(m, call, text) {
  if (typeof m === 'string') return text === m || text.startsWith(m + ' ') || text.startsWith(m);
  if (m instanceof RegExp) return m.test(text);
  return Boolean(m(call, text));
}

/** A result helper: ok(stdout) or ok(jsonValue). */
export function ok(stdout = '') {
  return { code: 0, stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '' };
}

/** A failed result with stderr. */
export function fail(code = 1, stderr = 'failed') {
  return { code, stdout: '', stderr };
}
