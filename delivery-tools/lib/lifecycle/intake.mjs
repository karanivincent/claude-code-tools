// Intake (spec 4.0). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Mechanical, and idempotent on the archive hash: check the export with the design adapter, hash
// it, find or create the epic, create the integration branch and worktree, snapshot the design
// there (runtime scripts zipped, a README with the hashes), keep the intent inputs, write
// state.json, commit. The intent itself is drafted by an extractor agent between two runs of
// intake: the first run stops with NEXT naming it; the second validates intent.json, fixes its
// mechanical fields, renders intent.md, updates the epic and commits both.

import { mkdtemp, readFile, rm, stat, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { readZip, writeZip } from '../core/zip.mjs';
import { sha256, sha256Tree, listTree } from '../core/hash.mjs';
import { featurePaths, assertFeatureSlug } from '../core/paths.mjs';
import { discoverRuns } from '../core/discovery.mjs';
import { createGit } from '../core/git.mjs';
import { createState, loadState, newRunId, updateState, formatEvent } from '../core/state.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { writeFileAtomic, writeJsonAtomic, exists, readJson } from '../core/fs.mjs';
import { isoDate } from '../core/clock.mjs';
import { gateResult } from '../core/gate.mjs';
import { hasMarker } from '../core/markers.mjs';
import { UsageError, DeliveryError, EXIT } from '../core/exit.mjs';
import { deps, isNotImplemented } from './deps.mjs';
import { runMarkers, integrationBranch, integrationWorktreePath, primaryWorktree, repoRel, lastLine } from './run-info.mjs';
import { syncEpic, findEpic } from '../github/issues.mjs';

export const README = 'README.md';
export const RUNTIME_ZIP = 'runtime.zip';

/** A feature slug from a design project name. */
export function slugify(name) {
  return String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'design';
}

/** Zip entries with one shared top-level folder lose it (exports are often zipped inside one). */
export function stripCommonRoot(entries) {
  const firsts = new Set(entries.map((e) => e.name.split('/')[0]));
  if (firsts.size !== 1 || entries.some((e) => !e.name.includes('/'))) return entries;
  const [root] = firsts;
  return entries.map((e) => ({ ...e, name: e.name.slice(root.length + 1) })).filter((e) => e.name);
}

/** The snapshot README (machine-read by verifyIntake: the three hashes in the table). */
export function renderSnapshotReadme({ project, adapter, exportedAt, takenOn, archiveSha256, treeSha256, snapshotSha256, zipped }) {
  return [
    `# Design snapshot: ${project}`,
    '',
    `Exported with the ${adapter} adapter${exportedAt ? ` on ${exportedAt}` : ' (export date unknown)'}; taken by \`delivery intake\` on ${takenOn}.`,
    '',
    'Do not edit anything in this directory. When the design changes, export it again and run intake',
    'with the new archive: it replaces the whole directory, so the diff shows what the designer changed.',
    ...(zipped.length ? [
      '',
      `The runtime scripts (${zipped.map((z) => `\`${z}\``).join(', ')}) are zipped in \`${RUNTIME_ZIP}\` rather than committed`,
      'loose, and `.gitignore` keeps them out once unzipped. Unzip it before serving the design locally.',
    ] : []),
    '',
    '| What | sha256 |',
    '|---|---|',
    `| archive | \`${archiveSha256}\` |`,
    `| export tree | \`${treeSha256}\` |`,
    `| snapshot | \`${snapshotSha256}\` |`,
    '',
    'The snapshot hash covers every file here except this README.',
    '',
  ].join('\n');
}

