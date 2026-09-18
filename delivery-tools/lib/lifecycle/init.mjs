// delivery init: draft .claude/delivery-profile.json for a person to review in the profile PR
// (spec 16, 18). Everything it can infer comes from package.json, the lockfile, git and the
// commands the repo's CLAUDE.md already names; everything else is a "<fill in: ...>" value, which
// preflight P1 reports until someone fills it. It never writes the safety file: the founder
// authors that one.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exists } from '../core/fs.mjs';
import { validateAgainst } from '../core/schema.mjs';

export const FILL = (what) => `<fill in: ${what}>`;
/** The slug placeholder: it must still match the owner/name pattern for the draft to validate. */
export const FILL_SLUG = 'fill-in/owner-and-name';

/** Every "<fill in: ...>" (or the slug placeholder) left in a profile, as JSON paths. */
export function unfilled(value, path = '') {
  if (typeof value === 'string') return value.includes('<fill in') || value === FILL_SLUG ? [path || '/'] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => unfilled(v, `${path}/${i}`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => unfilled(v, `${path}/${k}`));
  return [];
}

/** Commands a CLAUDE.md shows in backticks or code blocks, one per line. */
export function mentionedCommands(text) {
  const out = [];
  const src = String(text ?? '');
  for (const m of src.matchAll(/`([^`\n]{3,300})`/g)) out.push(m[1].trim());
  for (const block of src.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
    for (const line of block[1].split('\n')) {
      const l = line.replace(/\s+#.*$/, '').trim();
      if (l) out.push(l);
    }
  }
  return out.filter((c) => /^(node|pnpm|npm|yarn|bun|npx|bash|sh|make|\.\/)\b/.test(c));
}

/** The first mentioned command matching every pattern, or null. */
function find(cmds, ...patterns) {
  return cmds.find((c) => patterns.every((p) => p.test(c))) ?? null;
}

/** The script part of a "node <script> ..." command. */
function nodeScript(cmd) {
  return cmd?.match(/^(node\s+\S+\.m?js)/)?.[1] ?? null;
}

/**
 * Draft a profile from what the repo shows. Pure over its inputs.
 * @param {{ packageJson: object|null, claudeMd: string, lockfiles: string[], files: string[], remoteUrl: string|null, defaultBranch: string|null }} repo
 */
export function draftProfile({ packageJson, claudeMd, lockfiles, files, remoteUrl, defaultBranch }) {
  const pm = lockfiles.includes('pnpm-lock.yaml') ? 'pnpm' : lockfiles.includes('yarn.lock') ? 'yarn' : lockfiles.includes('bun.lockb') ? 'bun' : 'npm';
  const run = pm === 'npm' ? 'npm run' : pm;
  const scripts = packageJson?.scripts ?? {};
  const cmds = mentionedCommands(claudeMd);
  const slug = String(remoteUrl ?? '').match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)?.[1] ?? FILL_SLUG;

  const heavyScript = find(cmds, /heavy|slot/i, /--\s+'/)?.match(/^(.*?--\s+)'/)?.[1];
  const heavy = heavyScript ? `${heavyScript}'{cmd}'` : '{cmd}';
  const gateInner = find(cmds, /typecheck|tsc/, /lint/, /test/)?.match(/--\s+'([^']+)'/)?.[1]
    ?? (['typecheck', 'lint', 'build', 'test'].filter((s) => scripts[s]).map((s) => `${run} ${s}`).join(' && ') || FILL('the full local CI chain'));
  const ciWait = nodeScript(find(cmds, /wait/i, /check/i));
  const planner = nodeScript(find(cmds, /planner/i));
  const close = nodeScript(find(cmds, /close/i, /epic/i));
  const owed = find(cmds, /owed/i);
  const pending = nodeScript(find(cmds, /pending.?production/i));
  const ledger = nodeScript(find(cmds, /ledger/i));
  const flight = find(cmds, /\bflight\b/);
  const tried = find(cmds, /\btried\b/)?.replace(/\s+<[^>]+>.*$/, '');

  const messages = files.filter((f) => /(^|\/)messages\/[a-z]{2}(-[A-Z]{2})?\.json$/.test(f)).sort()
    .map((f) => ({ locale: f.match(/([a-z]{2}(-[A-Z]{2})?)\.json$/)[1], file: f }));
  const e2eDir = files.map((f) => f.match(/^(.*\/e2e)\//)?.[1]).find(Boolean) ?? FILL('the directory of the e2e specs');
  const appDir = files.map((f) => f.match(/^(.*\/src\/app)\//)?.[1]).find(Boolean);
  const componentsDir = files.map((f) => f.match(/^(.*\/src\/components)\//)?.[1]).find(Boolean);
  const dbTypes = files.find((f) => /database\.types\.ts$/.test(f)) ?? FILL('the generated database types file');
  const locales = messages.map((m) => m.locale);

  return {
    schemaVersion: 1,
    repo: { slug, base: defaultBranch || 'main', branchPrefix: 'epic/', worktreeRoot: '.claude/worktrees' },
    commands: {
      bootstrap: FILL('a command that prepares a fresh worktree at {dir} with a dev server on {port}'),
      heavy,
      gate: gateInner,
      unitCheck: scripts.typecheck ? `${run} typecheck && ${run} lint && npx vitest run {spec}` : FILL('typecheck, lint and the unit tests for {spec}'),
      devServer: scripts.dev ? `${run} dev -- --port {port}` : FILL('the dev server on {port}'),
      prodBuild: scripts.build ? `${run} build` : FILL('the production build'),
      prodStart: scripts.start ? `${run} start -- -p {port}` : FILL('the production server on {port}'),
      e2e: scripts.e2e ? `${run} e2e {spec}` : FILL('the e2e runner for {spec}'),
      previewUrl: FILL('a command printing the preview URL for commit {sha}'),
      versionProbe: 'GET /api/version',
      ciWait: ciWait ? `${ciWait} {pr}` : FILL('a CI waiter for PR {pr} that gates on runs for its head SHA'),
      stagingDeployWait: FILL('a command waiting until the base branch deploy serves {sha}'),
      review: { skill: FILL('the review skill'), args: '{pr} --fix' },
      loopTest: { command: FILL('the preview loop test for epic {epic} and PR {pr}'), when: [], stagingCommand: FILL('the staging loop test for epic {epic}') },
      flight: flight ?? FILL('the command listing work in flight'),
      tried: tried ? `${tried} {spec}` : FILL('the command listing what was already tried for {spec}'),
      planner: planner ?? FILL('the command printing the agent pool\'s queue as #N'),
      epicClose: close ? `${close} {epic} --evidence "node scripts/delivery.mjs land --check --epic {epic}" --exit 0` : FILL('the command closing epic {epic} on evidence'),
      migrationsOwed: owed ?? FILL('a command exiting 0 when no migration is owed on the test environment'),
      pendingProduction: pending ?? FILL('a command listing migrations pending production'),
      ledgerFetch: ledger ? `${ledger} --project {project}` : FILL('a command reading the migration ledger of {project}'),
    },
    paths: {
      designRoot: 'docs/design', deliveryRoot: 'docs/delivery', runRoot: '.delivery', handovers: 'docs/handovers',
      e2eDir,
      captureSpec: typeof e2eDir === 'string' && !e2eDir.startsWith('<') ? `${e2eDir}/delivery-capture.spec.ts` : FILL('where the committed capture spec lives'),
      versionRoute: appDir ? `${appDir}/api/version/route.ts` : FILL('the version route file'),
      messages,
      appRouteGlobs: appDir ? [`${appDir}/**/page.tsx`] : [],
      apiRouteGlobs: appDir ? [`${appDir}/api/**/route.ts`] : [],
      componentGlobs: componentsDir ? [`${componentsDir}/**/*.tsx`] : [],
      databaseTypes: dbTypes,
    },
    environments: { test: { name: 'staging', projectRef: FILL('the test project ref'), appUrl: FILL('the test app URL') }, previews: 'vercel' },
    auth: { supportModule: FILL('the e2e sign-in support module'), signInFunction: FILL('its sign-in function'), robotAdminEmail: FILL('the e2e admin robot'), robotMemberEmail: FILL('the e2e member robot') },
    issues: {
      repo: slug, epicLabels: ['epic'], epicType: null, childLabels: [], scopeLabel: 'needs-decision', polishLabels: [], subIssues: true, markerPrefix: 'delivery',
    },
    claims: { mode: 'open-draft-pr', verify: planner ? 'planner' : 'none', pathClaims: 'none', runLabel: 'delivery-run' },
    decisions: { file: '.claude/decisions/{slug}.json', looseEnd: '.claude/loose-ends/{slug}.json', handoverPattern: 'docs/handovers/{date}-{slug}-handover.md' },
    founder: { github: FILL('the founder\'s GitHub login'), reportFormat: 'tldr', mergesOwnPRs: true },
    baseline: { discriminators: ['mode', 'action', 'kind', 'status'] },
    audit: {
      widths: [1440, 390], phoneWidth: 390, themes: ['light', 'dark'], primaryLocale: locales.includes('en') ? 'en' : (locales[0] ?? 'en'), roles: ['admin', 'member'],
      bannedWords: Object.fromEntries((locales.length ? locales : ['en']).map((l) => [l, []])),
      developerPhrases: ['TODO', 'FIXME', 'lorem', 'not built', 'this PR'], sameAsEnglishOk: [], dateShape: 'D Mon',
    },
    limits: {
      builderParallel: 6, subagentCommandMinutes: 8, maxCuts: 5, overSizeHours: 6, maxAcceptedP2PerGroup: 3, maxAcceptedP2: 10,
      maxPropOrUnseedablePct: 20, maxFixWaves: 3, spotRecapturePct: 10,
    },
    release: { tagFormat: 'v{n}-{slug}', prodTitlePrefix: 'prod:', mergeMethod: 'merge-commit' },
    safetyFile: '.claude/delivery-safety.json',
  };
}

/** Read what draftProfile needs from a repo. */
export async function readRepoFacts(ctx) {
  const root = ctx.repoRoot;
  const read = async (rel) => { try { return await readFile(join(root, rel), 'utf8'); } catch { return null; } };
  const pkg = await read('package.json');
  let packageJson = null;
  try { packageJson = pkg ? JSON.parse(pkg) : null; } catch { packageJson = null; }
  const lockfiles = [];
  for (const f of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'package-lock.json']) if (await exists(join(root, f))) lockfiles.push(f);
  const ls = await ctx.git.raw(['ls-files']);
  const files = ls.code === 0 ? String(ls.stdout).split('\n').filter(Boolean) : [];
  const remote = await ctx.git.raw(['remote', 'get-url', 'origin']);
  const head = await ctx.git.raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  return {
    packageJson,
    claudeMd: (await read('CLAUDE.md')) ?? '',
    lockfiles,
    files,
    remoteUrl: remote.code === 0 ? String(remote.stdout).trim() : null,
    defaultBranch: head.code === 0 ? String(head.stdout).trim().replace(/^origin\//, '') : null,
  };
}

/** Schema issues of a draft (a draft must always validate; its fill-ins are strings). */
export function draftIssues(profile) {
  return validateAgainst('profile', profile).errors;
}
