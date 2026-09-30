// The run audit: the version 2 run record (per-phase models and cost, agents, founder and slot
// waits), how agent numbers reach the journal (SubagentStop hook, log-agent, log-wait, the shoot's
// slot), `delivery runs`, `delivery backfill-run`, models.json and its agents, the retro's model
// proposals (never applied), and `delivery crop`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecord, phasesFromJournal, agentsFromJournal, phaseCost } from '../../lib/retro/record.mjs';
import { readLedger, writeRecord, ledgerPath, upgradeRecord } from '../../lib/retro/ledger.mjs';
import { runRetro } from '../../lib/retro/retro.mjs';
import { usageOfTranscript, outcomeOf, projectDirFor } from '../../lib/retro/usage.mjs';
import { costOf, familyOf, loadModels, roleOf } from '../../lib/retro/models.mjs';
import { modelProposals } from '../../lib/retro/compare.mjs';
import { classify } from '../../lib/retro/size.mjs';
import { runsReport, runRows, modelRows, roundsToGreen, matchRates } from '../../lib/retro/runs.mjs';
import { agentEvent, waitEvent } from '../../lib/retro/log.mjs';
import { decodePng, encodePng, cropImage } from '../../lib/picture/png.mjs';
import { withShootSlot } from '../../lib/picture/shoot.mjs';
import { updateState, formatEvent, loadState, parseEvent } from '../../lib/core/state.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import logAgent from '../../lib/commands/log-agent.mjs';
import logWait from '../../lib/commands/log-wait.mjs';
import runsCommand from '../../lib/commands/runs.mjs';
import backfill from '../../lib/commands/backfill-run.mjs';
import cropCommand from '../../lib/commands/crop.mjs';
import hookSubagentStop from '../../lib/commands/hook-subagent-stop.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { makeRunRepo, ctxFor } from '../lifecycle/support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = (min) => new Date(Date.parse('2026-01-15T20:00:00.000Z') + min * 60000).toISOString();
const ev = (min, command, exit = 0, counts = {}) => ({ at: at(min), event: formatEvent({ command, exit, counts }) });