/** The three hashes a snapshot README records, or null. */
export function parseSnapshotReadme(text) {
  const get = (label) => String(text ?? '').match(new RegExp(`^\\| ${label} \\| \`([0-9a-f]{64})\` \\|$`, 'm'))?.[1] ?? null;
  const archive = get('archive');
  const tree = get('export tree');
  const snapshot = get('snapshot');
  const project = String(text ?? '').match(/^# Design snapshot: (.+)$/m)?.[1] ?? null;
  return archive && tree && snapshot ? { archive, tree, snapshot, project } : null;
}

/** intent.md, rendered from intent.json (never edited by hand). */
export function renderIntentMd(intent) {
  const L = [
    `# Intent: ${intent.feature}`,
    '',
    '<!-- Generated from intent.json by delivery intake. Edit intent.json, then run intake again. -->',
    '',
    `> ${intent.sentence}`,
    '',
    `**Job.** ${intent.job}`,
    '',
    '## Users',
    ...intent.users.map((u) => `- ${u.role}: ${u.can.join('; ') || 'nothing listed'}`),
    '',
    '## In scope',
    ...intent.inScope.map((s) => `- ${s.screen}${s.routes.length ? `: ${s.routes.map((r) => `\`${r}\``).join(', ')}` : ''}`),
    '',
    '## Out of scope',
    ...(intent.outOfScope.length ? intent.outOfScope.map((s) => `- ${s.screen}: ${s.why}`) : ['- Nothing listed.']),
    '',
    '## Requested in the design rounds',
    ...(intent.requested.length ? ['', '| Id | What | Source | Passes when |', '|---|---|---|---|', ...intent.requested.map((r) => `| ${r.id} | ${r.text} | ${r.source} | ${r.passWhen} |`)] : ['', 'Nothing recorded.']),
    '',
    '## Widths',
    ...(Object.keys(intent.widths).length ? Object.entries(intent.widths).map(([k, v]) => `- ${k}: ${v}`) : ['- Not set.']),
    '',
    `Themes: ${intent.themes.join(', ') || 'none'}. Locales: ${intent.locales.join(', ') || 'none'}.`,
    '',
    `Rollout: ${intent.rollout.mode}${intent.rollout.flag ? ` behind \`${intent.rollout.flag}\`` : ''} (${intent.rollout.why}).`,
    '',
    `Analytics: ${intent.analytics === 'none' ? 'none, decided' : intent.analytics.map((a) => `\`${a.event}\` when ${a.when}`).join('; ')}.`,
    '',
    `Redesign of pages that exist today: ${intent.redesign ? 'yes' : 'no'}.`,
    '',
    `Design: ${intent.design.project}, ${intent.design.adapter} export of ${intent.design.exportedAt}, snapshot \`${intent.design.snapshotDir}/\`, archive \`${intent.design.archiveSha256.slice(0, 12)}\`.`,
    '',
    `Epic: ${intent.epic ? `#${intent.epic}` : 'not created yet'}.`,
    '',
  ];
  return L.join('\n');
}

