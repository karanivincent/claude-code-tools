// Spot re-capture (spec 11.6). Owner: slice C (docs/ARCHITECTURE.md).
//
// An agent could edit a capture's files to add the markers a gate wants. ready re-captures a
// random share of the reached items (at least five) and compares what the page shows now with
// what the stored capture says it showed. Numbers are compared as shapes (every digit run is the
// same), so a clock that moved between the two captures is not a mismatch; words are compared exactly.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { createHash } from 'node:crypto';
import { gateResult } from '../core/gate.mjs';
import { itemKey } from './job.mjs';
import { normaliseText } from './judge.mjs';
import { captureRun, DEFAULT_HOOKS } from './run.mjs';

/** A deterministic PRNG from a string seed (sha256-seeded xorshift). */
export function seededRandom(seed) {
  const h = createHash('sha256').update(String(seed)).digest();
  let s = h.readUInt32LE(0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

/**
 * Pick max(minimum, ceil(pct% of items)) items, reproducibly for a seed.
 * @template T
 * @param {T[]} items
 * @param {number} pct
 * @param {string} seed
 * @param {number} [minimum]
 * @returns {T[]}
 */
export function sampleItems(items, pct, seed, minimum = 5) {
  const n = Math.min(items.length, Math.max(minimum, Math.ceil((items.length * pct) / 100)));
  const rand = seededRandom(seed);
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Text with every digit run reduced to one 0: the shape compared between two captures. */
export function textShape(text) {
  return String(text).split('\n').map(normaliseText).filter(Boolean).map((l) => l.replace(/\d+/g, '0')).join('\n');
}

/**
 * Re-capture a random limits.spotRecapturePct of reached states (at least five) and compare visible
 * text with the stored capture; any mismatch is red and leads the report.
 * Called by ready (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ runId: string, pct: number, seed?: string }} opts seed makes the sample reproducible
 * @param {typeof DEFAULT_HOOKS} [hooks]
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function spotRecapture(ctx, opts, hooks = ctx.captureHooks ?? DEFAULT_HOOKS) {
  const paths = ctx.requirePaths();
  const stored = await readArtefact(paths, 'capture', { key: opts.runId });
  const reached = stored.items.filter((i) => i.status === 'reached');
  if (!reached.length) return gateResult([{ code: 'spot', message: `${opts.runId} has no reached item to re-capture` }]);
  const seed = opts.seed ?? `${opts.runId}:${ctx.clock.now().toISOString()}`;
  const picks = sampleItems(reached, opts.pct, seed);
  const job = JSON.parse(await readFile(join(paths.captureDir(opts.runId), 'job.json'), 'utf8'));
  const byKey = new Map(job.items.map((i) => [i.key, i]));
  const items = picks.map((p) => byKey.get(itemKey(p))).filter(Boolean);
  const failures = [];
  if (items.length < picks.length) failures.push({ code: 'spot', message: `${opts.runId}: job.json lacks ${picks.length - items.length} of the sampled items` });
  // A spot run captures the same URLs; it never clicks controls (nothing to tear down).
  const runId = `s-${opts.runId.replace(/^c-/, '')}`.slice(0, 60);
  const r = await captureRun(ctx, {
    mode: stored.mode, baseUrl: stored.baseUrl, sha: stored.expectedSha, runId,
    items: items.map((i) => ({ ...i, clicks: false, controls: [] })),
  }, hooks);
  for (const p of picks) {
    const key = itemKey(p);
    const again = r.capture.items.find((i) => itemKey(i) === key);
    if (!again) continue;
    if (again.status !== 'reached') { failures.push({ code: 'spot', message: `${key}: not reached on re-capture (${again.why})` }); continue; }
    const before = await readFile(join(paths.captureDir(opts.runId), p.files.txt), 'utf8').catch(() => null);
    const after = await readFile(join(paths.captureDir(r.runId), again.files.txt), 'utf8').catch(() => null);
    if (before === null || after === null) { failures.push({ code: 'spot', message: `${key}: text file missing` }); continue; }
    if (textShape(before) !== textShape(after)) failures.push({ code: 'spot', message: `${key}: the stored capture's text differs from what the page shows now` });
  }
  await ctx.journal({ command: 'spot recapture', exit: failures.length ? 1 : 0, counts: { run: opts.runId, sampled: picks.length, mismatches: failures.length, spot: r.runId } });
  return gateResult(failures);
}
