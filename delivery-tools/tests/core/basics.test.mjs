// args, output, exit codes, hashing, markers and feature paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractGlobalFlags, parseCommandArgs, intFlag } from '../../lib/core/args.mjs';
import { createOutput } from '../../lib/core/output.mjs';
import { EXIT, DeliveryError, UsageError, worstExit, notImplementedError } from '../../lib/core/exit.mjs';
import { canonicalJson, hashJson, sha256, sha256Tree } from '../../lib/core/hash.mjs';
import { makeMarker, makeGlobalMarker, parseMarkers, hasMarker, readBlock, upsertBlock, CLAIMS_MARKER } from '../../lib/core/markers.mjs';
import { featurePaths, assertFeatureSlug } from '../../lib/core/paths.mjs';
import { gateResult, combineGates, guardGate } from '../../lib/core/gate.mjs';
import { sink } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';

test('global flags are pulled out wherever they appear', () => {
  const { global, rest } = extractGlobalFlags(['plan', '--json', 'check', '--feature', 'widgets', '-h', 'x']);
  assert.deepEqual(global, { feature: 'widgets', json: true, help: true });
  assert.deepEqual(rest, ['plan', 'check', 'x']);
  assert.equal(extractGlobalFlags(['--feature=abc']).global.feature, 'abc');
  assert.throws(() => extractGlobalFlags(['--feature']), UsageError);
});

test('command args: typed options, defaults, positional counts, unknown flags', () => {
  const spec = { options: { pr: { type: 'string' }, check: { type: 'boolean', default: false }, brief: { type: 'string', multiple: true } }, positionals: { min: 1, max: 1, names: ['unit'] } };
  const r = parseCommandArgs(['U3', '--pr', '12', '--brief', 'a', '--brief', 'b'], spec);
  assert.deepEqual(r.positionals, ['U3']);
  assert.deepEqual(r.values, { pr: '12', brief: ['a', 'b'], check: false });
  assert.throws(() => parseCommandArgs([], spec), /missing argument <unit>/);
  assert.throws(() => parseCommandArgs(['U3', 'U4'], spec), /unexpected argument "U4"/);
  assert.throws(() => parseCommandArgs(['U3', '--nope'], spec), (e) => e.exit === 2);
  assert.equal(parseCommandArgs(['a', 'b', 'c'], { positionals: { max: -1 } }).positionals.length, 3);
  assert.equal(intFlag('12', '--pr'), 12);
  assert.equal(intFlag(undefined, '--pr'), null);
  assert.throws(() => intFlag(undefined, '--pr', { required: true }), /--pr <n> is required/);
  assert.throws(() => intFlag('12a', '--pr'), /positive integer/);
});

test('output: one line per failure in human mode; one JSON object in --json mode', () => {
  const s = sink(), e = sink();
  const out = createOutput({ stdout: s, stderr: e });
  out.line('hello'); out.fail('M7', 'a leak\nacross lines'); out.warn('careful');
  assert.equal(out.finish(1), 1);
  assert.deepEqual(s.lines(), ['hello', 'FAIL M7 a leak across lines']);
  assert.deepEqual(e.lines(), ['WARN careful']);

  const j = sink();
  const outj = createOutput({ json: true, stdout: j, stderr: sink() });
  outj.line('x'); outj.fail('P2', 'safety differs'); outj.set('next', 'dispatch U4');
  outj.finish(3); outj.finish(3);
  const lines = j.lines();
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { ok: false, exit: 3, failures: [{ code: 'P2', message: 'safety differs' }], lines: ['x'], data: { next: 'dispatch U4' } });
});

test('exit codes and error classes', () => {
  assert.deepEqual(EXIT, { PASS: 0, RED: 1, USAGE: 2, BLOCKED: 3, WAIT: 4, INCONSISTENT: 5 });
  assert.equal(worstExit([0, 1, 4]), 4);
  assert.equal(worstExit([1, 3, 4]), 3);
  assert.equal(worstExit([3, 2]), 2);
  assert.equal(worstExit([2, 5, 1]), 5);
  const e = notImplementedError('B2', 'checkM2');
  assert.equal(e.exit, 2); assert.equal(e.code, 'not-implemented'); assert.match(e.message, /not implemented \(slice B2\): checkM2/);
  assert.ok(new DeliveryError(4, 'wait') instanceof Error);
});

