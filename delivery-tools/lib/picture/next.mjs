// Picture-mode status: where a run is in the picture loop, and its one NEXT line. The loop is
// pictures -> map -> rules -> worlds -> build -> shoot -> review -> (fix, shoot, review) x2 -> ship.
// pictureNext is pure over the facts; pictureFacts reads them from the run's files.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checklistPath, designIds, mapPath, validateMap } from './map.mjs';
import { featurePaths } from '../core/paths.mjs';
import { listRounds, roundInfo } from './rounds.mjs';
import { backToDesignItems } from './review.mjs';
import { designFor, hasPhone, mapItems } from './widths.mjs';
import { owedDesignRules, readRules, ruleFacts, rulesPath } from './rules.mjs';
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

/**
 * The committed HEAD version of components.json, for deciding whether a component counts as
 * marked built (fix round, I14): `--mark-built` only ever writes the working copy, and `ready`
 * reads the PR head, so NEXT moved on the moment the working copy said "built" while ready stayed
 * red until the change was actually committed and pushed. Falls back to the working copy when
 * there is no git handle (a test, or a file not tracked yet).
 */
async function committedComponentsMap(git, repoRoot, compPath, compMap) {
  if (!git) return compMap;
  try {
    const raw = await git.show('HEAD', relative(repoRoot, compPath));
    return raw ? JSON.parse(raw.toString('utf8')) : compMap;
  } catch { return compMap; }
}

/**
 * Whether the very first components run (feature slug "components") has ever gotten as far as
 * writing its own map.json — round 2 of I12: this is what actually makes "components" a taken
 * feature slug, not merely the product-wide components.json existing (a page run's own ready
 * check writes nothing there, but componentsMapPath's file can still exist before any components
 * run has). Read from the committed HEAD, the same way I14 reads "marked built", falling back to
 * the working copy when there is no git handle or the file is not on HEAD yet.
 */
async function firstComponentsRunHasMap(paths, opts) {
  if (!opts.profile) return false;
  const compRunPaths = featurePaths(paths.repoRoot, 'components', opts.profile.paths ?? {});
  const file = mapPath(compRunPaths);
  if (opts.git) {
    try {
      const raw = await opts.git.show('HEAD', relative(paths.repoRoot, file));
      if (raw) return true;
    } catch { /* fall through to the working copy */ }
  }
  return existsSync(file);
}

/** A design render's recorded component names (the same file readStateComponents reads), read synchronously. */
function stateComponentNames(paths, id, width) {
  if (!paths.designRenders) return [];
  const file = join(paths.designRenders, width === 'phone' ? `${id}@phone.components.json` : `${id}.components.json`);
  const data = readJsonSync(file);
  return Array.isArray(data?.names) ? data.names : [];
}

/** The component names a page run's own states show, at both widths (design ids from designFor). */
export function mapUsedComponents(paths, map) {
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
 * @param {{ profile?: object, git?: import('../core/git.mjs').createGit }} [opts] profile: needed
 *   for the components-first facts (componentsUnbuilt, pageBlockedComponents, designSyncMissing,
 *   componentsRunExists); omitted, those are empty/false and nothing else changes. git: bound to
 *   paths.repoRoot, read for componentsUnbuilt's and componentsRunExists' committed-HEAD checks
 *   (I14, I12); omitted, those fall back to the working copy, same as before.
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
  // Rules run straight after intake (A3), so they are read whether or not map.json exists yet;
  // known-state checking simply skips until the map does.
  const rules = ruleFacts(paths, { stateIds: map ? map.states.map((st) => st.id) : undefined });
  let owedDesign = [];
  try { owedDesign = owedDesignRules(readRules(paths)); } catch { /* rules.error already reports a parse problem */ }
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
  // Marked built only counts once it is on HEAD (I14): --mark-built writes the working copy, and
  // ready reads the PR head, so this must agree with ready or NEXT moves on before ready does.
  const committedCompMap = compMap ? await committedComponentsMap(opts.git, paths.repoRoot, compPath, compMap) : null;
  const componentsUnbuilt = isComponentsRun && compMap
    ? (() => {
      const names = galleryBuildingNames(paths);
      const effective = effectiveComponentsFor(committedCompMap, names, exportComponents);
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
  const componentsRunExists = await firstComponentsRunHasMap(paths, opts);

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
    // Rules whose proof is still "owed-design": send-to-design blocks picture-build's first
    // builder dispatch until each is either drawn (proof becomes picture/test) or cut by the
    // founder (proof becomes cut, with a Scope line).
    owedDesignRules: owedDesign.map((r) => r.id),
    seedStale: Boolean(map) && (!existsSync(paths.seedplan) || mtime(paths.seedplan) < Math.max(mtime(mapPath(paths)), newestWorld)),
    rounds,
    backToDesign: backToDesignItems(paths).length,
    pageBlockedComponents,
    // Whether the very first components run has ever written its own map.json (fix round, I12,
    // round 2) — the signal that "components" is a taken feature slug and a fresh one needs
    // --from components <export> to reach it.
    componentsRunExists,
    componentsUnbuilt,
    // The repo-relative components.json path, for NEXT's "commit ... and push" line (I14).
    componentsMapRelPath: compPath ? relative(paths.repoRoot, compPath) : null,
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
  // A3: the rules pass runs straight after intake, before pictures or the map, so a behaviour the
  // briefs state but the design never drew is sent back before picture-build starts, not found by
  // a builder mid-round.
  if (f.rulesOwed) return { step: 'rules', skill, text: `dispatch the rules agent with briefs/rules.md to write rules.json from the briefs in intent/, then ${cli} rules` };
  if (f.owedDesignRules?.length) {
    return { step: 'design-send', skill: 'design-send', text: `${f.owedDesignRules.length} rule(s) are owed to the design (${f.owedDesignRules.join(', ')}): send the design brief with design-send before picture-build starts, or have the founder cut them (proof: cut, with a Scope line) in rules.json` };
  }
  if (!f.designed) return { step: 'pictures', skill: 'design-inventory', text: `render the design's states: ${cli} design render` };
  if (!f.hasMap && !f.mapError) return { step: 'map', skill, text: 'dispatch the mapper agent with briefs/mapper.md to write map.json from the design pictures' };
  if (f.mapError) return { step: 'map', skill, text: `fix map.json (${f.problemCount || 1} problem(s); first: ${f.mapError}), then ${cli} map` };
  if (f.pageBlockedComponents?.length) {
    // A components run already exists once (the product-wide components.json is proof of that):
    // "components" is a taken feature slug, so reaching it again needs --from (fix round, I12).
    const intakeCmd = f.componentsRunExists ? `${cli} intake --components --from components <export>` : `${cli} intake --components <export>`;
    return { step: 'components', skill, text: `run the components run first: ${intakeCmd} (used component(s) not built: ${f.pageBlockedComponents.join(', ')})` };
  }
  if (f.phoneRenderOwed) return { step: 'pictures', skill: 'design-inventory', text: `render the design at phone width (the map checks the phone): ${cli} design render --width phone, then ${cli} map` };
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
    // Both halves matter (fix round, I14): --mark-built only ever writes the working copy, and
    // ready reads the PR head, so committing and pushing is what actually clears this, whether or
    // not the working copy already says built.
    const mapPathText = f.componentsMapRelPath ?? 'docs/.../components.json';
    return { step: 'components-build', skill, text: `${cli} components --mark-built ${f.componentsUnbuilt.join(' ')}, commit ${mapPathText} and push` };
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
