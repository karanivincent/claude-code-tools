// Builders for design tests: a synthetic Claude-Design-shaped snapshot (the generic widgets design,
// two shots, and runtime.zip holding a stand-in runtime), inside a temp repo.

import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { FIXTURES_DIR } from '../helpers/fixtures.mjs';
import { writeZip, crc32 } from '../../lib/core/zip.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';

/** A solid-colour PNG of w x h pixels. */
export function pngBytes(w = 4, h = 3, [r, g, b] = [200, 60, 60]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const DC_TEXT = () => readFileSync(join(FIXTURES_DIR, 'design', 'widgets.dc.html'), 'utf8');
export const TOYLIB = () => readFileSync(join(FIXTURES_DIR, 'design', 'toylib.js'));

/** The stand-in runtime with the library's real integrity hash filled in. */
export function toyRuntime() {
  const integrity = `sha384-${createHash('sha384').update(TOYLIB()).digest('base64')}`;
  return readFileSync(join(FIXTURES_DIR, 'design', 'toy-runtime.js'), 'utf8').replace('__TOYLIB_INTEGRITY__', integrity);
}

/** Files of a snapshot of the widgets design (relative path -> content). */
export function snapshotFiles(prefix = 'docs/design/widgets/') {
  return {
    [`${prefix}widgets.dc.html`]: DC_TEXT(),
    [`${prefix}shots/list.png`]: pngBytes(4, 3, [30, 120, 200]),
    [`${prefix}shots/dialog.png`]: pngBytes(4, 3, [200, 120, 30]),
    [`${prefix}runtime.zip`]: writeZip([{ name: 'support.js', data: toyRuntime() }]),
    [`${prefix}README.md`]: '# widgets design snapshot (synthetic)\n',
  };
}

/** A generic inventory for the widgets design. */
export function widgetsInventory(states) {
  return {
    schemaVersion: 1,
    feature: 'widgets',
    designTreeSha256: '0'.repeat(64),
    candidates: [],
    states: states ?? [
      { id: 'WL-01', screen: 'Widgets', name: 'the list', reach: { kind: 'click-path', steps: [] }, shots: ['shots/list.png'], render: { status: 'ok' }, controls: [] },
      { id: 'WL-02', screen: 'Widgets', name: 'no widgets', reach: { kind: 'prop', props: { empty: true } }, shots: [], render: { status: 'ok' }, controls: [] },
      { id: 'WL-03', screen: 'Widgets', name: 'details dialog', reach: { kind: 'click-path', steps: [{ click: 'Red widget' }] }, shots: ['shots/dialog.png'], render: { status: 'ok' }, controls: [] },
      { id: 'WL-04', screen: 'Widgets', name: 'settings by set', reach: { kind: 'click-path', steps: [{ set: { screen: 'settings', owner: 'Kim' } }] }, shots: [], render: { status: 'ok' }, controls: [] },
      { id: 'WL-05', screen: 'Widgets', name: 'loading', reach: { kind: 'unspecified', unspecified: 'loading' }, shots: [], render: { status: 'impossible', why: 'the design draws no loading state' }, controls: [] },
      { id: 'WL-06', screen: 'Widgets', name: 'picture only', reach: { kind: 'shot-only' }, shots: ['shots/dialog.png'], render: { status: 'ok' }, controls: [] },
    ],
  };
}

/**
 * A temp git repo with the widgets snapshot, its inventory, and a fake node_modules package that
 * answers the toy runtime's CDN URL (so render can vendor it).
 */
export function makeDesignRepo(opts = {}) {
  const files = {
    ...snapshotFiles(),
    'docs/delivery/widgets/inventory.json': opts.inventory ?? widgetsInventory(),
    'node_modules/toylib/package.json': { name: 'toylib', version: opts.libVersion ?? '1.2.3' },
    'node_modules/toylib/dist/toylib.js': TOYLIB(),
    '.gitignore': 'node_modules/\n.delivery/\n',
    ...(opts.files ?? {}),
  };
  return makeTempRepo({ files });
}
