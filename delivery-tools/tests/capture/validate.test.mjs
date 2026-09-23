import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { captureRun } from '../../lib/capture/run.mjs';
import { validateCaptureItems, latestCaptureRun, captureSmokeGate, readCaptureOutputs } from '../../lib/capture/validate.mjs';
import { spotRecapture, sampleItems, textShape, seededRandom } from '../../lib/capture/spot.mjs';
import { shaFromBody, probeServedSha } from '../../lib/capture/served-sha.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { widgetsPlan, captureRule, hooks, writePlan, GOOD } from './helpers.mjs';

async function setup(show) {
  const repo = makeTempRepo({ files: { 'README.md': 'widgets app\n' } });
  writePlan(repo, widgetsPlan());
  const clock = fakeClock('2026-01-15T20:00:00.000Z');
  const rule = captureRule((it, job) => show?.(it, job) ?? null);
  const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety(), passthrough: ['git'], rules: [rule], clock });
  ctx.captureHooks = hooks().hooks;
  return { repo, ctx, clock, rule };
}

test('re-validation recomputes from the files and the current plan, never from capture.json\'s status', async () => {
  const s = await setup();
  try {
    const r = await captureRun(s.ctx, { mode: 'wave' });
    let v = await validateCaptureItems(s.ctx, r.runId);
    assert.equal(v.length, 9);
    assert.ok(v.every((x) => x.status === 'reached'));
    // Each verdict carries what the item was served, read signed in: ready's proof of the served
    // commit when the version route answers no anonymous caller.
    const expected = JSON.parse(readFileSync(join(s.repo.dir, '.delivery/widgets/captures', r.runId, 'capture.json'), 'utf8')).expectedSha;
    assert.ok(v.every((x) => x.servedSha === expected), JSON.stringify(v.map((x) => x.servedSha)));
    // an agent adds a marker to a stored capture: the text hash no longer matches
    const dir = join(s.repo.dir, '.delivery/widgets/captures', r.runId);
    appendFileSync(join(dir, 'WG-03.design.admin.1440.en.light.txt'), 'Copy made\n');
    v = await validateCaptureItems(s.ctx, r.runId);
    const wg3 = v.find((x) => x.state === 'WG-03' && x.width === 1440);
    assert.equal(wg3.status, 'not-reached');
    assert.match(wg3.why, /changed after capture/);
    // a plan change after the capture is judged against the plan as it is now
    const plan = widgetsPlan();
    plan.rows[1].markers.text = ['Nothing here yet'];
    writePlan(s.repo, plan);
    v = await validateCaptureItems(s.ctx, r.runId);
    assert.ok(v.filter((x) => x.state === 'WG-02').every((x) => /missing marker "Nothing here yet"/.test(x.why)));
    // a status someone typed into capture.json changes nothing
    const manifest = join(dir, 'capture.json');
    const doc = JSON.parse(readFileSync(manifest, 'utf8'));
    doc.items.forEach((i) => { i.status = 'reached'; delete i.why; });
    writeFileSync(manifest, JSON.stringify(doc));
    v = await validateCaptureItems(s.ctx, r.runId);
    assert.ok(v.some((x) => x.status === 'not-reached'));
  } finally { s.repo.cleanup(); }
});

test('readCaptureOutputs refuses a dom.json that is not the schema, and a missing errors.json', async () => {
  const s = await setup();
  try {
    const r = await captureRun(s.ctx, { mode: 'wave' });
    const dir = join(s.repo.dir, '.delivery/widgets/captures', r.runId);
    const key = 'WG-01.design.admin.1440.en.light';
    writeFileSync(join(dir, `${key}.dom.json`), JSON.stringify({ schemaVersion: 1 }));
    renameSync(join(dir, `${key}.errors.json`), join(dir, `${key}.errors.json.bak`));
    const got = await readCaptureOutputs(dir, key);
    assert.equal(got.problems.length, 2);
    assert.match(got.problems[0], /dom\.json does not match its schema/);
    assert.match(got.problems[1], /no errors\.json/);
    const v = await validateCaptureItems(s.ctx, r.runId);
    assert.match(v.find((x) => x.state === 'WG-01' && x.width === 1440 && x.role === 'admin').why, /dom\.json does not match/);
  } finally { s.repo.cleanup(); }
});

