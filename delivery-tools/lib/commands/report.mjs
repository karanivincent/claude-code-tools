// delivery report: print the founder's report in the tldr format (spec 11.5).
// Owner: slice C (docs/ARCHITECTURE.md).

import { relative } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact, artefactHash } from '../core/artefacts.mjs';
import { readFindings } from '../core/findings.mjs';
import { loadState } from '../core/state.mjs';
import { readJson, exists } from '../core/fs.mjs';
import { EXIT } from '../core/exit.mjs';
import { buildReport } from '../report/report.mjs';
import { sameSha } from '../capture/judge.mjs';

export default defineCommand({
  name: "report",
  summary: "Print the founder's report in the tldr format",
  usage: `usage: delivery report

Print the founder's report (TL;DR, Needs you with tiers, Went wrong, Done, depth linked)
from ready.json, findings, the plan and the journal. The first line is the ready verdict for
the head SHA; late changes, waivers and accepted P2s come first. A ready record whose head or
inputs (plan, inventory, baseline, findings, safety file) changed since it was written is
reported stale, never ready. Nothing is recomputed and nothing is written.

The umbrella's final message is this output verbatim, plus the link to the punch-list page.

exit: 0 printed

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    parseCommandArgs(argv, {});
    const paths = ctx.requirePaths();
    let readyProblem = null;
    let ready = null;
    try {
      ready = await readArtefact(paths, 'ready', { optional: true });
    } catch (err) {
      if (typeof err.exit !== 'number') throw err;
      readyProblem = `ready.json is unreadable or does not match its schema (${err.message})`;
    }
    let state = null;
    let journalBroken = null;
    try {
      state = await loadState(paths.state, { optional: true });
    } catch (err) {
      if (typeof err.exit !== 'number') throw err;
      journalBroken = err.message;
      state = await readJson(paths.state, { optional: true, exit: EXIT.INCONSISTENT }).catch(() => null);
    }
    const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
    const intent = await readArtefact(paths, 'intent', { optional: true }).catch(() => null);
    const inventory = await readArtefact(paths, 'inventory', { optional: true }).catch(() => null);
    const findings = await readFindings(paths, state?.runId ?? 'report').catch(() => null);
    let profile = null;
    try { profile = await ctx.profile(); } catch { profile = null; }

    const stale = [];
    if (ready) {
      for (const name of ['plan', 'inventory', 'baseline', 'findings']) {
        const now = await artefactHash(paths, name);
        if (ready.inputs[name] !== now) stale.push(`${name}.json changed since the ready check`);
      }
      try {
        const s = await ctx.safety();
        if (ready.inputs.safety !== 'absent' && ready.inputs.safety !== s.sha256) stale.push('the safety file changed since the ready check');
      } catch { /* no safety file: nothing to compare */ }
    }
    const head = await ctx.git.revParse('HEAD').catch(() => null);
    if (ready && head && !sameSha(head, ready.headSha)) stale.unshift(`the head moved to ${head.slice(0, 12)}`);

    const pr = state?.pr ?? null;
    const repo = profile?.issues?.repo ?? profile?.repo?.slug ?? null;
    const r = buildReport({
      ready, readyProblem, stale, findings, plan, state, journalBroken, head, intent, inventory,
      punchList: (await exists(paths.punchList)) ? relative(ctx.cwd, paths.punchList) || paths.punchList : null,
      prUrl: pr && repo ? `https://github.com/${repo}/pull/${pr}` : null,
      cli: ctx.cli,
    });
    ctx.out.line(r.text);
    ctx.out.set('verdict', r.verdict);
    ctx.out.set('ready', r.ready);
    ctx.out.set('needsYou', r.needsYou);
    ctx.out.set('wentWrong', r.wentWrong);
    ctx.out.set('done', r.done);
    return EXIT.PASS;
  },
});
