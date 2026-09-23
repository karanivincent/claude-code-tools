import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize } from '../../lib/design/js-tokens.mjs';
import { splitDcHtml, propValues, literalResults, stateWrites, textTernaries, templateLists, isVisibleText, idPart, htmlUnescape } from '../../lib/design/claude-dc.mjs';
import claudeDesign, { claudeDesignCandidates, findDcFile } from '../../adapters/design/claude-design.mjs';
import imageFolder from '../../adapters/design/image-folder.mjs';
import { getDesignAdapter, ADAPTERS, designTreeSha256 } from '../../adapters/design/index.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { DC_TEXT, pngBytes, makeDesignRepo, snapshotFiles } from './helpers.mjs';
import command from '../../lib/commands/design-candidates.mjs';

test('the tokenizer tells strings, templates, regexes and division apart and keeps lines', () => {
  const src = "const a = 'x\\'y';\nconst r = /a\\/b[/]c/g.test(s) ? 2 / 1 : `t ${n === 1 ? 'one' : 'many'} end`; // c ? d : e\n/* x ? 'y' */ z";
  const t = tokenize(src, { line: 10 });
  const strs = t.filter((x) => x.t === 'str').map((x) => x.v);
  assert.deepEqual(strs, ["x'y"]);
  const re = t.find((x) => x.t === 'regex');
  assert.equal(re.v, '/a\\/b[/]c/g');
  assert.equal(re.line, 11);
  const div = t.filter((x) => x.t === 'punc' && x.v === '/');
  assert.equal(div.length, 1, 'the "2 / 1" is a division');
  const tmpl = t.find((x) => x.t === 'tmpl');
  assert.deepEqual(tmpl.parts, ['t ', ' end']);
  assert.deepEqual(tmpl.inner[0].filter((x) => x.t === 'str').map((x) => x.v), ['one', 'many']);
  assert.ok(!t.some((x) => x.t === 'str' && x.v === 'y'), 'comments are skipped');
  assert.equal(t[t.length - 1].line, 12);
});

test('literal results see through ternaries and parentheses', () => {
  const lit = (s) => literalResults(tokenize(s));
  assert.deepEqual(lit("'a'"), { literals: ['a'], computed: false });
  assert.deepEqual(lit("c ? 'a' : (d ? 'b' : null)"), { literals: ['a', 'b', null], computed: false });
  assert.deepEqual(lit('x.y'), { literals: [], computed: true });
  assert.deepEqual(lit("c ? 'a' : x"), { literals: ['a'], computed: true });
  assert.deepEqual(lit('-1'), { literals: [-1], computed: false });
  assert.deepEqual(lit('{}'), { literals: [{}], computed: false });
});

test('visible text is told from keys, CSS values, paths and icon names', () => {
  for (const s of ['Widgets', ' widget', ' in stock', 'No widgets yet', '—', '· ', 'About ', '+1 555 ••• •••', '10:40']) assert.ok(isVisibleText(s), s);
  for (const s of ['create', 'create-draft', 'var(--red)', '#fff', '12px', '0 0 1px', 'flex-start', 'pointer', '/api/x', '-v', 'px', 'none', 'color: red;']) assert.ok(!isVisibleText(s), s);
});

test('idPart keeps ids inside the candidate id alphabet, and signs', () => {
  assert.equal(idPart('In a call'), 'In-a-call');
  assert.equal(idPart('-1'), '-1');
  assert.equal(idPart(''), 'empty');
  assert.equal(idPart('{}'), 'empty');
  assert.equal(htmlUnescape('&quot;a&quot; &amp; &#39;b&#39; &#x41;'), '"a" & \'b\' A');
});

