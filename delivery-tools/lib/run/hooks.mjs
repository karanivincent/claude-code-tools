// The Node side of the plugin hooks (spec 11.4, 15.2). The shell scripts in hooks/ answer the
// no-run case themselves and call these only when a run may be active; these decide precisely.
// A refusal is exit 2 with the reason on stderr; the pre-bash ready check fails closed.

import { createCtx } from '../core/ctx.mjs';
import { hasMarker } from '../core/markers.mjs';
import { cliPrefix, ctxForRun, findRuns } from './context.mjs';
import { findRunPr, prMarker } from './github.mjs';
import { classifyBash } from './hook-match.mjs';
import { checkReady } from './ready.mjs';
import { dep } from './compose.mjs';

/** Read the hook payload: ctx.hookInput in tests, else stdin (empty after 2 s of silence). */
export async function readPayload(ctx) {
  const text = ctx.hookInput !== undefined ? String(ctx.hookInput) : await readStdin(2000);
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function readStdin(idleMs) {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const chunks = [];
    let timer = setTimeout(done, idleMs);
    function done() {
      clearTimeout(timer);
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      process.stdin.pause();
      resolve(Buffer.concat(chunks).toString('utf8'));
    }
    process.stdin.on('data', (c) => { chunks.push(c); clearTimeout(timer); timer = setTimeout(done, idleMs); });
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

/** Where refusals go: stderr (ctx.hookStderr in tests). */
export function hookStderr(ctx) {
  return ctx.hookStderr ?? process.stderr;
}

/** The ctx for the payload's cwd, which is where the session works (it may differ from the process's). */
export async function hookCtx(ctx, payload) {
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : null;
  if (!cwd || cwd === ctx.cwd) return ctx;
  const next = await createCtx({
    cwd, env: ctx.env, flags: { feature: null, json: false, help: false }, runner: ctx.runner,
    gh: ctx.gh && ctx.gh.repo !== 'unknown/unknown' ? ctx.gh : undefined, clock: ctx.clock, out: ctx.out, cli: ctx.cli,
  });
  if (ctx.deps) next.deps = ctx.deps;
  if (ctx.hookStderr) next.hookStderr = ctx.hookStderr;
  return next;
}

function within(dir, root) {
  return dir === root || dir.startsWith(root.endsWith('/') ? root : `${root}/`);
}

/**
 * The runs a gh pr ready target belongs to, each with its PR number.
 * @returns {Promise<{ run: object, pr: number|null }[]>}
 */
async function ownersOf(ctx, runs, target, cwd) {
  if (target.repo && ctx.gh?.repo && target.repo.toLowerCase() !== ctx.gh.repo.toLowerCase()) return [];
  const out = [];
  for (const run of runs) {
    const state = run.state;
    if (target.pr) {
      if (state?.pr === target.pr) { out.push({ run, pr: target.pr }); continue; }
      const pull = await ctx.gh.prGet(target.pr).catch(() => null);
      if (pull && hasMarker(pull.body, await prMarker(ctx, run.feature))) out.push({ run, pr: target.pr });
      continue;
    }
    const byBranch = target.branch && state?.branch === target.branch;
    let byCwd = false;
    if (target.current && cwd) {
      if (within(cwd, run.worktree)) byCwd = true;
      else {
        const r = await ctx.runner.run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd });
        byCwd = r.code === 0 && state?.branch === String(r.stdout).trim();
      }
    }
    if (byBranch || byCwd) out.push({ run, pr: state?.pr ?? null });
  }
  return out;
}

/** checkReady for one run's PR, as problem lines (empty when green). */
async function readyProblems(ctx, run, pr) {
  if (run.broken || !run.state) return [`run ${run.feature}: state.json is inconsistent (${run.broken?.message ?? 'unreadable'}); nothing may be marked ready`];
  const rctx = await ctxForRun(ctx, run);
  let number = pr;
  if (!number) number = (await findRunPr(rctx, run.state))?.number ?? null;
  if (!number) return [];
  const r = await dep(ctx, 'checkReady', checkReady)(rctx, { pr: number });
  if (r.ok) return [];
  const cli = cliPrefix(run.worktree, ctx.pluginRoot);
  return [
    `PR #${number} belongs to the delivery run ${run.feature}, and its ready.json does not allow marking it ready:`,
    ...r.failures.map((f) => `  - ${f.code}: ${f.message}`),
    `Run ${cli} ready --pr ${number} until it is green; the hook is right until it is.`,
  ];
}

/**
 * @param {object} ctx
 * @param {object} payload the PreToolUse payload for Bash
 * @returns {Promise<{ allow: boolean, reason?: string }>}
 */
export async function decidePreBash(ctx, payload) {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return { allow: true };
  const cls = classifyBash(command);
  if (!cls.ready.length && !cls.readyApi && !cls.seed) return { allow: true };
  let hctx;
  let runs;
  try {
    hctx = await hookCtx(ctx, payload);
    runs = await findRuns(hctx);
  } catch (err) {
    // The shell only calls here when it saw a run's state.json, so an error fails closed.
    return { allow: false, reason: `delivery: could not tell whether a delivery run is active (${err?.message ?? err}), so "${command.trim().slice(0, 120)}" is refused; run delivery status` };
  }
  if (!runs.length) return { allow: true };
  const names = runs.map((r) => r.feature).join(', ');
  if (cls.seed) {
    const cli = cliPrefix(runs[0].worktree, ctx.pluginRoot);
    return {
      allow: false,
      reason: `delivery: refused a raw seed command while the delivery run ${names} is active: ${cls.seed}. Only delivery seed writes fixture rows (spec 7.4): ${cli} seed --plan, then --check, --apply and --scan.`,
    };
  }
  const problems = [];
  try {
    for (const target of cls.ready) {
      for (const { run, pr } of await ownersOf(hctx, runs, target, hctx.cwd)) problems.push(...(await readyProblems(hctx, run, pr)));
    }
    if (cls.readyApi) for (const run of runs) problems.push(...(await readyProblems(hctx, run, null)));
  } catch (err) {
    problems.push(`the ready check could not run (${err?.message ?? err}), so nothing is marked ready`);
  }
  if (!problems.length) return { allow: true };
  return { allow: false, reason: [`delivery: refused "${command.trim().split('\n')[0].slice(0, 120)}".`, ...problems].join('\n') };
}

/**
 * @param {object} ctx
 * @param {object} payload the PreToolUse payload for a browser tool
 * @returns {Promise<{ allow: boolean, reason?: string }>}
 */
export async function decidePreBrowser(ctx, payload) {
  const agent = payload?.agent_id;
  if (typeof agent !== 'string' || !agent.trim()) return { allow: true };
  const hctx = await hookCtx(ctx, payload);
  const runs = await findRuns(hctx);
  if (!runs.length) return { allow: true };
  const tool = typeof payload.tool_name === 'string' && payload.tool_name ? payload.tool_name : 'this browser tool';
  return {
    allow: false,
    reason: `delivery: ${tool} refused for subagent ${agent}: the delivery run ${runs.map((r) => r.feature).join(', ')} is active, and every browser action by a subagent would ask the founder to approve it. Subagents never use browser tools (spec 3.3); browser work in a run goes through the committed capture command, run by the main session (delivery capture).`,
  };
}
