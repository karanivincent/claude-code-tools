// C5: where the retro is registered and documented, and that the code reads its numbers from tunables.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_ORDER, loadAllCommands } from '../../lib/core/command.mjs';
import { AUTO_MATCH_MAX_DIFF, MAX_BATCH_ITEMS, MAX_PARALLEL_REVIEWERS, PIXEL_TOLERANCE } from '../../lib/picture/review.mjs';
import { MAX_SLOTS } from '../../lib/capture/slots.mjs';
import { tunable } from '../../lib/retro/tunables.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('retro is a registered command, after land', async () => {
  assert.ok(COMMAND_ORDER.indexOf('retro') > COMMAND_ORDER.indexOf('land'));
  const all = await loadAllCommands();
  const retro = all.find((c) => c.module.name === 'retro').module;
  assert.match(retro.usage, /^usage: delivery retro/);
  assert.match(retro.usage, /no schedule, no cron/);
  assert.match(retro.usage, /"Needs you"/);
});

test('the deliver-from-design skill ends with the retro and sends "Needs you" to the final report', () => {
  const skill = read('skills/deliver-from-design/SKILL.md');
  assert.match(skill, /\| 5 Retro \| `delivery retro`/);
  assert.match(skill, /Needs you.*final\s+report/s);
});

test('OPERATING.md explains the retro and the size rule', () => {
  const doc = read('docs/OPERATING.md');
  for (const part of ['## The retro and the size rule', 'DELIVERY_PLUGIN_REPO', '~/.claude/plugins/cache', 'needs-decision', '50 lines', 'two runs in a row', 'no\nschedule, no cron']) assert.ok(doc.includes(part), part);
});

test('ARCHITECTURE.md lists the retro in the module map, the ownership table and the artefacts', () => {
  const arch = read('docs/ARCHITECTURE.md');
  for (const part of ['lib/retro/', '`lib/retro/**`', '`tunables.json`', '`tests/retro/**`', '| runs ledger |', '`retro`']) assert.ok(arch.includes(part), part);
});

test('the numbers the code uses are the ones in tunables.json', () => {
  assert.equal(AUTO_MATCH_MAX_DIFF, tunable('review.autoMatchMaxDiff'));
  assert.equal(PIXEL_TOLERANCE, tunable('review.pixelTolerance'));
  assert.equal(MAX_BATCH_ITEMS, tunable('review.maxBatchItems'));
  assert.equal(MAX_PARALLEL_REVIEWERS, tunable('review.maxParallelReviewers'));
  assert.equal(MAX_SLOTS, tunable('slots.max'));
  for (const f of ['lib/picture/review.mjs', 'lib/capture/slots.mjs', 'lib/capture/run.mjs']) assert.match(read(f), /tunable\('/, f);
});