test('the widgets design yields every kind of candidate, prop-only states included', () => {
  const c = claudeDesignCandidates({ file: 'widgets.dc.html', text: DC_TEXT(), shots: ['dialog.png', 'list.png'] });
  const ids = new Set(c.map((x) => x.id));
  for (const id of ['prop:empty:true', 'prop:empty:false', 'prop:tone:calm', 'prop:tone:loud', 'prop:limit:3', 'prop:limit:0', 'prop:limit:10']) assert.ok(ids.has(id), id);
  for (const id of ['set:screen:list', 'set:screen:settings', 'set:picked:computed', 'dialog:dlg:details', 'dialog:dlg:null', 'dialog:dlg:create', 'dialog:dlg:create-draft', 'dialog:menuOpen:computed']) assert.ok(ids.has(id), id);
  assert.ok(!ids.has('set:owner:Sam'), 'an initial value nothing ever sets is bookkeeping, not a candidate');
  for (const id of ['list:tabs', 'list:rows', 'shot:list.png', 'shot:dialog.png']) assert.ok(ids.has(id), id);
  const tern = c.filter((x) => x.kind === 'ternary');
  const values = tern.map((x) => x.values.join('|'));
  assert.ok(values.includes(' widget| widgets'), 'the plural ternary');
  assert.ok(values.includes('Widgets|Widget settings'));
  assert.ok(values.includes(' in stock|No widgets yet'));
  assert.ok(values.includes('Sold out|{} left'));
  assert.ok(values.some((v) => v.startsWith('About |')), 'a nested ternary is its own candidate');
  assert.ok(!values.some((v) => v.includes('var(')), 'no CSS ternary');
  assert.ok(!values.some((v) => v.includes('create')), 'no key ternary');
  assert.equal(tern.length, 5);
  const dcLines = DC_TEXT().split('\n');
  const plural = tern.find((x) => x.values.join('|') === ' widget| widgets');
  const line = Number(plural.source.split(':')[1]);
  assert.match(dcLines[line - 1], /n === 1 \? ' widget'/, 'source points at the ternary\'s own line');
  const doc = { schemaVersion: 1, feature: 'widgets', adapter: 'claude-design', designTreeSha256: '0'.repeat(64), candidates: c };
  assert.deepEqual(validateAgainst('candidates', doc).errors, []);
  assert.equal(new Set(c.map((x) => x.id)).size, c.length, 'ids are unique');
});

test('the parts of a .dc.html are found with their lines', () => {
  const parts = splitDcHtml(DC_TEXT());
  assert.ok(parts.template.text.includes('{{ title }}'));
  assert.equal(parts.props.value.tone.default, 'calm');
  assert.equal(DC_TEXT().split('\n')[parts.props.line - 1].includes('data-props'), true);
  const toks = tokenize(parts.script.text, { line: parts.script.line });
  const writes = stateWrites(toks, parts.script.text);
  assert.equal(writes.filter((w) => w.initial).length, 1);
  assert.equal(writes.filter((w) => !w.initial).length, 5);
  assert.equal(textTernaries(toks, parts.script.text).length, 5);
  assert.deepEqual(templateLists(parts.template.text, parts.template.line).map((l) => l.expr), ['tabs', 'rows']);
  assert.deepEqual(propValues(parts.props.value).map((p) => `${p.key}=${JSON.stringify(p.value)}${p.isDefault ? '*' : ''}`),
    ['empty=true', 'empty=false*', 'tone="calm"*', 'tone="loud"', 'limit=3*', 'limit=0', 'limit=10']);
});

