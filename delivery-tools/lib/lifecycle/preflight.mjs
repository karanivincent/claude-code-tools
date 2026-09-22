// Preflight probes (spec 4.1). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Every probe answers green, red, task (a repo prerequisite a wave-0 builder makes), waived,
// warning or not-applicable. A red probe is either a red-circle item (the founder acts, exit 3)
// or not; PROBES says which, and "conditional" probes decide from what they found. Probes that
// need another slice (the data adapter, sidefx, the seed check) show that slice's absence as a
// red line rather than crashing. The cheap probes (P1, P2, P7, P14) are recomputed by the phase-1
// gate from their sources; the rest are re-read from preflight.json.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROFILE_PATH, validateProfile, loadSafety, fillCommand, wrapHeavy } from '../core/profile.mjs';
import { sha256 } from '../core/hash.mjs';
import { gateResult } from '../core/gate.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { exists } from '../core/fs.mjs';
import { EXIT } from '../core/exit.mjs';
import { deps, isNotImplemented } from './deps.mjs';
import { readState, readPlan, matchesAny, lastLine, findRunPr, clip } from './run-info.mjs';
import { resolvePreview } from './preview.mjs';
import { unfilled } from './init.mjs';
import { parseDatabaseTypes } from '../plan/verify.mjs';

/**
 * Every probe, whether the founder may waive it, and whether red means the founder must act
 * (a red-circle item, exit 3) rather than a wave-0 task. Read by waive (A1) and the phase-1 gate.
 * blocking "conditional" means red-circle only in the case the spec names (see note).
 * @type {ReadonlyArray<{ id: string, title: string, waivable: boolean, blocking: boolean|'conditional', note: string }>}
 */
export const PROBES = Object.freeze([
  { id: 'P1', title: 'Profile validates; command strings complete', waivable: false, blocking: 'conditional', note: 'red-circle only for a founder-authored field; otherwise a wave-0 profile fix' },
  { id: 'P2', title: 'Safety file exists, validates, byte-identical to origin/<base>', waivable: false, blocking: true, note: 'no seeding without it' },
  { id: 'P3', title: 'Test database: service-role read and write; the project is the test project, not production', waivable: false, blocking: true, note: '' },
  { id: 'P4', title: 'Migration apply path to the test environment', waivable: false, blocking: 'conditional', note: 'red-circle when the plan adds a migration; re-checked after planning' },
  { id: 'P5', title: 'Fixture worlds; the e2e robot is not in the founder\'s organisation', waivable: false, blocking: false, note: 'wave-0 task T-robot-org' },
  { id: 'P6', title: 'Safe seeding: sidefx derives and an empty seed plan passes seed --check', waivable: false, blocking: false, note: 'wave-0 task' },
  { id: 'P7', title: 'Committed capture spec and a version route reporting the served SHA', waivable: false, blocking: false, note: 'wave-0 tasks T-capture, T-version' },
  { id: 'P8', title: 'Trusted e2e path against a resolved preview passes a smoke spec', waivable: false, blocking: 'conditional', note: 'red-circle if auth fails; wave-0 task if only the smoke spec is missing' },
  { id: 'P9', title: 'Preview resolver, CI waiter and staging-deploy waiter run', waivable: false, blocking: true, note: '' },
  { id: 'P10', title: 'Bootstrap command prepares a fresh worktree', waivable: false, blocking: false, note: 'wave-0 task T-bootstrap' },
  { id: 'P11', title: 'Heavy-slot wrapper works; both slots within 10 minutes', waivable: false, blocking: true, note: '' },
  { id: 'P12', title: 'Pool planner runs; path claims present in the scope check', waivable: false, blocking: 'conditional', note: 'red-circle for the planner; missing path claims is a recorded warning' },
  { id: 'P13', title: 'Observer user is a member of the founder\'s organisation', waivable: true, blocking: false, note: 'wave-0 task if the safety file names it; the report then leads with the waiver' },
  { id: 'P14', title: 'Every message file and banned-word list exists', waivable: false, blocking: false, note: 'wave-0 task' },
  { id: 'P15', title: 'Permission rehearsal: every command shape runs once without a prompt', waivable: false, blocking: false, note: 'fix the allow rule now' },
  { id: 'P16', title: 'Loop-test broker available when an in-scope path matches loopTest.when', waivable: false, blocking: 'conditional', note: 'red-circle only when the voice path is in scope' },
]);

