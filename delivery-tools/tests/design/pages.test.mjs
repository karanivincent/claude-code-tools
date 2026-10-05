// An export with more than one page (intake --page): the chosen page is read everywhere, whether
// it is passed in or recorded in the snapshot README.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import claudeDesign, { findDcFile, recordedPage, pageFileName } from '../../adapters/design/claude-design.mjs';
import { getDesignAdapter } from '../../adapters/design/index.mjs';
import { prepareServeDir } from '../../lib/design/serve.mjs';
import { readExportSnapshot } from '../../lib/design/review.mjs';
import { renderSnapshotReadme } from '../../lib/lifecycle/intake.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { DC_TEXT } from './helpers.mjs';

const H = 'a'.repeat(64);

/** Home (the widgets prototype), Settings (a second page that imports Picker) and Picker. */
function twoPages(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Home.dc.html'), DC_TEXT());
  writeFileSync(join(dir, 'Settings.dc.html'), '<x-dc><dc-import name="Picker"></dc-import></x-dc>');
  writeFileSync(join(dir, 'Picker.dc.html'), '<x-dc></x-dc>');
  writeFileSync(join(dir, 'support.js'), '');
}

test('findDcFile: a chosen page among several; the others are components or other pages', async () => {
  const d = makeTempDir();
  try {
    const exp = join(d.dir, 'export');
    twoPages(exp);
    const none = await findDcFile(exp);
    assert.match(none.error, /more than one page that no other file imports \(Home\.dc\.html, Settings\.dc\.html\); choose one with intake --page/);
    assert.deepEqual(await findDcFile(exp, { page: 'Home' }), { file: 'Home.dc.html', components: ['Picker.dc.html'], otherPages: ['Settings.dc.html'] });
    assert.deepEqual(await findDcFile(exp, { page: 'Home.dc.html' }), { file: 'Home.dc.html', components: ['Picker.dc.html'], otherPages: ['Settings.dc.html'] });
    assert.match((await findDcFile(exp, { page: 'Reports' })).error, /--page names Reports\.dc\.html, which is not at the top of the export \(its pages: Home\.dc\.html, Picker\.dc\.html, Settings\.dc\.html\)/);
    assert.equal(pageFileName('Home'), 'Home.dc.html');

    const found = await claudeDesign.detect(exp, { page: 'Home' });
    assert.equal(found.ok, true);
    assert.equal(found.project, 'Home');
    assert.equal(found.page, 'Home.dc.html');
    assert.match(found.notes.join('\n'), /left out Settings\.dc\.html: another page of the export/);
    assert.equal((await getDesignAdapter(exp, { page: 'Home' })).name, 'claude-design');
    await assert.rejects(getDesignAdapter(exp), (e) => e.exit === 2 && /--page/.test(e.message));
  } finally { d.cleanup(); }
});

test('a snapshot README that records the page makes every reader open it: candidates, screens, serve, review', async () => {
  const d = makeTempDir();
  try {
    const snap = join(d.dir, 'snapshot');
    twoPages(snap);
    writeFileSync(join(snap, 'README.md'), renderSnapshotReadme({
      project: 'Home', adapter: 'claude-design', exportedAt: null, takenOn: '2026-01-15',
      archiveSha256: H, treeSha256: H, snapshotSha256: H, zipped: [], page: 'Home.dc.html',
    }));
    assert.equal(await recordedPage(snap), 'Home.dc.html');
    assert.equal((await findDcFile(snap)).file, 'Home.dc.html');
    assert.equal((await getDesignAdapter(snap)).name, 'claude-design');

    const candidates = await claudeDesign.candidates(snap);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.filter((c) => c.kind !== 'shot').every((c) => c.source.startsWith('Home.dc.html:')), 'every candidate comes from the chosen page');
    assert.deepEqual(await claudeDesign.screens(snap), await claudeDesign.screens(snap, { page: 'Home' }));

    const served = await prepareServeDir(snap, join(d.dir, 'serve'));
    assert.equal(served.dcFile, 'Home.dc.html');
    assert.equal((await readExportSnapshot(snap)).mainFile, 'Home.dc.html');

    // A new export has no README: the caller passes the page the run recorded.
    const fresh = join(d.dir, 'fresh');
    twoPages(fresh);
    assert.equal((await readExportSnapshot(fresh)).mainFile, null);
    assert.equal((await readExportSnapshot(fresh, { page: await recordedPage(snap) })).mainFile, 'Home.dc.html');
    assert.equal((await prepareServeDir(fresh, join(d.dir, 'serve2'), { page: 'Home' })).dcFile, 'Home.dc.html');
  } finally { d.cleanup(); }
});
