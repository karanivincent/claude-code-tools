// Build a ctx exactly as bin/delivery.mjs does, with a stub runner, the in-memory gh, a fake clock
// and captured output. Every external command must be answered by `rules` or it throws.

import { createCtx } from '../../lib/core/ctx.mjs';
import { createOutput } from '../../lib/core/output.mjs';
import { createStubRunner } from './runner-stub.mjs';
import { createGhStub } from './gh-stub.mjs';
import { fakeClock } from './clock.mjs';

/** A write()-able sink that remembers what was written. */
export function sink() {
  const chunks = [];
  return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join(''), lines: () => chunks.join('').split('\n').filter(Boolean) };
}

/**
 * @param {{
 *   repoRoot: string, feature?: string|null, json?: boolean,
 *   rules?: import('./runner-stub.mjs').StubRule[], passthrough?: string[], runner?: any,
 *   gh?: any, clock?: any, profile?: object, safety?: object, env?: object,
 * }} o  profile/safety are injected values; omit them to read the repo's files
 */
export async function makeTestCtx(o) {
  const stdout = sink();
  const stderr = sink();
  const clock = o.clock ?? fakeClock();
  const runner = o.runner ?? createStubRunner(o.rules ?? [], { passthrough: o.passthrough ?? [] });
  const gh = o.gh ?? createGhStub({ clock });
  const out = createOutput({ json: o.json ?? false, stdout, stderr });
  const ctx = await createCtx({
    cwd: o.repoRoot, repoRoot: o.repoRoot, env: o.env ?? {}, flags: { feature: o.feature ?? null, json: o.json ?? false, help: false },
    runner, gh, clock, out, profile: o.profile, safety: o.safety, cli: { version: '0.0.0-test', manifestSha256: null },
  });
  return { ctx, stdout, stderr, runner, gh, clock };
}