test('gate results combine and keep the most serious exit', async () => {
  assert.deepEqual(gateResult(), { ok: true, failures: [] });
  const c = combineGates([gateResult(), gateResult([{ code: 'a', message: 'x' }], 4), gateResult([{ code: 'b', message: 'y' }], 5)]);
  assert.equal(c.ok, false); assert.equal(c.exit, 5); assert.equal(c.failures.length, 2);
  const g = await guardGate('phase-2', async () => { throw notImplementedError('B1', 'inventoryGate'); });
  assert.deepEqual(g, { ok: false, failures: [{ code: 'not-implemented', message: 'not implemented (slice B1): inventoryGate' }], exit: 2 });
  await assert.rejects(guardGate('x', async () => { throw new TypeError('bug'); }), TypeError);
});

test('hashing: canonical JSON ignores key order; tree hash ignores mtimes and OS litter', async () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } }), '{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
  assert.equal(hashJson({ a: 1, b: 2 }), hashJson({ b: 2, a: 1 }));
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const t = makeTempDir();
  try {
    mkdirSync(join(t.dir, 'sub'));
    writeFileSync(join(t.dir, 'sub', 'b.txt'), 'b'); writeFileSync(join(t.dir, 'a.txt'), 'a');
    const h1 = await sha256Tree(t.dir);
    writeFileSync(join(t.dir, '.DS_Store'), 'x');
    assert.equal(await sha256Tree(t.dir), h1);
    writeFileSync(join(t.dir, 'a.txt'), 'A');
    assert.notEqual(await sha256Tree(t.dir), h1);
  } finally { t.cleanup(); }
});

test('markers: make, parse, find and blocks', () => {
  const epic = makeMarker({ feature: 'widgets', kind: 'epic' });
  const unit = makeMarker({ feature: 'widgets', kind: 'unit', id: 'U3' });
  assert.equal(epic, '<!-- delivery:widgets:epic -->');
  assert.equal(unit, '<!-- delivery:widgets:unit:U3 -->');
  assert.equal(makeGlobalMarker('claims'), CLAIMS_MARKER);
  assert.throws(() => makeMarker({ feature: 'Widgets', kind: 'epic' }), /bad marker feature/);
  assert.throws(() => makeMarker({ feature: 'w', kind: 'unit', id: 'U 3' }), /bad marker id/);

  const body = `Title\n<!--delivery:widgets:unit:U3-->\n${CLAIMS_MARKER}\n<!-- other:x:y -->`;
  const parsed = parseMarkers(body);
  assert.deepEqual(parsed.map((m) => [m.feature, m.kind, m.id]), [['widgets', 'unit', 'U3'], [null, 'claims', null]]);
  assert.equal(hasMarker(body, unit), true);
  assert.equal(hasMarker(body, epic), false);
  assert.equal(hasMarker('<!-- delivery:widgets:unit:U30 -->', unit), false);
  assert.equal(parseMarkers('<!-- tool:a:b -->', { prefix: 'tool' }).length, 1);

  const block = makeMarker({ feature: 'widgets', kind: 'block', id: 'coverage' });
  let text = 'Intro written by a person.';
  text = upsertBlock(text, block, 'Coverage: 3 states');
  assert.equal(readBlock(text, block), 'Coverage: 3 states');
  text = upsertBlock(text, block, 'Coverage: 4 states');
  assert.ok(text.startsWith('Intro written by a person.\n\n<!-- delivery:widgets:block:coverage -->'));
  assert.equal(readBlock(text, block), 'Coverage: 4 states');
  assert.equal(text.match(/block:coverage/g).length, 2);
  assert.equal(readBlock('nothing here', block), null);
});

test('feature paths follow D8, honour profile roots, and refuse bad ids', () => {
  const p = featurePaths('/repo', 'widgets');
  assert.equal(p.plan, '/repo/docs/delivery/widgets/plan.json');
  assert.equal(p.state, '/repo/.delivery/widgets/state.json');
  assert.equal(p.designSnapshot, '/repo/docs/design/widgets');
  assert.equal(p.unitReport('U3'), '/repo/.delivery/widgets/units/U3.report.json');
  assert.equal(p.captureManifest('c-1'), '/repo/.delivery/widgets/captures/c-1/capture.json');
  assert.equal(p.designRender('WL-01', 'dom.json'), '/repo/.delivery/widgets/design/WL-01.dom.json');
  assert.equal(featurePaths('/repo', 'widgets', { runRoot: '.run', deliveryRoot: 'd' }).state, '/repo/.run/widgets/state.json');
  assert.throws(() => featurePaths('/repo', '../x'), /feature slug/);
  assert.throws(() => p.unitFile('../../etc'), /unit id/);
  assert.equal(assertFeatureSlug('a-b-1'), 'a-b-1');
});
