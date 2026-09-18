// DELIVERY_RUNNER_STUB for subprocess tests of the hooks: git runs for real (on temp repositories
// only), gh answers from the JSON world named by DELIVERY_TEST_GH, and anything else is refused.
//   world: { "prs": { "<n>": <gh pr view --json object> } }

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function world() {
  try { return JSON.parse(readFileSync(process.env.DELIVERY_TEST_GH, 'utf8')); } catch { return { prs: {} }; }
}

function gh(args) {
  if (args[0] === 'pr' && args[1] === 'view') {
    const pr = world().prs?.[args[2]];
    if (!pr) return { code: 1, stdout: '', stderr: `GraphQL: Could not resolve to a PullRequest with the number of ${args[2]}. (repository.pullRequest)` };
    return { code: 0, stdout: JSON.stringify(pr), stderr: '' };
  }
  if (args[0] === 'api') {
    const path = args[3] ?? '';
    if (path.startsWith('search/issues')) return { code: 0, stdout: '', stderr: '' };
    return { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
  }
  return { code: 1, stdout: '', stderr: `the test world has no answer for gh ${args.join(' ')}` };
}

export default function stub(call) {
  if (call.cmd === 'git') {
    const r = spawnSync('git', call.args, { cwd: call.cwd, input: call.input, encoding: call.encoding === 'buffer' ? 'buffer' : 'utf8' });
    return { code: r.status ?? 1, stdout: r.stdout, stderr: String(r.stderr ?? '') };
  }
  if (call.cmd === 'gh') return gh(call.args);
  return undefined;
}
