// W9 (D11): the model experiment in models.json: which runs still owe it, and how the ledger records it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeExperiment, loadModels } from '../../lib/retro/models.mjs';
import { agentsFromJournal, experimentOf } from '../../lib/retro/record.mjs';
import { agentEvent } from '../../lib/retro/log.mjs';
import { formatEvent } from '../../lib/core/state.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { runRows, runsReport } from '../../lib/retro/runs.mjs';

const EXP = { role: 'builder', agent: 'delivery-tools:picture-builder-medium', model: 'opus', effort: 'medium', runs: 1, since: '0.23.0', about: 'x' };
const cfg = { experiment: EXP };
const rec = (experiment) => ({ feature: 'f', ...(experiment ? { experiment } : {}) });
const recorded = { role: 'builder', agent: EXP.agent, model: 'opus', effort: 'medium' };

test('activeExperiment: on while fewer than `runs` ledger records carry it, off after', () => {
  assert.equal(activeExperiment(cfg, []), EXP);
  assert.equal(activeExperiment(cfg, [rec(null), rec(null)]), EXP);
  assert.equal(activeExperiment(cfg, [rec(recorded)]), null);
  assert.equal(activeExperiment({ experiment: { ...EXP, runs: 2 } }, [rec(recorded)]).runs, 2);
  assert.equal(activeExperiment({ experiment: { ...EXP, runs: 2 } }, [rec(recorded), rec(recorded)]), null);
});

test('activeExperiment: a record for another role or agent does not count; no experiment means null', () => {
  assert.equal(activeExperiment(cfg, [rec({ ...recorded, role: 'reviewer' })]), EXP);
  assert.equal(activeExperiment(cfg, [rec({ ...recorded, agent: 'delivery-tools:other' })]), EXP);
  assert.equal(activeExperiment({}, []), null);
});

test('the shipped models.json has the experiment for the builder, active on an empty ledger', () => {
  const shipped = loadModels();
  assert.deepEqual([shipped.experiment.role, shipped.experiment.agent, shipped.experiment.model, shipped.experiment.effort, shipped.experiment.runs, shipped.experiment.since],
    ['builder', 'delivery-tools:picture-builder-medium', 'opus', 'medium', 1, '0.23.0']);
  assert.ok(activeExperiment(shipped, []));
});

test('experimentOf: the record carries it only when the run dispatched the experiment agent', () => {
  assert.deepEqual(experimentOf([{ agentType: 'delivery-tools:picture-builder-medium' }], EXP), recorded);
  assert.equal(experimentOf([{ agentType: 'delivery-tools:picture-builder' }, { agentType: null }], EXP), null);
  assert.equal(experimentOf([{ agentType: EXP.agent }], null), null);
});

test('the agent type survives the journal line, so the retro can see the experiment agent was dispatched', () => {
  const line = { at: '2026-10-01T10:00:00Z', event: formatEvent(agentEvent({ id: 'a1', role: 'builder', agentType: EXP.agent, model: 'opus', effort: 'medium' })) };
  const [a] = agentsFromJournal([line]);
  assert.equal(a.agentType, EXP.agent);
  assert.deepEqual(experimentOf([a], EXP), recorded);
});

test('the run record schema accepts the experiment, and only its four fields', () => {
  const base = { schemaVersion: 2, feature: 'f', endedAt: '2026-10-01T10:00:00Z', pluginVersion: '0.23.0', estimate: false, phases: Object.fromEntries(['intake', 'render', 'map', 'seed', 'build', 'shoot', 'review', 'ci'].map((p) => [p, null])), phaseCost: {}, founder: null, slotWaits: null, main: null, agents: [], rounds: [], reviewers: [], ciAfterPr: [], improvements: [], autoChanges: [] };
  assert.equal(validateAgainst('run-record', base).ok, true);
  assert.equal(validateAgainst('run-record', { ...base, experiment: recorded }).ok, true);
  assert.equal(validateAgainst('run-record', { ...base, experiment: { ...recorded, extra: 1 } }).ok, false);
  assert.equal(validateAgainst('run-record', { ...base, experiment: { role: 'builder' } }).ok, false);
});

test('delivery runs prints the experiment next to the run\'s name', () => {
  const r = { schemaVersion: 2, feature: 'rounds', endedAt: '2026-10-01T10:00:00Z', pluginVersion: '0.23.0', estimate: false, phases: { build: 10 }, agents: [], rounds: [], founder: null, slotWaits: null, main: null, experiment: recorded };
  assert.deepEqual(runRows([r])[0].experiment, recorded);
  assert.ok(runsReport([r]).some((l) => l.includes('rounds (exp: builder opus medium)')));
});
