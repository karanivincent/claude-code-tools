import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderPunchList, orderFindings, captureKeyOf, featureName, locatePictures } from '../../lib/report/punch-list.mjs';
import { normaliseAuditorFindings, lastIngested } from '../../lib/report/audit.mjs';
import { makeFinding } from '../../lib/core/findings.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState, formatEvent } from '../../lib/core/state.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import { pngBytes } from '../design/helpers.mjs';
import command from '../../lib/commands/audit-compile.mjs';
import { PLUGIN_ROOT } from '../../lib/core/ctx.mjs';

const TEMPLATE = readFileSync(join(PLUGIN_ROOT, 'templates', 'punch-list.html'), 'utf8');
const f = (over) => makeFinding({ source: 'check:M7', severity: 'P2', state: 'WL-01', where: 'WL-01.design.admin.1440.en.light.txt:2', group: 'list', design: 'In stock', live: 'In stock .', ...over });

test('the page: findings ordered by severity and status, a tally, filters, pictures side by side, text escaped', () => {
  const findings = [
    f({ severity: 'P3', state: 'WL-03', where: 'a' }),
    f({ severity: 'P1', state: 'WL-02', where: 'b', live: '<script>alert(1)</script>', status: 'open' }),
    f({ severity: 'P1', state: 'WL-01', where: 'c', status: 'fixed', fixedIn: 'c-20260115-200000-wave' }),
    f({ severity: 'P2', state: 'WL-04', where: 'd', status: 'accepted', accept: { reasonClass: 'adapt', issue: 7, text: 'the product word wins' }, group: 'detail' }),
  ];
  assert.deepEqual(orderFindings(findings).map((x) => `${x.severity}/${x.status}/${x.state}`), ['P1/open/WL-02', 'P1/fixed/WL-01', 'P2/accepted/WL-04', 'P3/open/WL-03']);
  const pictures = new Map([[findings[1].id, { design: 'design/WL-02.png', live: 'captures/c-1/WL-02.design.admin.1440.en.light.png', liveLine: null }]]);
  const html = renderPunchList({ template: TEMPLATE, feature: 'widgets', findings, pictures, meta: 'Run <code>r-1</code>', footer: 'footer' });
  assert.match(html, /^<title>Widgets punch list<\/title>/);
  assert.ok(!/%%[A-Z_]+%%/.test(html), 'every placeholder filled');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.match(html, /<li class="p1"><b>1<\/b><span>P1 open<\/span><\/li><li class="p2"><b>0<\/b>/);
  assert.match(html, /<img class="shot" src="design\/WL-02\.png" alt="Design render of WL-02"/);
  assert.match(html, /src="captures\/c-1\/WL-02\.design\.admin\.1440\.en\.light\.png"/);
  assert.match(html, /<div class="none">No design picture<\/div>/);
  assert.match(html, /data-kind="status" data-value="open" aria-pressed="true"/);
  assert.match(html, /data-kind="status" data-value="fixed" aria-pressed="false"/);
  assert.match(html, /data-kind="group" data-value="detail"/);
  assert.match(html, /<dt>accepted<\/dt><dd>adapt, #7: the product word wins<\/dd>/);
  assert.ok(html.indexOf('WL-02') < html.indexOf('WL-03'));
  assert.match(html, /<p class="empty" id="punch-empty" hidden>/);
  const empty = renderPunchList({ template: TEMPLATE, feature: 'new-inbox', findings: [], pictures: new Map(), meta: '', footer: '' });
  assert.match(empty, /<title>New inbox punch list<\/title>/);
  assert.match(empty, /<p class="empty" id="punch-empty" >No findings: every check and auditor came back clean\.<\/p>/);
});

test('the template keeps the artifact contract: a title first, tokens for both themes, a body background, no page-wide scroll', () => {
  assert.match(TEMPLATE, /^<title>/);
  assert.ok(!/<(!doctype|html|head|body)\b/i.test(TEMPLATE));
  assert.match(TEMPLATE, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(TEMPLATE, /:root\[data-theme="dark"\]/);
  assert.match(TEMPLATE, /body \{[^}]*background: var\(--ground\)/);
  assert.match(TEMPLATE, /padding-inline: 16px/);
  assert.ok(!/https?:\/\/(?!fonts\.(googleapis|gstatic)\.com)/.test(TEMPLATE), 'only Google Fonts from outside');
});

test('capture keys are read out of a finding\'s where', () => {
  assert.deepEqual(captureKeyOf('WL-01.design.admin.1440.en.light.txt:4'), { key: 'WL-01.design.admin.1440.en.light', line: 4 });
  assert.deepEqual(captureKeyOf('WL-01.messy.member.390.fr.dark.dom.json'), { key: 'WL-01.messy.member.390.fr.dark', line: null });
  assert.equal(captureKeyOf('apps/web/messages/en.json:12'), null);
  assert.equal(featureName('widgets'), 'Widgets');
});

test('auditor reports: source forced to the group, P1 categories floored, other sources refused', () => {
  const { findings, problems } = normaliseAuditorFindings({
    findings: [
      { state: 'WL-01', where: 'WL-01.design.admin.1440.en.light.png', severity: 'P3', rule: 'dead-control', design: 'New widget opens a form', live: 'nothing happens', group: 'list' },
      { state: 'WL-02', where: 'x', severity: 'P2', design: 'a', live: 'b' },
      { source: 'check:M7', state: 'WL-03', where: 'y', severity: 'P3' },
      { state: 'WL-04', where: 'z', severity: 'P9' },
      'nonsense',
    ],
  }, 'list');
  assert.deepEqual(findings.map((x) => [x.source, x.severity, x.state]), [['auditor:list', 'P1', 'WL-01'], ['auditor:list', 'P2', 'WL-02']]);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /may not write source check:M7/);
  assert.match(normaliseAuditorFindings({ nope: 1 }, 'g').problems[0], /not a findings document/);
  assert.deepEqual([...lastIngested([{ event: formatEvent({ command: 'audit ingest auditor:list', exit: 0, counts: { file: 'abc123' } }) }], 'audit ingest')], [['auditor:list', 'abc123']]);
});

async function runRepo() {
  const repo = makeTempRepo({ files: { 'README.md': 'x\n' } });
  const paths = featurePaths(repo.dir, 'widgets');
  mkdirSync(paths.deliveryDir, { recursive: true });
  writeFileSync(paths.plan, JSON.stringify(validExample('plan')));
  await createState(paths, { feature: 'widgets', runId: 'r-20260115-2000-abcd', worktree: repo.dir, branch: 'epic/101-widgets', epic: 101, at: '2026-01-15T20:00:00.000Z' });
  mkdirSync(paths.designRenders, { recursive: true });
  writeFileSync(paths.designRender('WL-01', 'png'), pngBytes());
  const run = 'c-20260115-200000-wave';
  mkdirSync(paths.captureDir(run), { recursive: true });
  const key = 'WL-01.design.admin.1440.en.light';
  writeFileSync(join(paths.captureDir(run), `${key}.png`), pngBytes(4, 3, [10, 200, 10]));
  writeFileSync(join(paths.captureDir(run), `${key}.txt`), 'Widgets\n3 widgets in stock\n');
  const capture = validExample('capture');
  capture.runId = run;
  capture.items = [{ ...capture.items[0], files: { png: `${key}.png`, txt: `${key}.txt`, dom: `${key}.dom.json` } }];
  writeFileSync(paths.captureManifest(run), JSON.stringify(capture));
  mkdirSync(join(paths.runDir, 'audit'), { recursive: true });
  return { repo, paths, run, key };
}

test('audit compile records auditor reports once, counts a changed report as a re-audit, and writes the page', async () => {
  const { repo, paths, run, key } = await runRepo();
  try {
    const report = (live) => JSON.stringify({ schemaVersion: 1, runId: 'x', findings: [
      { state: 'WL-01', where: `${key}.txt:2`, severity: 'P2', design: '3 widgets in stock', live, group: 'list' },
      { state: 'WL-01', where: `${key}.png`, severity: 'P3', rule: 'dead-control', design: 'New widget opens a form', live: 'nothing happens', group: 'list' },
    ] });
    writeFileSync(join(paths.runDir, 'audit', 'list.json'), report('3 widget in stock'));
    const a = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    assert.equal(await command.run(a.ctx, []), 0);
    assert.match(a.stdout.text(), /recorded auditor:list: 2 findings \(2 new, 0 fixed, 0 reopened\)/);
    const doc = JSON.parse(readFileSync(paths.findings, 'utf8'));
    assert.deepEqual(doc.findings.map((x) => [x.source, x.severity, x.status, x.reAudits]), [['auditor:list', 'P2', 'open', 0], ['auditor:list', 'P1', 'open', 0]]);
    const html = readFileSync(paths.punchList, 'utf8');
    assert.match(html, /src="design\/WL-01\.png"/);
    assert.match(html, new RegExp(`src="captures/${run}/${key.replace(/\./g, '\\.')}\\.png"`));
    assert.match(a.stdout.text(), /publish with 2 picture\(s\) as supporting files/);

    const b = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    await command.run(b.ctx, []);
    assert.match(b.stdout.text(), /1 auditor report\(s\) unchanged since last recorded/);

    writeFileSync(join(paths.runDir, 'audit', 'list.json'), report('3 widgets in stock (fixed)'));
    const c = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    await command.run(c.ctx, []);
    assert.match(c.stdout.text(), /, a re-audit/);
    const doc2 = JSON.parse(readFileSync(paths.findings, 'utf8'));
    assert.ok(doc2.findings.every((x) => x.reAudits === 1));
    const events = JSON.parse(readFileSync(paths.state, 'utf8')).journal.map((e) => e.event);
    assert.ok(events.some((e) => e.startsWith('re-audit auditor:list | exit=0 | reAudits=1')));

    // the second auditor's pass marks the P1 a duplicate; a bad report is refused but the page is still written
    const p1 = doc2.findings.find((x) => x.severity === 'P1');
    writeFileSync(join(paths.runDir, 'audit', 'list.refute.json'), JSON.stringify({ refutations: [{ id: p1.id, verdict: 'duplicate', why: 'same as the M9 finding' }] }));
    writeFileSync(join(paths.runDir, 'audit', 'list.spot.json'), JSON.stringify({ judged: 8, disagreed: 1 }));
    writeFileSync(join(paths.runDir, 'audit', 'broken.json'), '{ not json');
    const d = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'], json: true });
    const exit = await command.run(d.ctx, ['--embed']);
    assert.equal(exit, 2);
    d.ctx.out.finish(exit);
    const out = JSON.parse(d.stdout.text());
    assert.deepEqual(out.failures.map((x) => x.code), ['auditor-report']);
    assert.match(out.failures[0].message, /broken\.json: not JSON/);
    assert.deepEqual(out.data.files, []);
    const doc3 = JSON.parse(readFileSync(paths.findings, 'utf8'));
    assert.equal(doc3.findings.find((x) => x.id === p1.id).status, 'duplicate');
    assert.match(readFileSync(paths.punchList, 'utf8'), /src="data:image\/png;base64,/);
    assert.ok(out.lines.some((l) => /spot check auditor:list: 1 of 8 disagreed/.test(l)));
  } finally { repo.cleanup(); }
});

test('pictures: a finding that names its capture file gets that one; others the best capture of their state', async () => {
  const { repo, paths, run, key } = await runRepo();
  try {
    const named = f({ state: 'WL-01', where: `${key}.txt:2` });
    const other = f({ state: 'WL-01', where: 'apps/web/messages/en.json:3', source: 'check:M8' });
    const none = f({ state: 'WL-09', where: 'q' });
    const { pictures, files } = await locatePictures(paths, [named, other, none]);
    assert.deepEqual(pictures.get(named.id), { design: 'design/WL-01.png', live: `captures/${run}/${key}.png`, liveLine: '3 widgets in stock' });
    assert.equal(pictures.get(other.id).live, `captures/${run}/${key}.png`);
    assert.deepEqual(pictures.get(none.id), { design: null, live: null, liveLine: null });
    assert.deepEqual(files, [`captures/${run}/${key}.png`, 'design/WL-01.png']);
  } finally { repo.cleanup(); }
});
