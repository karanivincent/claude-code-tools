// Shared setup for the baseline tests: a temporary repo holding the synthetic app at its base
// commit (origin/main) and its redesigned head, a ctx on it, and the intent of a redesign.
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { BASE, HEAD, INTENT_SCOPE } from './app-fixture.mjs';

export const PROFILE = makeProfile({ baseline: { discriminators: ['step', 'mode', 'channel'] } });

/** Commit exactly these paths (run artefacts under docs/ and .delivery/ stay untracked). */
export function apply(repo, files, message) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) { if (existsSync(join(repo.dir, path))) rmSync(join(repo.dir, path)); }
    else repo.write({ [path]: text });
    repo.git('add', '-A', '--', path);
  }
  repo.git('commit', '-q', '-m', message);
  return repo.git('rev-parse', 'HEAD');
}

export async function setup() {
  const repo = makeTempRepo({ files: BASE });
  const baseSha = repo.git('rev-parse', 'HEAD');
  repo.git('update-ref', 'refs/remotes/origin/main', baseSha);
  const headSha = apply(repo, HEAD, 'the redesign');
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: PROFILE, safety: makeSafety(), passthrough: ['git'] });
  const intent = { ...validExample('intent'), inScope: INTENT_SCOPE, redesign: true };
  await writeArtefact(t.ctx.paths, 'intent', intent);
  return { repo, baseSha, headSha, intent, ...t };
}
