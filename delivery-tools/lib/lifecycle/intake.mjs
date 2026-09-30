// Intake (spec 4.0). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Mechanical, and idempotent on the archive hash: check the export with the design adapter, hash
// it, find or create the epic, create the integration branch and worktree, snapshot the design
// there (runtime scripts zipped, a README with the hashes), keep the intent inputs, write
// state.json, commit. The intent itself is drafted by an extractor agent between two runs of
// intake: the first run stops with NEXT naming it; the second validates intent.json, fixes its
// mechanical fields, renders intent.md, updates the epic and commits both.

import { mkdtemp, readFile, rm, stat, copyFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { readZip, writeZip } from '../core/zip.mjs';
import { sha256, sha256Tree, listTree } from '../core/hash.mjs';
import { featurePaths, assertFeatureSlug } from '../core/paths.mjs';
import { discoverRuns } from '../core/discovery.mjs';
import { createGit } from '../core/git.mjs';
import { createState, loadState, newRunId, updateState, formatEvent } from '../core/state.mjs';
import { carryOver } from './update-run.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { writeFileAtomic, writeJsonAtomic, exists, readJson } from '../core/fs.mjs';
import { isoDate } from '../core/clock.mjs';
import { gateResult } from '../core/gate.mjs';
import { hasMarker } from '../core/markers.mjs';
import { UsageError, DeliveryError, EXIT } from '../core/exit.mjs';
import { deps, isNotImplemented } from './deps.mjs';
import { runMarkers, integrationBranch, integrationWorktreePath, primaryWorktree, repoRel, lastLine } from './run-info.mjs';
import { syncEpic, findEpic } from '../github/issues.mjs';
import { readExportComponents, componentOrder } from '../design/components.mjs';
import { componentsMapPath, readComponentsMap, writeComponentsMap, refreshDesignEntries } from '../components/map.mjs';
import { componentsInventory, galleryStates } from '../components/states.mjs';
import { worldFilePath } from '../seed/plan.mjs';

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
 * @param {{ source: string, sentence?: string|null, epic?: number|null, briefs?: string[], adapter?: string|null, from?: string|null }} o
 */
export async function runIntake(ctx, { source, sentence = null, epic: adoptEpic = null, briefs = [], adapter: adapterName = null, from = null, components = false }) {
  const profile = await ctx.profile();
  if (components) {
    if (!profile.components) throw new UsageError('profile.components is not configured; add a components block (map, galleryRoute) before running --components');
    if (!profile.components.map) throw new UsageError('profile.components.map is not set; add it to profile.components before running --components');
    if (!profile.components.galleryRoute) throw new UsageError('profile.components.galleryRoute is not set; add it to profile.components before running --components');
  }
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
    for (const note of found.notes ?? []) ctx.out.line(note);
    const allRuns = await discoverRuns(ctx.git, { runRoot: profile.paths.runRoot });
    const takenFeatures = new Set(allRuns.map((r) => r.feature));
    // --feature, else the run of the worktree this runs in, else "components" (a components run
    // shares one feature slug so a later export can update it by name) — except an update run
    // (--from) cannot itself default to the very slug it names, so --from on a components run gets
    // its own dated slug instead (fix round, I12): components.json and the run's other files are
    // still carried over by --from, same as any other update run. A second --from components the
    // same day gets "-2", then "-3", ... (fix round, round 2) rather than colliding with the first.
    let defaultComponentsFeature = 'components';
    if (components && from) {
      const base = `components-${isoDate(ctx.clock).replace(/-/g, '')}`;
      defaultComponentsFeature = base;
      for (let n = 2; takenFeatures.has(defaultComponentsFeature); n += 1) defaultComponentsFeature = `${base}-${n}`;
    }
    // ctx.feature is "the single run in this worktree" (core/discovery.mjs resolveFeature), resolved
    // before this command ever sees --components. That default belongs to a page run only: a
    // components run started from inside some other run's own worktree (fix round, 0.9.1 bug 1) must
    // still get the components slug, never adopt the worktree's own feature and overwrite its
    // snapshot. Only an explicit --feature (ctx.flags.feature) may override the components default.
    const feature = assertFeatureSlug(ctx.flags.feature ?? (components ? defaultComponentsFeature : (ctx.feature ?? slugify(project))));

    // The run, if this feature already has one in some worktree.
    const existingRun = allRuns.find((r) => r.feature === feature) ?? null;
    const state = existingRun ? await loadState(existingRun.statePath) : null;
    if (adoptEpic && state?.epic && state.epic !== adoptEpic) {
      throw new UsageError(`this run's epic is #${state.epic}; --epic ${adoptEpic} would move it (start a new feature instead)`);
    }
    const lookupRoot = existingRun ? existingRun.worktree : ctx.repoRoot;
    const lookupPaths = featurePaths(lookupRoot, feature, profile.paths);

    // The sentence: this call's, else the one kept from the first intake. A components run is
    // mechanical (spec components-first §3): it needs no founder sentence, so it is never required.
    const sentenceFile = join(lookupPaths.intentDir, 'sentence.txt');
    const kept = (await exists(sentenceFile)) ? (await readFile(sentenceFile, 'utf8')).trim() : null;
    const theSentence = sentence ?? kept;
    if (!components && !theSentence) throw new UsageError('the first intake needs --intent "<one sentence of intent>"');

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
    if (theSentence) await writeFileAtomic(join(paths.intentDir, 'sentence.txt'), `${theSentence}\n`);

    // An update run starts from the earlier run's map, worlds, rules and intent.
    if (from) {
      if (assertFeatureSlug(from) === feature) throw new UsageError(`--from ${from} names this run; an update run needs a new feature slug (--feature)`);
      // A components run's own intake always writes a fresh map.json (fix round, I15/round 2):
      // copying the earlier run's over first would leave a stale one behind if this run is later
      // refused (no target yet) or has nothing new to build (M5), hiding both behind a map.json
      // that was never really this run's own.
      const carried = await carryOver({
        fromDir: featurePaths(worktree, from, profile.paths).deliveryDir, toDir: paths.deliveryDir,
        feature, sentence: theSentence, carryMap: !components,
      }).catch((err) => { throw new UsageError(err.message); });
      lines.push(carried.length ? `update run from ${from}: carried over ${carried.join(', ')}` : `update run from ${from}: nothing new to carry over`);
    }

    // The intent, if the extractor has written it. A components run is mechanical (spec
    // components-first §3) and has no intent.json of its own: it writes components.json,
    // inventory.json, gallery-states.json, map.json and its world file instead.
    const design = {
      adapter: adapter.name, archiveSha256: pack.archiveSha256, treeSha256, project,
      exportedAt: found.exportedAt ?? isoDate(ctx.clock), snapshotDir: repoRel(worktree, paths.designSnapshot),
    };
    // Every intake, of any kind, checks the export's components against the product-wide
    // components.json and reports drift; only a components run persists it (below).
    const drift = await readComponentDrift({ profile, worktree, exportDir: pack.dir });
    if (drift) {
      lines.push(...drift.lines);
      if (!components) for (const e of drift.errors) failures.push({ code: 'components', message: e });
    }

    let next = null;
    let intentState = 'missing';
    let componentsOk = true;
    if (components) {
      // Read lazily (getSafety), not up front: the null-target and nothing-to-build returns never
      // reach the email-building step, so a repo whose safety file is not set up yet still gets
      // those results instead of an unrelated "no safety file" error.
      const getSafety = async () => (await ctx.safety()).safety;
      const cr = await runComponentsIntake({ profile, worktree, paths, treeSha256, drift, getSafety });
      lines.push(...cr.lines);
      for (const f of cr.failures) failures.push(f);
      next = cr.next;
      componentsOk = cr.failures.length === 0;
    } else if (await exists(paths.intentJson)) {
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
    const committed = await commitIntake(git, { paths, worktree, project, feature, reexport, profile });
    if (committed) lines.push(`committed on ${branch}: ${committed}`);

    const exit = components
      ? (componentsOk ? EXIT.PASS : EXIT.RED)
      : (intentState === 'invalid' ? EXIT.USAGE : intentState === 'missing' ? EXIT.RED : EXIT.PASS);
    if (!components && intentState === 'missing') failures.push({ code: 'intent', message: `${repoRel(worktree, paths.intentJson)} is not drafted yet` });
    const journalIntent = components ? (componentsOk ? 'components' : 'blocked') : intentState;
    await updateState(paths, (s) => ({ ...s, epic, ...(from ? { from } : {}) }), {
      at: ctx.clock.now().toISOString(),
      event: formatEvent({ command: 'intake', exit, counts: { archive: pack.archiveSha256.slice(0, 12), reexport: reexport ? 1 : 0, intent: journalIntent, epic } }),
      inputs: { archive: pack.archiveSha256, tree: treeSha256 }, outputs: { epic, branch, intent: journalIntent },
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

async function commitIntake(git, { paths, worktree, project, feature, reexport, profile }) {
  // map.json, rules.json and worlds/ exist at intake only when an update run carried them over, or
  // (map.json, worlds/, gallery-states.json, inventory.json) a components run just wrote them.
  const rels = [paths.designSnapshot, paths.intentDir, paths.intentJson, paths.intentMd,
    join(paths.deliveryDir, 'map.json'), join(paths.deliveryDir, 'rules.json'), join(paths.deliveryDir, 'worlds'),
    paths.inventory, join(paths.deliveryDir, 'gallery-states.json'),
    ...(profile?.components?.map ? [componentsMapPath(worktree, profile)] : [])];
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
 * Every intake (any kind) checks the export's components against the product-wide
 * docs/delivery/components.json (components-first spec §2) and reports drift. Pure read: never
 * writes (a components run persists it separately, in runComponentsIntake). Null when the profile
 * has no components map configured, so a repo that never turned this on pays nothing for it.
 * @returns {Promise<{ mapPath: string, exported: object[], errors: string[], existing: object,
 *   refreshed: object|null, changed: string[], lines: string[] } | null>}
 */
async function readComponentDrift({ profile, worktree, exportDir }) {
  const mapPath = componentsMapPath(worktree, profile);
  if (!mapPath) return null;
  const { components: exported, errors } = await readExportComponents(exportDir);
  const existing = (await readComponentsMap(mapPath)) ?? { version: 1, components: [] };
  if (errors.length) return { mapPath, exported, errors, existing, refreshed: null, changed: [], lines: [] };
  const before = new Map(existing.components.filter((c) => c.kind === 'design').map((c) => [c.name, c]));
  const { map: refreshed, changed } = refreshDesignEntries(existing, exported);
  const lines = changed.map((name) => {
    const prev = before.get(name);
    const now = refreshed.components.find((c) => c.kind === 'design' && c.name === name);
    return prev ? `${name}: ${prev.status} -> ${now.status} (the design file changed)` : `${name}: new component (found in the export)`;
  });
  return { mapPath, exported, errors, existing, refreshed, changed, lines };
}

/**
 * The components run's fixture admin email: derived from the feature slug, never a hardcoded
 * literal, and checked against this repo's own safety.fixtureUserPattern rather than assumed (fix
 * round, 0.9.1 bug 2) — a components world seeded with `profile.auth.robotAdminEmail` is not a
 * fixture address, so `seed --check` refused it. "components" shortens to "comp" so the plain
 * default reads `delivery+comp-admin@example.invalid`; a dated run keeps its own date
 * ("components-20260115" -> `delivery+comp-20260115-admin@example.invalid`).
 * @param {string} feature
 * @param {object} safety
 */
export function componentsWorldEmail(feature, safety) {
  const short = String(feature).replace(/^components/, 'comp');
  const email = `delivery+${short}-admin@example.invalid`;
  const pattern = safety?.fixtureUserPattern;
  if (pattern && !new RegExp(pattern).test(email)) {
    throw new UsageError(`the components world's fixture email "${email}" does not match this repo's safety.fixtureUserPattern (${pattern}); adjust componentsWorldEmail in lib/lifecycle/intake.mjs for this repo's own convention`);
  }
  return email;
}

/**
 * The components world's organisation name: the profile's own test data when it names one
 * (profile.testData.orgName), else the generic "Acme Store" every other generic fixture and
 * example in this plugin already uses (briefs/mapper.md, templates/design-brief.md).
 * @param {object} profile
 */
export function componentsWorldOrgName(profile) {
  return profile?.testData?.orgName || 'Acme Store';
}

/**
 * The organisation-row template for a components run's world file: the first
 * docs/delivery/<feature>/worlds/<world>.json in the repo (features in sorted order, the
 * components run's own feature skipped) with a row keyed "org" and another row whose values
 * reference "user:admin" — an existing page run's own world, copied rather than reinvented,
 * because which tables an organisation and its admin membership live in is this product's
 * business, never generic plugin code's (fix round, 0.9.1 bug 2).
 * @param {string} worktree
 * @param {string} skipFeature
 * @returns {Promise<object[]|null>} the template's rows, or null when the repo has none yet
 */
export async function findComponentsWorldTemplate(worktree, skipFeature) {
  const deliveryDir = join(worktree, 'docs', 'delivery');
  let entries;
  try { entries = await readdir(deliveryDir, { withFileTypes: true }); } catch { return null; }
  const features = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const feature of features) {
    if (feature === skipFeature) continue;
    const worldsDir = join(deliveryDir, feature, 'worlds');
    let files;
    try { files = (await readdir(worldsDir)).filter((n) => n.endsWith('.json')).sort(); } catch { continue; }
    for (const name of files) {
      const doc = await readJson(join(worldsDir, name), { optional: true }).catch(() => null);
      const rows = doc?.rows;
      if (!Array.isArray(rows)) continue;
      // Only the organisation row and the admin's own rows that point at nothing but it: a page
      // run's world also seeds contacts, calls and a member, none of which the gallery needs, and
      // a row referencing a user this world does not have would fail the seed.
      const refsOk = (r) => [...JSON.stringify(r.values ?? {}).matchAll(/"\$ref":"([^"]+)"/g)].every((m) => m[1] === 'org' || m[1] === 'user:admin');
      const org = rows.find((r) => r.key === 'org' && refsOk(r));
      const admin = rows.filter((r) => r.key !== 'org' && JSON.stringify(r.values ?? {}).includes('"user:admin"') && refsOk(r));
      if (org && admin.length) return [org, ...admin];
    }
  }
  return null;
}

/**
 * A template's rows, generalised for a components run's own world: every literal (non-placeholder)
 * "slug" value becomes `delivery-comp-<feature>`, so the new world's organisation never collides
 * with the one the template came from. $ref, $orgName and $rel placeholders resolve generically for
 * any world and are kept exactly as the template has them.
 * @param {object[]} templateRows
 * @param {string} feature
 */
export function componentsWorldRows(templateRows, feature) {
  const slug = `delivery-comp-${feature}`;
  const isPlaceholder = (v) => v && typeof v === 'object' && ('$ref' in v || '$orgName' in v || '$rel' in v);
  return templateRows.map((row) => ({
    ...row,
    values: Object.fromEntries(Object.entries(row.values ?? {}).map(([col, v]) => [
      col, (col.toLowerCase() === 'slug' && !isPlaceholder(v)) ? slug : v,
    ])),
  }));
}

/**
 * The components-specific writes of `delivery intake --components` (components-first spec §3):
 * persist the drift `readComponentDrift` already computed into components.json, then write this
 * run's inventory.json, gallery-states.json, map.json (kind "components") and worlds/components.json
 * for every design entry whose status is new or stale, in build (uses) order. Refuses, with nothing
 * beyond components.json written, when a design entry has no target yet: the mapper
 * (briefs/components-mapper.md) has not run.
 * @returns {Promise<{ lines: string[], failures: { code: string, message: string }[], next: string|null }>}
 */
async function runComponentsIntake({ profile, worktree, paths, treeSha256, drift, getSafety }) {
  const lines = [];
  if (drift.errors.length) return { lines, failures: drift.errors.map((e) => ({ code: 'components', message: e })), next: null };

  await writeComponentsMap(drift.mapPath, drift.refreshed);
  const design = drift.refreshed.components.filter((c) => c.kind === 'design');
  lines.push(`${repoRel(worktree, drift.mapPath)}: ${design.length} design component(s)`);

  const nullTargets = design.filter((c) => c.target === null);
  if (nullTargets.length) {
    return {
      lines,
      failures: nullTargets.map((c) => ({ code: 'components', message: `${c.name}: no target yet (the mapper has not run)` })),
      next: 'NEXT: dispatch the mapper with briefs/components-mapper.md',
    };
  }

  let order;
  try {
    order = componentOrder(design);
  } catch (err) {
    return { lines, failures: [{ code: 'components', message: err.message }], next: null };
  }

  const byName = new Map(design.map((c) => [c.name, c]));
  const toBuild = drift.exported.filter((c) => ['new', 'stale'].includes(byName.get(c.name)?.status));

  // Fix round (M5): nothing new or stale means every component is already built. Writing an empty
  // inventory/gallery/map/world here would also silently wipe out the real ones from an earlier
  // components run that already built something — this run just has nothing left to add.
  if (!toBuild.length) {
    lines.push('nothing to build: every component is built');
    return { lines, failures: [], next: null };
  }

  const inventoryPart = componentsInventory(toBuild, order);
  const gallery = galleryStates(toBuild, order);
  const inventory = { schemaVersion: 1, feature: paths.feature, designTreeSha256: treeSha256, candidates: [], ...inventoryPart };
  await writeJsonAtomic(paths.inventory, inventory);
  lines.push(`inventory: ${inventory.states.length} state(s) -> ${repoRel(worktree, paths.inventory)}`);

  await writeJsonAtomic(join(paths.deliveryDir, 'gallery-states.json'), gallery);
  lines.push(`gallery-states.json: ${gallery.states.length} state(s)`);

  const route = profile.components.galleryRoute;
  // The world user must be a fixture address seed --check accepts, not the real-looking
  // profile.auth.robotAdminEmail — and kind/orgName so this world seeds the same way every other
  // run's worlds already do (fix round, 0.9.1 bug 2).
  const email = componentsWorldEmail(paths.feature, await getSafety());
  const orgName = componentsWorldOrgName(profile);
  const mapDoc = {
    schemaVersion: 1, feature: paths.feature, title: 'Components', kind: 'components', route,
    widths: ['desktop', 'phone'],
    worlds: [{ id: 'components', kind: 'design', orgName, users: [{ role: 'admin', email, name: 'Components Admin' }] }],
    states: inventoryPart.states.map((s) => ({
      id: s.id, screen: s.screen, name: s.name, design: s.id,
      reach: { world: 'components', role: 'admin', steps: [{ goto: route }] },
      buttons: [],
    })),
  };
  await writeJsonAtomic(join(paths.deliveryDir, 'map.json'), mapDoc);
  lines.push(`map.json: kind components, ${mapDoc.states.length} state(s) at ${route}`);

  // The organisation row template: copied from an existing run's own world file rather than
  // reinvented here, because which tables an organisation and its admin membership live in is this
  // product's business (fix round, 0.9.1 bug 2). None found yet (a brand-new repo, or this is the
  // very first run) writes the minimal world as before and says so with a NEXT line.
  const template = await findComponentsWorldTemplate(worktree, paths.feature);
  const worldPath = worldFilePath(paths, 'components');
  let worldNext = null;
  let worldRows;
  if (template) {
    worldRows = componentsWorldRows(template, paths.feature);
  } else {
    worldRows = [{ key: 'org', table: 'organizations', values: { name: { $orgName: true } } }];
    worldNext = `NEXT: fill in ${repoRel(worktree, worldPath)} before seeding (no other run's world file was found in this repo to copy an organisation row template from)`;
  }
  await writeJsonAtomic(worldPath, { schemaVersion: 1, world: 'components', rows: worldRows });
  lines.push(`${repoRel(worktree, worldPath)} written${template ? '' : ' (minimal: no template found)'}`);

  return { lines, failures: [], next: worldNext };
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
