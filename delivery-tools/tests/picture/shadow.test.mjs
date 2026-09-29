// The shadow grader: what delivery review asks an outside model for every finding, and the proof
// that it only records. The network is never touched: fetch is injected through ctx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_CONCURRENT, exportShadow, runShadow, shadowFindings, shadowSetup } from '../../lib/picture/shadow.mjs';
import { shadowTotals } from '../../lib/retro/record.mjs';
import { validateProfile } from '../../lib/core/profile.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { sampleMap } from './map.test.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import reviewCommand from '../../lib/commands/review.mjs';

const KEY = 'sk-test-0123456789abcdef';
const GRADER = { endpoint: 'https://grader.example.invalid/v1/answer', model: 'grader-1', keyEnv: 'GRADER_KEY' };
const withGrader = () => makeProfile({ review: { shadowGrader: GRADER } });
const ENV = { GRADER_KEY: KEY };

const RUN = '.delivery/widgets/rounds';
const REVIEW_MD = `2 states have problems.

## KC-05
- must fix: the Add button is a small pill; the design has a large one.
- small: the focus ring is blue, not orange.

## KC-04
- small: the divider is lighter than the design.

## Matching
KC-08
`;
const rec = (over = {}) => ({ reached: true, problems: [], buttons: [], factsAgree: false, pixelDiff: 0, liveHash: 'L', designHash: 'D', ...over });

/** A run with one compiled-ready round: two states with notes, one not reached. */
function makeRun(extra = {}) {
  return makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': { ...sampleMap(), feature: 'widgets' },
    [`${RUN}/1/shoot.json`]: { states: { 'KC-05': rec(), 'KC-04': rec(), 'KC-08': rec({ reached: false, problems: ['timeout waiting for the answer field'] }) } },
    [`${RUN}/1/review-a.md`]: REVIEW_MD,
    ...extra,
  } });
}

/** A stub fetch: records every call and answers with `answer(call)` (default: a code-bug choice). */
function stubFetch(answer) {
  const calls = [];
  const fn = async (url, init) => {
    const call = { url, init, body: JSON.parse(init.body) };
    calls.push(call);
    if (answer) return answer(call);
    return { ok: true, status: 200, json: async () => ({ answers: { answer: { choice: 'code-bug', probabilities: { 'code-bug': 0.9, 'data-gap': 0.06, 'known-steer': 0.04 } } } }) };
  };
  fn.calls = calls;
  return fn;
}

const tree = (dir) => readdirSync(dir, { recursive: true }).map(String).filter((f) => statSync(join(dir, f)).isFile());

async function review(repo, o = {}) {
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: o.profile ?? makeProfile(), env: o.env ?? {}, fetch: o.fetch });
  const exit = await reviewCommand.run(t.ctx, ['--round', '1', ...(o.args ?? [])]);
  return { ...t, exit };
}

test('the findings are each must and small sentence and each not-reached reason, carried items skipped', () => {
  const summary = { states: {
    'KC-05': { verdict: 'must', must: ['a', 'b'], small: ['c'], design: ['ignored'] },
    'KC-04@phone': { verdict: 'small', must: [], small: ['d'] },
    'KC-08': { verdict: 'not-reached', must: [], small: [] },
    'KC-09': { verdict: 'must', must: ['carried one'], small: [], carried: { from: 1 } },
    'KC-10': { verdict: 'data-gap', must: [], small: [], dataGap: ['ignored'] },
  } };
  const shoot = { states: { 'KC-08': { problems: ['timeout', 'no element'] } } };
  assert.deepEqual(shadowFindings(summary, shoot).map((f) => [f.state, f.width, f.verdict, f.text]), [
    ['KC-05', 'desktop', 'must', 'a'], ['KC-05', 'desktop', 'must', 'b'], ['KC-05', 'desktop', 'small', 'c'],
    ['KC-04', 'phone', 'small', 'd'],
    ['KC-08', 'desktop', 'not-reached', 'timeout'], ['KC-08', 'desktop', 'not-reached', 'no element'],
  ]);
});