/** The wave-0 tasks a probe can turn into (spec 19 names the same ids). */
export const TASKS = Object.freeze({
  'T-profile': 'Fix the delivery profile so every command is complete',
  'T-robot-org': 'Move the e2e robot and its fixtures into their own organisation',
  'T-seed-safe': 'Make seeding safe: the side-effect map derives and an empty seed plan passes the seed check',
  'T-capture': 'Commit the capture spec and its support file from the templates',
  'T-version': 'Add a version route that reports the served commit SHA',
  'T-bootstrap': 'Add a bootstrap command that prepares a fresh worktree and prints the test line',
  'T-observer': 'Create the observer user from the safety file and add it to the founder\'s organisation',
  'T-locales': 'Add the missing message files and banned-word lists',
  'T-path-claims': 'Teach the scope check and the dispatcher to honour the claimed-paths block of open delivery-run PRs',
});

export const CHEAP_PROBES = Object.freeze(['P1', 'P2', 'P7', 'P14']);

const green = (detail) => ({ status: 'green', detail });
const warning = (detail) => ({ status: 'warning', detail });
const na = (detail) => ({ status: 'not-applicable', detail });
const task = (id, detail) => ({ status: 'task', detail, task: id });
const redP = (detail, { blocking = false, fix } = {}) => ({ status: 'red', detail, blocking, ...(fix ? { fix } : {}) });

