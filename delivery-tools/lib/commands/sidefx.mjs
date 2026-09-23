// delivery sidefx: derive the side-effect map from worker code and migrations.
// Owner: slice B2 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { deriveWithReport } from '../sidefx/derive.mjs';
import { describeFilters } from '../seed/evaluate.mjs';

export default defineCommand({
  name: 'sidefx',
  summary: 'Derive the side-effect map from worker code and migrations',
  usage: `usage: delivery sidefx [--ref <ref>]... [--no-db] [--list]

Build .delivery/<feature>/sidefx.json from the code, every run: .from('<table>') chains with
literal filters in the safety file's worker globs, the where clauses of the latest SQL
definition of every .rpc() function they call, the test database's scheduled jobs, and the
safety file's hand-listed forbidden states. Every predicate is actionable by default.

options:
  --ref <ref>   read the worker files at this git ref (repeatable; default origin/<base> and HEAD,
                the code the test environment runs and the code being built)
  --no-db       do not read cron.job from the test database; the map then misses scheduled jobs,
                which a warning says (seed --check and --scan never use this: they derive the map
                afresh, database included)
  --list        print every predicate

exit: 0 derived; 1 a scheduled job or database function could not be parsed and is not hand-listed,
      or cron.job could not be read; 3 no safety file

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: { ref: { type: 'string', multiple: true }, 'no-db': { type: 'boolean' }, list: { type: 'boolean' } },
    });
    const noDb = Boolean(values['no-db']);
    const { sidefx, failures, notes } = await deriveWithReport(ctx, { refs: values.ref, cron: noDb ? 'skip' : 'db', write: Boolean(ctx.paths) });
    const by = (o) => sidefx.predicates.filter((p) => p.origin === o).length;
    ctx.out.line(`side-effect map: ${sidefx.predicates.length} predicate(s) (ts ${by('ts')}, sql ${by('sql')}, hand ${by('hand')}) from ${notes.tsFiles} worker file(s) at ${notes.refs.join(', ')}; cron: ${noDb ? 'not read (--no-db)' : notes.cron}`);
    if (notes.rpcs.length) ctx.out.line(`database functions followed: ${notes.rpcs.join(', ')}`);
    if (values.list) for (const p of sidefx.predicates) ctx.out.line(`  ${p.id}  ${p.table}: ${describeFilters(p.filters)}  (${p.source})`);
    for (const f of failures) ctx.out.fail(f.code, f.message);
    if (noDb) ctx.out.warn('cron.job was not read (--no-db): scheduled jobs are missing from this map');
    ctx.out.set('sidefx', { predicates: sidefx.predicates, files: sidefx.files.length, notes });
    const exit = failures.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'sidefx', exit, counts: { predicates: sidefx.predicates.length, failures: failures.length }, outputs: sidefx.predicates });
    return exit;
  },
});
