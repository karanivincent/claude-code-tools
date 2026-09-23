// The image-folder adapter (spec 4.0 step 1, 4.2 step 1): a folder of pictures, one per screen or
// state, with no runtime. Every image is a candidate; a picture state has no reach steps, and its
// words cannot be read from the page (there is no page).

import { readdir, stat } from 'node:fs/promises';
import { listTree } from '../../lib/core/hash.mjs';
import { idPart } from '../../lib/design/claude-dc.mjs';

export const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

async function images(dir) {
  const files = await listTree(dir, { ignore: (rel) => rel.startsWith('__MACOSX/') });
  return files.filter((f) => IMAGE.test(f));
}

/** @type {import('./index.mjs').DesignAdapter} */
const adapter = {
  name: 'image-folder',

  async detect(dir) {
    try { if (!(await stat(dir)).isDirectory()) return { ok: false, reason: `${dir} is not a directory` }; } catch {
      return { ok: false, reason: `${dir} is not a readable directory` };
    }
    const top = await readdir(dir);
    if (top.some((n) => n.endsWith('.dc.html'))) return { ok: false, reason: 'holds a *.dc.html: use the claude-design adapter' };
    const imgs = await images(dir);
    if (!imgs.length) return { ok: false, reason: 'no images (png, jpg, webp, gif)' };
    const name = dir.replace(/\/+$/, '').split('/').pop() || 'design';
    return { ok: true, project: name, exportedAt: null };
  },

  async snapshotLayout(dir) {
    const files = await listTree(dir, { ignore: (rel) => rel.startsWith('__MACOSX/') });
    return { copy: files.filter((f) => IMAGE.test(f) || /\.(md|txt|json)$/i.test(f)), zip: [] };
  },

  async candidates(snapshotDir) {
    return (await images(snapshotDir)).map((rel) => ({
      id: `shot:${idPart(rel)}`,
      kind: 'shot',
      source: rel,
      detail: rel,
    }));
  },
};

export default adapter;