test('the request carries the criteria, the rules, the model from the profile, the finding, the verdict and the steers, with the key in the auth header', async () => {
  const repo = makeRun({ 'docs/delivery/widgets/steers.md': 'Ignore the empty-state illustration.\n\nPrices are test data.\n' });
  try {
    const fetch = stubFetch();
    const { exit } = await review(repo, { profile: withGrader(), env: ENV, fetch });
    assert.equal(exit, 1);
    assert.equal(fetch.calls.length, 4, 'two must/small on KC-05, one on KC-04, one not-reached reason');
    const first = fetch.calls.find((c) => c.body.state.finding.startsWith('the Add button'));
    assert.equal(first.url, GRADER.endpoint);
    assert.equal(first.init.method, 'POST');
    assert.equal(first.init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(first.body.model, 'grader-1');
    assert.equal(first.body.state.reviewerVerdict, 'must');
    assert.deepEqual(first.body.state.knownSteers, ['Ignore the empty-state illustration.', 'Prices are test data.']);
    const q = first.body.questions.answer;
    assert.equal(q.type, 'choice');
    assert.deepEqual(Object.keys(q.criteria), ['code-bug', 'data-gap', 'known-steer']);
    assert.equal(q.instructions.rules.length, 2);
    assert.match(q.instructions.rules[0], /known-steer only when/);
    assert.ok(first.init.signal, 'a timeout signal is set');
    const doc = JSON.parse(readFileSync(join(repo.dir, RUN, '1/shadow.json'), 'utf8'));
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.model, 'grader-1');
    assert.equal(doc.answers.length, 4);
    const nr = doc.answers.find((a) => a.verdict === 'not-reached');
    assert.deepEqual([nr.state, nr.width, nr.text, nr.choice], ['KC-08', 'desktop', 'timeout waiting for the answer field', 'code-bug']);
    assert.equal(nr.probs['code-bug'], 0.9);
  } finally { repo.cleanup(); }
});

test('with no steers.md the known steers are an empty list', async () => {
  const repo = makeRun();
  try {
    const fetch = stubFetch();
    await review(repo, { profile: withGrader(), env: ENV, fetch });
    assert.deepEqual(fetch.calls[0].body.state.knownSteers, []);
  } finally { repo.cleanup(); }
});

test('at most 8 requests are in flight at once, and every finding is answered in order', async () => {
  let inFlight = 0;
  let peak = 0;
  const fetch = async () => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return { ok: true, json: async () => ({ answers: { answer: { choice: 'data-gap', probabilities: {} } } }) };
  };
  const findings = Array.from({ length: 30 }, (_, i) => ({ state: `S-${i}`, width: 'desktop', verdict: 'must', text: `t${i}` }));
  const doc = await runShadow({ fetch, config: GRADER, key: KEY, findings, steers: [], at: 'now' });
  assert.equal(MAX_CONCURRENT, 8);
  assert.equal(peak, 8);
  assert.deepEqual(doc.answers.map((a) => a.state), findings.map((f) => f.state));
});

test('a network error is tried up to three times; a bad answer or an http error is not', async () => {
  const one = [{ state: 'S-1', width: 'desktop', verdict: 'must', text: 't' }];
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };

  let n = 0;
  const flaky = async () => { n += 1; if (n < 3) throw new Error('ECONNRESET'); return { ok: true, json: async () => ({ answers: { answer: { choice: 'known-steer', probabilities: {} } } }) }; };
  let doc = await runShadow({ fetch: flaky, config: GRADER, key: KEY, findings: one, steers: [], at: 'now', sleep });
  assert.equal(n, 3);
  assert.equal(doc.answers[0].choice, 'known-steer');
  assert.equal(doc.answers[0].error, undefined);

  n = 0;
  const down = async () => { n += 1; throw new Error(`connect failed with ${KEY}`); };
  doc = await runShadow({ fetch: down, config: GRADER, key: KEY, findings: one, steers: [], at: 'now', sleep });
  assert.equal(n, 3);
  assert.match(doc.answers[0].error, /^network: connect failed/);
  assert.doesNotMatch(JSON.stringify(doc), new RegExp(KEY), 'the key is blanked out of an error');

  n = 0;
  const http = async () => { n += 1; return { ok: false, status: 500, json: async () => ({}) }; };
  doc = await runShadow({ fetch: http, config: GRADER, key: KEY, findings: one, steers: [], at: 'now', sleep });
  assert.equal(n, 1);
  assert.equal(doc.answers[0].error, 'http 500');

  const junk = async () => ({ ok: true, json: async () => ({ answers: { answer: { choice: 'banana' } } }) });
  doc = await runShadow({ fetch: junk, config: GRADER, key: KEY, findings: one, steers: [], at: 'now', sleep });
  assert.equal(doc.answers[0].error, 'no usable choice');
});