test('latestCaptureRun: newest of a mode; smoke and spot runs only when asked', async () => {
  const s = await setup();
  try {
    assert.equal(await latestCaptureRun(s.ctx), null);
    const a = await captureRun(s.ctx, { mode: 'wave' });
    s.clock.advance(60_000);
    const b = await captureRun(s.ctx, { mode: 'wave' });
    s.clock.advance(60_000);
    const smoke = await captureRun(s.ctx, { mode: 'branch', smoke: true });
    assert.ok(b.runId > a.runId);
    assert.equal(await latestCaptureRun(s.ctx, { mode: 'wave' }), b.runId);
    assert.equal(await latestCaptureRun(s.ctx), b.runId, 'a smoke run is not "the latest capture"');
    assert.equal(await latestCaptureRun(s.ctx, { smoke: true }), smoke.runId);
    assert.equal(await latestCaptureRun(s.ctx, { mode: 'full' }), null);
    s.clock.set('2026-01-15T20:01:00.000Z');
    const again = await captureRun(s.ctx, { mode: 'wave' });
    assert.equal(again.runId, `${b.runId.replace(/-wave$/, '')}.2-wave`, 'two runs in one second are numbered, not overwritten');
    assert.equal(await latestCaptureRun(s.ctx, { mode: 'wave' }), again.runId);
  } finally { s.repo.cleanup(); }
});

test('the capture smoke gate: one reached state per world and role, re-validated', async () => {
  const s = await setup((it) => (s.bad && it.world === 'empty' ? { lines: ['Error'], testids: [] } : null));
  try {
    let g = await captureSmokeGate(s.ctx);
    assert.equal(g.ok, false);
    assert.match(g.failures[0].message, /no capture smoke run/);
    const r = await captureRun(s.ctx, { mode: 'branch', smoke: true });
    assert.match(r.runId, /-run-smoke$/);
    g = await captureSmokeGate(s.ctx);
    assert.deepEqual(g, { ok: true, failures: [] });
    s.bad = true;
    s.clock.advance(60_000);
    await captureRun(s.ctx, { mode: 'branch', smoke: true });
    g = await captureSmokeGate(s.ctx);
    assert.equal(g.ok, false);
    assert.ok(g.failures.some((f) => /WG-02 \(empty, admin\)/.test(f.message)));
    assert.ok(g.failures.some((f) => /nothing reached as empty admin/.test(f.message)));
  } finally { s.repo.cleanup(); }
});

test('the smoke gate takes a later capture that reached every world and role in place of a stale smoke', async () => {
  // The smoke asks whether the capture can sign in as each world and role and reach a page. It is
  // taken before any screen exists, and a fix wave that rewrites a marker leaves it failing for
  // ever against words it was never captured with -- which sent a finished run back to wave 0.
  const s = await setup((it) => (s.bad && it.world === 'empty' ? { lines: ['Error'], testids: [] } : null));
  try {
    s.bad = true;
    await captureRun(s.ctx, { mode: 'branch', smoke: true });
    assert.equal((await captureSmokeGate(s.ctx)).ok, false, 'a smoke that did not reach every world is red on its own');

    s.bad = false;
    s.clock.advance(60_000);
    await captureRun(s.ctx, { mode: 'wave' });
    assert.deepEqual(await captureSmokeGate(s.ctx), { ok: true, failures: [] }, 'a later capture that reached them all answers the same question');
  } finally { s.repo.cleanup(); }
});

test('spot recapture: a stored capture that no longer matches the page is red; a moved clock is not', async () => {
  const s = await setup((it) => {
    if (s.phase === 'spot' && it.state === 'WG-03') return { lines: ['Widgets', 'Something else entirely'], testids: ['widget-list'] };
    if (it.state === 'WG-01') return { ...GOOD['WG-01'], lines: [...GOOD['WG-01'].lines, `Updated ${s.phase === 'spot' ? 9 : 2} minutes ago`] };
    return null;
  });
  try {
    const r = await captureRun(s.ctx, { mode: 'wave' });
    s.phase = 'spot';
    s.clock.advance(3_600_000);
    const g = await spotRecapture(s.ctx, { runId: r.runId, pct: 100, seed: 'fixed' });
    assert.equal(g.ok, false);
    const keys = g.failures.map((f) => f.message.split(':')[0]);
    assert.ok(keys.every((k) => k.startsWith('WG-03.')), `only WG-03 differs: ${keys.join(', ')}`);
    assert.ok(g.failures.some((f) => /not reached on re-capture|differs from what the page shows/.test(f.message)));
  } finally { s.repo.cleanup(); }
});

