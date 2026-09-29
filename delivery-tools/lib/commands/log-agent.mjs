// delivery log-agent: record one agent of the run (role, model, effort, minutes, tokens, outcome) in
// its journal, for the runs ledger. The SubagentStop hook does this on its own; the skills call it
// after an agent returns to add the outcome, and it covers a session whose hook did not fire.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { ROLES, roleConfig, costOf, familyOf } from '../retro/models.mjs';
import { agentFromTranscript } from '../retro/usage.mjs';
import { agentEvent } from '../retro/log.mjs';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const count = (v, flag) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`${flag} needs a number of 0 or more, got "${v}"`);
  return n;
};

export default defineCommand({
  name: 'log-agent',
  summary: 'Record one agent of the run (role, model, effort, minutes, tokens, outcome) in its journal',
  usage: `usage: delivery log-agent --role <role> [--id <id>] [--outcome <word>] [--transcript <file.jsonl>]
                          [--model <m>] [--effort <e>] [--minutes <n>]
                          [--tokens-in <n>] [--tokens-cached <n>] [--tokens-out <n>]

Adds an agent line to the run's journal; delivery retro turns the lines into the ledger's agents,
phaseCost and the time and cost by model that delivery runs prints. The plugin's SubagentStop
hook writes one line per agent on its own (numbers from the agent's transcript). Call this after
an agent returns to add what the hook cannot know, such as --outcome blocked, with the same --id
(the agent id the dispatch returned); a later line for an id fills in or overrides the earlier one.

The role is one of models.json's roles (${ROLES.join(', ')}) or "other". The model and
effort default to the role's in models.json; the phase is always the role's. --transcript reads
minutes, tokens and model from an agent's transcript file; flags given as well win.

options:
  --role <role>          required
  --id <id>              the agent's id (default: a new one per call)
  --outcome <word>       done (default), blocked, failed, or another lowercase word
  --transcript <file>    the agent's .jsonl transcript
  --model <m>            opus, sonnet, haiku or a model id
  --effort <e>           low, medium, high, xhigh or max
  --minutes <n>          wall-clock minutes
  --tokens-in <n>        input tokens, cache writes included
  --tokens-cached <n>    cache-read tokens
  --tokens-out <n>       output tokens

exit: 0 recorded; 2 usage or no run

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values: v } = parseCommandArgs(argv, { options: Object.fromEntries(['role', 'id', 'outcome', 'transcript', 'model', 'effort', 'minutes', 'tokens-in', 'tokens-cached', 'tokens-out'].map((k) => [k, { type: 'string' }])) });
    ctx.requirePaths();
    const role = String(v.role ?? '');
    if (!role) throw new UsageError('--role <role> is required');
    if (role !== 'other' && !ROLES.includes(role)) throw new UsageError(`--role must be one of ${ROLES.join(', ')} or other, got "${role}"`);
    if (v.effort && !EFFORTS.includes(v.effort)) throw new UsageError(`--effort must be one of ${EFFORTS.join(', ')}`);
    if (v.outcome && !/^[a-z][a-z-]*$/.test(v.outcome)) throw new UsageError('--outcome is one lowercase word, such as done, blocked or failed');
    const cfg = role === 'other' ? null : roleConfig(role);
    let a = { id: v.id ?? `log-${ctx.clock.now().getTime().toString(36)}`, role, phase: cfg?.phase ?? null };
    if (v.transcript) {
      const t = agentFromTranscript({ id: a.id, text: readFileSync(resolve(ctx.cwd, v.transcript), 'utf8'), effortFromConfig: false });
      if (!t) throw new UsageError(`${v.transcript} holds no assistant message to count`);
      a = { ...a, model: t.model, minutes: t.minutes, tokensIn: t.tokensIn, tokensCached: t.tokensCached, tokensOut: t.tokensOut, outcome: t.outcome };
    }
    const model = v.model ? (familyOf(v.model) ?? v.model) : (a.model ?? cfg?.model);
    a = {
      ...a, model, effort: v.effort ?? cfg?.effort ?? null,
      minutes: count(v.minutes, '--minutes') ?? a.minutes,
      tokensIn: count(v['tokens-in'], '--tokens-in') ?? a.tokensIn,
      tokensCached: count(v['tokens-cached'], '--tokens-cached') ?? a.tokensCached,
      tokensOut: count(v['tokens-out'], '--tokens-out') ?? a.tokensOut,
      outcome: v.outcome ?? a.outcome ?? 'done',
    };
    if ([a.tokensIn, a.tokensCached, a.tokensOut].some(Number.isFinite)) a.costUsd = costOf(a.model, a) ?? undefined;
    await ctx.journal(agentEvent(a));
    ctx.out.line(`logged ${a.role} ${a.id}: ${a.model}${a.effort ? ` at ${a.effort}` : ''}, outcome ${a.outcome}${Number.isFinite(a.minutes) ? `, ${a.minutes} min` : ''}${Number.isFinite(a.costUsd) ? `, about $${a.costUsd}` : ''}`);
    ctx.out.set('agent', a);
    return 0;
  },
});
