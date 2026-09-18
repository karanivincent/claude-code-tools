// delivery check: run mechanical checks M1-M17 and record findings.
// Owner: slice B1 (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError, EXIT, worstExit } from '../core/exit.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { CHECK_IDS, MODE_CHECKS, ADVISORY, runChecks } from '../checks/index.mjs';
import { resolveCaptureRun } from '../checks/env.mjs';

const USAGE = `usage: delivery check <id|all> [--capture <runId>]

Run one mechanical check (M1 to M17) or all of them on the plan, renders, captures and
message files, and record findings with source check:<id> and the severity by rule
(spec 8.1, raised one level on a day-one state). M5 and M6 are advisory until the replay
proves them: their output goes to .delivery/<feature>/hints/ for the auditors, not to
findings.json. "all" runs the checks of the capture's mode (spec 9): branch M3 M4 M7 M9 M10
M15; wave every check but M12; full every check; staging M3 M7 M10 M12 M15; real-org M12;
with no capture, M1 M2 M8 M13.

options:
  --capture <runId>  the capture run to check (default: the newest)

exit: 0 no open finding from these checks and no failure; 1 findings or failures;
      2 usage; 3 blocked (a check that needs the founder, such as M13's safety file);
      4 wait and retry (a preview not ready)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`;

export default defineCommand({
  name: 'check',
  summary: 'Run mechanical checks M1-M17 and record findings',
  usage: USAGE,
  async run(ctx, argv) {
    const { values, positionals } = parseCommandArgs(argv, {
      options: { capture: { type: 'string' } },
      positionals: { min: 1, max: 1, names: ['id|all'] },
    });
    const paths = ctx.requirePaths();
    const want = positionals[0];
    let ids;
    let captureRunId = values.capture ?? null;
    if (want === 'all') {
      captureRunId = await resolveCaptureRun(ctx, paths, captureRunId);
      const mode = captureRunId ? (await readArtefact(paths, 'capture', { key: captureRunId })).mode : 'none';
      ids = [...MODE_CHECKS[mode]];
      ctx.out.line(`check all on ${captureRunId ? `capture ${captureRunId} (${mode})` : 'no capture'}: ${ids.join(' ') || 'nothing to check in this mode'}`);
    } else {
      const id = want.toUpperCase();
      if (!CHECK_IDS.includes(id)) throw new UsageError(`unknown check "${want}"; one of ${CHECK_IDS.join(', ')} or all`);
      ids = [id];
    }
    if (!ids.length) return EXIT.PASS;

    const res = await runChecks(ctx, ids, { captureRunId });
    for (const n of res.notes) ctx.out.line(`NOTE ${n}`);
    for (const f of res.failures) ctx.out.fail(f.code, f.message);
    const open = res.findings.filter((f) => f.status === 'open');
    for (const f of open) ctx.out.fail(f.source.replace(/^check:/, ''), `${f.severity} ${f.state} ${f.where}: ${f.rule ?? ''} ${f.live}`.replace(/\s+/g, ' ').trim());
    for (const h of res.hints) ctx.out.line(`HINT ${h.source.replace(/^check:/, '')} ${h.state} ${h.where}: ${h.live}`);

    const count = (s) => open.filter((f) => f.severity === s).length;
    const counts = { findings: open.length, p1: count('P1'), p2: count('P2'), p3: count('P3'), failures: res.failures.length, hints: res.hints.length };
    ctx.out.line(`${ids.join(' ')}: ${open.length} open finding(s) (P1 ${counts.p1}, P2 ${counts.p2}, P3 ${counts.p3}), ${res.failures.length} failure(s)${res.hints.length ? `, ${res.hints.length} hint(s) for the auditors` : ''}${res.captureRunId ? ` on ${res.captureRunId}` : ''}`);
    ctx.out.set('checks', ids);
    ctx.out.set('captureRunId', res.captureRunId);
    ctx.out.set('counts', counts);
    ctx.out.set('findings', open.map((f) => ({ id: f.id, source: f.source, rule: f.rule ?? null, severity: f.severity, state: f.state, where: f.where })));
    ctx.out.set('advisory', ids.filter((id) => ADVISORY.has(id)));

    const exit = worstExit([open.length || res.failures.length ? EXIT.RED : EXIT.PASS, res.exit ?? EXIT.PASS]);
    await ctx.journal({ command: `check ${want === 'all' ? 'all' : ids[0]}`, exit, counts, inputs: { ids, captureRunId: res.captureRunId }, outputs: counts.findings ? open.map((f) => f.id) : [] });
    return exit;
  },
});
