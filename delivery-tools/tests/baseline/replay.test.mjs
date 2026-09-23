// M2 on the private replay set (spec 20.2): between the build's merge base and its epic head, the
// capabilities expected/m2.json names are reported lost, and the rewritten e2e test is found by
// what it asserted, not by its title. Every project value comes from the set at run time.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayTest } from '../helpers/replay.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeSafety } from '../helpers/fixtures.mjs';
import { extractAtRef, numberCapabilities } from '../../lib/baseline/extract.mjs';
import { diffCapabilities } from '../../lib/baseline/diff.mjs';

const NEEDS = ['expected/m2.json', 'refs.json', 'config/delivery-profile.json', 'config/intent.json'];

/** What a quoted assertion line asserts, in the extractor's own terms. */
function atomsOf(lines) {
  const out = new Set();
  for (const { text } of lines) {
    for (const m of text.matchAll(/getByTestId\(\s*['"]([^'"]+)['"]/g)) out.add(`testid:${m[1]}`);
    const kv = /^\s*([A-Za-z_]\w*)\s*:\s*['"]([^'"]*)['"],?\s*$/.exec(text);
    if (kv) out.add(`value:${kv[1]}=${kv[2]}`);
  }
  return out;
}

replayTest('M2 reports the lost capabilities between the merge base and the epic head', { needs: NEEDS }, async (t, dir) => {
  const read = (rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  const refs = read('refs.json');
  const ex = read('expected/m2.json');
  const profile = read('config/delivery-profile.json');
  const intent = read('config/intent.json');
  if (!existsSync(refs.repo)) { t.skip('the target repository is not on this machine'); return; }
  const { ctx } = await makeTestCtx({ repoRoot: refs.repo, profile, safety: makeSafety(), passthrough: ['git'] });
  const base = await extractAtRef(ctx, { ref: ex.base.sha, profile, intent });
  const head = await extractAtRef(ctx, { ref: ex.head.sha, profile, intent });
  const baseline = { schemaVersion: 1, base: { ref: ex.base.ref, sha: base.sha }, capabilities: numberCapabilities(base.capabilities), refreshes: [] };
  const findings = diffCapabilities({
    baseline, head: { capabilities: head.capabilities, e2e: head.e2e, files: new Set(head.allFiles), texts: new Map() },
    baseE2e: base.e2e, plan: null, headRef: ex.head.ref,
  });
  for (const want of ex.mustReportLost) {
    if (want.kind !== 'e2e-assertion') {
      const f = findings.find((x) => x.where === want.signature);
      assert.ok(f, `${want.id}: ${want.signature} is not reported`);
      assert.equal(f.severity, 'P1', want.id);
      assert.equal(f.rule, 'lost', want.id);
      continue;
    }
    const expected = atomsOf(want.base.asserts);
    assert.ok(expected.size, `${want.id}: nothing to match on`);
    const hit = findings.find((x) => x.severity === 'P1' && /^e2e-(not-carried|rewritten|mapped)/.test(x.rule) && (() => {
      const d = base.e2e.get(x.where);
      return d && d.file === want.base.test.file && [...expected].every((a) => d.assertions.includes(a));
    })());
    assert.ok(hit, `${want.id}: no base e2e test in ${want.base.test.file} asserting ${[...expected].join(', ')} is reported as not carried`);
  }
});
