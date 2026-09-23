// The handover's generated sections (spec 11.5): Verification performed in the past tense from the
// journal, Migrations from the branch, Known limitations as prose; the rest of the file is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validExample } from '../helpers/fixtures.mjs';
import { formatEvent } from '../../lib/core/state.mjs';
import { updateState } from '../../lib/core/state.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { verificationLines, handoverSections, migrationFiles, writeHandover, findHandover, handoverPathRegExp } from '../../lib/lifecycle/handover.mjs';
import handoverCommand from '../../lib/commands/handover.mjs';
import { makeRunRepo, makePlan, ctxFor, write } from './support.mjs';

const at = (m) => `2026-01-15T21:${String(m).padStart(2, '0')}:00.000Z`;

test('verificationLines: the last result of each command, past tense, in the order they last ran', () => {
  const journal = [
    { at: at(0), event: formatEvent({ command: 'genesis', counts: { run: 'r-1' } }) },
    { at: at(1), event: formatEvent({ command: 'check M7', exit: 1, counts: { findings: 3 } }) },
    { at: at(2), event: formatEvent({ command: 'issues sync', exit: 0, counts: { created: 4 } }) },
    { at: at(3), event: formatEvent({ command: 'check M7', exit: 0, counts: { findings: 0 } }) },
    { at: at(4), event: 'a note without an exit code' },
  ];
  assert.deepEqual(verificationLines(journal), [
    '- `delivery issues sync` exited 0 (created=4), last run 2026-01-15 21:02 UTC.',
    '- `delivery check M7` exited 0 (findings=0), last run 2026-01-15 21:03 UTC, 2 runs in all.',
  ]);
});

test('sections: limitations are prose, never checkboxes; migrations come from the diff', () => {
  const findings = validExample('findings');
  findings.findings = [{ ...findings.findings[0], status: 'accepted', severity: 'P2', accept: { reasonClass: 'data-not-in-product', issue: 150, text: 'the column does not exist yet' } }];
  const plan = makePlan();
  plan.rows.find((r) => r.id === 'WL-03').issue = 104;
  const s = handoverSections({
    journal: [], migrations: migrationFiles(['db/migrations/0001_add.sql', 'apps/web/x.tsx', 'other/migrations/2.sql'], ['db/migrations/*.sql']),
    findingsDoc: findings, plan, ready: { owedAfterMerge: ['a loop test on staging'] }, waivers: [{ probe: 'P13', note: 'later', at: at(0) }],
  });
  assert.match(s.verification, /No delivery command has recorded a result yet\./);
  assert.match(s.migrations, /- `db\/migrations\/0001_add\.sql`\n- `other\/migrations\/2\.sql`/);
  assert.match(s.limitations, /accepted as data-not-in-product, tracked in #150: the column does not exist yet/);
  assert.match(s.limitations, /WL-03 was not built \(cut, money: each use calls a paid service\); its follow-up is #104\./);
  assert.match(s.limitations, /Owed after the merge, by the suite: a loop test on staging\./);
  assert.match(s.limitations, /Preflight probe P13 was waived by the founder: later\./);
  assert.doesNotMatch(Object.values(s).join('\n'), /- \[[ x]\]/, 'no checkbox anywhere');
  assert.doesNotMatch(Object.values(s).join('\n'), /\b(closes|fixes|resolves) #\d+/i, 'no closing keyword in a committed file');
});

test('writeHandover creates the branch\'s handover once, then regenerates only its sections', async () => {
  const repo = await makeRunRepo();
  try {
    const { ctx } = await ctxFor(repo.worktree);
    await updateState(repo.paths, (s) => s, { at: at(5), event: formatEvent({ command: 'wave start', exit: 0, counts: { wave: 1 } }) });
    assert.equal(await handoverCommand.run(ctx, []), 0);
    const rel = 'docs/handovers/2026-01-15-widgets-handover.md';
    const abs = join(repo.worktree, rel);
    const first = readFileSync(abs, 'utf8');
    assert.match(first, /^# Handover: the widgets delivery run \(#101\)/);
    assert.match(first, /`delivery wave start` exited 0 \(wave=1\)/);
    writeFileSync(abs, first.replace('# Handover: the widgets delivery run (#101)\n', '# Handover: the widgets delivery run (#101)\n\n## What changed and why\n\nWritten by the main session.\n'));
    await writeArtefact(repo.paths, 'findings', { schemaVersion: 1, runId: 'r-1', findings: [] });
    const res = await writeHandover(ctx);
    assert.equal(res.created, false);
    const second = readFileSync(abs, 'utf8');
    assert.match(second, /## What changed and why\n\nWritten by the main session\./);
    assert.match(second, /`delivery handover` exited 0/);
    assert.equal(await findHandover(ctx, { profile: ctx.profile && (await ctx.profile()), feature: 'widgets', committedOnly: true }), null, 'not committed yet');
    repo.wtGit('add', rel);
    repo.wtGit('commit', '-q', '-m', 'Write the handover');
    assert.equal(await findHandover(ctx, { profile: await ctx.profile(), feature: 'widgets', committedOnly: true }), rel);
    write(repo.worktree, { 'docs/handovers/2026-01-20-widgets-handover.md': 'another' });
    assert.equal(await findHandover(ctx, { profile: await ctx.profile(), feature: 'widgets' }), rel, 'the one this branch added wins');
    assert.ok(handoverPathRegExp('docs/handovers/{date}-{slug}-handover.md', 'widgets').test(rel));
  } finally { repo.cleanup(); }
});
