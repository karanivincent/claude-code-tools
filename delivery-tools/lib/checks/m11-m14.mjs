// M11 (the PR's own e2e specs against the preview) and M14 (rows the run left behind), the two
// checks that reach outside the files: a browser run and the test database.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fillCommand, wrapHeavy } from '../core/profile.mjs';
import { WaitError } from '../core/exit.mjs';
import { resolvePreview } from '../lifecycle/preview.mjs';
import { createDataAdapter } from '../../adapters/data/supabase.mjs';
import { excerpt } from './text.mjs';

const SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const E2E_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * The e2e specs this branch adds or changes, against its merge base with origin/<base>.
 * @param {object} env
 */
export async function changedSpecs(env) {
  const { git } = env.ctx;
  const p = env.profile;
  const base = `origin/${p.repo.base}`;
  const mb = (await git.mergeBase(base, 'HEAD')) ?? base;
  const dir = p.paths.e2eDir.replace(/\/$/, '');
  return (await git.diffNames(mb, 'HEAD'))
    .filter((f) => f.startsWith(`${dir}/`) && SPEC_RE.test(f) && f !== p.paths.captureSpec)
    .filter((f) => existsSync(join(env.paths.repoRoot, f)))
    .sort();
}

const lastLines = (s, n = 12) => String(s ?? '').trim().split('\n').slice(-n).join(' / ');

export const M11 = {
  id: 'M11',
  needsCapture: false,
  async run(env, opts = {}) {
    const specs = await changedSpecs(env);
    if (!specs.length) return { findings: [], failures: [], notes: ['M11: this branch adds or changes no e2e spec'], inScope: () => true };
    const head = await env.ctx.git.revParse('HEAD');
    const preview = await (opts.resolvePreview ?? resolvePreview)(env.ctx, { sha: head });
    if (preview.pending) throw new WaitError(`M11: the preview for ${head.slice(0, 12)} is not ready (${preview.detail}); retry`);
    if (!preview.url) return { findings: [], failures: [{ code: 'M11', message: `M11 needs a preview URL for ${head.slice(0, 12)}: ${preview.detail}` }] };
    const findings = [];
    for (const spec of specs) {
      const cmd = wrapHeavy(env.profile, fillCommand(env.profile.commands.e2e, { spec }));
      const r = await env.ctx.runner.sh(cmd, { cwd: env.paths.repoRoot, env: { E2E_BASE_URL: preview.url }, timeoutMs: E2E_TIMEOUT_MS });
      if (r.code === 0) continue;
      findings.push(env.finding('M11', {
        rule: 'e2e-failed', state: spec, group: 'e2e', where: `${spec}@${head.slice(0, 12)}`,
        design: `${spec} passes against the preview`,
        live: excerpt(`exit ${r.code}${r.timedOut ? ' (timed out)' : ''}: ${lastLines(r.stdout) || lastLines(r.stderr)}`, 600),
      }));
    }
    // One run covers every spec the branch changes, so an earlier failure not seen now is fixed.
    return { findings, failures: [], inScope: () => true };
  },
};

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

export const M14 = {
  id: 'M14',
  needsCapture: true,
  async run(env, opts = {}) {
    const byTable = new Map();
    const owner = new Map();
    const notes = [];
    let odd = 0;
    for (const it of env.capture.items) {
      for (const raw of it.item.createdRowIds ?? []) {
        const m = /^([^:]+):(.+)$/.exec(raw);
        if (!m || !IDENT.test(m[1])) { odd++; continue; }
        byTable.set(m[1], [...(byTable.get(m[1]) ?? []), m[2]]);
        owner.set(`${m[1]}:${m[2]}`, it.item.state);
      }
    }
    if (odd) notes.push(`M14: ${odd} created row id(s) are not "table:id" and were not checked`);
    notes.push('M14: rows the new e2e specs leave in the robot\'s organisation are not counted yet');
    if (!byTable.size) return { findings: [], failures: [], notes, inScope: () => true };
    const adapter = await (opts.createDataAdapter ?? createDataAdapter)(env.ctx);
    const findings = [];
    for (const [table, ids] of [...byTable].sort(([a], [b]) => a.localeCompare(b))) {
      const left = await adapter.query(`select id::text as id from "${table}" where id::text = any($1)`, [ids]);
      for (const row of left) {
        findings.push(env.finding('M14', {
          rule: 'leftover-rows', state: owner.get(`${table}:${row.id}`) ?? 'run', where: `${table}:${row.id}`,
          design: 'torn down after the capture', live: `${table} row ${row.id} is still there`,
        }));
      }
    }
    return { findings, failures: [], notes, inScope: () => true };
  },
};
