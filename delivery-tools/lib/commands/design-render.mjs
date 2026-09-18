// delivery design render: render every design state to png, txt and dom.json (spec 4.2 step 3).
// Owner: slice C (docs/ARCHITECTURE.md).

import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { exists } from '../core/fs.mjs';
import { UsageError, EXIT } from '../core/exit.mjs';
import { getDesignAdapter } from '../../adapters/design/index.mjs';
import { renderDesign, DEFAULT_VIEWPORT } from '../design/render.mjs';

export default defineCommand({
  name: "design render",
  summary: "Render every design state to png, txt and dom.json",
  usage: `usage: delivery design render [--states <ID,...>] [--port <n>] [--width <px>] [--height <px>] [--offline]

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

This launches a browser: run it through the profile's heavy wrapper.

options:
  --states <ids>     render only these states (comma-separated)
  --port <n>         port for the static server (default: a free one)
  --width <px>       viewport width (default: the profile's first audit width, else 1440)
  --height <px>      viewport height (default 900)
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
    const viewport = {
      width: num(values.width, '--width') ?? profile?.audit?.widths?.[0] ?? DEFAULT_VIEWPORT.width,
      height: num(values.height, '--height') ?? DEFAULT_VIEWPORT.height,
    };
    const port = values.port === undefined ? 0 : num(values.port, '--port');

    const r = await renderDesign(ctx, {
      paths, inventory, adapter: adapter.name, states, port, offline: values.offline, viewport,
      e2eDir: profile?.paths?.e2eDir ?? null,
      playwrightRoot: ctx.env.DELIVERY_PLAYWRIGHT_ROOT || null,
    });
    for (const id of r.rendered) ctx.out.line(`rendered ${id}`);
    for (const id of r.shots) ctx.out.line(`picture only ${id}: shot copied, no text or dom`);
    for (const s of r.skipped) ctx.out.line(`skipped ${s.id}: ${s.why}`);
    for (const f of r.failed) ctx.out.fail('render', `${f.id}: ${f.why}`);
    if (r.escaped.length) ctx.out.warn(`offline: aborted requests to ${r.escaped.join(', ')}`);
    ctx.out.line(`${r.rendered.length} rendered, ${r.shots.length} pictures, ${r.skipped.length} skipped, ${r.failed.length} failed; files in ${paths.designRenders}`);
    ctx.out.set('rendered', r.rendered);
    ctx.out.set('shots', r.shots);
    ctx.out.set('skipped', r.skipped);
    ctx.out.set('failed', r.failed);
    const exit = r.failed.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({
      command: 'design render', exit,
      counts: { rendered: r.rendered.length, pictures: r.shots.length, skipped: r.skipped.length, failed: r.failed.length },
      inputs: { inventory: inventory.designTreeSha256, states }, outputs: r,
    });
    return exit;
  },
});
