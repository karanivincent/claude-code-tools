// delivery capture: capture states for a mode and validate every capture (spec 4.2 step 4, 4.5, 4.6, 6.2, 9).
// Owner: slice C (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { UsageError, EXIT } from '../core/exit.mjs';
import { captureRun } from '../capture/run.mjs';
import { MODES } from '../capture/job.mjs';

export default defineCommand({
  name: "capture",
  summary: "Capture states for a mode and validate every capture",
  usage: `usage: delivery capture --mode baseline|branch|wave|full|staging|real-org [--states <ID,...>] [--base-url <url>] [--sha <sha>] [--unit <unit>] [--smoke] [--timeout <minutes>] [--dry-run]

Run the committed capture spec through the heavy wrapper over the mode's matrix of worlds,
widths, roles, locales and themes (spec 9). Each capture is validated: required markers
present, no forbidden marker, not identical to a sibling, served SHA as expected, no console
error or failed request, seed data not drifted; otherwise the state is not-reached.
Writes .delivery/<feature>/captures/<run>/capture.json. real-org is read-only by interception.

Modes: baseline (today's pages on the test deployment, before and after pictures, captured not
judged), branch (a unit's dev server, which the capture's Playwright webServer owns), wave and
full (the preview serving the PR head; a local production build where there are no previews),
staging (the test deployment after the merge), real-org (the founder's organisation, read-only).
A state is captured when its plan row is seeded, or an action with an intercept; prop and
unseedable states are listed as component-test states. Fixture worlds are re-applied and scanned
before anything is captured in them; rows that clicks create are torn down afterwards.

options:
  --mode <mode>      required
  --states <ids>     only these states
  --base-url <url>   where to capture (default: resolved from the mode)
  --sha <sha>        the expected served SHA (default: the head)
  --unit <unit>      branch mode: the unit whose states and dev server to use
  --smoke            branch mode: one state per world and role, on this worktree (the wave-0 smoke)
  --timeout <min>    give up on the capture command after this many minutes (default 90)
  --dry-run          write the job file and print the command, run nothing

exit: 0 every state reached; 1 a state not reached; 3 the real organisation is needed and not named; 4 preview not ready

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: {
        mode: { type: 'string' }, states: { type: 'string' }, 'base-url': { type: 'string' }, sha: { type: 'string' },
        unit: { type: 'string' }, smoke: { type: 'boolean', default: false }, timeout: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
    });
    if (!values.mode) throw new UsageError(`--mode is required: one of ${MODES.join(', ')}`);
    if (values.unit && values.mode !== 'branch') throw new UsageError('--unit is a branch-mode option');
    if (values.sha !== undefined && !/^[0-9a-f]{7,40}$/i.test(values.sha)) throw new UsageError(`--sha needs a commit SHA, got "${values.sha}"`);
    if (values['base-url'] !== undefined && !/^https?:\/\//.test(values['base-url'])) throw new UsageError(`--base-url needs an http(s) URL, got "${values['base-url']}"`);
    let timeoutMs;
    if (values.timeout !== undefined) {
      if (!/^[1-9]\d{0,3}$/.test(values.timeout)) throw new UsageError(`--timeout needs whole minutes, got "${values.timeout}"`);
      timeoutMs = Number(values.timeout) * 60_000;
    }
    const states = values.states ? values.states.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const r = await captureRun(ctx, {
      mode: values.mode, states, unit: values.unit ?? null, baseUrl: values['base-url'] ?? null,
      sha: values.sha?.toLowerCase() ?? null, smoke: values.smoke, dryRun: values['dry-run'], timeoutMs,
    });
    for (const s of r.skipped) ctx.out.line(`not captured ${s.state}: ${s.why}`);
    if (values['dry-run']) {
      ctx.out.line(`job ${r.jobPath}`);
      ctx.out.line(`base URL ${r.target.baseUrl} (${r.target.detail}), expected SHA ${r.target.expectedSha}`);
      ctx.out.line(`would run: ${Object.entries(r.env).map(([k, v]) => `${k}=${v}`).join(' ')} ${r.command}`);
      ctx.out.set('runId', r.runId);
      ctx.out.set('jobPath', r.jobPath);
      ctx.out.set('command', r.command);
      return EXIT.PASS;
    }
    // An unnamed or unreadable observer is reported (the report leads with it), never a red capture.
    for (const f of r.failures) {
      if (f.code === 'real-org') ctx.out.warn(f.message);
      else ctx.out.fail(f.code, f.message);
    }
    const items = r.capture.items;
    for (const it of items.filter((i) => i.status !== 'reached')) {
      ctx.out.fail('not-reached', `${it.state} ${it.world}/${it.role} ${it.width} ${it.locale} ${it.theme}: ${it.why}`);
    }
    ctx.out.line(`capture ${r.runId}: ${items.length - r.notReached} of ${items.length} reached (${r.capture.mode}, ${r.capture.baseUrl}, expected ${r.capture.expectedSha.slice(0, 12)})`);
    ctx.out.set('runId', r.runId);
    ctx.out.set('items', items.length);
    ctx.out.set('notReached', r.notReached);
    ctx.out.set('skipped', r.skipped);
    return r.notReached || r.failures.some((f) => f.code !== 'real-org') ? EXIT.RED : EXIT.PASS;
  },
});
