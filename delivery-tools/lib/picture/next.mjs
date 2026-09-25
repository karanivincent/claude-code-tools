// Picture-mode status: where a run is in the picture loop, and its one NEXT line. The loop is
// pictures -> map -> worlds -> build -> shoot -> review -> (fix, shoot, review) x2 -> ship.
// pictureNext is pure over the facts; pictureFacts reads them from the run's files.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checklistPath, designIds, mapPath, validateMap } from './map.mjs';
import { listRounds, roundInfo } from './rounds.mjs';

/** Round 1 is the first build; two fix rounds follow at most. */
export const MAX_ROUNDS = 3;

const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

/** Read what the picture loop needs from a run's files. */
export function pictureFacts(paths) {
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
  return {
    designed: designed.size,
    hasMap: Boolean(map),
    mapError: mapError ?? problems[0] ?? null,
    problemCount: problems.length,
    checklistStale: Boolean(map) && mtime(checklistPath(paths)) < mtime(mapPath(paths)),
    seedStale: Boolean(map) && (!existsSync(paths.seedplan) || mtime(paths.seedplan) < Math.max(mtime(mapPath(paths)), newestWorld)),
    rounds,
  };
}

/**
 * @param {ReturnType<typeof pictureFacts>} f
 * @param {{ cli: string }} o
 * @returns {{ text: string, skill: string|null, step: string }}
 */
export function pictureNext(f, { cli }) {
  const skill = 'picture-build';
  if (!f.designed) return { step: 'pictures', skill: 'design-inventory', text: `render the design's states: ${cli} design render` };
  if (!f.hasMap && !f.mapError) return { step: 'map', skill, text: 'dispatch the mapper agent with briefs/mapper.md to write map.json from the design pictures' };
  if (f.mapError) return { step: 'map', skill, text: `fix map.json (${f.problemCount || 1} problem(s); first: ${f.mapError}), then ${cli} map` };
  if (f.checklistStale) return { step: 'map', skill, text: `${cli} map (the checklist is older than map.json)` };
  if (f.seedStale) return { step: 'worlds', skill, text: `${cli} seed --plan, then --check, then --apply (the seed plan is older than the map or a world file)` };
  const last = f.rounds[f.rounds.length - 1];
  if (!last) return { step: 'build', skill, text: `dispatch the builder with briefs/builder-picture.md; when it reports, start the dev server and run ${cli} shoot --base-url <url> (round 1)` };
  if (!last.shot) return { step: 'shoot', skill, text: `${cli} shoot --base-url <url> --round ${last.round}` };
  if (!last.reviews) return { step: 'review', skill, text: `dispatch the reviewers (briefs/reviewer-picture.md), one per screen, into round ${last.round}` };
  if (!last.compiled) return { step: 'review', skill, text: `${cli} review --round ${last.round}` };
  const open = (last.counts?.must ?? 0) + (last.counts?.notReached ?? 0);
  if (open && last.round < MAX_ROUNDS) {
    return { step: 'fix', skill, text: `fix round: send the builder round ${last.round}'s review.json (${open} state(s) open), re-seed the worlds it names, then ${cli} shoot --base-url <url> (round ${last.round + 1})` };
  }
  const tail = open ? `; ${open} state(s) stay open after ${MAX_ROUNDS} rounds and go to the founder as a list` : '';
  return { step: 'ship', skill, text: `ship: the full CI chain, push, ${cli} ci --pr <n>, then give the founder the preview, a sign-in link and round ${last.round}'s comparison page${tail}` };
}

/** Status lines for a picture-mode run. */
export function pictureStatusLines(run, f, next) {
  const lines = [`run ${run.feature} (picture mode) in ${run.worktree} on ${run.branch ?? '(no branch)'}`];
  lines.push(`design pictures: ${f.designed}; map: ${f.hasMap ? (f.mapError ? `${f.problemCount} problem(s)` : 'valid') : 'not written'}`);
  for (const r of f.rounds) {
    const c = r.counts;
    lines.push(`round ${r.round}: ${!r.shot ? 'not shot' : !r.reviews ? 'shot, not reviewed' : !r.compiled ? 'reviewed, not compiled' : `${c.match} match, ${c.small} small, ${c.must} to fix, ${c.notReached} not reached`}`);
  }
  lines.push(`NEXT: ${next.text}${next.skill ? ` (skill: ${next.skill})` : ''}`);
  return lines;
}