async function unpack(source) {
  const st = await stat(source).catch(() => null);
  if (!st) throw new UsageError(`no such archive or directory: ${source}`);
  if (st.isDirectory()) {
    return { dir: source, archiveSha256: await sha256Tree(source), cleanup: async () => {} };
  }
  const bytes = await readFile(source);
  // A zip starts with a local file header. Anything else is refused here, by name: a single HTML
  // file is Claude Design's standalone download, a rendered page with none of the design's source,
  // so no state could be listed from it.
  if (bytes.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') {
    if (/\.html?$/i.test(source)) {
      throw new UsageError(`${basename(source)} is a standalone HTML download: a rendered page without the design's source, so its states cannot be listed. Export the Claude Design project as a .zip archive and pass that instead.`);
    }
    throw new UsageError(`${basename(source)} is not a .zip archive or a directory: pass the Claude Design project's .zip export, or its unpacked folder.`);
  }
  const entries = stripCommonRoot(readZip(bytes));
  const dir = await mkdtemp(join(tmpdir(), 'delivery-intake-'));
  for (const e of entries) {
    const abs = join(dir, e.name);
    await mkdir(dirname(abs), { recursive: true });
    await writeFileAtomic(abs, e.data);
  }
  return { dir, archiveSha256: sha256(bytes), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function copyInto(srcDir, rels, destDir) {
  for (const rel of rels) {
    const to = join(destDir, rel);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(srcDir, rel), to);
  }
}

/**
 * Write the snapshot for one export into snapshotDir (replacing whatever was there).
 * @returns {Promise<{ snapshotSha256: string, zipped: string[], copied: number }>}
 */
export async function writeSnapshot({ exportDir, snapshotDir, layout, readme }) {
  await rm(snapshotDir, { recursive: true, force: true });
  await mkdir(snapshotDir, { recursive: true });
  const zip = [...layout.zip].sort();
  const copy = [...layout.copy].filter((p) => !zip.includes(p)).sort();
  await copyInto(exportDir, copy, snapshotDir);
  if (zip.length) {
    const entries = [];
    for (const rel of zip) entries.push({ name: rel, data: await readFile(join(exportDir, rel)) });
    await writeFileAtomic(join(snapshotDir, RUNTIME_ZIP), writeZip(entries));
    await writeFileAtomic(join(snapshotDir, '.gitignore'), `# Unzipped from ${RUNTIME_ZIP}; never committed loose.\n${zip.map((z) => `/${z}`).join('\n')}\n`);
  }
  const snapshotSha256 = await sha256Tree(snapshotDir, { ignore: (rel) => rel === README });
  await writeFileAtomic(join(snapshotDir, README), readme({ snapshotSha256, zipped: zip }));
  return { snapshotSha256, zipped: zip, copied: copy.length };
}

/**
 * delivery intake. Returns { exit, lines, failures, next, feature, epic, worktree }.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ source: string, sentence?: string|null, epic?: number|null, briefs?: string[], adapter?: string|null }} o
 */
export async function runIntake(ctx, { source, sentence = null, epic: adoptEpic = null, briefs = [], adapter: adapterName = null }) {
  const profile = await ctx.profile();
  const d = deps(ctx);
  const lines = [];
  const failures = [];
  const abs = resolve(ctx.cwd, source);
  const pack = await unpack(abs);
  try {
    const treeSha256 = await sha256Tree(pack.dir);
    let adapter;
    try {
      adapter = await d.getDesignAdapter(pack.dir, adapterName ? { adapter: adapterName } : {});
    } catch (err) {
      // The adapter names the temporary unpack directory; the founder knows the archive.
      if (err && err.exit === EXIT.USAGE && !isNotImplemented(err)) throw new UsageError(String(err.message).split(pack.dir).join(abs), { code: err.code });
      throw err;
    }
    const found = await adapter.detect(pack.dir);
    if (!found.ok) throw new UsageError(`not a recognised ${adapter.name} export: ${found.reason ?? 'unknown layout'}${adapter.name === 'claude-design' ? ' (for a folder of images pass --adapter image-folder)' : ''}`);
    const project = found.project || basename(abs).replace(/\.zip$/i, '');
    // --feature, else the run of the worktree this runs in, else the project's name as a slug.
    const feature = assertFeatureSlug(ctx.flags.feature ?? ctx.feature ?? slugify(project));

    // The run, if this feature already has one in some worktree.
    const existingRun = (await discoverRuns(ctx.git, { runRoot: profile.paths.runRoot })).find((r) => r.feature === feature) ?? null;
    const state = existingRun ? await loadState(existingRun.statePath) : null;
    if (adoptEpic && state?.epic && state.epic !== adoptEpic) {
      throw new UsageError(`this run's epic is #${state.epic}; --epic ${adoptEpic} would move it (start a new feature instead)`);
    }
    const lookupRoot = existingRun ? existingRun.worktree : ctx.repoRoot;
    const lookupPaths = featurePaths(lookupRoot, feature, profile.paths);

    // The sentence: this call's, else the one kept from the first intake.
    const sentenceFile = join(lookupPaths.intentDir, 'sentence.txt');
    const kept = (await exists(sentenceFile)) ? (await readFile(sentenceFile, 'utf8')).trim() : null;
    const theSentence = sentence ?? kept;
    if (!theSentence) throw new UsageError('the first intake needs --intent "<one sentence of intent>"');

    // The epic, before the branch (the branch name carries its number).
    const epicRes = await syncEpic(ctx, { paths: lookupPaths, profile, sentence: theSentence, adopt: adoptEpic });
    const epic = epicRes.number;
    lines.push(`epic #${epic}: ${epicRes.action}`);

    // The integration branch and worktree.
    let worktree = state?.worktree ?? null;
    let branch = state?.branch ?? null;
    if (!worktree) {
      branch = integrationBranch(profile, epic, feature);
      worktree = integrationWorktreePath(await primaryWorktree(ctx.git), profile, feature);
      await ensureWorktree(ctx, { profile, branch, worktree });
      lines.push(`integration worktree ${worktree} on ${branch}`);
    }
    const paths = featurePaths(worktree, feature, profile.paths);
    const git = createGit(ctx.runner, { cwd: worktree });

    // The snapshot, replaced only when the archive changed.
    const readmePath = join(paths.designSnapshot, README);
    const recorded = (await exists(readmePath)) ? parseSnapshotReadme(await readFile(readmePath, 'utf8')) : null;
    let reexport = false;
    if (!recorded || recorded.archive !== pack.archiveSha256) {
      reexport = Boolean(recorded);
      const layout = await adapter.snapshotLayout(pack.dir);
      const snap = await writeSnapshot({
        exportDir: pack.dir, snapshotDir: paths.designSnapshot, layout,
        readme: ({ snapshotSha256, zipped }) => renderSnapshotReadme({
          project, adapter: adapter.name, exportedAt: found.exportedAt ?? null, takenOn: isoDate(ctx.clock),
          archiveSha256: pack.archiveSha256, treeSha256, snapshotSha256, zipped,
        }),
      });
      lines.push(`${reexport ? 'replaced the snapshot with the new export' : 'snapshot written'}: ${repoRel(worktree, paths.designSnapshot)}/ (${snap.copied} files, ${snap.zipped.length} zipped into ${RUNTIME_ZIP})`);
    } else {
      lines.push(`snapshot unchanged (archive ${pack.archiveSha256.slice(0, 12)} already taken)`);
    }

    // Intent inputs: the export's uploads/, every --brief file, the sentence.
    const uploads = (await exists(join(pack.dir, 'uploads'))) ? await listTree(join(pack.dir, 'uploads')) : [];
    await copyInto(join(pack.dir, 'uploads'), uploads, join(paths.intentDir, 'uploads'));
    for (const b of briefs) {
      const from = resolve(ctx.cwd, b);
      if (!(await exists(from))) throw new UsageError(`--brief ${b}: no such file`);
      await mkdir(join(paths.intentDir, 'briefs'), { recursive: true });
      await copyFile(from, join(paths.intentDir, 'briefs', basename(from)));
    }
    await writeFileAtomic(join(paths.intentDir, 'sentence.txt'), `${theSentence}\n`);

    // The intent, if the extractor has written it.
    const design = {
      adapter: adapter.name, archiveSha256: pack.archiveSha256, treeSha256, project,
      exportedAt: found.exportedAt ?? isoDate(ctx.clock), snapshotDir: repoRel(worktree, paths.designSnapshot),
    };
    let next = null;
    let intentState = 'missing';
    if (await exists(paths.intentJson)) {
      const raw = await readJson(paths.intentJson);
      const fixed = { ...raw, schemaVersion: 1, feature, epic, sentence: raw.sentence || theSentence, design };
      const { errors } = validateAgainst('intent', fixed);
      if (errors.length) {
        for (const e of errors.slice(0, 20)) failures.push({ code: 'intent', message: `intent.json${e.path === '/' ? '' : e.path}: ${e.message}` });
        intentState = 'invalid';
      } else {
        if (JSON.stringify(fixed) !== JSON.stringify(raw)) await writeJsonAtomic(paths.intentJson, fixed);
        await writeFileAtomic(paths.intentMd, renderIntentMd(fixed));
        intentState = 'valid';
        await syncEpic(ctx, { paths, profile, sentence: theSentence });
        if (reexport) next = 'NEXT: re-run design candidates and design render on the new snapshot, then diff the inventory (changed states reopen their plan rows)';
      }
    } else {
      next = `NEXT: switch this session into ${worktree} with EnterWorktree (path ${worktree}), so it and every agent it dispatches can write there; draft ${repoRel(worktree, paths.intentJson)} with one delivery-extractor (briefs/extractor-design.md, intent section; the design facts are in ${repoRel(worktree, readmePath)} and the sentence in ${repoRel(worktree, join(paths.intentDir, 'sentence.txt'))}), then run intake again there`;
    }

    // State, then one commit of the snapshot and the intent.
    if (!(await exists(paths.state))) {
      await createState(paths, { feature, runId: newRunId(ctx.clock), worktree, branch, epic, at: ctx.clock.now().toISOString() });
      lines.push(`run state ${repoRel(worktree, paths.state)} created`);
    }
    const committed = await commitIntake(git, { paths, worktree, project, feature, reexport });
    if (committed) lines.push(`committed on ${branch}: ${committed}`);

    const exit = intentState === 'invalid' ? EXIT.USAGE : intentState === 'missing' ? EXIT.RED : EXIT.PASS;
    if (intentState === 'missing') failures.push({ code: 'intent', message: `${repoRel(worktree, paths.intentJson)} is not drafted yet` });
    await updateState(paths, (s) => ({ ...s, epic }), {
      at: ctx.clock.now().toISOString(),
      event: formatEvent({ command: 'intake', exit, counts: { archive: pack.archiveSha256.slice(0, 12), reexport: reexport ? 1 : 0, intent: intentState, epic } }),
      inputs: { archive: pack.archiveSha256, tree: treeSha256 }, outputs: { epic, branch, intent: intentState },
    });
    return { exit, lines, failures, next, feature, epic, worktree, branch };
  } finally {
    await pack.cleanup();
  }
}

async function ensureWorktree(ctx, { profile, branch, worktree }) {
  if (await exists(join(worktree, '.git'))) return;
  const base = profile.repo.base;
  await ctx.git.raw(['fetch', 'origin', base]);
  const hasBranch = Boolean(await ctx.git.revParse(`refs/heads/${branch}`));
  const start = (await ctx.git.revParse(`origin/${base}`)) ? `origin/${base}` : base;
  const args = hasBranch ? ['worktree', 'add', worktree, branch] : ['worktree', 'add', '-b', branch, worktree, start];
  const r = await ctx.git.raw(args);
  if (r.code !== 0) throw new DeliveryError(EXIT.RED, `git worktree add failed: ${lastLine(r.stderr, r.stdout)}`, { code: 'git' });
}

async function commitIntake(git, { paths, worktree, project, feature, reexport }) {
  const rels = [paths.designSnapshot, paths.intentDir, paths.intentJson, paths.intentMd];
  const present = [];
  for (const p of rels) if (await exists(p)) present.push(repoRel(worktree, p));
  if (!present.length) return null;
  await git.ok(['add', '--', ...present]);
  const staged = await git.raw(['diff', '--cached', '--quiet']);
  if (staged.code === 0) return null;
  const message = reexport
    ? `Replace the ${feature} design snapshot with the new ${project} export`
    : `Snapshot the ${project} design export and the intent for ${feature}`;
  await git.ok(['commit', '-q', '-m', message]);
  return message;
}

/**
 * Phase-0 gate input, recomputed from sources: the snapshot under docs/design/<feature>/ hashes to
 * what its README recorded (so it was not edited since intake), intent.json validates and names
 * the same archive and tree, the epic exists and carries its marker, and state.json exists with a
 * sound journal.
 * Called by lib/gates/phase-0.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function verifyIntake(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const failures = [];
  let exit;

  if (!(await exists(paths.state))) failures.push({ code: 'intake', message: 'no state.json: run delivery intake' });
  else {
    try { await loadState(paths.state); } catch (err) {
      failures.push({ code: 'journal', message: err.message });
      exit = err.exit ?? EXIT.INCONSISTENT;
    }
  }

  const readmePath = join(paths.designSnapshot, README);
  const recorded = (await exists(readmePath)) ? parseSnapshotReadme(await readFile(readmePath, 'utf8')) : null;
  if (!recorded) failures.push({ code: 'snapshot', message: `no snapshot README with its hashes at ${repoRel(paths.repoRoot, readmePath)}` });
  else {
    const actual = await sha256Tree(paths.designSnapshot, { ignore: (rel) => rel === README });
    if (actual !== recorded.snapshot) failures.push({ code: 'snapshot', message: `the design snapshot was edited after intake (hash ${actual.slice(0, 12)}, recorded ${recorded.snapshot.slice(0, 12)}); a new export goes through intake` });
  }

  const intent = await readJson(paths.intentJson, { optional: true }).catch(() => null);
  if (!intent) failures.push({ code: 'intent', message: `${repoRel(paths.repoRoot, paths.intentJson)} is missing (draft it with the extractor, then run intake again)` });
  else {
    const { errors } = validateAgainst('intent', intent);
    for (const e of errors.slice(0, 10)) failures.push({ code: 'intent', message: `intent.json${e.path === '/' ? '' : e.path}: ${e.message}` });
    if (!errors.length && recorded) {
      if (intent.design.archiveSha256 !== recorded.archive) failures.push({ code: 'intent', message: 'intent.json names a different archive than the snapshot (run intake again)' });
      if (intent.design.treeSha256 !== recorded.tree) failures.push({ code: 'intent', message: 'intent.json names a different export tree than the snapshot (run intake again)' });
    }
  }

  const epic = await findEpic(ctx);
  const marker = runMarkers(profile, paths.feature).epic();
  if (!epic) failures.push({ code: 'epic', message: `no issue carries ${marker} (run delivery intake)` });
  else if (!hasMarker(epic.body, marker)) failures.push({ code: 'epic', message: `#${epic.number} is named as the epic but lacks ${marker} (run delivery issues sync --epic-only)` });
  else if (intent?.epic && intent.epic !== epic.number) failures.push({ code: 'epic', message: `intent.json names #${intent.epic}, the marked epic is #${epic.number}` });

  return gateResult(failures, exit);
}
