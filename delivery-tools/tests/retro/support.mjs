// Shared set-up for the retro tests: a plugin checkout with its own bare origin (real git, local
// only), a ctx that answers `gh pr merge` and the plugin's test command from rules, and a helper
// that writes earlier runs into the ledger.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { ok, fail } from '../helpers/runner-stub.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { updateState, formatEvent } from '../../lib/core/state.mjs';
import { writeRecord, ledgerPath } from '../../lib/retro/ledger.mjs';
import { makeRunRepo, gitIn, testProfile } from '../lifecycle/support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A plugin checkout (delivery-tools/ inside a repo) whose origin is a local bare repo. */
export function makePluginRepo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'delivery-retro-')));
  const origin = join(root, 'origin.git');
  const dir = join(root, 'plugin');
  mkdirSync(join(dir, 'delivery-tools', 'briefs'), { recursive: true });
  mkdirSync(join(dir, 'delivery-tools', 'tests'), { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const g = gitIn(dir);
  g('init', '-q', '-b', 'main');
  for (const [k, v] of [['commit.gpgsign', 'false'], ['core.hooksPath', '/dev/null'], ['user.name', 'Test'], ['user.email', 'test@example.invalid']]) g('config', k, v);
  copyFileSync(join(ROOT, 'tunables.json'), join(dir, 'delivery-tools', 'tunables.json'));
  writeFileSync(join(dir, 'delivery-tools', 'briefs', 'reviewer-picture.md'), '# Reviewer\n\nCompare each state.\n');
  writeFileSync(join(dir, 'delivery-tools', 'tests', 'x.test.mjs'), '// a test\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'initial');
  g('remote', 'add', 'origin', origin);
  g('push', '-q', 'origin', 'main');
  g('fetch', '-q', 'origin');
  const inOrigin = (...args) => execFileSync('git', ['--git-dir', origin, ...args], { encoding: 'utf8' }).trim();
  return { root, origin, dir, git: g, inOrigin, pluginDir: join(dir, 'delivery-tools'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Rules for the two non-git things a retro may start: the plugin's tests and `gh pr merge`. */
export function retroRules({ suite = ok('all pass'), merge = ok('merged') } = {}) {
  return [
    { match: /^node --test /, result: suite },
    { match: /^gh pr merge /, result: merge },
  ];
}

/** A ctx on a run repo, with the plugin checkout and a stub GitHub for the plugin repo. */
export async function retroEnv({ plugin = null, env = {}, rules = retroRules(), profile = testProfile(), clock = fakeClock('2026-01-15T21:00:00.000Z') } = {}) {
  const repo = await makeRunRepo();
  const pluginGh = createGhStub({ clock, repo: 'example-org/example-plugin' });
  const res = await makeTestCtx({
    repoRoot: repo.worktree, feature: 'widgets', profile, rules, passthrough: ['git'], clock, gh: createGhStub({ clock }),
    env: { ...(plugin ? { DELIVERY_PLUGIN_REPO: plugin.dir } : {}), ...env },
  });
  return { repo, plugin, pluginGh, clock, ...res };
}

/** An earlier run's record for the ledger. */
export function earlier(feature, day, overrides = {}) {
  const r = validExample('run-record');
  return { ...r, feature, endedAt: `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`, autoChanges: [], improvements: [], ...overrides, phases: { ...r.phases, ...(overrides.phases ?? {}) } };
}

/** Put earlier runs in the ledger of this run's repo. */
export async function seedLedger(env, records) {
  for (const r of records) await writeRecord(ledgerPath(env.repo.paths), r);
}

/** Make this run's journal show `minutes` of review (one review event that long after genesis). */
export async function slowReview(env, minutes) {
  await updateState(env.repo.paths, (s) => s, { at: new Date(Date.parse('2026-01-15T20:00:00.000Z') + minutes * 60000).toISOString(), event: formatEvent({ command: 'review --round 1', exit: 0 }) });
}

export { ok, fail };
