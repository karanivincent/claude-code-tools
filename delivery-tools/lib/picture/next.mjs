// Picture-mode status: where a run is in the picture loop, and its one NEXT line. The loop is
// pictures -> map -> rules -> worlds -> build -> shoot -> review -> (fix, shoot, review) x2 -> ship.
// pictureNext is pure over the facts; pictureFacts reads them from the run's files.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checklistPath, designIds, mapPath, validateMap } from './map.mjs';
import { listRounds, roundInfo } from './rounds.mjs';
import { backToDesignItems } from './review.mjs';
import { designFor, hasPhone, mapItems } from './widths.mjs';
import { ruleFacts, rulesPath } from './rules.mjs';
import { componentsMapPath, effectiveComponentsFor, findDesignSystemManifest, missingFromDesignSystem } from '../components/map.mjs';
import { usedComponents } from '../components/check.mjs';
import { readExportComponents } from '../design/components.mjs';
import { parseEvent } from '../core/state.mjs';

/**
 * The run's real design snapshot, for effectiveComponents (I3: a page run's intake never calls
 * refreshDesignEntries, so components.json's own status/hash can be stale, or simply not know a
 * component the run's states show). No snapshot yet (an old run, or a test with no export on disk)
 * is not an error here: effectiveComponentsFor falls back to each name's own map-recorded hash.
 */
async function safeExportComponents(dir) {
  if (!dir || !existsSync(dir)) return [];
  try { return (await readExportComponents(dir)).components; } catch { return []; }
}

/** Round 1 is the first build; two fix rounds follow at most. */
export const MAX_ROUNDS = 3;

const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

/**
 * Each item's verdict from the newest round that pictured it: a round that re-shoots a few items
 * leaves the others at their earlier verdict instead of counting them as not reached. Keyed by
 * item key ("KC-05", "KC-05@phone"), which is what review.json keys its states by.
 * @returns {Map<string, { verdict: string, round: number }>}
 */
export function latestVerdicts(paths) {
  const latest = new Map();
  for (const n of listRounds(paths)) {
    const states = roundInfo(paths, n).review?.states ?? {};
    for (const [id, s] of Object.entries(states)) if (s.verdict !== 'not-shot') latest.set(id, { verdict: s.verdict, round: n });
  }
  return latest;
}

/**
 * Whether the map checks phone items against a narrow render of the design (a responsive design)
 * while the design has never been rendered at phone width.
 */
export function phoneRenderOwed(map, designed) {
  if (!map || !hasPhone(map)) return false;
  if ([...designed].some((id) => id.endsWith('@phone'))) return false;
  return mapItems(map).some((i) => i.width === 'phone' && !i.state.reach?.test && designFor(i.state, 'phone') && !designFor(i.state, 'phone').separate);
}

