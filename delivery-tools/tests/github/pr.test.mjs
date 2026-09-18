// The PR body's generated blocks (spec 11.5): late changes first, text outside the blocks kept,
// Closes only for built units, the claimed-paths block readable by a pattern match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import { CLAIMS_MARKER } from '../../lib/core/markers.mjs';
import { prBlockContents, composePrBody, coverageCounts, parseClaims, referencedIssues, PR_BLOCKS } from '../../lib/github/pr.mjs';
import { makePlan } from '../lifecycle/support.mjs';

function plan() {
  const p = makePlan();
  p.units[0].issue = 102;
  p.units[1].issue = 103;
  p.rows.push({ ...p.rows[2], id: 'CAP-003', class: 'remove', reason: { code: 'unused', text: 'nobody uses it' }, scopeLine: 'S2' });
  p.scope.push({ line: 'S2', rows: ['CAP-003'], kind: 'remove', text: 'Remove the slug.', default: 'remove', appliesAtWave: 2, reply: 'remove' });
  return p;
}

test('coverage counts designed states, cuts, adapts, invented rows and capabilities', () => {
  assert.deepEqual(coverageCounts(plan()), { statesBuilt: 2, cut: 1, cutWithIssue: 0, adapted: 0, invented: 0, removed: 1, kept: 0, migrated: 1 });
});

test('blocks: late changes, removals with their Scope line, accepted P2s, owed items, Closes only for built units', () => {
  const findings = validExample('findings');
  findings.findings = [{ ...findings.findings[0], status: 'accepted', severity: 'P2', accept: { reasonClass: 'platform-limit', issue: 140, text: 'no live transcript in the browser' } }];
  const b = prBlockContents({
    plan: plan(), late: [{ row: 'WL-01', from: 'change', to: 'cut', scopeLine: null }], findingsDoc: findings,
    owed: ['a loop test on staging (the preview cannot be dialled)'], built: new Set(['U1']), handoverUrl: 'https://github.invalid/h.md',
  });
  assert.match(b['late-changes'], /WL-01: change → cut \(no Scope line yet\)/);
  assert.match(b.removed, /CAP-003 \(unused: nobody uses it\): Scope line S2, decided "remove"/);
  assert.match(b.accepted, /Accepted as platform-limit, #140: no live transcript in the browser/);
  assert.match(b.owed, /a loop test on staging/);
  assert.equal(b.children, 'Closes #102\nRefs #103');
  assert.equal(b.handover, 'Handover: https://github.invalid/h.md');
});

test('composePrBody: fixed order on a new body, in place on an old one, human text kept', () => {
  const profile = makeProfile();
  const blocks = prBlockContents({ plan: plan(), late: [] });
  const body = composePrBody('', { profile, feature: 'widgets', blocks, claimed: ['a/b.tsx'] });
  const order = PR_BLOCKS.map((n) => body.indexOf(`<!-- delivery:widgets:block:${n} -->`));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.deepEqual(parseClaims(body, CLAIMS_MARKER), ['a/b.tsx']);
  const edited = `Reviewer notes above.\n\n${body}`;
  const next = composePrBody(edited, { profile, feature: 'widgets', blocks: { ...blocks, children: 'Closes #102\nCloses #103' }, claimed: ['a/b.tsx', 'c.ts'] });
  assert.match(next, /^Reviewer notes above\./);
  assert.match(next, /Closes #103/);
  assert.deepEqual(parseClaims(next, CLAIMS_MARKER), ['a/b.tsx', 'c.ts']);
  assert.equal(next.split('<!-- delivery:widgets:pr -->').length - 1, 1);
});

test('referencedIssues knows Refs and every closing keyword, and nothing else', () => {
  assert.deepEqual([...referencedIssues('Refs #1\nCloses #2\nfixes #3\nResolved #4\nsee #5\nRef #6')].sort((a, b) => a - b), [1, 2, 3, 4, 6]);
});
