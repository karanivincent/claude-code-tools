// delivery design render: render every design state to png, txt and dom.json (spec 4.2 step 3).
// Owner: slice C (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { exists } from '../core/fs.mjs';
import { UsageError, EXIT } from '../core/exit.mjs';
import { getDesignAdapter } from '../../adapters/design/index.mjs';
import { renderDesign, DEFAULT_VIEWPORT } from '../design/render.mjs';
import { WIDTHS, WIDTH_NAMES, itemKey } from '../picture/widths.mjs';
import { readMap } from '../picture/map.mjs';
import { rebuildContractFile } from '../picture/contract.mjs';

export default defineCommand({
  name: "design render",
  summary: "Render every design state to png, txt and dom.json",
  usage: `usage: delivery design render [--states <ID,...>] [--port <n>] [--width <desktop|phone|px>] [--height <px>] [--offline]

Serve the snapshot on a local port (runtime unzipped under .delivery/<feature>/design-serve/)
and render each inventory state by its click path, or from a temporary copy with a prop's
default changed, to <ID>.png, <ID>.txt and <ID>.dom.json under .delivery/<feature>/design/.
Words are read from the rendered page, never from source. Uses the target repo's Playwright,
and answers the design runtime's CDN scripts from the repo's node_modules when the same
package version is installed there.

A state whose render.status is "impossible" is skipped and listed. A shot-only state (and
every state of an image-folder design) gets its first shot copied as <ID>.png, with no text.
Steps: {"click": "<exact visible text>"} or {"click": "<playwright selector>"} such as
text=..., css=..., role=...; {"set": {...}} writes the design component's own state.

A "prop" reach's props are baked into the served file as new defaults, so the design mounts
with them already set. A "preset" reach's props never are: the design boots with its own
defaults, then those props are changed on the running component, because a preset applies only
on a prop *change* (a design's componentDidUpdate) and never fires from a default. They are
props, not state: a {"set": ...} step writes state and never applies a preset. Steps run after
the preset and are not reset by it. design candidates lists each entry of a preset table (a
method m(arg) that indexes a top-level const T = {...}, called as this.m(this.props.P)) as a
"preset" candidate with its props.

Warnings, which never fail the render: a state whose reach sets a prop named like one of the
design's state keys (the prop never sets that state), and a state whose page is mostly an iframe
(its words are not read; a phone view is rendered with --width phone, not a phone-frame prop).

Every rendered picture is hashed; two different states whose pictures come out byte-identical
are refused (both ids and the hash are named), unless one names the other in the inventory with
"samePictureAs": "<id>".

A named width renders at that width's size: desktop is 1440 x 900 with today's file names, and
phone is 390 x 844 and adds @phone (<ID>@phone.png, <ID>@phone.txt, <ID>@phone.dom.json), for a
picture-mode map that declares "widths": ["desktop", "phone"]. At phone width a picture-only state
is skipped: a fixed picture has one width, so a map points a phone item at it with
"design": { "phone": "<ID>" }.

Once a picture-mode map exists, the data contract (docs/delivery/<feature>/contract.json) is rebuilt
from the new renders: labels stay on texts that did not change, new texts wait for the labeller,
and seed --check must pass again before the next shoot.

This launches a browser: run it through the profile's heavy wrapper.

options:
  --states <ids>     render only these states (comma-separated)
  --port <n>         port for the static server (default: a free one)
  --width <w>        desktop, phone, or a width in pixels (default: the profile's first audit
                     width, else 1440; a pixel width keeps today's file names)
  --height <px>      viewport height (default 900, or the named width's height)
  --offline          abort every request the snapshot or the repo cannot answer (fonts fall back)

exit: 0 rendered; 1 a state failed to render; 2 Playwright not found

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: {
        states: { type: 'string' }, port: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' },
        offline: { type: 'boolean', default: false },
      },
    });
    const paths = ctx.requirePaths();
    if (!(await exists(paths.designSnapshot))) throw new UsageError(`no design snapshot at ${paths.designSnapshot}; run intake first`);
    const inventory = await readArtefact(paths, 'inventory');
    const intent = await readArtefact(paths, 'intent', { optional: true });
    let profile = null;
    try { profile = await ctx.profile(); } catch (err) { if (err.exit !== EXIT.USAGE) throw err; }
    const adapter = await getDesignAdapter(paths.designSnapshot, { adapter: intent?.design?.adapter });
    const states = values.states ? values.states.split(',').map((s) => s.trim()).filter(Boolean) : null;
    if (states) {
      const known = new Set(inventory.states.map((s) => s.id));
      const unknown = states.filter((s) => !known.has(s));
      if (unknown.length) throw new UsageError(`not in the inventory: ${unknown.join(', ')}`);
    }
    const num = (v, flag) => {
      if (v === undefined) return undefined;
      if (!/^[1-9]\d{1,4}$/.test(v)) throw new UsageError(`${flag} needs a whole number of pixels, got "${v}"`);
      return Number(v);
    };
    const named = values.width !== undefined && !/^\d+$/.test(values.width) ? values.width : null;
    if (named && !WIDTH_NAMES.includes(named)) throw new UsageError(`--width is ${WIDTH_NAMES.join(', ')} or a number of pixels, got "${values.width}"`);
    const viewport = named
      ? { width: WIDTHS[named].width, height: num(values.height, '--height') ?? WIDTHS[named].height }
      : {
        width: num(values.width, '--width') ?? profile?.audit?.widths?.[0] ?? DEFAULT_VIEWPORT.width,
        height: num(values.height, '--height') ?? DEFAULT_VIEWPORT.height,
      };
    const width = named ?? 'desktop';
    const shown = (id) => itemKey(id, width);
    const port = values.port === undefined ? 0 : num(values.port, '--port');

    const r = await renderDesign(ctx, {
      paths, inventory, adapter: adapter.name, states, port, offline: values.offline, viewport, width,
      e2eDir: profile?.paths?.e2eDir ?? null,
      playwrightRoot: ctx.env.DELIVERY_PLAYWRIGHT_ROOT || null,
      timeZone: profile?.testData?.timeZone ?? null,
    });
    for (const id of r.rendered) ctx.out.line(`rendered ${shown(id)}`);
    for (const id of r.shots) ctx.out.line(`picture only ${id}: shot copied, no text or dom`);
    for (const s of r.skipped) ctx.out.line(`skipped ${shown(s.id)}: ${s.why}`);
    for (const f of r.failed) ctx.out.fail('render', `${shown(f.id)}: ${f.why}`);
    for (const w of r.warnings) ctx.out.warn(`${shown(w.id)}: ${w.why}`);
    if (r.escaped.length) ctx.out.warn(`offline: aborted requests to ${r.escaped.join(', ')}`);
    ctx.out.line(`${r.rendered.length} rendered, ${r.shots.length} pictures, ${r.skipped.length} skipped, ${r.failed.length} failed; files in ${paths.designRenders}`);
    ctx.out.set('rendered', r.rendered);
    ctx.out.set('shots', r.shots);
    ctx.out.set('skipped', r.skipped);
    ctx.out.set('failed', r.failed);
    ctx.out.set('warnings', r.warnings);
    const exit = r.failed.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({
      command: 'design render', exit,
      counts: { rendered: r.rendered.length, pictures: r.shots.length, skipped: r.skipped.length, failed: r.failed.length },
      inputs: { inventory: inventory.designTreeSha256, states, ...(width !== 'desktop' ? { width } : {}) }, outputs: r,
    });
    await contractAfterRender(ctx, paths, r);
    return exit;
  },
});

/**
 * R11 of stable picture data: a new export makes every contract stale, so a render rebuilds it.
 * A contract problem never changes the render's exit; it is printed for the next step.
 */
async function contractAfterRender(ctx, paths, r) {
  if (!r.rendered.length) return;
  let map;
  try { map = readMap(paths); } catch { return; }
  if (!map) return;
  try {
    const c = await rebuildContractFile(paths, map, ctx.clock.now().toISOString());
    const todo = c.summary.unlabelled.length;
    ctx.out.line(`contract rebuilt: ${c.summary.texts} text(s)${c.changed.length ? `; the design changed ${c.changed.join(', ')}` : ''}${todo ? `; ${todo} to label (delivery contract)` : ''}; run delivery seed --check again before the next shoot`);
  } catch (err) {
    ctx.out.warn(`the data contract was not rebuilt: ${String(err?.message ?? err).split('\n')[0]}`);
  }
}