function readJsonSync(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** A design render's recorded component names (the same file readStateComponents reads), read synchronously. */
function stateComponentNames(paths, id, width) {
  if (!paths.designRenders) return [];
  const file = join(paths.designRenders, width === 'phone' ? `${id}@phone.components.json` : `${id}.components.json`);
  const data = readJsonSync(file);
  return Array.isArray(data?.names) ? data.names : [];
}

/** The component names a page run's own states show, at both widths (design ids from designFor). */
function mapUsedComponents(paths, map) {
  const stateNames = [];
  for (const s of map.states ?? []) {
    for (const width of ['desktop', 'phone']) {
      const d = designFor(s, width);
      if (d) stateNames.push(stateComponentNames(paths, d.id, width));
    }
  }
  return usedComponents(stateNames);
}

/** The component names a components run's gallery-states.json says it is building. */
function galleryBuildingNames(paths) {
  const doc = readJsonSync(join(paths.deliveryDir, 'gallery-states.json'));
  return doc ? [...new Set((doc.states ?? []).map((s) => s.component))] : [];
}

/** Whether the run's journal already recorded a successful, epic-closing land. */
function alreadyLanded(journal) {
  return (journal ?? []).some((e) => {
    const { command, exit, counts } = parseEvent(e.event);
    return /^land --epic \d+$/.test(command) && exit === 0 && counts.closed === '1';
  });
}

/**
 * Read what the picture loop needs from a run's files.
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {{ profile?: object }} [opts] profile: needed for the components-first facts (componentsUnbuilt,
 *   pageBlockedComponents, designSyncMissing); omitted, those are empty/null and nothing else changes.
 * @returns {Promise<object>}
 */
export async function pictureFacts(paths, opts = {}) {
  const designed = designIds(paths);
  let map = null;
  let mapError = null;
  try { map = JSON.parse(readFileSync(mapPath(paths), 'utf8')); } catch (err) { mapError = existsSync(mapPath(paths)) ? `map.json does not parse: ${err.message}` : null; }
  const problems = map ? validateMap(map, { designed }) : [];
  const worldsDir = join(paths.deliveryDir, 'worlds');
  const newestWorld = existsSync(worldsDir) ? Math.max(0, ...readdirSync(worldsDir).map((f) => mtime(join(worldsDir, f)))) : 0;
  const rounds = listRounds(paths).map((n) => {
    const info = roundInfo(paths, n);
    const newestReview = Math.max(0, ...info.reviews.map((f) => mtime(join(info.dir, f))));
    return {
      round: n,
      shot: Boolean(info.shoot),
      reviews: info.reviews.length,
      compiled: Boolean(info.review) && mtime(join(info.dir, 'review.json')) >= newestReview,
      counts: info.review?.counts ?? null,
      compare: info.compare,
    };
  });
  const latest = [...latestVerdicts(paths).values()];
  const count = (v) => latest.filter((s) => s.verdict === v).length;
  const desktopPictures = [...designed].filter((id) => !id.includes('@')).length;
  const rules = map ? ruleFacts(paths, { stateIds: map.states.map((st) => st.id) }) : null;
  let from = null;
  let journal = [];
  try {
    const st = JSON.parse(readFileSync(paths.state, 'utf8'));
    from = st.from ?? null;
    journal = st.journal ?? [];
  } catch { /* no state yet */ }

  // Components-first (spec §4, §6, §8.1): only meaningful with a profile (componentsMapPath needs
  // it) and, for componentsUnbuilt/designSyncMissing, a components-kind map.
  const isComponentsRun = map?.kind === 'components';
  const compPath = opts.profile ? componentsMapPath(paths.repoRoot, opts.profile) : null;
  const compMap = compPath ? readJsonSync(compPath) : null;
  const exportComponents = compMap ? await safeExportComponents(paths.designSnapshot) : [];
  const componentsUnbuilt = isComponentsRun && compMap
    ? (() => {
      const names = galleryBuildingNames(paths);
      const effective = effectiveComponentsFor(compMap, names, exportComponents);
      return names.filter((name) => effective.get(name) !== 'built');
    })()
    : [];
  const pageBlockedComponents = !isComponentsRun && map && compMap
    ? (() => {
      const names = mapUsedComponents(paths, map);
      const effective = effectiveComponentsFor(compMap, names, exportComponents);
      return names.filter((name) => ['new', 'stale'].includes(effective.get(name)));
    })()
    : [];
  const landedComponentsRun = isComponentsRun && alreadyLanded(journal);
  let designSyncMissing = null;
  if (landedComponentsRun && compMap) {
    const manifestPath = findDesignSystemManifest(paths.designSnapshot);
    if (manifestPath) designSyncMissing = missingFromDesignSystem(compMap, readJsonSync(manifestPath)?.components ?? []);
  }

  return {
    designed: desktopPictures,
    phonePictures: designed.size - desktopPictures,
    phoneRenderOwed: phoneRenderOwed(map, designed),
    noun: map && hasPhone(map) ? 'item' : 'state',
    open: latest.length ? { must: count('must'), notReached: count('not-reached') } : null,
    hasMap: Boolean(map),
    mapError: mapError ?? problems[0] ?? null,
    problemCount: problems.length,
    checklistStale: Boolean(map) && mtime(checklistPath(paths)) < Math.max(mtime(mapPath(paths)), mtime(rulesPath(paths))),
    // Briefs with no rules.json, or rules with a gap: either way a decision could go unchecked.
    // An update run: the page already exists, so round 1 pictures it before anything is built.
    update: from,
    rulesOwed: Boolean(rules && rules.briefs && !rules.exists),
    rulesProblem: rules?.problems[0] ?? null,
    ruleProblemCount: rules?.problems.length ?? 0,
    ruleCounts: rules?.counts ?? null,
    seedStale: Boolean(map) && (!existsSync(paths.seedplan) || mtime(paths.seedplan) < Math.max(mtime(mapPath(paths)), newestWorld)),
    rounds,
    backToDesign: backToDesignItems(paths).length,
    pageBlockedComponents,
    componentsUnbuilt,
    landedComponentsRun,
    designSyncMissing,
  };
}

/**
 * @param {ReturnType<typeof pictureFacts>} f
 * @param {{ cli: string }} o
 * @returns {{ text: string, skill: string|null, step: string }}
 */
export function pictureNext(f, { cli, readyOk = false, epic = null }) {
  const skill = 'picture-build';
  // A components run that has already landed has nothing left in the picture loop; the only thing
  // still owed is syncing the design-system project with what this run built (spec §8.1).
  if (f.landedComponentsRun && f.designSyncMissing?.length) {
    return { step: 'design-sync', skill: null, text: `run /design-sync on the design-system project: it lacks ${f.designSyncMissing.join(', ')}` };
  }
  if (!f.designed) return { step: 'pictures', skill: 'design-inventory', text: `render the design's states: ${cli} design render` };
  if (!f.hasMap && !f.mapError) return { step: 'map', skill, text: 'dispatch the mapper agent with briefs/mapper.md to write map.json from the design pictures' };
  if (f.mapError) return { step: 'map', skill, text: `fix map.json (${f.problemCount || 1} problem(s); first: ${f.mapError}), then ${cli} map` };
  if (f.pageBlockedComponents?.length) {
    return { step: 'components', skill, text: `run the components run first: ${cli} intake --components <export> (used component(s) not built: ${f.pageBlockedComponents.join(', ')})` };
  }
  if (f.phoneRenderOwed) return { step: 'pictures', skill: 'design-inventory', text: `render the design at phone width (the map checks the phone): ${cli} design render --width phone, then ${cli} map` };
  if (f.rulesOwed) return { step: 'rules', skill, text: `dispatch the rules agent with briefs/rules.md to write rules.json from the briefs in intent/, then ${cli} rules and ${cli} map` };
  if (f.rulesProblem) return { step: 'rules', skill, text: `fix rules.json (${f.ruleProblemCount} problem(s); first: ${f.rulesProblem}), then ${cli} rules and ${cli} map` };
  if (f.checklistStale) return { step: 'map', skill, text: `${cli} map (the checklist is older than map.json)` };
  if (f.seedStale) return { step: 'worlds', skill, text: `${cli} seed --plan, then --check, then --apply (the seed plan is older than the map or a world file)` };
  const last = f.rounds[f.rounds.length - 1];
  if (!last && f.update) return { step: 'shoot', skill, text: `update run from ${f.update}: picture the page as it is before building. Start the dev server, then ${cli} shoot --base-url <url> (round 1); the reviewers list what the new design changed, and the builder fixes only that` };
  if (!last) return { step: 'build', skill, text: `dispatch the builder with briefs/builder-picture.md; when it reports, start the dev server and run ${cli} shoot --base-url <url> (round 1)` };
  if (!last.shot) return { step: 'shoot', skill, text: `${cli} shoot --base-url <url> --round ${last.round}` };
  if (!last.reviews) return { step: 'review', skill, text: `dispatch the reviewers (briefs/reviewer-picture.md), one per screen, into round ${last.round}` };
  if (!last.compiled) return { step: 'review', skill, text: `${cli} review --round ${last.round}` };
  const o = f.open ?? last.counts ?? {};
  const open = (o.must ?? 0) + (o.notReached ?? 0);
  const noun = f.noun ?? 'state';
  if (open && last.round < MAX_ROUNDS) {
    return { step: 'fix', skill, text: `fix round: send the builder round ${last.round}'s review.json (${open} ${noun}(s) open), re-seed the worlds it names, then ${cli} shoot --base-url <url> (round ${last.round + 1})` };
  }
  let tail = open ? `; ${open} ${noun}(s) stay open after ${MAX_ROUNDS} rounds and go to the founder as a list` : '';
  const backToDesign = f.backToDesign ?? 0;
  if (backToDesign) tail += `; ${backToDesign} item(s) go back to the design: ${cli} brief new <slug> --from-run`;
  if (f.componentsUnbuilt?.length) {
    return { step: 'components-build', skill, text: `${cli} components --mark-built ${f.componentsUnbuilt.join(' ')}` };
  }
  if (readyOk) return { step: 'land', skill, text: `ready is green: mark the PR ready; after the founder's merge, ${cli} land --epic ${epic ?? '<epic>'}${tail}` };
  return { step: 'ship', skill, text: `ship: the full CI chain, push, ${cli} ci --pr <n>, then give the founder the preview, a sign-in link and round ${last.round}'s comparison page${tail}` };
}

/** Status lines for a picture-mode run. */
export function pictureStatusLines(run, f, next) {
  const lines = [`run ${run.feature} (picture mode) in ${run.worktree} on ${run.branch ?? '(no branch)'}`];
  lines.push(`design pictures: ${f.designed}${f.phonePictures ? ` (phone: ${f.phonePictures})` : ''}; map: ${f.hasMap ? (f.mapError ? `${f.problemCount} problem(s)` : 'valid') : 'not written'}`);
  if (f.ruleCounts) lines.push(`rules: ${f.ruleCounts.total} (${f.ruleCounts.picture} by a state, ${f.ruleCounts.test} by a test, ${f.ruleCounts.cut} cut)${f.ruleProblemCount ? `; ${f.ruleProblemCount} gap(s)` : ''}`);
  for (const r of f.rounds) {
    const c = r.counts;
    lines.push(`round ${r.round}: ${!r.shot ? 'not shot' : !r.reviews ? 'shot, not reviewed' : !r.compiled ? 'reviewed, not compiled' : `${c.match} match, ${c.small} small, ${c.must} to fix, ${c.notReached} not reached`}`);
  }
  lines.push(`NEXT: ${next.text}${next.skill ? ` (skill: ${next.skill})` : ''}`);
  return lines;
}