test('the key is never written to shadow.json, any file of the run, the output or an error', async () => {
  const repo = makeRun();
  try {
    const fetch = stubFetch((call) => { if (call.body.state.finding.startsWith('the divider')) throw new Error(`refused: Bearer ${KEY}`); return { ok: true, json: async () => ({ answers: { answer: { choice: 'code-bug', probabilities: {} } } }) }; });
    const { stdout, stderr } = await review(repo, { profile: withGrader(), env: ENV, fetch });
    for (const f of tree(repo.dir).filter((p) => !p.startsWith('.git/'))) {
      assert.ok(!readFileSync(join(repo.dir, f)).includes(KEY), `${f} holds the key`);
    }
    assert.ok(!stdout.text().includes(KEY) && !stderr.text().includes(KEY));
    assert.match(stderr.text(), /shadow grader: 1 of 4 answers failed/);
  } finally { repo.cleanup(); }
});

test('it is off, and silent, without the profile key; without the env var it warns once and asks nothing', async () => {
  const repo = makeRun();
  try {
    let fetch = stubFetch();
    let r = await review(repo, { profile: makeProfile(), env: ENV, fetch });
    assert.equal(fetch.calls.length, 0);
    assert.equal(existsSync(join(repo.dir, RUN, '1/shadow.json')), false);
    assert.equal(r.stderr.text(), '');

    fetch = stubFetch();
    r = await review(repo, { profile: withGrader(), env: { GRADER_KEY: '  ' }, fetch });
    assert.equal(fetch.calls.length, 0);
    assert.equal(existsSync(join(repo.dir, RUN, '1/shadow.json')), false);
    assert.equal(r.stderr.lines().length, 1);
    assert.match(r.stderr.text(), /GRADER_KEY is not set/);

    r = await review(repo, { profile: withGrader(), env: {}, fetch });
    assert.equal(fetch.calls.length, 0);
  } finally { repo.cleanup(); }
});

test('review.json, the printed output and the exit code are identical with the grader off, answering, failing or throwing', async () => {
  const repo = makeRun();
  const file = join(repo.dir, RUN, '1/review.json');
  try {
    const base = await review(repo, { profile: makeProfile(), env: ENV });
    const baseJson = readFileSync(file);
    const cases = {
      answering: stubFetch(),
      'network down': async () => { throw new Error('ENOTFOUND'); },
      'http 500': async () => ({ ok: false, status: 500, json: async () => ({}) }),
      'json blows up': async () => ({ ok: true, json: async () => { throw new Error('not json'); } }),
    };
    for (const [name, fetch] of Object.entries(cases)) {
      const r = await review(repo, { profile: withGrader(), env: ENV, fetch });
      assert.equal(r.exit, base.exit, name);
      assert.ok(readFileSync(file).equals(baseJson), `${name}: review.json changed`);
      assert.equal(r.stdout.text(), base.stdout.text(), name);
      assert.ok(r.stderr.lines().length <= 1, `${name}: at most one warning line`);
    }
    // A fetch that cannot even be called is a warning too, never a crash.
    const r = await review(repo, { profile: withGrader(), env: ENV, fetch: 'not a function' });
    assert.equal(r.exit, base.exit);
    assert.ok(readFileSync(file).equals(baseJson));
  } finally { repo.cleanup(); }
});

test('shadowSetup reads the profile key and the named env var', () => {
  assert.deepEqual(shadowSetup({}, ENV), { off: 'no-profile-key' });
  assert.deepEqual(shadowSetup(withGrader(), {}), { off: 'no-key', keyEnv: 'GRADER_KEY' });
  assert.deepEqual(shadowSetup(withGrader(), ENV), { config: GRADER, key: KEY });
});

