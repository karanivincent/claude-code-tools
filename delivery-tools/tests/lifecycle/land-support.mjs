// The land tests' run: merged, with its epic, children, Scope issue, workflow runs, a staging
// capture on disk, and every other slice's function stubbed through ctx.deps.
import assert from 'node:assert/strict';
import { ok } from '../helpers/runner-stub.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { makeRunRepo, makePlan, ctxFor } from './support.mjs';

export const MERGE = 'e'.repeat(40);
export const mk = (kind, id) => makeMarker({ feature: 'widgets', kind, id });

export async function landedRun({ removeRow = false, voice = true } = {}) {
  const plan = makePlan();
  plan.units[0].issue = 102;
  plan.units[1].issue = 103;
  plan.scopeIssue = 105;
  if (removeRow) plan.rows.push({ ...plan.rows[2], id: 'CAP-003', class: 'remove', reason: { code: 'unused', text: 'nobody uses it' } });
  const repo = await makeRunRepo({ plan });
  const clock = fakeClock('2026-01-16T09:00:00.000Z');
  const gh = createGhStub({ clock, startAt: 101 });
  await gh.issueCreate({ title: 'Widgets', body: `Epic.\n${mk('epic')}`, labels: ['epic'] });
  for (const u of ['U1', 'U2']) { const i = await gh.issueCreate({ title: u, body: mk('unit', u) }); await gh.issueClose(i.number); }
  const pr = await gh.prCreate({ title: 'Widgets', body: `Closes #102\nCloses #103\n${mk('pr')}`, base: 'main', head: 'epic/101-widgets' });
  await gh.issueCreate({ title: 'Scope for #101: widgets', body: mk('scope'), labels: ['needs-decision'] });
  gh.setFiles(pr.number, voice ? ['apps/server/src/call.ts', 'apps/web/src/widgets/list.tsx'] : ['apps/web/src/widgets/list.tsx']);
  gh.merge(pr.number, MERGE);
  let runs = [{ name: 'CI', status: 'completed', conclusion: 'success' }, { name: 'E2E (staging)', status: 'completed', conclusion: 'success' }];
  gh.api = async (method, path) => {
    assert.equal(method, 'GET');
    // A red run on the merge commit asks whether a later base-branch run fixed it forward: none here.
    if (path === 'repos/example-org/example-repo/actions/runs?branch=main&status=completed&per_page=100') return { workflow_runs: [] };
    assert.equal(path, `repos/example-org/example-repo/actions/runs?head_sha=${MERGE}&per_page=100`);
    return { workflow_runs: runs };
  };
  const capture = { ...validExample('capture'), runId: 'c-20260116-0800-staging', mode: 'staging', expectedSha: MERGE };
  await writeArtefact(repo.paths, 'capture', capture, { key: capture.runId });
  const calls = { checks: [] };
  const deps = {
    validateCaptureItems: async () => capture.items.map((i) => ({ state: i.state, world: i.world, role: i.role, width: i.width, locale: i.locale, theme: i.theme, status: 'reached', why: null })),
    runChecks: async (_ctx, ids, opts) => { calls.checks.push([ids.join(','), opts.captureRunId ?? null, opts.record]); return { findings: [], failures: [] }; },
    checkReady: async () => ({ ok: true, failures: [], headSha: 'a'.repeat(40) }),
  };
  const rules = [
    { match: `DEPLOY_SHA=${MERGE} node scripts/wait-for-deploy.mjs`, result: ok('live') },
    { match: 'node scripts/migrations-owed.mjs', result: ok('nothing owed') },
    { match: 'node scripts/pending-production.mjs', result: ok('20260115120000_add_widget_flags.sql') },
    { match: 'node scripts/loop-test.mjs --issue 101', result: ok('loop test passed') },
    { match: 'node scripts/close-epic.mjs 101 --exit 0', result: () => { gh.db.issues.get(101).state = 'closed'; return ok('Closed #101.'); } },
  ];
  const env = await ctxFor(repo.worktree, { gh, clock, rules, deps });
  return { repo, gh, calls, deps, setRuns: (r) => { runs = r; }, capture, ...env };
}

