// delivery prepush (A5): the branch's removed names, org-scoped lists, distance from base and
// components rule, each on a real temp repository with a real bare origin (git only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import prepushCommand from '../../lib/commands/prepush.mjs';
import { orgScopedTables, planNames, prepushProblems, specNames } from '../../lib/lifecycle/prepush.mjs';
import { makeTempRepo, makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { commitAll, startRun, writeFiles, gitIn } from '../run/support.mjs';

const H = `sha256:${'7'.repeat(64)}`;
const PAGE = 'apps/web/src/components/widgets/toolbar.tsx';
const PLAN = 'docs/delivery/replay/widgets/plan.json';
const MIGRATIONS = 'supabase/migrations/*.sql';
const LISTS = [
  { label: 'DEPENDENT_TABLES', files: 'apps/web/src/lib/retirement.ts' },
  { label: 'retire_organization', files: 'supabase/migrations/*.sql', alsoContains: 'retire_organization' },
  { label: 'erasure plan', files: 'scripts/erasure-plan.mjs' },
];

const profileWith = (paths = {}, extra = {}) => {
  const p = makeProfile(extra);
  return { ...p, paths: { ...p.paths, ...paths } };
};

/** A repo on main with a bare origin and a feature branch; base files are committed and pushed first. */
async function setup({ base = {}, profile = profileWith(), feature = null } = {}) {
  const repo = makeTempRepo({ files: { '.gitignore': '.delivery/\n', '.claude/delivery-profile.json': profile, '.claude/delivery-safety.json': makeSafety(), ...base } });
  const bare = makeTempDir('delivery-origin-');
  execFileSync('git', ['clone', '-q', '--bare', repo.dir, bare.dir]);
  repo.git('remote', 'add', 'origin', bare.dir);
  repo.git('fetch', '-q', 'origin');
  repo.git('checkout', '-q', '-b', 'feature');
  const t = await makeTestCtx({ repoRoot: repo.dir, passthrough: ['git'], profile, feature });
  return { repo, bare, ...t, cleanup() { repo.cleanup(); bare.cleanup(); } };
}

const codes = (problems) => problems.map((p) => p.code);

test('a clean branch passes: nothing removed, nothing behind, exit 0', async () => {
  const s = await setup({ base: { [PAGE]: '<button data-testid="save-widget">Save widget</button>\n', [PLAN]: { steps: [{ testId: 'save-widget', text: 'Save widget' }] } } });
  try {
    writeFiles(s.repo.dir, { [PAGE]: '<button data-testid="save-widget">Save widget</button><p>more</p>\n' });
    commitAll(s.repo.dir, 'edit');
    assert.deepEqual(await prepushProblems(s.ctx), []);
    assert.equal(await prepushCommand.run(s.ctx, []), 0);
    assert.match(s.stdout.text(), /prepush: clean/);
  } finally { s.cleanup(); }
});

test('a test id the base plan.json names, removed by the branch, fails and names the id and the plan', async () => {
  const s = await setup({ base: { [PAGE]: '<button data-testid="save-widget">Save</button>\n', [PLAN]: { steps: [{ click: '[data-testid="save-widget"]' }] } } });
  try {
    writeFiles(s.repo.dir, { [PAGE]: '<button data-testid="save-widget-2">Save</button>\n' });
    commitAll(s.repo.dir, 'rename the test id');
    assert.equal(await prepushCommand.run(s.ctx, []), 1);
    const out = s.stdout.text();
    assert.match(out, /FAIL removed-name .*test id "save-widget".*docs\/delivery\/replay\/widgets\/plan\.json/);
  } finally { s.cleanup(); }
});

test('the plan is read from the base branch, not the branch: editing plan.json on the branch does not clear it', async () => {
  const s = await setup({ base: { [PAGE]: '<b data-testid="save-widget">Save</b>\n', [PLAN]: { steps: [{ testId: 'save-widget' }] } } });
  try {
    writeFiles(s.repo.dir, { [PAGE]: '<b>Save</b>\n', [PLAN]: { steps: [] } });
    commitAll(s.repo.dir, 'drop it from both');
    assert.deepEqual(codes(await prepushProblems(s.ctx)), ['removed-name']);
  } finally { s.cleanup(); }
});

test('visible text an e2e spec names, removed by the branch, fails; text that is still there passes', async () => {
  const spec = "await page.getByText('Delete widget').click();\nawait expect(page.getByRole('button', { name: 'Archive widget' })).toBeVisible();\n";
  const s = await setup({ base: { 'apps/web/e2e/widgets.spec.ts': spec, [PAGE]: '<a>Delete widget</a><a>Archive widget</a>\n' } });
  try {
    writeFiles(s.repo.dir, { [PAGE]: '<a>Remove widget</a><a>Archive widget</a>\n' });
    commitAll(s.repo.dir, 'reword');
    const problems = await prepushProblems(s.ctx);
    assert.deepEqual(codes(problems), ['removed-name']);
    assert.match(problems[0].message, /visible text "Delete widget".*apps\/web\/e2e\/widgets\.spec\.ts/);
  } finally { s.cleanup(); }
});

test('a name the base sources never had is not "removed" (it may be new on the base)', async () => {
  const s = await setup({ base: { [PAGE]: '<a>Hello</a>\n', 'apps/web/e2e/widgets.spec.ts': "page.getByTestId('never-existed');\n" } });
  try {
    writeFiles(s.repo.dir, { [PAGE]: '<a>Hello again</a>\n' });
    commitAll(s.repo.dir, 'edit');
    assert.deepEqual(await prepushProblems(s.ctx), []);
  } finally { s.cleanup(); }
});

const MIGRATION_OK = 'create table public.widget_notes (\n  id uuid primary key,\n  organization_id uuid not null references organizations(id),\n  body text\n);\n';
const listFiles = (table) => ({
  'apps/web/src/lib/retirement.ts': `export const DEPENDENT_TABLES = ['${table}'];\n`,
  'supabase/migrations/0001_retire.sql': `create function retire_organization() as $$ delete from ${table}; $$;\n`,
  'scripts/erasure-plan.mjs': `export default ['${table}'];\n`,
});
const orgProfile = () => profileWith({ migrationsGlob: MIGRATIONS, orgScopedLists: LISTS });

test('an org-scoped table missing from a list fails, naming the table and the list', async () => {
  const s = await setup({ profile: orgProfile(), base: listFiles('old_things') });
  try {
    writeFiles(s.repo.dir, { ...listFiles('widget_notes'), 'supabase/migrations/0002_notes.sql': MIGRATION_OK, 'scripts/erasure-plan.mjs': "export default ['old_things'];\n" });
    commitAll(s.repo.dir, 'add widget_notes');
    const problems = await prepushProblems(s.ctx);
    assert.deepEqual(codes(problems), ['org-scoped']);
    assert.match(problems[0].message, /table widget_notes .*missing from erasure plan/);
  } finally { s.cleanup(); }
});

test('an org-scoped table present in every list passes; a table without the org column is ignored; no orgScopedLists skips the rule', async () => {
  const s = await setup({ profile: orgProfile(), base: listFiles('old_things') });
  try {
    writeFiles(s.repo.dir, { ...listFiles('widget_notes'), 'supabase/migrations/0002_notes.sql': `${MIGRATION_OK}create table public.lookup (id int primary key, label text);\n` });
    commitAll(s.repo.dir, 'add widget_notes');
    assert.deepEqual(await prepushProblems(s.ctx), []);
  } finally { s.cleanup(); }
  const bare = await setup({ base: listFiles('old_things') });
  try {
    writeFiles(bare.repo.dir, { 'supabase/migrations/0002_notes.sql': MIGRATION_OK });
    commitAll(bare.repo.dir, 'add widget_notes, nothing configured');
    assert.deepEqual(await prepushProblems(bare.ctx), []);
  } finally { bare.cleanup(); }
});

test('alsoContains: a list only counts migrations that hold the marker', async () => {
  const s = await setup({ profile: orgProfile(), base: listFiles('old_things') });
  try {
    // widget_notes is named in the new migration itself, which has no retire_organization marker.
    writeFiles(s.repo.dir, { 'supabase/migrations/0002_notes.sql': MIGRATION_OK, 'apps/web/src/lib/retirement.ts': "export const DEPENDENT_TABLES = ['widget_notes'];\n", 'scripts/erasure-plan.mjs': "export default ['widget_notes'];\n" });
    commitAll(s.repo.dir, 'add widget_notes');
    const problems = await prepushProblems(s.ctx);
    assert.deepEqual(problems.map((p) => p.message.match(/missing from (\S+)/)[1]), ['retire_organization']);
  } finally { s.cleanup(); }
});

test('orgScopedTables reads columns at the top level only, in any spelling', () => {
  const sql = `-- create table ghost (organization_id uuid);\ncreate table if not exists "public"."a" (id int, "organization_id" uuid);\ncreate table b (id int, note text default 'organization_id', unique (id, organization_id));`;
  assert.deepEqual(orgScopedTables(sql), ['a']);
  assert.deepEqual(orgScopedTables('create table c (id int, tenant_id uuid);', 'tenant_id'), ['c']);
});

test('a branch behind its base fails after the fetch, naming how far', async () => {
  const s = await setup({ base: { 'a.txt': 'a\n' } });
  try {
    // A second clone advances origin/main, which the branch has not seen: only the fetch reveals it.
    const other = makeTempDir('delivery-clone-');
    execFileSync('git', ['clone', '-q', s.bare.dir, join(other.dir, 'c')]);
    writeFileSync(join(other.dir, 'c', 'b.txt'), 'b\n');
    gitIn(join(other.dir, 'c'), 'add', '-A');
    gitIn(join(other.dir, 'c'), 'commit', '-q', '-m', 'base moves on');
    gitIn(join(other.dir, 'c'), 'push', '-q', 'origin', 'HEAD:main');
    other.cleanup();
    assert.equal(await prepushCommand.run(s.ctx, []), 1);
    assert.match(s.stdout.text(), /FAIL behind-base the branch is 1 commit\(s\) behind origin\/main/);
  } finally { s.cleanup(); }
});

test('--json carries the problems', async () => {
  const s = await setup({ base: { 'a.txt': 'a\n' } });
  try {
    const t = await makeTestCtx({ repoRoot: s.repo.dir, passthrough: ['git'], profile: profileWith(), json: true });
    assert.equal(t.ctx.out.finish(await prepushCommand.run(t.ctx, [])), 0);
    assert.equal(JSON.parse(t.stdout.text()).ok, true);
  } finally { s.cleanup(); }
});

test('specNames and planNames read string literals only', () => {
  const spec = specNames("page.getByTestId('a-b'); page.locator('[data-testid=\"c-d\"]'); getByText(/re/); getByLabel(\"Email address\");");
  assert.deepEqual([...spec.testIds].sort(), ['a-b', 'c-d']);
  assert.deepEqual([...spec.texts], ['Email address']);
  const plan = planNames({ a: [{ testId: 'x-y', text: 'Go on', n: 3, click: '[data-testid=z-w]' }] });
  assert.deepEqual([...plan.testIds].sort(), ['x-y', 'z-w']);
  assert.deepEqual([...plan.texts], ['Go on']);
});

// Rule 4: the components rule ready runs, reported here before the push.
const COMPONENT_MAP = (status) => ({
  version: 1, allowOwns: [],
  components: [{ kind: 'design', name: 'Picker', design: { file: 'Picker.dc.html', hash: H }, target: 'src/ui/picker.tsx', status, builtHash: status === 'built' ? H : null, props: {}, owns: [], builtOn: [], replaces: [], uses: [], states: ['C-Picker-01'] }],
});
const RUN_MAP = { schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/w', pageArea: { left: 240, designLeft: 240 }, worlds: [], states: [{ id: 'W-01', screen: 'Main', name: 'Everything', reach: { world: 'design', role: 'admin', steps: [{ goto: '/w' }] }, buttons: [] }] };

test("a components problem is reported (ready's rule, run before the push), and a built component is not", async () => {
  const profile = makeProfile({ components: { map: 'docs/delivery/components.json' } });
  const s = await setup({ profile, feature: 'widgets' });
  try {
    writeFiles(s.repo.dir, { 'docs/delivery/widgets/map.json': RUN_MAP, 'docs/delivery/components.json': COMPONENT_MAP('new'), 'src/ui/picker.tsx': 'export const Picker = () => null;\n', 'src/menu.tsx': "import { Picker } from './ui/picker';\n" });
    commitAll(s.repo.dir, 'page');
    const paths = await startRun(s.repo.dir, { phase: 'build' });
    mkdirSync(paths.designRenders, { recursive: true });
    writeFileSync(join(paths.designRenders, 'W-01.components.json'), JSON.stringify({ names: ['Picker'] }));
    const problems = await prepushProblems(s.ctx);
    assert.deepEqual(codes(problems), ['components']);
    assert.match(problems[0].message, /Picker: used but not built/);
    writeFiles(s.repo.dir, { 'docs/delivery/components.json': COMPONENT_MAP('built') });
    commitAll(s.repo.dir, 'built');
    assert.deepEqual(await prepushProblems(s.ctx), []);
  } finally { s.cleanup(); }
});