test('--shadow-export splits the answers from the sample and gives every finding an id', async () => {
  const doc = (model, answers) => ({ schemaVersion: 1, model, at: 'x', answers });
  const repo = makeTempRepo({ files: {
    [`${RUN}/1/shoot.json`]: { states: {} },
    [`${RUN}/1/shadow.json`]: doc('grader-1', [
      { state: 'KC-05', width: 'desktop', verdict: 'must', text: 'first', choice: 'code-bug', probs: { 'code-bug': 0.9 } },
      { state: 'KC-04', width: 'phone', verdict: 'small', text: 'lost', error: 'http 500' },
    ]),
    [`${RUN}/2/shoot.json`]: { states: {} },
    [`${RUN}/2/shadow.json`]: doc('grader-1', [
      { state: 'KC-08', width: 'desktop', verdict: 'not-reached', text: 'second', choice: 'data-gap', probs: { 'data-gap': 0.7 } },
    ]),
  } });
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile() });
    assert.equal(await reviewCommand.run(ctx, ['--shadow-export']), 0);
    const dir = join(repo.dir, 'docs/delivery/widgets');
    const sample = JSON.parse(readFileSync(join(dir, 'shadow-sample.json'), 'utf8'));
    const answers = JSON.parse(readFileSync(join(dir, 'shadow-answers.json'), 'utf8'));
    assert.deepEqual(sample.items.map((i) => [i.id, i.round, i.state, i.width, i.verdict, i.text]), [
      ['f001', 1, 'KC-05', 'desktop', 'must', 'first'],
      ['f002', 2, 'KC-08', 'desktop', 'not-reached', 'second'],
    ]);
    for (const item of sample.items) for (const k of ['choice', 'probs', 'error']) assert.equal(k in item, false, `sample must not hold ${k}`);
    assert.doesNotMatch(readFileSync(join(dir, 'shadow-sample.json'), 'utf8'), /code-bug|data-gap|probs/);
    assert.deepEqual(answers.answers, { f001: { choice: 'code-bug', probs: { 'code-bug': 0.9 } }, f002: { choice: 'data-gap', probs: { 'data-gap': 0.7 } } });
    assert.deepEqual(answers.models, ['grader-1']);
    assert.match(stdout.text(), /2 finding\(s\).*1 failed request/);
    assert.equal(exportShadow({ runDir: join(repo.dir, '.delivery/none'), feature: 'widgets' }), null);
  } finally { repo.cleanup(); }
});

test('--shadow-export with no shadow.json anywhere is a usage error', async () => {
  const repo = makeRun();
  try {
    const r = await review(repo, { args: ['--shadow-export'] });
    assert.equal(r.exit, 2);
  } finally { repo.cleanup(); }
});

test('the retro record counts answered and failed shadow answers, and only when a round has a shadow.json', () => {
  const repo = makeTempRepo({ files: {
    [`${RUN}/1/shadow.json`]: { schemaVersion: 1, model: 'm', at: 'x', answers: [{ choice: 'code-bug' }, { error: 'e' }, { choice: 'data-gap' }] },
    [`${RUN}/2/shoot.json`]: { states: {} },
  } });
  try {
    const paths = { runDir: join(repo.dir, '.delivery/widgets') };
    assert.deepEqual(shadowTotals(paths), { answered: 2, errors: 1 });
    assert.equal(shadowTotals({ runDir: join(repo.dir, '.delivery/none') }), null);
  } finally { repo.cleanup(); }
});

test('the profile and run-record schemas accept the new keys and stay strict', () => {
  assert.deepEqual(validateProfile(withGrader()), []);
  const bad = (g) => validateProfile(makeProfile({ review: { shadowGrader: g } })).length > 0;
  assert.equal(bad({ endpoint: GRADER.endpoint, model: 'm' }), true, 'keyEnv is required');
  assert.equal(bad({ ...GRADER, extra: 1 }), true);
  assert.equal(bad({ ...GRADER, keyEnv: 'not a name' }), true);
  assert.equal(bad({ ...GRADER, endpoint: 'ftp://x' }), true);
  assert.equal(validateProfile(makeProfile({ review: { other: 1 } })).length > 0, true);
  const base = { schemaVersion: 2, feature: 'widgets', endedAt: '2026-01-15T20:00:00.000Z', pluginVersion: '1', estimate: false, phaseCost: {}, slotWaits: null, main: null, agents: [], phases: Object.fromEntries(['intake', 'render', 'map', 'seed', 'build', 'shoot', 'review', 'ci'].map((p) => [p, null])), founder: null, rounds: [], reviewers: [], ciAfterPr: [], improvements: [], autoChanges: [] };
  assert.equal(validateAgainst('run-record', base).ok, true);
  assert.equal(validateAgainst('run-record', { ...base, shadow: { answered: 3, errors: 1 } }).ok, true);
  assert.equal(validateAgainst('run-record', { ...base, shadow: { answered: 3 } }).ok, false);
});
