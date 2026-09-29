// delivery crop: cut the same box out of a round's live and design pictures, scaled up, so a
// reviewer (or an auditor) can look closely at a small difference instead of guessing from the
// whole page. Owner: slice C (docs/ARCHITECTURE.md).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs, intFlag } from '../core/args.mjs';
import { UsageError } from '../core/exit.mjs';
import { roundDir } from '../picture/rounds.mjs';
import { roundFiles } from '../picture/widths.mjs';
import { cropImage, decodePng, encodePng } from '../picture/png.mjs';

/** "x,y,w,h" as four whole numbers, w and h above 0. */
export function parseBox(text) {
  const m = String(text ?? '').match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (!m || Number(m[3]) === 0 || Number(m[4]) === 0) throw new UsageError(`--box needs x,y,w,h in pixels of the picture, got "${text}"`);
  return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

export default defineCommand({
  name: 'crop',
  summary: 'Cut the same box out of a round\'s live and design pictures, scaled up, for a close look',
  usage: `usage: delivery crop --round <n> --item <ITEM> --box x,y,w,h [--zoom <1-4>]
       delivery crop --file <picture.png> [--file <other.png>] --box x,y,w,h [--zoom <1-4>] [--out <dir>]

A reviewer's close look: where two pictures differ in something small (an icon, a border, a
number), cut the same box out of both and read the two crops instead of the whole page. The box
is in pixels of the picture as it is on disk. The crops are written beside the round
(rounds/<n>/crops/<ITEM>-<x>-<y>-<w>-<h>.live.png and .design.png) or into --out, and their paths
are printed; read them with the Read tool. A box running past an edge is cut at it.

options:
  --round <n>        the round whose pictures to crop (with --item)
  --item <ITEM>      the item, as the round names it: KC-05 or KC-05@phone
  --file <png>       any picture instead (repeatable; an auditor's capture and render)
  --box x,y,w,h      required
  --zoom <n>         scale up 1 to 4 times (default 2)
  --out <dir>        where --file crops go (default: beside the first file)

exit: 0 written; 2 usage, or a picture that is missing or not a plain 8-bit PNG

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values: v } = parseCommandArgs(argv, { options: { round: { type: 'string' }, item: { type: 'string' }, file: { type: 'string', multiple: true }, box: { type: 'string' }, zoom: { type: 'string' }, out: { type: 'string' } } });
    const box = parseBox(v.box);
    const zoom = v.zoom === undefined ? 2 : intFlag(v.zoom, '--zoom');
    if (zoom > 4) throw new UsageError('--zoom is 1 to 4');
    const tag = `${box.x}-${box.y}-${box.w}-${box.h}`;
    let jobs;
    if (v.file?.length) {
      if (v.round || v.item) throw new UsageError('give --file, or --round with --item, not both');
      const files = v.file.map((f) => resolve(ctx.cwd, f));
      const outDir = v.out ? resolve(ctx.cwd, v.out) : join(files[0], '..', 'crops');
      jobs = files.map((f) => ({ from: f, to: join(outDir, `${basename(f, '.png')}-${tag}.png`) }));
    } else {
      const round = intFlag(v.round, '--round', { required: true });
      if (!v.item || !/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(v.item)) throw new UsageError('--item <ITEM> is required, as the round names it (KC-05 or KC-05@phone)');
      const dir = roundDir(ctx.requirePaths(), round);
      const names = roundFiles(v.item);
      jobs = ['live', 'design'].map((k) => ({ from: join(dir, names[k]), to: join(dir, 'crops', `${v.item}-${tag}.${k}.png`) }));
    }
    const out = [];
    for (const j of jobs) {
      if (!existsSync(j.from)) throw new UsageError(`no picture at ${relative(ctx.cwd, j.from)}`);
      let img;
      try { img = decodePng(await readFile(j.from)); } catch (err) { throw new UsageError(`${relative(ctx.cwd, j.from)}: ${err.message}`); }
      let c;
      try { c = cropImage(img, { ...box, zoom }); } catch (err) { throw new UsageError(`${relative(ctx.cwd, j.from)}: ${err.message}`); }
      await mkdir(join(j.to, '..'), { recursive: true });
      await writeFile(j.to, encodePng(c));
      out.push({ from: j.from, file: j.to, width: c.width, height: c.height });
      ctx.out.line(`${j.to} (${c.width} x ${c.height}, box ${c.box.x},${c.box.y},${c.box.w},${c.box.h} at ${zoom}x)`);
    }
    ctx.out.set('crops', out);
    return 0;
  },
});
