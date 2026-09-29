// delivery backfill-run: write an estimated ledger line for a run that ended without one, from its
// journal, its rounds and Claude Code's transcripts of its worktree. Owner: slice A2.

import { resolve } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readJson } from '../core/fs.mjs';
import { UsageError } from '../core/exit.mjs';
import { loadState } from '../core/state.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { buildRecord, phaseCost } from '../retro/record.mjs';
import { ledgerPath, readLedger, writeRecord } from '../retro/ledger.mjs';
import { runRows } from '../retro/runs.mjs';

export default defineCommand({
  name: 'backfill-run',
  summary: 'Write an estimated runs-ledger line for an earlier run, from its journal and transcripts',
  usage: `usage: delivery backfill-run [--ended-at <iso>] [--transcripts <dir> | --no-transcripts]
                             [--agents <file.json>] [--force] [--dry-run]

For a run that ended before land wrote the runs ledger: builds the run's line the way delivery
retro does (phase minutes and founder waits from the journal, rounds and reviewer batches from
rounds/, improvements from workflow-improvements.md) and adds its agents and the main session's
tokens from Claude Code's transcripts of the run's worktree (~/.claude/projects/<worktree>/, or
--transcripts). The line is marked "estimate": true, and each agent's effort is null, since
nothing recorded it. It proposes and applies nothing: the next real retro compares against it.

It never replaces a line the run's own retro wrote (estimate false) unless --force; it replaces an
earlier backfill of the same run. Commit docs/delivery/runs.jsonl afterwards.

options:
  --ended-at <iso>       when the run ended (default: the journal's last line)
  --transcripts <dir>    Claude Code's folder of the run's sessions
  --no-transcripts       journal and rounds only
  --agents <file.json>   more agents, as the ledger's agents entries (for sessions whose
                         transcripts are gone)
  --force                replace the run's own retro line
  --dry-run              print the line; write nothing

exit: 0 written (or printed); 1 the run already has a retro line; 2 no run or a bad option

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values: v } = parseCommandArgs(argv, { options: {
      'ended-at': { type: 'string' }, transcripts: { type: 'string' }, 'no-transcripts': { type: 'boolean' },
      agents: { type: 'string' }, force: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    } });
    const paths = ctx.requirePaths();
    if (v.transcripts && v['no-transcripts']) throw new UsageError('give --transcripts or --no-transcripts, not both');
    const state = await loadState(paths.state, { optional: true });
    const last = (state?.journal ?? []).map((e) => e.at).filter(Boolean).sort().pop();
    const endedAt = v['ended-at'] ?? last;
    if (!endedAt || !Number.isFinite(Date.parse(endedAt))) throw new UsageError(v['ended-at'] ? `--ended-at "${v['ended-at']}" is not a date` : 'the run has no journal to date it by; pass --ended-at');
    const file = ledgerPath(paths);
    const previous = (await readLedger(file)).find((r) => r.feature === paths.feature) ?? null;
    if (previous && !previous.estimate && !v.force) {
      ctx.out.fail('recorded', `${paths.feature} already has a line its own retro wrote (${previous.endedAt}); pass --force to replace it with an estimate`);
      return 1;
    }
    const transcripts = v['no-transcripts'] ? false : (v.transcripts ? resolve(ctx.cwd, v.transcripts) : undefined);
    const rec = await buildRecord(ctx, paths, { previous, estimate: true, endedAt: new Date(Date.parse(endedAt)).toISOString(), transcripts });
    if (v.agents) {
      const extra = await readJson(resolve(ctx.cwd, v.agents));
      const list = Array.isArray(extra) ? extra : [extra];
      const ids = new Set(rec.agents.map((a) => a.id));
      rec.agents.push(...list.filter((a) => !ids.has(a.id)));
      rec.phaseCost = phaseCost(rec.agents);
      const check = validateAgainst('run-record', rec);
      if (!check.ok) throw new UsageError(`${v.agents}: ${check.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')}`);
    }
    const row = runRows([rec])[0];
    ctx.out.line(`backfill ${rec.feature} (estimate): ${row.minutes} min over ${Object.values(rec.phases).filter((p) => p !== null).length} phases, ${rec.agents.length} agents, ${rec.rounds.length} rounds, cost ${row.costUsd === null ? 'not found' : `about $${row.costUsd.toFixed(2)}`}${rec.main ? '' : '; no main-session transcript found'}`);
    ctx.out.set('record', rec);
    if (v['dry-run']) { ctx.out.line(JSON.stringify(rec)); return 0; }
    await writeRecord(file, rec);
    ctx.out.line(`written to ${file.slice(paths.repoRoot.length + 1)}; commit it`);
    await ctx.journal({ command: 'backfill-run', exit: 0, counts: { agents: rec.agents.length, rounds: rec.rounds.length } });
    return 0;
  },
});
