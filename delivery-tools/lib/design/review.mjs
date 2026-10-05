// Design export review (components-first spec §8.4, plan task 8): compares a new Claude Design
// export against the run's current snapshot -- which components and screens changed, which states
// need re-rendering, whether the change introduced a forbidden name, and whether it left a rule
// with no proof. The findings feed the next brief (`brief new --from-review`), not a typed chat
// message: canvas screenshots lag and show one state at a time, the export already renders
// headlessly.

import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { readZip } from '../core/zip.mjs';
import { UsageError } from '../core/exit.mjs';
import { ensureDir, exists, writeFileAtomic, writeJsonAtomic } from '../core/fs.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { stripCommonRoot } from '../lifecycle/intake.mjs';
import { findDcFile, claudeDesignScreens, recordedPage } from '../../adapters/design/claude-design.mjs';
import { splitDcHtml } from './claude-dc.mjs';
import { screenMap } from './screens.mjs';
import { readExportComponents, sha256Text } from './components.mjs';
import { renderDesign, renderFileName, readStateComponents } from './render.mjs';
import { resolvePlaywright } from '../core/playwright.mjs';
import { ruleFacts } from '../picture/rules.mjs';
import { forbiddenNamesIn } from '../brief/brief.mjs';

export const REVIEW_DIRNAME = 'design-review';
const WIDTHS = ['desktop', 'phone'];

/**
 * Unpack a zip or accept a directory, the way `delivery intake` does (lib/lifecycle/intake.mjs's
 * own unpack, not exported, so this mirrors it with the same shared helper for the common root).
 * @param {string} source
 * @returns {Promise<{ dir: string, cleanup: () => Promise<void> }>}
 */
