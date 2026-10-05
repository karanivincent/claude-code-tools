// B6 of the delivery feedback: the contract labeller writes batch files that are all folded in,
// may key a label by its text alone, and works from contract-todo.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContract, mergeLabels } from '../../lib/picture/contract.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import contractCommand from '../../lib/commands/contract.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';

const AT = '2026-01-15T12:00:00.000Z';

test('buildContract: a label keyed by text applies to every state that shows the text; a state\'s own entry wins', () => {
  const texts = new Map([['A-01', ['Total calls', 'Acme Store']], ['A-02', ['Total calls']]]);
  const labels = {
    states: { 'A-02': [{ text: 'Total calls', label: 'data', kind: 'generated', shape: 'text' }] },
    texts: { 'Total calls': { label: 'fixed' }, 'Acme  Store': { label: 'data', table: 'organizations', column: 'name' } },
  };
  const { contract } = buildContract({ texts, labels, at: AT });
  assert.deepEqual(contract.states['A-01'].texts, [{ text: 'Total calls', label: 'fixed' }, { text: 'Acme Store', label: 'data', table: 'organizations', column: 'name' }]);
  assert.equal(contract.states['A-02'].texts[0].label, 'data');
});

test('mergeLabels: later batch files win per text, earlier labels are never lost', () => {
  const merged = mergeLabels([
    { states: { 'A-01': [{ text: 'One', label: 'fixed' }, { text: 'Two', label: 'fixed' }] }, texts: { Save: { label: 'fixed' } }, inconsistent: { 'A-03': 'x' } },
    { states: { 'A-01': [{ text: 'Two', label: 'data', table: 't', column: 'c' }] }, texts: { Total: { label: 'fixed' } } },
  ]);
  assert.deepEqual(merged.states['A-01'].map((e) => [e.text, e.label]), [['One', 'fixed'], ['Two', 'data']]);
  assert.deepEqual(Object.keys(merged.texts), ['Save', 'Total']);
  assert.deepEqual(merged.inconsistent, { 'A-03': 'x' });
});

async function setup() {
  const map = {
    schemaVersion: 1, feature: 'widgets', kind: 'new', route: '/w', worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+w@example.invalid' }] }],
    states: [{ id: 'W-01', screen: 'W', name: 'List', reach: { world: 'design', role: 'admin', steps: [{ goto: '/w' }] } }, { id: 'W-02', screen: 'W', name: 'Empty', reach: { world: 'design', role: 'admin', steps: [{ goto: '/w' }] } }],
  };
  const repo = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': map } });
  const design = join(repo.dir, '.delivery', 'widgets', 'design');
  mkdirSync(design, { recursive: true });
  const dom = (texts) => JSON.stringify({ schemaVersion: 1, elements: texts.map((text, i) => ({ kind: 'text', text, visible: true, box: { x: 300, y: 10 + i * 30, w: 100, h: 20 } })) });
  for (const [id, texts] of [['W-01', ['Widgets', 'Blue widget']], ['W-02', ['Widgets', 'Nothing yet']]]) {
    writeFileSync(join(design, `${id}.png`), '');
    writeFileSync(join(design, `${id}.dom.json`), dom(texts));
  }
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), clock: fakeClock(AT) });
  return { repo, ...t, deliveryDir: join(repo.dir, 'docs', 'delivery', 'widgets'), todoFile: join(repo.dir, '.delivery', 'widgets', 'contract-todo.json') };
}

test('delivery contract: writes contract-todo.json, folds in every batch file, and a later batch never loses an earlier one', async () => {
  const { repo, ctx, stdout, deliveryDir, todoFile } = await setup();
  try {
    assert.equal(await contractCommand.run(ctx, []), 1);
    let todo = JSON.parse(readFileSync(todoFile, 'utf8'));
    assert.equal(todo.write, 'contract-labels-1.json');
    assert.deepEqual(todo.unlabelled, [
      { text: 'Widgets', states: ['W-01', 'W-02'] },
      { text: 'Blue widget', states: ['W-01'] },
      { text: 'Nothing yet', states: ['W-02'] },
    ]);
    assert.match(stdout.text(), /contract-todo\.json lists each text to label or fix/);

    writeFileSync(join(deliveryDir, 'contract-labels-1.json'), JSON.stringify({ schemaVersion: 1, texts: { Widgets: { label: 'fixed' } }, states: { 'W-01': [{ text: 'Blue widget', label: 'data' }] } }));
    assert.equal(await contractCommand.run(ctx, []), 1, 'the data label names no table yet');
    todo = JSON.parse(readFileSync(todoFile, 'utf8'));
    assert.equal(todo.write, 'contract-labels-2.json');
    assert.deepEqual(todo.unlabelled, [{ text: 'Nothing yet', states: ['W-02'] }]);
    assert.deepEqual(todo.invalid.map((x) => [x.text, x.states]), [['Blue widget', ['W-01']]]);
    assert.match(todo.invalid[0].why, /names its table/);

    writeFileSync(join(deliveryDir, 'contract-labels-2.json'), JSON.stringify({ schemaVersion: 1, states: { 'W-01': [{ text: 'Blue widget', label: 'data', table: 'widgets', column: 'name' }], 'W-02': [{ text: 'Nothing yet', label: 'fixed' }] } }));
    assert.equal(await contractCommand.run(ctx, []), 0, stdout.text());
    const contract = JSON.parse(readFileSync(join(deliveryDir, 'contract.json'), 'utf8'));
    assert.equal(contract.states['W-02'].texts[0].label, 'fixed', 'the first batch\'s text label is kept');
    assert.equal(contract.states['W-01'].texts[1].table, 'widgets', 'the later batch wins');
    assert.deepEqual(JSON.parse(readFileSync(todoFile, 'utf8')).unlabelled, []);
  } finally { repo.cleanup(); }
});

test('NEXT points the labeller at contract-todo.json', () => {
  const base = { rulesOwed: false, owedDesignRules: [], designed: 3, hasMap: true, mapError: null, guardsToApprove: [], pageBlockedComponents: [], phoneRenderOwed: false, rulesProblem: null, checklistStale: false, rounds: [] };
  const todo = pictureNext({ ...base, contractMissing: false, contractTodo: 4, seedStale: true }, { cli: 'delivery' });
  assert.match(todo.text, /contract-todo\.json/);
});