test('adapters: detect, snapshot layout, and refusing what they do not read', async () => {
  const d = makeTempDir();
  try {
    const exp = join(d.dir, 'export');
    mkdirSync(join(exp, 'shots'), { recursive: true });
    mkdirSync(join(exp, 'uploads'), { recursive: true });
    mkdirSync(join(exp, '_ds', 'kit'), { recursive: true });
    writeFileSync(join(exp, 'widgets.dc.html'), DC_TEXT());
    writeFileSync(join(exp, 'support.js'), '/* runtime */');
    writeFileSync(join(exp, '_ds', 'kit', 'bundle.js'), '/* bundle */');
    writeFileSync(join(exp, '_ds', 'kit', 'tokens.css'), ':root{}');
    writeFileSync(join(exp, 'shots', 'a.png'), pngBytes());
    writeFileSync(join(exp, 'uploads', 'brief.pdf'), 'x');
    assert.deepEqual(await claudeDesign.detect(exp), { ok: true, project: 'widgets', exportedAt: null });
    const layout = await claudeDesign.snapshotLayout(exp);
    assert.deepEqual(layout.zip, ['_ds/kit/bundle.js', 'support.js']);
    assert.deepEqual(layout.copy, ['_ds/kit/tokens.css', 'shots/a.png', 'widgets.dc.html']);
    assert.equal((await getDesignAdapter(exp)).name, 'claude-design');

    const pics = join(d.dir, 'pics');
    mkdirSync(pics);
    writeFileSync(join(pics, 'home.png'), pngBytes());
    writeFileSync(join(pics, 'detail.jpg'), 'x');
    await assert.rejects(getDesignAdapter(pics), (e) => e.exit === 2 && /needs --adapter image-folder/.test(e.message));
    assert.equal((await getDesignAdapter(pics, { adapter: 'image-folder' })).name, 'image-folder');
    assert.deepEqual((await imageFolder.candidates(pics)).map((c) => c.id), ['shot:detail.jpg', 'shot:home.png']);
    assert.equal((await imageFolder.detect(exp)).ok, false, 'a Claude Design export is not a picture folder');
    await assert.rejects(getDesignAdapter(pics, { adapter: 'nope' }), (e) => e.exit === 2);
    const empty = join(d.dir, 'empty');
    mkdirSync(empty);
    assert.match((await claudeDesign.detect(empty)).reason, /no \*\.dc\.html/);
    writeFileSync(join(empty, 'a.dc.html'), '<x-dc></x-dc>');
    assert.match((await claudeDesign.detect(empty)).reason, /no support\.js/);
    writeFileSync(join(empty, 'b.dc.html'), '<x-dc></x-dc>');
    assert.match((await claudeDesign.detect(empty)).reason, /more than one/);
    // Components the page imports with <dc-import> do not count as a second page.
    writeFileSync(join(empty, 'support.js'), '');
    writeFileSync(join(empty, 'a.dc.html'), '<x-dc><dc-import name="b" open="{{ x }}"></dc-import></x-dc>');
    assert.deepEqual(await claudeDesign.detect(empty), { ok: true, project: 'a', exportedAt: null });
    assert.deepEqual(await findDcFile(empty), { file: 'a.dc.html', components: ['b.dc.html'] });
    writeFileSync(join(empty, 'c.dc.html'), '<x-dc></x-dc>');
    assert.match((await claudeDesign.detect(empty)).reason, /2 of them imported by no other/);
    assert.deepEqual(ADAPTERS, ['claude-design', 'image-folder']);
  } finally { d.cleanup(); }
});

test('design candidates writes a valid candidates.json from the snapshot (runtime zipped)', async () => {
  const repo = makeDesignRepo();
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile() });
    assert.equal(await command.run(ctx, []), 0);
    const doc = JSON.parse(readFileSync(join(repo.dir, '.delivery/widgets/candidates.json'), 'utf8'));
    assert.equal(doc.adapter, 'claude-design');
    assert.equal(doc.designTreeSha256, await designTreeSha256(join(repo.dir, 'docs/design/widgets')));
    assert.ok(doc.candidates.some((c) => c.id === 'prop:tone:loud'));
    assert.match(stdout.text(), /candidates from the claude-design design: .*7 prop-value/);
    // a loose unzipped runtime beside the snapshot does not change the design's identity
    const before = doc.designTreeSha256;
    repo.write({ 'docs/design/widgets/support.js': '/* unzipped by hand */' });
    assert.equal(await designTreeSha256(join(repo.dir, 'docs/design/widgets')), before);
  } finally { repo.cleanup(); }
});

test('design candidates refuses a run with no snapshot, and an unknown adapter', async () => {
  const repo = makeDesignRepo({ files: {} });
  try {
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'other', profile: makeProfile() });
    await assert.rejects(command.run(ctx, []), (e) => e.exit === 2 && /no design snapshot/.test(e.message));
    const { ctx: c2 } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile() });
    await assert.rejects(command.run(c2, ['--adapter', 'figma']), (e) => e.exit === 2);
  } finally { repo.cleanup(); }
});

test('the snapshot files helper carries the runtime only inside runtime.zip', () => {
  const files = Object.keys(snapshotFiles(''));
  assert.ok(files.includes('runtime.zip'));
  assert.ok(!files.some((f) => f.endsWith('.js')));
});