test('sampling is reproducible, takes at least five, and shapes ignore numbers only', () => {
  const items = Array.from({ length: 40 }, (_, i) => i);
  assert.deepEqual(sampleItems(items, 10, 'seed'), sampleItems(items, 10, 'seed'));
  assert.notDeepEqual(sampleItems(items, 10, 'seed'), sampleItems(items, 10, 'other'));
  assert.equal(sampleItems(items, 10, 'x').length, 5);
  assert.equal(sampleItems(items, 50, 'x').length, 20);
  assert.equal(sampleItems([1, 2], 10, 'x').length, 2);
  assert.equal(new Set(sampleItems(items, 100, 'x')).size, 40);
  const r = seededRandom('a');
  const xs = Array.from({ length: 100 }, r);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.equal(textShape('Edited 3 minutes ago\n\n14 calls'), textShape('Edited 12 minutes ago\n14 calls'));
  assert.notEqual(textShape('3 calls'), textShape('3 visits'));
});

test('served SHA: read from JSON or text; a missing route or a network failure is null', async () => {
  const sha = 'deadbeef'.repeat(5);
  assert.equal(shaFromBody(JSON.stringify({ sha })), sha);
  assert.equal(shaFromBody(JSON.stringify({ build: { commit: sha.toUpperCase() } })), sha);
  assert.equal(shaFromBody(`commit ${sha}\n`), sha);
  assert.equal(shaFromBody(JSON.stringify({ sha: null })), null);
  assert.equal(shaFromBody(''), null);
  const { ctx } = await makeTestCtx({ repoRoot: '/nonexistent-repo', profile: makeProfile() });
  const calls = [];
  const fake = (status, body) => async (url, init) => { calls.push([String(url), init.method]); return { ok: status < 400, status, text: async () => body }; };
  assert.equal(await probeServedSha(ctx, 'https://preview.example.invalid', { fetch: fake(200, JSON.stringify({ sha })) }), sha);
  assert.deepEqual(calls[0], ['https://preview.example.invalid/api/version', 'GET']);
  assert.equal(await probeServedSha(ctx, 'https://preview.example.invalid/', { fetch: fake(404, 'not found') }), null);
  assert.equal(await probeServedSha(ctx, 'https://preview.example.invalid', { fetch: async () => { throw new Error('ENOTFOUND'); } }), null);
  assert.equal(await probeServedSha(ctx, '', { fetch: fake(200, sha) }), null);

  // A version route that redirects is not answering, and the page it redirects to must not answer
  // in its place. A sign-in page's build id read as a served SHA, and the capture refused a
  // deployment that was serving the very commit it had been asked for.
  const login = `<!DOCTYPE html><html><body><script src="/_next/static/${'d1e58d753c78'}${'9'.repeat(20)}/main.js"></script>${'x'.repeat(400)}</body></html>`;
  assert.equal(shaFromBody(login), null, 'a page is never a version answer');
  const withType = (status, body, type) => async () => ({ ok: status < 400, status, headers: { get: () => type }, text: async () => body });
  assert.equal(await probeServedSha(ctx, 'https://preview.example.invalid', { fetch: withType(200, login, 'text/html; charset=utf-8') }), null);
  assert.equal(await probeServedSha(ctx, 'https://preview.example.invalid', { fetch: withType(307, '', 'text/plain') }), null, 'a redirect is not an answer');
  // The redirect must not be followed at all: following it is how the page got to answer.
  let sawRedirectMode = null;
  await probeServedSha(ctx, 'https://preview.example.invalid', {
    fetch: async (url, init) => { sawRedirectMode = init.redirect; return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ sha }) }; },
  });
  assert.equal(sawRedirectMode, 'manual');
});

test('smoke without a plan world user is skipped, not captured as someone else', async () => {
  const repo = makeTempRepo({ files: { 'README.md': 'x\n' } });
  try {
    const plan = widgetsPlan();
    plan.worlds[1].users = [];
    writePlan(repo, plan);
    mkdirSync(join(repo.dir, '.delivery/widgets'), { recursive: true });
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety(), passthrough: ['git'], rules: [captureRule()] });
    ctx.captureHooks = hooks().hooks;
    const r = await captureRun(ctx, { mode: 'branch', smoke: true, dryRun: true });
    assert.deepEqual(r.skipped.filter((x) => x.state === 'WG-02').map((x) => x.why), ['world empty has no admin user in the plan']);
  } finally { repo.cleanup(); }
});