export async function unpackExport(source) {
  const st = await stat(source).catch(() => null);
  if (!st) throw new UsageError(`no such export or directory: ${source}`);
  if (st.isDirectory()) return { dir: source, cleanup: async () => {} };
  const bytes = await readFile(source);
  if (bytes.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') {
    throw new UsageError(`${basename(source)} is not a .zip archive or a directory: pass the Claude Design project's .zip export, or its unpacked folder.`);
  }
  const entries = stripCommonRoot(readZip(bytes));
  const dir = await mkdtemp(join(tmpdir(), 'delivery-review-'));
  for (const e of entries) {
    const abs = join(dir, e.name);
    await mkdir(dirname(abs), { recursive: true });
    await writeFileAtomic(abs, e.data);
  }
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/**
 * One export's components and screens, read fresh from disk.
 *
 * `screens` is one hash per screen value the main page can take, found with screenMap over the
 * main file's template and script (spec §8.4: "screens ... whose hash changed"). When the main
 * page's screen state cannot be resolved -- one value only, or no screen key at all, true of most
 * components-only exports and of a page with a single screen -- it falls back to a single "main"
 * entry hashing the whole main file. `mainHash` is that whole-file hash, always computed (even
 * when the screens resolve): `diffExports` falls back to it when the two exports disagree on
 * whether the screen state resolves at all, since a `{main}` map cannot be compared to a per-value
 * map screen by screen.
 * @param {string} dir an export directory (already unpacked)
 * @param {{ page?: string|null }} [opts] page: the page of an export with several; a snapshot's
 *   README supplies its own when this is not given
 * @returns {Promise<{ components: object[], errors: string[], screens: Record<string, string>, screenKey: string|null, mainFile: string|null, mainHash: string|null }>}
 */
export async function readExportSnapshot(dir, opts = {}) {
  const { components, errors } = await readExportComponents(dir);
  const dc = await findDcFile(dir, { page: opts.page ?? null });
  if (dc.error) return { components, errors: [...errors, dc.error], screens: {}, screenKey: null, mainFile: null, mainHash: null };
  const mainText = await readFile(join(dir, dc.file), 'utf8');
  const mainHash = sha256Text(mainText);
  const screen = claudeDesignScreens(mainText);
  if (!screen) return { components, errors, screens: { main: mainHash }, screenKey: null, mainFile: dc.file, mainHash };
  const parts = splitDcHtml(mainText);
  const map = screenMap(parts, screen);
  const templateLines = parts.template ? parts.template.text.split('\n') : [];
  const scriptText = parts.script ? parts.script.text : '';
  const screens = {};
  for (const value of screen.values) {
    const kept = templateLines.filter((_, i) => {
      const allowed = map.templateLine(parts.template.line + i);
      return allowed === null || allowed.includes(value);
    });
    screens[value] = sha256Text(`${kept.join('\n')}\n\x00\n${scriptText}`);
  }
  return { components, errors, screens, screenKey: screen.key, mainFile: dc.file, mainHash };
}

/**
 * Screens and components whose hash changed between two exports (pure; spec §8.4). `screens` is
 * only comparable value-by-value when both exports resolved the same way; when one resolved a
 * screen key and the other fell back to a single "main" entry (or neither resolved but a caller
 * built the maps some other way), the two `screens` maps do not share keys the way a per-value
 * diff needs, so the whole main file's hash (`mainHash`) is compared instead.
 * @param {{ components: {name: string, hash: string}[], screens: Record<string, string>, screenKey?: string|null, mainHash?: string|null }} before
 * @param {{ components: {name: string, hash: string}[], screens: Record<string, string>, screenKey?: string|null, mainHash?: string|null }} after
 * @returns {{ componentsChanged: string[], componentsAdded: string[], componentsRemoved: string[], screensChanged: string[] }}
 */
export function diffExports(before, after) {
  const b = new Map((before.components ?? []).map((c) => [c.name, c.hash]));
  const a = new Map((after.components ?? []).map((c) => [c.name, c.hash]));
  const componentsAdded = [...a.keys()].filter((n) => !b.has(n)).sort();
  const componentsRemoved = [...b.keys()].filter((n) => !a.has(n)).sort();
  const componentsChanged = [...a.keys()].filter((n) => b.has(n) && b.get(n) !== a.get(n)).sort();
  let screensChanged;
  if (Boolean(before.screenKey) !== Boolean(after.screenKey)) {
    screensChanged = before.mainHash !== after.mainHash ? ['main'] : [];
  } else {
    const beforeScreens = before.screens ?? {};
    const afterScreens = after.screens ?? {};
    const screenNames = new Set([...Object.keys(beforeScreens), ...Object.keys(afterScreens)]);
    screensChanged = [...screenNames].filter((n) => beforeScreens[n] !== afterScreens[n]).sort();
  }
  return { componentsChanged, componentsAdded, componentsRemoved, screensChanged };
}

/** The screen value an inventory state's reach gives the prototype's screen prop, or null. */
function stateScreenValue(reach, key) {
  if (!key || !reach) return null;
  if (reach.props && typeof reach.props[key] === 'string') return reach.props[key];
  for (const step of reach.steps ?? []) {
    if (step?.set && typeof step.set[key] === 'string') return step.set[key];
  }
  return null;
}

/**
 * Which inventory states need re-rendering after a design change: a state whose last render named
 * a changed component (from its "<ID>.components.json"), or every state of a changed screen (its
 * reach props or set-steps give the prototype's screen prop that value). When the screen state
 * cannot be resolved, every state is returned as soon as anything changed at all -- a changed
 * component *or* a changed screen (the "main" fallback) -- because there is no way to tell which
 * states a screen change touches, and a component-only change (the design's other components
 * untouched) still needs every state re-checked for the same reason. Nothing is returned when
 * neither changed.
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {{ states: object[] }} inventory
 * @param {{ componentsChanged: string[], screensChanged: string[] }} diff
 * @param {string|null} screenKey
 * @returns {Promise<string[]>} sorted state ids
 */
export async function statesToReview(paths, inventory, diff, screenKey) {
  const states = inventory?.states ?? [];
  if (!screenKey) {
    const changed = diff.screensChanged.length || diff.componentsChanged.length;
    return changed ? [...states.map((s) => s.id)].sort() : [];
  }
  const changedComponents = new Set(diff.componentsChanged);
  const changedScreens = new Set(diff.screensChanged);
  const out = new Set();
  for (const s of states) {
    const names = await readStateComponents(paths, s.id);
    if (names.some((n) => changedComponents.has(n))) { out.add(s.id); continue; }
    const value = stateScreenValue(s.reach, screenKey);
    if (value !== null && changedScreens.has(value)) out.add(s.id);
  }
  return [...out].sort();
}

function findingLines({ diff, rulesGaps, forbiddenNames }) {
  const out = [];
  for (const n of diff.componentsAdded) out.push(`Component ${n} was added.`);
  for (const n of diff.componentsRemoved) out.push(`Component ${n} was removed.`);
  for (const n of diff.componentsChanged) out.push(`Component ${n} changed.`);
  for (const s of diff.screensChanged) out.push(`Screen ${s} changed.`);
  for (const g of rulesGaps) out.push(`Rule gap: ${g}`);
  for (const f of forbiddenNames) out.push(`"${f.name}" is a forbidden name and appears in ${f.state}${f.width === 'phone' ? '@phone' : ''}.txt`);
  return out;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The compare page: every changed state, before and after, desktop and phone, side by side. */
export function renderComparePage({ feature, changedStates }) {
  const rows = changedStates.map((id) => {
    const img = (dir, width) => {
      const src = `${dir}/${renderFileName(id, width, 'png')}`;
      return `<figure><figcaption>${esc(dir)}</figcaption><img loading="lazy" src="${esc(src)}" alt="${esc(id)} ${esc(dir)} ${esc(width)}"></figure>`;
    };
    return `  <section class="state">
    <h2>${esc(id)}</h2>
    <div class="widths">
      <div class="width"><h3>Desktop</h3><div class="pair">${img('before', 'desktop')}${img('after', 'desktop')}</div></div>
      <div class="width"><h3>Phone</h3><div class="pair">${img('before', 'phone')}${img('after', 'phone')}</div></div>
    </div>
  </section>`;
  }).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(feature)} design review</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#1a1a1a}
.pair{display:flex;gap:1rem;flex-wrap:wrap}
figure{margin:0}
img{max-width:360px;border:1px solid #ccc;display:block}
figcaption{font-size:0.85rem;color:#555;margin-bottom:0.25rem}
h2{margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem}
</style>
</head><body>
<h1>${esc(feature)} design review</h1>
<p>${changedStates.length} state(s) changed.</p>
${rows || '<p>No states need re-rendering.</p>'}
</body></html>
`;
}

/**
 * Compare a new export with the run's current snapshot (spec §8.4). Renders the changed states'
 * pictures only when a Playwright is resolvable; otherwise review.json and the compare page are
 * still written, with the pictures reported as skipped and why.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ exportDir: string }} o exportDir: a folder or a .zip
 * @returns {Promise<object>} the review, also written to .delivery/<feature>/design-review/review.json
 */
export async function reviewExport(ctx, { exportDir }) {
  const paths = ctx.requirePaths();
  const unpacked = await unpackExport(exportDir);
  try {
    // A new export has no README of its own: it is read at the page the run's snapshot records.
    const page = await recordedPage(paths.designSnapshot);
    const [before, after] = await Promise.all([
      readExportSnapshot(paths.designSnapshot),
      readExportSnapshot(unpacked.dir, { page }),
    ]);
    const diff = diffExports(before, after);
    // Only trust a screen key when both exports resolved the same one: diffExports itself falls
    // back to the whole-file "main" hash whenever they disagree, so statesToReview must use the
    // same fallback rather than matching real state screen values against a diff that names none.
    const screenKey = before.screenKey && after.screenKey === before.screenKey ? after.screenKey : null;

    const inventory = await readArtefact(paths, 'inventory', { optional: true });
    const changedStates = inventory ? await statesToReview(paths, inventory, diff, screenKey) : [];

    const reviewDir = join(paths.runDir, REVIEW_DIRNAME);
    const afterDir = join(reviewDir, 'after');
    const beforeDir = join(reviewDir, 'before');
    await ensureDir(afterDir);
    await ensureDir(beforeDir);

    const profile = await ctx.profile().catch(() => null);
    const rendered = { desktop: [], phone: [] };
    const failed = [];
    let picturesSkippedWhy = null;

    if (changedStates.length) {
      const playwrightRoot = ctx.env.DELIVERY_PLAYWRIGHT_ROOT || ctx.repoRoot;
      try {
        await resolvePlaywright({ repoRoot: playwrightRoot, e2eDir: profile?.paths?.e2eDir ?? null });
      } catch (err) {
        picturesSkippedWhy = err.message;
      }
      if (!picturesSkippedWhy) {
        const changedInventory = { states: inventory.states.filter((s) => changedStates.includes(s.id)) };
        for (const width of WIDTHS) {
          const r = await renderDesign(ctx, {
            paths, inventory: changedInventory, adapter: 'claude-design', states: changedStates, width,
            snapshotDir: unpacked.dir, serveDir: join(reviewDir, 'serve'), outDir: afterDir, page,
            e2eDir: profile?.paths?.e2eDir ?? null, playwrightRoot: ctx.env.DELIVERY_PLAYWRIGHT_ROOT || null,
          });
          rendered[width] = r.rendered;
          for (const f of r.failed) failed.push({ ...f, width });
        }
        for (const id of changedStates) {
          for (const width of WIDTHS) {
            for (const ext of ['png', 'txt']) {
              const name = renderFileName(id, width, ext);
              const src = join(paths.designRenders, name);
              if (await exists(src)) await copyFile(src, join(beforeDir, name));
            }
          }
        }
      }
    }

    const forbiddenNames = [];
    const names = profile?.design?.forbiddenNames ?? [];
    if (names.length) {
      for (const width of WIDTHS) {
        for (const id of rendered[width]) {
          let text;
          try { text = await readFile(join(afterDir, renderFileName(id, width, 'txt')), 'utf8'); } catch { continue; }
          for (const name of forbiddenNamesIn(text, names)) forbiddenNames.push({ state: id, width, name });
        }
      }
    }

    let rulesGaps = [];
    const rf = ruleFacts(paths, { stateIds: inventory ? inventory.states.map((s) => s.id) : undefined, stage: 'plan' });
    if (rf.exists) rulesGaps = rf.problems;

    const findings = findingLines({ diff, rulesGaps, forbiddenNames });

    const review = {
      schemaVersion: 1,
      generatedAt: ctx.clock.now().toISOString(),
      before: { screenKey: before.screenKey, screens: before.screens, components: before.components.map((c) => ({ name: c.name, hash: c.hash })) },
      after: { screenKey: after.screenKey, screens: after.screens, components: after.components.map((c) => ({ name: c.name, hash: c.hash })) },
      diff,
      changedStates,
      pictures: { rendered, failed, skippedWhy: picturesSkippedWhy },
      rulesGaps,
      forbiddenNames,
      findings,
    };
    await writeJsonAtomic(join(reviewDir, 'review.json'), review);
    await writeFileAtomic(join(reviewDir, 'compare.html'), renderComparePage({ feature: paths.feature, changedStates }));
    return review;
  } finally {
    await unpacked.cleanup();
  }
}
