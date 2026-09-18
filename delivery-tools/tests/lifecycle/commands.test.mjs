// A2's commands as the CLI runs them: every one prints real usage, and pr-body keeps the draft
// PR's generated blocks current (Closes only once a unit's branch is merged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openClaims } from '../../lib/github/claims.mjs';
import prBodyCommand from '../../lib/commands/pr-body.mjs';
import { makeRunRepo, makePlan, ctxFor, write, gitIn, BRANCH } from './support.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'delivery.mjs');
const A2 = ['init', 'intake', 'preflight', 'issues sync', 'scope post', 'scope read', 'claims open', 'claims verify', 'dupes', 'ci', 'wave start', 'wave merge', 'wave end', 'pr-body', 'handover', 'land'];

test('every A2 command prints its usage with --help and exits 0', () => {
  for (const name of A2) {
    const out = execFileSync(process.execPath, [BIN, ...name.split(' '), '--help'], { encoding: 'utf8' });
    assert.match(out, new RegExp(`^usage: delivery ${name}`), name);
    assert.doesNotMatch(out, /not implemented/, name);
    assert.match(out, /\nexit: /, `${name} documents its exit codes`);
  }
});

test('pr-body turns Refs into Closes once a unit is merged, and leaves the rest of the body alone', async () => {
  const plan = makePlan();
  plan.units[0].issue = 102;
  plan.units[1].issue = 103;
  const repo = await makeRunRepo({ plan });
  try {
    const { ctx, gh, stdout } = await ctxFor(repo.worktree);
    const { pr } = await openClaims(ctx);
    await gh.prEdit(pr, { body: `A note for the reviewer.\n\n${(await gh.prGet(pr)).body}` });
    assert.equal(await prBodyCommand.run(ctx, []), 0);
    assert.match(stdout.text(), new RegExp(`PR #${pr}: body already current`));

    const unitWt = join(repo.root, 'u1');
    repo.git('worktree', 'add', '-q', '-b', `${BRANCH}--U1`, unitWt, BRANCH);
    write(unitWt, { 'apps/web/src/widgets/contract.ts': 'export type Shell = {};\n' });
    gitIn(unitWt)('add', '-A');
    gitIn(unitWt)('commit', '-q', '-m', 'U1');
    repo.wtGit('merge', '-q', '--no-ff', '-m', 'Merge unit U1', `${BRANCH}--U1`);

    assert.equal(await prBodyCommand.run(ctx, []), 0);
    const body = (await gh.prGet(pr)).body;
    assert.match(body, /^A note for the reviewer\./);
    assert.match(body, /^Closes #102$/m);
    assert.match(body, /^Refs #103$/m);
    assert.equal(await prBodyCommand.run(ctx, ['--print']), 0);
  } finally { repo.cleanup(); }
});