/** The script a command runs (node x.mjs, bash y.sh), repo-relative, or null. */
export function scriptOf(command) {
  for (const tok of String(command ?? '').split(/\s+/)) {
    const t = tok.replace(/^['"]|['"]$/g, '');
    if (/^[\w./-]+\.(m?js|cjs|ts|sh|py)$/.test(t) && !t.startsWith('-')) return t;
  }
  return null;
}

/** Everything the probes read, loaded once. Never throws for a missing piece. */
async function probeEnv(ctx) {
  const env = { ctx, d: deps(ctx), paths: ctx.paths, profile: null, profileBytes: null, profileIssues: [], safety: null, safetyErr: null, plan: null, state: null };
  try { env.profileBytes = await readFile(join(ctx.repoRoot, PROFILE_PATH)); } catch { env.profileBytes = null; }
  if (env.profileBytes) {
    try {
      env.profile = JSON.parse(env.profileBytes.toString('utf8'));
      env.profileIssues = validateProfile(env.profile);
      for (const p of unfilled(env.profile)) {
        if (!env.profileIssues.some((i) => i.path === p)) env.profileIssues.push({ path: p, message: 'still says "<fill in: ...>"' });
      }
    } catch (err) { env.profileIssues = [{ path: '/', message: `not valid JSON (${err.message})` }]; env.profile = null; }
  }
  if (env.profile && !env.profileIssues.length) {
    try { env.safety = await loadSafety(ctx.repoRoot, env.profile); } catch (err) { env.safetyErr = err; }
  }
  if (env.paths) {
    env.plan = await readPlan(env.paths, { optional: true }).catch(() => null);
    env.state = await readState(env.paths).catch(() => null);
  }
  return env;
}

async function dataAdapter(env) {
  if (!env.adapter) env.adapter = env.d.createDataAdapter(env.ctx, {});
  return env.adapter;
}

/**
 * The columns a plan's rows declare missing that the generated database types still lack.
 *
 * A row's `exists: false` is a statement about the base at planning time, and the plan is frozen
 * at the Scope snapshot, so it keeps saying "missing" after the backend unit that builds it has
 * merged. Reading the plan alone therefore makes P4 red-circle forever once any row ever asked
 * for a migration: the widgets rehearsal applied its table, regenerated the types and still got
 * "the plan adds data the schema lacks" at every later preflight. The schema is the thing P4 is
 * actually about, so it is what gets asked; an unreadable types file answers "assume missing",
 * which is the safe direction and is its own probe's problem.
 */
async function stillMissing(env) {
  const declared = [...new Set((env.plan?.rows ?? []).flatMap((row) => (row.data ?? []).filter((x) => !x.exists).map((x) => `${x.table}.${x.column}`)))];
  if (!declared.length) return [];
  const path = env.profile?.paths?.databaseTypes;
  let types = null;
  if (path) {
    try { types = parseDatabaseTypes(await readFile(join(env.ctx.repoRoot, path), 'utf8')); } catch { types = null; }
  }
  if (!types) return declared;
  return declared.filter((claim) => {
    const [table, column] = claim.split('.');
    return !types.get(table)?.has(column);
  });
}

/**
 * The repo's Playwright config calls deliveryWebServer(), so branch mode has a server to capture.
 *
 * Committing the spec and the support file is not the whole wiring: one line in the Playwright
 * config is what lets the capture own a dev server, and nothing checked it. The widgets rehearsal
 * finished wave 0, ran the smoke, and got ERR_CONNECTION_REFUSED on a port nothing was serving —
 * at the end of the phase, from a task that had been marked done. Playwright only ever reads a
 * file named playwright.config.*, so that is exactly where the call has to be.
 */
async function webServerWired(env) {
  const r = await env.ctx.git.raw(['grep', '-l', '-e', 'deliveryWebServer', '--', '*playwright.config.*']);
  const hits = r.code === 0 ? String(r.stdout).split('\n').filter(Boolean) : [];
  if (hits.length) return { ok: true, detail: `${hits[0]} calls deliveryWebServer()` };
  return { ok: false, detail: 'no playwright.config.* calls deliveryWebServer(), so branch-mode captures have no server: add `webServer: deliveryWebServer()` to the Playwright config, importing it from the capture support file' };
}

const PROBE_FNS = {
  async P1(env) {
    if (!env.profileBytes) return redP(`no ${PROFILE_PATH}`, { blocking: true, fix: 'Run `delivery init`, review the draft and merge it in the profile PR' });
    if (!env.profileIssues.length) return green('the profile validates and every command string is complete');
    const founder = env.profileIssues.filter((i) => /^\/(founder|safetyFile)/.test(i.path));
    const first = env.profileIssues[0];
    if (founder.length) return redP(`${founder.length} founder-authored field(s) invalid, first ${founder[0].path}: ${founder[0].message}`, { blocking: true, fix: `The founder corrects ${PROFILE_PATH} and merges it` });
    return task('T-profile', `${env.profileIssues.length} profile issue(s), first ${first.path}: ${first.message}`);
  },
  async P2(env) {
    if (!env.profile) return redP('no valid profile, so the safety file cannot be located', { blocking: true });
    if (env.safetyErr) return redP(env.safetyErr.message, { blocking: true, fix: `The founder writes ${env.profile.safetyFile} and merges it to ${env.profile.repo.base}; the run waits for it` });
    const base = env.profile.repo.base;
    await env.ctx.git.raw(['fetch', 'origin', base]);
    const merged = await env.ctx.git.show(`origin/${base}`, env.profile.safetyFile);
    if (!merged) return redP(`${env.profile.safetyFile} is not on origin/${base}: only the version the founder merged counts`, { blocking: true, fix: `Merge ${env.profile.safetyFile} to ${base} in the profile PR` });
    if (!Buffer.from(merged).equals(env.safety.bytes)) return redP(`${env.profile.safetyFile} differs from origin/${base} (edited locally)`, { blocking: true, fix: `Restore it from origin/${base}: \`git checkout origin/${base} -- ${env.profile.safetyFile}\`` });
    return green(`${env.profile.safetyFile} validates and matches origin/${base} (${env.safety.sha256.slice(0, 12)})`);
  },
  async P3(env) {
    if (env.profile.testData?.mode === 'none') return na('testData.mode is none: nothing is seeded');
    const ref = env.profile.environments.test.projectRef;
    if (env.safetyErr) return redP('the safety file does not load (P2), so the production refs cannot be ruled out', { blocking: true });
    if (env.safety?.safety.productionRefs.includes(ref)) return redP(`the profile's test project ${ref} is listed as production in the safety file`, { blocking: true, fix: 'Point environments.test.projectRef at the test project' });
    const a = await dataAdapter(env);
    const r = await a.probeAccess();
    if (r.read && r.write) return green(`read and write on ${ref}: ${r.detail}`);
    return redP(`no ${r.read ? 'write' : 'read'} access to the test project ${ref}: ${r.detail}`, { blocking: true, fix: 'Give this session the test project\'s service-role credentials, then run `delivery preflight --only P3`' });
  },
  async P4(env) {
    if (env.profile.testData?.mode === 'none') return na('testData.mode is none');
    const a = await dataAdapter(env);
    const r = await a.probeMigrationApply();
    if (r.ok) return green(r.detail);
    const missing = await stillMissing(env);
    if (missing.length) return redP(`the plan adds data the schema lacks (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? `, +${missing.length - 3} more` : ''}), and migrations cannot be applied to the test environment: ${r.detail}`, { blocking: true, fix: 'Authorise the migration path for the test project (an access token for its management API), then `delivery preflight --only P4`' });
    return warning(`migrations cannot be applied to the test environment (${r.detail}); red-circle once the plan adds a migration`);
  },
  async P5(env) {
    if (env.safetyErr) return redP('the safety file does not load (P2), so the founder\'s organisation is unknown');
    const real = env.safety?.safety.realOrg ?? null;
    if (!real) return na('the safety file names no founder organisation');
    const a = await dataAdapter(env);
    if (typeof a.membership !== 'function') return warning('the data adapter has no membership lookup, so the robot\'s organisation was not checked');
    const orgs = await a.membership(env.profile.auth.robotAdminEmail);
    if (orgs.some((o) => (o.orgId ?? o.id) === real.id)) return task('T-robot-org', 'the e2e robot belongs to the founder\'s organisation, so its fixtures sit among his real rows');
    return green('the e2e robot is not a member of the founder\'s organisation');
  },
  async P6(env) {
    if (env.profile.testData?.mode === 'none') return na('testData.mode is none');
    if (!env.paths) return warning('no run yet: run preflight after intake');
    await env.d.deriveSideEffects(env.ctx);
    const empty = { schemaVersion: 1, runId: env.state?.runId ?? 'preflight', project: env.profile.environments.test.projectRef, worlds: [], rows: [], users: [] };
    const g = await env.d.seedCheckGate(env.ctx, { seedPlan: empty });
    if (g.ok) return green('the side-effect map derives and an empty seed plan passes the seed check');
    return task('T-seed-safe', `the seed check refuses an empty plan: ${g.failures[0]?.message ?? 'no detail'}`);
  },
  async P7(env) {
    const missing = [];
    if (!(await exists(join(env.ctx.repoRoot, env.profile.paths.captureSpec)))) missing.push(['T-capture', `no capture spec at ${env.profile.paths.captureSpec}`]);
    if (!(await exists(join(env.ctx.repoRoot, env.profile.paths.versionRoute)))) missing.push(['T-version', `no version route at ${env.profile.paths.versionRoute}`]);
    const wired = await webServerWired(env);
    if (!wired.ok) missing.push(['T-capture', wired.detail]);
    if (!missing.length) return green('the capture spec, the version route and the capture\'s webServer are committed');
    return { ...task(missing[0][0], missing.map((m) => m[1]).join('; ')), tasks: missing.map((m) => m[0]) };
  },
  async P8(env) {
    if (!(await exists(join(env.ctx.repoRoot, env.profile.paths.captureSpec)))) return task('T-capture', 'the smoke spec is the committed capture spec, which does not exist yet');
    const target = await previewTarget(env);
    if (!target) return warning('no open pull request with a preview to run the smoke spec against');
    if (!target.url) return warning(`the preview of #${target.pr} could not be resolved: ${target.detail}`);
    const cmd = wrapHeavy(env.profile, fillCommand(env.profile.commands.e2e, { spec: env.profile.paths.captureSpec }));
    const r = await env.ctx.runner.sh(cmd, { cwd: env.ctx.repoRoot, env: { E2E_BASE_URL: target.url, DELIVERY_SMOKE: '1' }, timeoutMs: 20 * 60_000 });
    if (r.code === 0) return green(`the capture spec's smoke run passed against the preview of #${target.pr}`);
    const said = `${r.stdout}\n${r.stderr}`;
    if (/auth|sign.?in|log.?in|401|403|magic.?link|token/i.test(said)) return redP(`the smoke run could not sign in against the preview of #${target.pr}: ${lastLine(r.stderr, r.stdout)}`, { blocking: true, fix: 'Give this machine the e2e sign-in credentials the repo\'s e2e suite reads, then `delivery preflight --only P8`' });
    return task('T-capture', `the smoke run failed without an auth error (exit ${r.code}): ${lastLine(r.stderr, r.stdout)}`);
  },
  async P9(env) {
    const problems = [];
    const target = await previewTarget(env);
    if (target) {
      if (!target.url && !target.pending && env.profile.environments.previews !== 'none') problems.push(`preview resolver: ${target.detail}`);
      const r = await env.ctx.runner.sh(fillCommand(env.profile.commands.ciWait, { pr: target.pr, sha: target.sha }), { cwd: env.ctx.repoRoot, timeoutMs: 60_000 });
      if (![0, 1, 2, 124].includes(r.code)) problems.push(`CI waiter exited ${r.code}: ${lastLine(r.stderr, r.stdout)}`);
    }
    const baseSha = await env.ctx.git.revParse(`origin/${env.profile.repo.base}`);
    if (baseSha) {
      const r = await env.ctx.runner.sh(fillCommand(env.profile.commands.stagingDeployWait, { sha: baseSha }), { cwd: env.ctx.repoRoot, timeoutMs: 60_000 });
      if (![0, 124].includes(r.code)) problems.push(`staging-deploy waiter exited ${r.code}: ${lastLine(r.stderr, r.stdout)}`);
    }
    if (problems.length) return redP(problems.join('; '), { blocking: true, fix: 'These waiters live in the repo and the suite cannot fix them; repair the named script' });
    if (!target) return warning('no open pull request to exercise the preview resolver and the CI waiter; the staging-deploy waiter runs');
    return green(`the preview resolver, the CI waiter and the staging-deploy waiter run (#${target.pr})`);
  },
  async P10(env) {
    const script = scriptOf(env.profile.commands.bootstrap);
    if (!env.profile.commands.bootstrap.trim()) return task('T-bootstrap', 'no bootstrap command');
    if (script && !(await exists(join(env.ctx.repoRoot, script)))) return task('T-bootstrap', `the bootstrap command runs ${script}, which does not exist`);
    return green(`the bootstrap command is present (${clip(env.profile.commands.bootstrap, 80)})`);
  },
  async P11(env) {
    const r = await env.ctx.runner.sh(wrapHeavy(env.profile, 'true'), { cwd: env.ctx.repoRoot, timeoutMs: 10 * 60_000 });
    if (r.code === 0) return green('the heavy-slot wrapper ran a command');
    return redP(r.code === 124 ? 'no heavy slot came free within 10 minutes' : `the heavy-slot wrapper exited ${r.code}: ${lastLine(r.stderr, r.stdout)}`, { blocking: true, fix: 'Stop whatever holds the heavy slots on this machine, then `delivery preflight --only P11`' });
  },
  async P12(env) {
    const notes = [];
    if (env.profile.claims.verify === 'planner') {
      const r = await env.ctx.runner.sh(env.profile.commands.planner, { cwd: env.ctx.repoRoot, timeoutMs: 3 * 60_000 });
      if (r.code !== 0) return redP(`the planner exited ${r.code}: ${lastLine(r.stderr, r.stdout)}`, { blocking: true, fix: `Repair \`${env.profile.commands.planner}\` so it prints its queue` });
    }
    if (env.profile.claims.pathClaims === 'none') notes.push('path claims are off (claims.pathClaims none): the run detects pool PRs in its files rather than preventing them');
    else {
      const prefix = env.profile.issues.markerPrefix || 'delivery';
      const r = await env.ctx.git.raw(['grep', '-l', '-F', `${prefix}:claims`, `origin/${env.profile.repo.base}`, '--']);
      if (r.code !== 0) return task('T-path-claims', `the scope check on origin/${env.profile.repo.base} does not read the claimed-paths block yet; until it does the run detects pool PRs in its files rather than preventing them (a recorded warning)`);
    }
    if (notes.length) return warning(notes.join('; '));
    return green(env.profile.claims.verify === 'planner' ? 'the planner runs and the scope check reads path claims' : 'claims are not verified by a planner here; the scope check reads path claims');
  },
  async P13(env) {
    if (env.safetyErr) return redP('the safety file does not load (P2), so the observer user is unknown');
    const real = env.safety?.safety.realOrg ?? null;
    if (!real) return na('the safety file names no founder organisation, so none is audited');
    const a = await dataAdapter(env);
    if (typeof a.membership !== 'function') return warning('the data adapter has no membership lookup, so the observer user was not checked');
    const orgs = await a.membership(real.observerEmail);
    if (orgs.some((o) => (o.orgId ?? o.id) === real.id)) return green('the observer user is a member of the founder\'s organisation');
    return task('T-observer', 'the observer user named in the safety file is not a member of the founder\'s organisation');
  },
  async P14(env) {
    const missing = [];
    for (const m of env.profile.paths.messages) {
      if (!(await exists(join(env.ctx.repoRoot, m.file)))) missing.push(`message file ${m.file}`);
      if (!Array.isArray(env.profile.audit.bannedWords[m.locale])) missing.push(`banned words for ${m.locale}`);
    }
    if (missing.length) return task('T-locales', `missing: ${missing.join(', ')}`);
    return green(`${env.profile.paths.messages.length} message files and their banned-word lists exist`);
  },
  async P15() {
    return warning(`the CLI cannot see permission prompts; the main session runs each shape once now: ${REHEARSAL.join(' · ')}`);
  },
  async P16(env) {
    const script = scriptOf(env.profile.commands.loopTest.command);
    const present = !script || (await exists(join(env.ctx.repoRoot, script)));
    const files = (env.plan?.units ?? []).flatMap((u) => u.files);
    const inScope = files.some((f) => matchesAny(f, env.profile.commands.loopTest.when));
    if (present) return green(inScope ? 'the loop-test broker is present and the voice path is in scope' : 'the loop-test broker is present');
    if (inScope) return redP(`the plan touches ${env.profile.commands.loopTest.when.join(', ')} and the loop-test broker ${script} does not exist`, { blocking: true, fix: `Restore ${script} or correct commands.loopTest in the profile` });
    return warning(env.plan ? `no loop-test broker (${script}); not needed, since no unit touches ${env.profile.commands.loopTest.when.join(', ')}` : `no loop-test broker (${script}); re-checked after planning`);
  },
};

/** The command shapes P15 rehearses (read-only forms). */
export const REHEARSAL = Object.freeze([
  'node scripts/delivery.mjs status --help', 'git fetch --dry-run origin', 'gh pr list --limit 1', 'gh issue list --limit 1',
]);

async function previewTarget(env) {
  if (env.previewTarget !== undefined) return env.previewTarget;
  let pr = null;
  try {
    if (env.paths && env.state) pr = await findRunPr(env.ctx, { profile: env.profile, feature: env.paths.feature, state: env.state });
    if (!pr || pr.state !== 'open') pr = (await env.ctx.gh.prList({ state: 'open', limit: 20 }))[0] ?? null;
  } catch { pr = null; }
  if (!pr) { env.previewTarget = null; return null; }
  const res = await resolvePreview(env.ctx, { sha: pr.headRefOid, timeoutMs: 3 * 60_000 });
  env.previewTarget = { pr: pr.number, sha: pr.headRefOid, ...res };
  return env.previewTarget;
}

/**
 * Run the probes (all, or only some, keeping the others' last results), apply waivers, and
 * write preflight.json.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ only?: string[]|null, write?: boolean }} [o]
 */
export async function runProbes(ctx, { only = null, write = true } = {}) {
  const env = await probeEnv(ctx);
  const previous = ctx.paths ? await readArtefact(ctx.paths, 'preflight', { optional: true }).catch(() => null) : null;
  const waivers = new Map((env.state?.waivers ?? []).map((w) => [w.probe, w]));
  const results = [];
  for (const p of PROBES) {
    if (only && !only.includes(p.id)) {
      const old = previous?.probes.find((x) => x.id === p.id);
      if (old) { results.push(old); continue; }
    }
    let r;
    if (p.id !== 'P1' && (!env.profile || env.profileIssues.length)) r = redP('skipped: the profile does not validate (P1)', { blocking: false });
    else {
      try { r = await PROBE_FNS[p.id](env); } catch (err) {
        if (!(err && typeof err.exit === 'number')) throw err;
        r = redP(isNotImplemented(err) ? `cannot probe yet: ${err.message}` : err.message, { blocking: p.blocking === true });
      }
    }
    const blocking = r.status === 'red' ? (p.blocking === true ? true : p.blocking === false ? false : Boolean(r.blocking)) : false;
    let status = r.status;
    if ((status === 'red' || status === 'task') && p.waivable && waivers.has(p.id)) status = 'waived';
    results.push({
      id: p.id, status, waivable: p.waivable, blocking, detail: clip(r.detail, 500),
      ...(r.fix ? { fix: r.fix } : {}), ...(r.task ? { task: r.task } : {}),
      ...(r.tasks ? { tasks: r.tasks } : {}),
    });
  }
  const oldTasks = new Map((previous?.tasks ?? []).map((t) => [t.id, t]));
  const tasks = [];
  for (const r of results) {
    if (r.status !== 'task') continue;
    for (const id of r.tasks ?? [r.task]) {
      if (!id || tasks.some((t) => t.id === id)) continue;
      tasks.push({ id, title: TASKS[id] ?? id, probe: r.id, issue: oldTasks.get(id)?.issue ?? null });
    }
  }
  const doc = {
    schemaVersion: 1,
    generatedAt: ctx.clock.now().toISOString(),
    profileSha256: sha256(env.profileBytes ?? Buffer.alloc(0)),
    safetySha256: env.safety?.sha256 ?? null,
    probes: results.map(({ tasks: _t, ...rest }) => rest),
    tasks,
  };
  if (write && ctx.paths) await writeArtefact(ctx.paths, 'preflight', doc);
  return { doc, results };
}

/** Exit for a preflight: 3 when a red-circle item is open, 1 for any other red, else 0. */
export function preflightExit(probes) {
  if (probes.some((p) => p.status === 'red' && p.blocking)) return EXIT.BLOCKED;
  if (probes.some((p) => p.status === 'red')) return EXIT.RED;
  return EXIT.PASS;
}

/** A red probe as one line: what is wrong, then what fixes it. */
export function probeLine(p) {
  const end = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
  return `${end(p.detail)}${p.fix ? ` Fix: ${end(p.fix)}` : ''}`;
}

/**
 * Phase-1 gate input: every probe green, turned into a wave-0 task, or waived where waivable.
 * Re-runs the cheap probes (P1, P2, P7, P14) from sources and re-validates preflight.json for the rest.
 * Called by lib/gates/phase-1.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function preflightGate(ctx) {
  const paths = ctx.requirePaths();
  const doc = await readArtefact(paths, 'preflight', { optional: true });
  if (!doc) return gateResult([{ code: 'preflight', message: 'no preflight.json: run delivery preflight' }]);
  const fresh = await runProbes(ctx, { only: CHEAP_PROBES, write: false });
  const failures = [];
  const bytes = await readFile(join(ctx.repoRoot, PROFILE_PATH)).catch(() => Buffer.alloc(0));
  if (sha256(bytes) !== doc.profileSha256) failures.push({ code: 'preflight', message: 'the profile changed since preflight ran; run delivery preflight again' });
  let blocked = false;
  for (const p of PROBES) {
    const r = CHEAP_PROBES.includes(p.id) ? fresh.results.find((x) => x.id === p.id) : doc.probes.find((x) => x.id === p.id);
    if (!r) { failures.push({ code: p.id, message: `${p.id} has no result (run delivery preflight)` }); continue; }
    if (r.status === 'red') {
      failures.push({ code: p.id, message: `${p.id} is red: ${r.detail}` });
      if (r.blocking) blocked = true;
    }
  }
  return gateResult(failures, blocked ? EXIT.BLOCKED : undefined);
}