/** A transcript as Claude Code writes one: a prompt, then assistant messages split over lines that repeat their usage. */
function transcript({ model = 'claude-sonnet-5-5', prompt = 'Read the brief.', start = 1, minutes = 10, last = 'All done.\nOutcome: done', usage = { input_tokens: 10, cache_creation_input_tokens: 990, cache_read_input_tokens: 5000, output_tokens: 200 } } = {}) {
  const lines = [
    { type: 'user', timestamp: at(start), message: { role: 'user', content: prompt } },
    { type: 'assistant', timestamp: at(start + 1), message: { id: 'm1', model, usage: { ...usage, output_tokens: 5 }, content: [{ type: 'text', text: 'Working.' }] } },
    { type: 'assistant', timestamp: at(start + 1), message: { id: 'm1', model, usage, content: [{ type: 'tool_use', name: 'Read' }] } },
    { type: 'assistant', timestamp: at(start + minutes), message: { id: 'm2', model, usage, content: [{ type: 'text', text: last }] } },
  ];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

/** A Claude Code config folder with one session of the worktree: a main transcript and subagents. */
function claudeHome(worktree, agents = [], main = null) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'delivery-claude-')));
  const proj = projectDirFor(worktree, { CLAUDE_CONFIG_DIR: home });
  const sub = join(proj, 'sess-1', 'subagents');
  mkdirSync(sub, { recursive: true });
  if (main) writeFileSync(join(proj, 'sess-1.jsonl'), main);
  for (const a of agents) {
    writeFileSync(join(sub, `agent-${a.id}.jsonl`), a.text);
    writeFileSync(join(sub, `agent-${a.id}.meta.json`), JSON.stringify(a.meta));
  }
  return { home, proj, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

// ---- schema ----

test('run-record version 2: the valid example validates, agents and waits are strict, and a version 1 line is upgraded', async () => {
  const good = validExample('run-record');
  assert.equal(validateAgainst('run-record', good).ok, true);
  const bad = (patch) => validateAgainst('run-record', { ...good, ...patch }).ok;
  assert.equal(bad({ agents: [{ ...good.agents[0], effort: 'huge' }] }), false, 'effort is low..max or null');
  assert.equal(bad({ agents: [{ ...good.agents[0], tokensIn: -1 }] }), false);
  assert.equal(bad({ agents: [{ ...good.agents[0], phase: 'lunch' }] }), false);
  assert.equal(bad({ phaseCost: { lunch: good.phaseCost.build } }), false);
  assert.equal(bad({ slotWaits: { count: 1 } }), false);
  assert.equal(bad({ estimate: 'yes' }), false);
  const { agents, ...noAgents } = good;
  assert.equal(validateAgainst('run-record', noAgents).ok, false, 'agents is required');

  const v1 = { schemaVersion: 1, feature: 'old', endedAt: good.endedAt, pluginVersion: '0.12.0', phases: good.phases, founder: null, rounds: [], reviewers: [], ciAfterPr: [], improvements: [], autoChanges: [] };
  const up = upgradeRecord(v1);
  assert.equal(up.schemaVersion, 2);
  assert.deepEqual([up.agents, up.phaseCost, up.main, up.slotWaits, up.estimate], [[], {}, null, null, false]);
  assert.equal(validateAgainst('run-record', up).ok, true);
  const repo = await makeRunRepo();
  try {
    const file = ledgerPath(repo.paths);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(v1)}\n`);
    assert.equal((await readLedger(file))[0].schemaVersion, 2, 'read as version 2');
    await writeRecord(file, { ...good, feature: 'widgets' });
    assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).schemaVersion), [2, 2], 'written back as version 2');
  } finally { repo.cleanup(); }
});

// ---- models.json and the agents ----

function frontmatter(rel) {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(ROOT, rel), 'utf8'));
  return Object.fromEntries(m[1].split('\n').map((l) => /^([A-Za-z]+):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2]]));
}

test('models.json: every role names an agent whose own file carries the same model and effort', () => {
  const cfg = loadModels();
  const want = { extractor: ['sonnet', 'medium'], contract: ['sonnet', 'medium'], steers: ['sonnet', 'medium'], mapper: ['sonnet', 'medium'], 'seed-writer': ['sonnet', 'medium'], builder: ['opus', 'high'], 'fix-builder': ['sonnet', 'medium'], reviewer: ['sonnet', 'medium'], 'ci-fixer': ['sonnet', 'medium'], 'unit-builder': ['sonnet', 'medium'], 'contract-builder': ['opus', 'high'], auditor: ['sonnet', 'high'], main: ['opus', 'high'] };
  for (const [role, [model, effort]] of Object.entries(want)) assert.deepEqual([cfg.roles[role].model, cfg.roles[role].effort], [model, effort], role);
  for (const [role, r] of Object.entries(cfg.roles)) {
    if (!r.agent) continue;
    const name = r.agent.replace(/^delivery-tools:/, '');
    const fm = frontmatter(`agents/${name}.md`);
    assert.equal(fm.name, name, role);
    assert.equal(fm.model, r.model, `${role}: ${name}.md model`);
    assert.equal(fm.effort, r.effort, `${role}: ${name}.md effort`);
    if (r.edits && r.model === 'sonnet') assert.match(readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8'), /run (a|the) real check/i, `${name}: a Sonnet role that edits runs a real check`);
  }
  // D11: the experiment's agent file exists and carries the experiment's model and effort.
  const e = cfg.experiment;
  assert.ok(e, 'models.json names an experiment');
  assert.ok(cfg.roles[e.role], 'the experiment is for a known role');
  const ename = e.agent.replace(/^delivery-tools:/, '');
  const efm = frontmatter(`agents/${ename}.md`);
  assert.equal(efm.name, ename);
  assert.equal(efm.model, e.model, `${ename}.md model`);
  assert.equal(efm.effort, e.effort, `${ename}.md effort`);
  assert.ok(cfg.roles[e.role].agentTypes.includes(e.agent), 'the role lists the experiment agent so the ledger knows its role');
  assert.deepEqual(cfg.models.opus, { id: 'claude-opus-5-5', match: 'opus', inPerMTok: 4, outPerMTok: 20 });
  assert.deepEqual(cfg.models.sonnet, { id: 'claude-sonnet-5-5', match: 'sonnet', inPerMTok: 2, outPerMTok: 10 });
});

test('models.json: no Sonnet role runs above high effort', () => {
  const cfg = loadModels();
  for (const [role, r] of Object.entries(cfg.roles)) {
    if (r.model === 'sonnet') assert.ok(!['xhigh', 'max'].includes(r.effort), `${role}: Sonnet at ${r.effort}`);
  }
  if (cfg.experiment?.model === 'sonnet') assert.ok(!['xhigh', 'max'].includes(cfg.experiment.effort), 'the experiment: Sonnet above high');
  for (const f of readdirSync(join(ROOT, 'agents'))) {
    const fm = frontmatter(`agents/${f}`);
    if (fm.model === 'sonnet') assert.ok(!['xhigh', 'max'].includes(fm.effort), `${f}: Sonnet at ${fm.effort}`);
  }
});

test('prices: a million in and out tokens cost $24 on Opus and $12 on Sonnet; cache reads at a tenth; unknown models cost null', () => {
  assert.equal(costOf('claude-opus-5-5', { tokensIn: 1e6, tokensOut: 1e6 }), 24);
  assert.equal(costOf('sonnet', { tokensIn: 1e6, tokensOut: 1e6 }), 12);
  assert.equal(costOf('claude-sonnet-5-5', { tokensCached: 1e6 }), 0.2);
  assert.equal(costOf('gpt-9', { tokensIn: 1e6 }), null);
  assert.equal(familyOf('claude-sonnet-5'), 'sonnet');
});

test('an agent\'s role: its Role line, then its agent type, then its description', () => {
  assert.equal(roleOf({ prompt: 'Role: seed-writer\nRead the brief.', agentType: 'delivery-tools:delivery-worker' }), 'seed-writer');
  assert.equal(roleOf({ agentType: 'delivery-tools:picture-fixer' }), 'fix-builder');
  assert.equal(roleOf({ agentType: 'delivery-tools:delivery-extractor', description: 'States: the list' }), 'extractor');
  assert.equal(roleOf({ agentType: 'general-purpose', description: 'Review round 1 group A' }), 'reviewer');
  assert.equal(roleOf({ agentType: 'general-purpose', description: 'Builder fix round 2' }), 'fix-builder');
  assert.equal(roleOf({ agentType: 'general-purpose', description: 'Write the button map' }), 'mapper');
  assert.equal(roleOf({ agentType: 'Explore', description: 'Look around' }), 'other');
});

// ---- transcripts ----

test('a transcript counts each message once, prices it, and reads the outcome line', () => {
  const u = usageOfTranscript(transcript({ minutes: 10 }));
  assert.equal(u.messages, 2);
  assert.deepEqual([u.tokensIn, u.tokensCached, u.tokensOut], [2000, 10000, 400]);
  assert.equal(u.minutes, 9);
  assert.equal(u.model, 'claude-sonnet-5-5');
  assert.equal(outcomeOf('Fixed.\nOutcome: blocked'), 'blocked');
  assert.equal(outcomeOf('Fixed.'), 'done');
});

// ---- the journal: agents and waits ----

test('agent and wait lines never end a phase; founder waits leave the phases; a later line for an agent fills it in', () => {
  const journal = [
    ev(0, 'intake'),
    ev(30, 'map'),
    { at: at(40), event: formatEvent(agentEvent({ id: 'a1', role: 'mapper', phase: 'map', model: 'sonnet', effort: 'medium', minutes: 12, tokensIn: 1e6, tokensCached: 0, tokensOut: 1e5 })) },
    { at: at(55), event: formatEvent(waitEvent('founder', 15)) },
    { at: at(58), event: formatEvent(waitEvent('slot', 2.5)) },
    ev(60, 'shoot --round 1'),
    { at: at(61), event: formatEvent(agentEvent({ id: 'a1', outcome: 'blocked' })) },
  ];
  const { phases, founder, slotWaits } = phasesFromJournal(journal);
  assert.equal(phases.map, 30);
  assert.equal(phases.shoot, 15, '30 minutes to the shoot, less the 15 the founder was waited on');
  assert.deepEqual(founder, { waitMinutes: 15, questions: 1 });
  assert.deepEqual(slotWaits, { count: 1, minutes: 2.5 });
  const [a] = agentsFromJournal(journal);
  assert.deepEqual([a.role, a.model, a.effort, a.minutes, a.outcome, a.costUsd], ['mapper', 'sonnet', 'medium', 12, 'blocked', 3]);
  assert.deepEqual(phaseCost([a]).map, { models: ['sonnet'], agentMinutes: 12, tokensIn: 1e6, tokensCached: 0, tokensOut: 1e5, costUsd: 3 });
});

test('log-agent and log-wait write journal lines the record reads; bad input is a usage error', async () => {
  const repo = await makeRunRepo();
  try {
    const { ctx, stdout } = await ctxFor(repo.worktree);
    assert.equal(await logAgent.run(ctx, ['--role', 'fix-builder', '--id', 'f1', '--minutes', '20', '--tokens-in', '500000', '--tokens-out', '50000', '--outcome', 'blocked']), 0);
    assert.match(stdout.text(), /logged fix-builder f1: sonnet at medium, outcome blocked, 20 min, about \$1.5/);
    assert.equal(await logWait.run(ctx, ['--founder', '--minutes', '30']), 0);
    await assert.rejects(logAgent.run(ctx, ['--role', 'chef']), /--role must be one of/);
    await assert.rejects(logAgent.run(ctx, ['--role', 'mapper', '--effort', 'huge']), /--effort/);
    await assert.rejects(logWait.run(ctx, ['--founder', '--slot', '--minutes', '3']), /exactly one/);
    await assert.rejects(logWait.run(ctx, ['--slot', '--minutes', '0']), /above 0/);
    const rec = await buildRecord(ctx, repo.paths, { transcripts: false });
    assert.deepEqual(rec.agents, [{ id: 'f1', role: 'fix-builder', phase: 'build', model: 'sonnet', effort: 'medium', minutes: 20, tokensIn: 500000, tokensCached: 0, tokensOut: 50000, costUsd: 1.5, outcome: 'blocked' }]);
    assert.equal(rec.phaseCost.build.costUsd, 1.5);
    assert.deepEqual(rec.founder, { waitMinutes: 30, questions: 1 });
    assert.equal(validateAgainst('run-record', rec).ok, true);
  } finally { repo.cleanup(); }
});

test('the SubagentStop hook records the finished agent from its transcript, in the run whose worktree the session is in', async () => {
  const repo = await makeRunRepo();
  const claude = claudeHome(repo.worktree, [{ id: 'ab12', text: transcript({ prompt: 'Role: seed-writer\nRead the brief.', last: 'Worlds fixed.\nOutcome: done' }), meta: { agentType: 'delivery-tools:delivery-worker', description: 'Fix worlds' } }]);
  try {
    const { ctx } = await ctxFor(repo.worktree, { env: { CLAUDE_CONFIG_DIR: claude.home } });
    ctx.hookInput = JSON.stringify({ session_id: 'sess-1', cwd: repo.worktree, hook_event_name: 'SubagentStop', agent_id: 'ab12', agent_type: 'delivery-tools:delivery-worker', last_assistant_message: 'Worlds fixed.\nOutcome: blocked' });
    assert.equal(await hookSubagentStop.run(ctx, []), 0);
    const state = await loadState(repo.paths.state);
    const line = parseEvent(state.journal.at(-1).event);
    assert.equal(line.command, 'agent');
    assert.deepEqual([line.counts.id, line.counts.role, line.counts.phase, line.counts.model, line.counts.effort, line.counts.outcome], ['ab12', 'seed-writer', 'seed', 'sonnet', 'medium', 'blocked']);
    ctx.hookInput = JSON.stringify({ session_id: 'sess-1', cwd: repo.worktree, agent_id: 'nope' });
    assert.equal(await hookSubagentStop.run(ctx, []), 0, 'no transcript: nothing written, never a failure');
    assert.equal((await loadState(repo.paths.state)).journal.length, state.journal.length);
  } finally { repo.cleanup(); claude.cleanup(); }
});

test('a shoot that waited for its slot writes a wait slot line', async () => {
  const repo = await makeRunRepo();
  try {
    const file = join(repo.root, 'slots.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, holders: [{ id: 'x', pid: 1, label: 'e2e', at: at(0) }, { id: 'y', pid: 1, label: 'e2e', at: at(0) }] }));
    const { ctx } = await ctxFor(repo.worktree, { env: { DELIVERY_SLOTS_FILE: file } });
    // pid 1 is alive; free the slots after the first poll, as another job ending would.
    setTimeout(() => writeFileSync(file, JSON.stringify({ schemaVersion: 1, holders: [] })), 1300);
    await withShootSlot(ctx, async () => 'shot');
    const line = parseEvent((await loadState(repo.paths.state)).journal.at(-1).event);
    assert.equal(line.command, 'wait slot');
    assert.ok(Number(line.counts.minutes) >= 0);
  } finally { repo.cleanup(); }
});

// ---- buildRecord from transcripts ----

test('buildRecord adds the agents and main-session usage the worktree\'s transcripts show inside the run', async () => {
  const repo = await makeRunRepo();
  const claude = claudeHome(repo.worktree, [
    { id: 'b1', text: transcript({ model: 'claude-opus-5-5', start: 5, minutes: 40 }), meta: { agentType: 'delivery-tools:picture-builder', description: 'Build the page' } },
    { id: 'r1', text: transcript({ start: 50, minutes: 6 }), meta: { agentType: 'general-purpose', description: 'Review round 1 group A' } },
    { id: 'old', text: transcript({ start: -600 }), meta: { agentType: 'general-purpose', description: 'Review round 1 group A' } },
  ], transcript({ model: 'claude-opus-5-5', start: 2, minutes: 50, usage: { input_tokens: 100000, output_tokens: 10000 } }));
  try {
    await updateState(repo.paths, (s) => s, ev(55, 'review --round 1'));
    const { ctx } = await ctxFor(repo.worktree, { env: { CLAUDE_CONFIG_DIR: claude.home } });
    const rec = await buildRecord(ctx, repo.paths);
    assert.deepEqual(rec.agents.map((a) => [a.id, a.role, a.phase, a.model, a.effort]), [['b1', 'builder', 'build', 'opus', null], ['r1', 'reviewer', 'review', 'sonnet', null]], 'the agent from before the run is left out; effort is unknown from a transcript');
    assert.deepEqual(rec.phaseCost.build.models, ['opus']);
    assert.equal(rec.main.model, 'opus');
    assert.equal(rec.main.tokensIn, 200000);
    assert.equal(validateAgainst('run-record', rec).ok, true);
  } finally { repo.cleanup(); claude.cleanup(); }
});

// ---- delivery runs ----

const rec = (feature, o = {}) => ({ ...validExample('run-record'), feature, ...o });

test('runs: time by phase in %, rounds to green, match rate per round, time and cost by model', () => {
  const a = rec('alpha');
  const b = rec('beta', { estimate: true, rounds: [{ round: 1, match: 5, small: 0, toFix: 5, notReached: 0, dataGap: 0, carried: 0 }], agents: [], main: null, phaseCost: {} });
  assert.equal(roundsToGreen(a.rounds), 2);
  assert.equal(roundsToGreen(b.rounds), null);
  assert.deepEqual(matchRates(a.rounds), [56, 89]);
  const [ra, rb] = runRows([a, b]);
  assert.equal(ra.minutes, 252.5);
  assert.equal(ra.phasePct.build, 38);
  assert.equal(ra.costUsd, 46.8);
  assert.equal(rb.costUsd, null, 'no agent numbers: no cost, not $0');
  const models = modelRows([a, b]);
  assert.deepEqual(models.map((m) => [m.model, m.agents, m.agentMinutes, m.mainMinutes]), [['opus', 1, 95, 252.5], ['sonnet', 2, 75, 0]]);
  assert.equal(models.reduce((n, m) => n + m.costPct, 0), 100);
  const text = runsReport([a, b]).join('\n');
  assert.match(text, /Time by phase/);
  assert.match(text, /beta \(est\.\)/);
  assert.match(text, /56% > 89%/);
  assert.match(text, /not after 1/);
  assert.match(text, /Time and cost by model/);
  assert.match(text, /fix-builder\s+sonnet/);
  assert.match(runsReport([]).join('\n'), /no runs in the ledger yet/);
});

test('delivery runs reads the ledger, prints the tables and needs no run', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const file = join(repo.primary, 'docs', 'delivery', 'runs.jsonl');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, [rec('alpha'), rec('beta')].map((r) => JSON.stringify(r)).join('\n') + '\n');
    const { ctx, stdout } = await ctxFor(repo.primary, { feature: null });
    assert.equal(await runsCommand.run(ctx, []), 0);
    assert.match(stdout.text(), /alpha[\s\S]*beta/);
    const only = await ctxFor(repo.primary, { feature: null, json: true });
    assert.equal(await runsCommand.run(only.ctx, ['--only', 'beta']), 0);
  } finally { repo.cleanup(); }
});

// ---- delivery backfill-run ----

test('backfill-run writes an estimated line from the journal and transcripts, and never replaces the run\'s own retro line', async () => {
  const repo = await makeRunRepo();
  const claude = claudeHome(repo.worktree, [{ id: 'x1', text: transcript({ start: 3, minutes: 20 }), meta: { agentType: 'delivery-tools:delivery-extractor', description: 'States: list' } }]);
  try {
    for (const [m, c] of [[10, 'design render'], [40, 'map'], [90, 'shoot --round 1']]) await updateState(repo.paths, (s) => s, ev(m, c));
    const { ctx, stdout } = await ctxFor(repo.worktree);
    const file = ledgerPath(repo.paths);
    assert.equal(await backfill.run(ctx, ['--transcripts', claude.proj, '--dry-run']), 0);
    assert.ok(!existsSync(file), 'a dry run writes nothing');
    assert.equal(await backfill.run(ctx, ['--transcripts', claude.proj]), 0);
    const [line] = await readLedger(file);
    assert.equal(line.estimate, true);
    assert.equal(line.endedAt, at(90), 'ended when the journal ended');
    assert.deepEqual(line.phases.map, 30);
    assert.deepEqual(line.agents.map((a) => [a.role, a.effort]), [['extractor', null]]);
    assert.deepEqual(line.autoChanges, []);
    assert.match(stdout.text(), /backfill widgets \(estimate\)/);

    assert.equal(await backfill.run(ctx, ['--no-transcripts', '--ended-at', at(95)]), 0, 'an earlier backfill is replaced');
    assert.equal((await readLedger(file))[0].endedAt, at(95));

    await runRetro(ctx, repo.paths);
    assert.equal((await readLedger(file))[0].estimate, false);
    assert.equal(await backfill.run(ctx, ['--no-transcripts']), 1, 'the run\'s own line stays');
    assert.match(JSON.stringify(ctx.out.failures()), /already has a line its own retro wrote/);
    assert.equal(await backfill.run(ctx, ['--no-transcripts', '--force']), 0);
    assert.equal((await readLedger(file))[0].estimate, true);
    await assert.rejects(backfill.run(ctx, ['--ended-at', 'soon']), /not a date/);
  } finally { repo.cleanup(); claude.cleanup(); }
});

test('backfill-run --agents adds agents from a file, checked against the schema', async () => {
  const repo = await makeRunRepo();
  try {
    await updateState(repo.paths, (s) => s, ev(30, 'map'));
    const { ctx } = await ctxFor(repo.worktree);
    const extra = join(repo.root, 'agents.json');
    writeFileSync(extra, JSON.stringify([{ id: 'h1', role: 'builder', phase: 'build', model: 'opus', effort: null, minutes: 60, tokensIn: 1e6, tokensCached: 0, tokensOut: 1e5, costUsd: 6, outcome: 'done' }]));
    assert.equal(await backfill.run(ctx, ['--no-transcripts', '--agents', extra]), 0);
    assert.equal((await readLedger(ledgerPath(repo.paths)))[0].phaseCost.build.costUsd, 6);
    writeFileSync(extra, JSON.stringify([{ id: 'h2', role: 'builder' }]));
    await assert.rejects(backfill.run(ctx, ['--no-transcripts', '--agents', extra]), /agents\.json/);
  } finally { repo.cleanup(); }
});

// ---- model proposals ----

test('the retro proposes a model change from the agents, always large, and never touches models.json', async () => {
  const blocked = (id) => ({ id, role: 'fix-builder', phase: 'build', model: 'sonnet', effort: 'medium', minutes: 30, tokensIn: 1, tokensCached: 0, tokensOut: 1, costUsd: 1, outcome: 'blocked' });
  const cur = rec('gamma', { agents: [blocked('f1'), blocked('f2')] });
  const [p] = modelProposals([rec('alpha'), cur], cur).filter((x) => x.change.role === 'fix-builder');
  assert.deepEqual(p.change.to, { model: 'sonnet', effort: 'high' });
  assert.equal(p.metric.name, 'notDone.fix-builder');
  assert.equal(classify(p.change, null, { history: [] }).size, 'large');
  assert.deepEqual(modelProposals([cur], { ...cur, estimate: true }), [], 'an estimate never argues for a change');

  const opus = (id, feature) => ({ id, role: 'builder', phase: 'build', model: 'opus', effort: 'high', minutes: 60, tokensIn: 3e6, tokensCached: 0, tokensOut: 2e5, costUsd: 16, outcome: 'done' });
  const prev = rec('delta', { agents: [opus('b0')] });
  const now = rec('eps', { agents: [opus('b1')] });
  const trial = modelProposals([prev, now], now).find((x) => x.change.role === 'builder');
  assert.deepEqual(trial.change.to, { model: 'sonnet', effort: 'medium' });

  const repo = await makeRunRepo();
  try {
    const before = readFileSync(join(ROOT, 'models.json'), 'utf8');
    const { ctx } = await ctxFor(repo.worktree);
    for (const id of ['f1', 'f2']) await logAgent.run(ctx, ['--role', 'fix-builder', '--id', id, '--outcome', 'blocked']);
    const res = await runRetro(ctx, repo.paths);
    const entry = res.record.autoChanges.find((e) => e.kind === 'other' && e.change.kind === 'model');
    assert.ok(entry, 'recorded as a proposal');
    assert.deepEqual([entry.size, entry.status], ['large', 'proposed']);
    assert.ok(res.needsYou.some((l) => /fix-builder role from sonnet at medium to sonnet at high/.test(l)));
    assert.equal(readFileSync(join(ROOT, 'models.json'), 'utf8'), before, 'models.json is never changed by the retro');
  } finally { repo.cleanup(); }
});

// ---- delivery crop ----

function png(width, height, fill) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  return encodePng({ width, height, data });
}

test('png: a round trip keeps every pixel, and a crop scales a box by a whole number', () => {
  const src = png(8, 6, (x, y) => [x * 30, y * 40, 7, 255]);
  const img = decodePng(src);
  assert.deepEqual([img.width, img.height], [8, 6]);
  assert.deepEqual([...img.data.subarray((2 * 8 + 3) * 4, (2 * 8 + 3) * 4 + 4)], [90, 80, 7, 255]);
  const c = cropImage(img, { x: 3, y: 2, w: 2, h: 2, zoom: 2 });
  assert.deepEqual([c.width, c.height], [4, 4]);
  assert.deepEqual([...c.data.subarray(0, 4)], [90, 80, 7, 255]);
  assert.deepEqual([...c.data.subarray((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4)], [120, 120, 7, 255]);
  assert.deepEqual(cropImage(img, { x: 6, y: 4, w: 10, h: 10 }).box, { x: 6, y: 4, w: 2, h: 2 }, 'cut at the edge');
  assert.throws(() => cropImage(img, { x: 20, y: 0, w: 2, h: 2 }), /outside/);
  assert.throws(() => decodePng(Buffer.from('nope')), /not a PNG/);
});

test('delivery crop cuts the same box out of a round item\'s live and design pictures', async () => {
  const repo = await makeRunRepo();
  try {
    const dir = join(repo.paths.runDir, 'rounds', '2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'KC-05@phone.live.png'), png(40, 30, () => [255, 0, 0, 255]));
    writeFileSync(join(dir, 'KC-05@phone.design.png'), png(40, 30, () => [0, 0, 255, 255]));
    const { ctx, stdout } = await ctxFor(repo.worktree);
    assert.equal(await cropCommand.run(ctx, ['--round', '2', '--item', 'KC-05@phone', '--box', '5,5,10,8']), 0);
    const live = decodePng(readFileSync(join(dir, 'crops', 'KC-05@phone-5-5-10-8.live.png')));
    const design = decodePng(readFileSync(join(dir, 'crops', 'KC-05@phone-5-5-10-8.design.png')));
    assert.deepEqual([live.width, live.height, [...live.data.subarray(0, 3)]], [20, 16, [255, 0, 0]]);
    assert.deepEqual([...design.data.subarray(0, 3)], [0, 0, 255]);
    assert.match(stdout.text(), /crops\/KC-05@phone-5-5-10-8\.live\.png \(20 x 16/);
    await assert.rejects(cropCommand.run(ctx, ['--round', '2', '--item', 'KC-06', '--box', '1,1,2,2']), /no picture/);
    await assert.rejects(cropCommand.run(ctx, ['--round', '2', '--item', 'KC-05', '--box', '1,1']), /--box needs/);
    await assert.rejects(cropCommand.run(ctx, ['--round', '2', '--item', 'KC-05@phone', '--box', '1,1,2,2', '--zoom', '9']), /1 to 4/);
  } finally { repo.cleanup(); }
});

test('time inside a build agent\'s window is build time, whichever command ends the gap', () => {
  const journal = [ev(0, 'seed --apply'), ev(100, 'shoot --round 1')];
  assert.deepEqual([phasesFromJournal(journal).phases.build, phasesFromJournal(journal).phases.shoot], [null, 100]);
  const windows = [[Date.parse(at(10)), Date.parse(at(70))]];
  const { phases } = phasesFromJournal(journal, { buildWindows: windows });
  assert.deepEqual([phases.build, phases.shoot], [60, 40]);
  const [a] = agentsFromJournal([{ at: at(70), event: formatEvent(agentEvent({ id: 'b', role: 'builder', phase: 'build', model: 'opus', minutes: 60 })) }]);
  assert.equal(a.startedAt, at(10), 'a hook line is written when the agent stops');
});
