// delivery gate: unit gate: branch capture, M3 M4 M7 M9 M10, component tests, unit check.
// Owner: slice B1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT } from '../core/exit.mjs';
import { assertFileId } from '../core/paths.mjs';
import { runUnitGate, RENDER_EMPTY_ENV } from '../gate/unit.mjs';

export default defineCommand({
  name: 'gate',
  summary: 'Unit gate: branch capture, M3 M4 M7 M9 M10, component tests, unit check',
  usage: `usage: delivery gate <unit>

Capture the unit's own states in branch mode on its dev server (Playwright webServer, through
the heavy wrapper), run M3, M4 (design world), M7, M9 and M10 on those captures, check the
component render tests (every marker in the test file, the test passing, and failing when
the component renders nothing: the test runs once more with ${RENDER_EMPTY_ENV}=1), and re-run
the unit check in the unit's worktree. Writes findings and the failure file
.delivery/<feature>/units/<unit>.gate.json; red means the builder gets that file.

exit: 0 green; 1 red

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { positionals } = parseCommandArgs(argv, { positionals: { min: 1, max: 1, names: ['unit'] } });
    const unitId = assertFileId(positionals[0], 'unit id');
    const r = await runUnitGate(ctx, unitId);
    for (const f of r.failures) ctx.out.fail(f.code, f.message);
    ctx.out.line(`gate ${unitId}: ${r.ok ? 'green' : `red, ${r.failures.length} failure(s); the builder gets ${r.file}`}${r.captureRunId ? ` (capture ${r.captureRunId})` : ''}`);
    ctx.out.set('file', r.file);
    ctx.out.set('captureRunId', r.captureRunId);
    ctx.out.set('head', r.head);
    const exit = r.ok ? EXIT.PASS : EXIT.RED;
    await ctx.journal({ command: `gate ${unitId}`, exit, counts: { failures: r.failures.length, capture: r.captureRunId ?? 'none' }, inputs: { unit: unitId, head: r.head }, outputs: r.failures });
    return exit;
  },
});
