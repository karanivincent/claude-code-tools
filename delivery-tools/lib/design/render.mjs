// Design render (spec 4.2 step 3): serve the snapshot, bring each inventory state up in a browser by
// its click path or prop values, and save what the page shows: <ID>.png, <ID>.txt (one line per
// text element, read from the rendered page, never transcribed from source) and <ID>.dom.json.

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { ensureDir } from '../core/fs.mjs';
import { writeArtefact } from '../core/artefacts.mjs';
import { resolvePlaywright, playwrightSearchDirs } from '../core/playwright.mjs';
import { ConfigError } from '../core/exit.mjs';
import { sha256 } from '../core/hash.mjs';
import { startStaticServer, contentTypeFor } from './server.mjs';
import { prepareServeDir, writePropCopy } from './serve.mjs';
import { findDcFile } from '../../adapters/design/claude-design.mjs';
import { vendorResolver } from './vendor.mjs';
import { declaredProps } from './components.mjs';
import { splitDcHtml, stateWrites } from './claude-dc.mjs';
import { tokenize } from './js-tokens.mjs';
import { pageExtract, linesToText } from '../capture/page-extract.mjs';
import { itemKey, WIDTHS } from '../picture/widths.mjs';

export const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const BOOT_SELECTOR = '#dc-root .sc-host';
const STEP_TIMEOUT_MS = 5000;
const BOOT_TIMEOUT_MS = 20000;

/**
 * The viewport to render a component's own $preview at, for one render width. At desktop the
 * preview's own size is used untouched; at any narrower width (fix round, I10) it is clamped to
 * that width's own maximum, since $preview is a desktop-sized default and a component rendered at
 * phone width must never come out wider than a phone layout allows. Height is never touched.
 * @param {{ width: number, height: number|null }} preview
 * @param {string} width a WIDTHS name ("desktop", "phone", ...)
 * @returns {{ width: number, height: number }}
 */
export function previewViewport(preview, width) {
  const cap = WIDTHS[width]?.width;
  const w = width === 'desktop' || !cap ? preview.width : Math.min(preview.width, cap);
  return { width: w, height: preview.height ?? 600 };
}

const KILL_MOTION_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

// Installed before any page script: reaches the design component through React's fiber on the
// root host element. __deliverySet writes its own state, which is what a {set: {...}} step does.
// __deliveryProps changes its props, which is what a preset does: the runtime's wrapper feeds
// __userProps() into logic.props and calls logic.componentDidUpdate(prevProps), and a design
// applies a preset only there, when it sees the prop change. The prop change is reported once;
// later updates see the patched props as unchanged, so click steps after a preset are not reset.
const SET_STATE_INIT = `window.__deliveryFind = function (ok) {
  var hosts = document.querySelectorAll('.sc-host[data-sc-name]');
  for (var h = 0; h < hosts.length; h++) {
    var el = hosts[h], keys = Object.keys(el), f = null;
    for (var k = 0; k < keys.length; k++) if (keys[k].indexOf('__reactFiber$') === 0) f = el[keys[k]];
    for (; f; f = f.return) if (f.stateNode && f.stateNode.logic && ok(f.stateNode)) return f.stateNode;
  }
  return null;
};
window.__deliverySet = function (patch) {
  var sn = window.__deliveryFind(function (s) { return typeof s.logic.setState === 'function'; });
  if (!sn) return false;
  sn.logic.setState(patch);
  return true;
};
window.__deliveryProps = function (patch) {
  var sn = window.__deliveryFind(function (s) { return typeof s.__userProps === 'function' && typeof s.forceUpdate === 'function'; });
  if (!sn) return false;
  var own = sn.__userProps.bind(sn), L = sn.logic, cdu = L.componentDidUpdate, first = true;
  sn.__userProps = function () { return Object.assign({}, own(), patch); };
  if (typeof cdu === 'function') {
    L.componentDidUpdate = function (prev, prevState) {
      if (first) { first = false; return cdu.call(this, prev, prevState); }
      return cdu.call(this, Object.assign({}, prev, patch), prevState);
    };
  }
  sn.forceUpdate();
  return true;
};`;

/**
 * The design's reach keys (pure): its state keys, and each declared prop with the values its
 * editor offers (null when any value goes). Read by planRenders to move a state key out of props.
 * @param {string} html the page's .dc.html
 * @returns {{ stateKeys: Set<string>, props: Record<string, { options: unknown[]|null }> }}
 */
export function designReachKeys(html) {
  const declared = splitDcHtml(html).props?.value ?? {};
  const props = {};
  for (const [k, meta] of Object.entries(declared)) {
    if (k.startsWith('$')) continue;
    const options = Array.isArray(meta?.options) ? meta.options : meta?.editor === 'boolean' || meta?.tsType === 'boolean' ? [true, false] : null;
    props[k] = { options };
  }
  return { stateKeys: designStateKeys(html), props };
}

/**
 * Split a reach's props into the ones that stay props and the ones that are state: a key the
 * design writes with this.set and does not declare as a prop, or declares with options that do
 * not include the value (`screen: "round"` beside a `screen` prop of Desktop or Phone). A prop
 * never sets the state of the same name, so a state key becomes a {set} step.
 * @param {Record<string, unknown>|null} props
 * @param {{ stateKeys: Set<string>, props: Record<string, { options: unknown[]|null }> }|null} design
 * @returns {{ props: Record<string, unknown>|null, set: Record<string, unknown>|null }}
 */
export function splitReachProps(props, design) {
  if (!props || !design) return { props, set: null };
  const keep = {};
  const set = {};
  for (const [k, v] of Object.entries(props)) {
    const declared = design.props[k];
    const isState = design.stateKeys.has(k) && (!declared || (declared.options && !declared.options.includes(v)));
    if (isState) set[k] = v; else keep[k] = v;
  }
  return { props: Object.keys(keep).length ? keep : null, set: Object.keys(set).length ? set : null };
}

/**
 * What to do for each state (pure).
 * @param {object} inventory
 * @param {{ states?: string[]|null, adapter: string, width?: string, design?: ReturnType<typeof designReachKeys>|null }} opts
 *   design: the page's reach keys; with it, a prop or preset key that is state becomes a {set} step
 *   (the item's `moved` says which)
 * @returns {{ id: string, action: 'render'|'shot'|'skip'|'fail', why?: string, steps?: object[], props?: object|null, shot?: string, moved?: object }[]}
 */
export function planRenders(inventory, opts) {
  const wanted = opts.states ? new Set(opts.states) : null;
  const narrow = opts.width && opts.width !== 'desktop';
  const out = [];
  for (const s of inventory.states) {
    if (wanted && !wanted.has(s.id)) continue;
    const reach = s.reach ?? { kind: 'unspecified' };
    if (s.render?.status === 'impossible') { out.push({ id: s.id, action: 'skip', why: `impossible: ${s.render.why ?? 'no reason given'}` }); continue; }
    if (opts.adapter === 'image-folder' || reach.kind === 'shot-only') {
      // A fixed picture has one width; a map points a phone item at it with design.phone.
      if (narrow) { out.push({ id: s.id, action: 'skip', why: `a picture-only state has no ${opts.width} render; point a map state at it with "design": { "${opts.width}": "${s.id}" }` }); continue; }
      if (!s.shots?.length) out.push({ id: s.id, action: 'fail', why: 'a picture state names no shot' });
      else out.push({ id: s.id, action: 'shot', shot: s.shots[0] });
      continue;
    }
    if (reach.kind === 'unspecified') {
      out.push({ id: s.id, action: 'fail', why: `an unspecified (${reach.unspecified ?? 'undrawn'}) state has no design to render; set render.status impossible with the reason` });
      continue;
    }
    const props = reach.props && Object.keys(reach.props).length ? reach.props : null;
    // A component with its defaults (no props) is still a valid state when it names its own file.
    if (reach.kind === 'prop' && !props && !reach.file) { out.push({ id: s.id, action: 'fail', why: 'a prop state names no props' }); continue; }
    // A preset only ever applies on a prop *change* (a design's componentDidUpdate), never at
    // mount, so a preset's props are never baked into the served file as new defaults: render
    // boots the design's own defaults, then changes the preset's props at runtime (spec 4.2 step 3)
    // so componentDidUpdate sees the change. A prop-only reach still bakes props as defaults.
    if (reach.kind === 'preset' && !props) { out.push({ id: s.id, action: 'fail', why: 'a preset state names no props to set' }); continue; }
    // A key the prototype writes with this.set is state, not a prop: it is set after boot, before
    // the reach's own steps. A component file's keys are its own, so it is left alone.
    const split = reach.file ? { props, set: null } : splitReachProps(props, opts.design ?? null);
    const steps = [...(split.set ? [{ set: split.set }] : []), ...(reach.steps ?? [])];
    const item = { id: s.id, action: 'render', steps, props: reach.kind === 'preset' ? null : split.props };
    if (reach.kind === 'preset' && split.props) item.preset = split.props;
    if (split.set) item.moved = split.set;
    if (reach.file) item.file = reach.file;
    if (s.samePictureAs) item.samePictureAs = s.samePictureAs;
    out.push(item);
  }
  return out;
}

/**
 * Every state key of a design page: the keys of its initial `state = {...}` and of every
 * this.set({...}). Empty when the file has no logic script.
 * @param {string} html the .dc.html
 * @returns {Set<string>}
 */
export function designStateKeys(html) {
  const parts = splitDcHtml(html);
  if (!parts.script) return new Set();
  const writes = stateWrites(tokenize(parts.script.text, { line: parts.script.line }), parts.script.text);
  return new Set(writes.flatMap((w) => w.entries.map((e) => e.key)));
}

/**
 * The props a state's reach sets whose names are also state keys of the design (the Rounds run's
 * `screen` mix-up): setting the prop never sets the state of that name.
 * @param {Record<string, unknown>|null} props
 * @param {Set<string>} stateKeys
 * @returns {string|null} the warning, or null
 */
export function propStateClash(props, stateKeys) {
  const clash = Object.keys(props ?? {}).filter((k) => stateKeys.has(k));
  if (!clash.length) return null;
  const k = clash[0];
  return `the reach sets prop${clash.length > 1 ? 's' : ''} ${clash.map((c) => `"${c}"`).join(', ')}, which ${clash.length > 1 ? 'are' : 'is'} also a state key of the design; a prop never sets the state of the same name. If the state was meant, reach it with a {"set": {"${k}": ...}} step`;
}

/** Above this share of the page, an iframe is where the state's content is. */
export const IFRAME_SHARE_WARN = 0.5;

/**
 * The share of the page (its full scroll area) the largest visible iframe covers, 0 to 1.
 * @param {{ w: number, h: number }[]} frames each iframe's visible box
 * @param {{ w: number, h: number }} pageSize
 */
export function iframeShare(frames, pageSize) {
  const area = Math.max(1, pageSize.w * pageSize.h);
  return frames.reduce((m, f) => Math.max(m, Math.max(0, f.w) * Math.max(0, f.h) / area), 0);
}

/**
 * The warning for a state whose page is mostly an iframe, or null. Its words come from the top
 * document only, so they miss what the frame draws: usually a phone view drawn inside a phone
 * frame, which is rendered with --width phone instead.
 */
export function iframeWarning(share) {
  if (share <= IFRAME_SHARE_WARN) return null;
  return `an iframe covers ${Math.round(share * 100)}% of the page, and its words are not read (only the top document is). A phone view is rendered with --width phone, never through a phone-frame prop`;
}

/**
 * A design render's file name. Desktop keeps "<ID>.<ext>"; any other named width adds "@<width>":
 * "<ID>@phone.png".
 */
export function renderFileName(id, width, ext) {
  return `${itemKey(id, width ?? 'desktop')}.${ext}`;
}

/**
 * The design components a rendered state's page actually shows: every `.sc-host[data-sc-name]`
 * host's name, minus the root host's own name (the state's own component, not one it uses).
 * @param {{ name: string, root: boolean }[]} hosts
 * @returns {string[]} sorted, unique
 */
export function componentNames(hosts) {
  const root = hosts.find((h) => h.root);
  const names = new Set(hosts.map((h) => h.name));
  if (root) names.delete(root.name);
  return [...names].sort();
}

/**
 * A component file's own preview size, read once. Never throws: a `reach.file` that does not
 * resolve in the served snapshot (or cannot be read for any other reason) is reported in `why`
 * instead, so a caller can fail that one state and carry on rather than aborting the whole render.
 * @param {string} serveDir
 * @param {string} file
 * @returns {Promise<{ preview: {width:number, height:number|null}|null, why: string|null }>}
 */
export async function readComponentPreview(serveDir, file) {
  let html;
  try {
    html = await readFile(join(serveDir, file), 'utf8');
  } catch (err) {
    return { preview: null, why: `cannot read component file ${file}: ${err.code ?? err.message}` };
  }
  return { preview: declaredProps(html).preview, why: null };
}

/**
 * The components a rendered state showed, from the "<ID>[@width].components.json" file written
 * beside its png. Empty when the file is absent (older renders, or a render that failed).
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {string} stateId
 * @param {string} [width]
 * @returns {Promise<string[]>}
 */
export async function readStateComponents(paths, stateId, width = 'desktop') {
  paths.designRender(stateId, 'components.json'); // checks the id
  const file = join(paths.designRenders, renderFileName(stateId, width, 'components.json'));
  let raw;
  try { raw = await readFile(file, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const data = JSON.parse(raw);
  return Array.isArray(data.names) ? data.names : [];
}

/** A Playwright selector string, or exact visible text. */
export function isSelector(s) {
  return /^(css|text|xpath|id|data-testid|role|internal:[a-z-]+)=/.test(s) || s.startsWith('//');
}

function locatorFor(page, s) {
  return isSelector(s) ? page.locator(s) : page.getByText(s, { exact: true });
}

async function firstVisible(loc, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const n = await loc.count();
    for (let k = 0; k < Math.min(n, 50); k++) {
      const one = loc.nth(k);
      if (await one.isVisible()) return one;
    }
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]).then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }));
  await page.waitForTimeout(60);
}

/**
 * Run one step. Throws an Error whose message names the step when it cannot be done.
 * @param {any} page
 * @param {{ click?: string, set?: object }} step
 * @param {number} n 1-based
 */
export async function runDesignStep(page, step, n) {
  if (step && typeof step.click === 'string') {
    const target = await firstVisible(locatorFor(page, step.click), STEP_TIMEOUT_MS);
    if (!target) throw new Error(`step ${n}: nothing visible matches click ${JSON.stringify(step.click)}`);
    await target.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step && step.set && typeof step.set === 'object') {
    const ok = await page.evaluate((patch) => (typeof window.__deliverySet === 'function' ? window.__deliverySet(patch) : false), step.set);
    if (!ok) throw new Error(`step ${n}: found no design component to set ${JSON.stringify(step.set)} on`);
  } else {
    throw new Error(`step ${n}: not a click or set step (${JSON.stringify(step)})`);
  }
  await settle(page);
}

/**
 * Render the inventory's states.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ paths: import('../core/paths.mjs').FeaturePaths, inventory: object, adapter: string, states?: string[]|null,
 *           port?: number, offline?: boolean, viewport?: { width: number, height: number }, width?: string,
 *           e2eDir?: string|null, playwrightRoot?: string|null, timeZone?: string|null,
 *           snapshotDir?: string, serveDir?: string, outDir?: string }} opts
 *   timeZone: the profile's testData.timeZone, so the design's own dates read in the zone the
 *   shoot's browser uses
 *   snapshotDir, serveDir and outDir default to paths.designSnapshot, paths.designServe and
 *   paths.designRenders; `delivery design review` (plan task 8) renders a different export into its
 *   own scratch folders instead of the run's own snapshot and renders.
 * @returns {Promise<{ rendered: string[], shots: string[], skipped: { id: string, why: string }[], failed: { id: string, why: string }[], escaped: string[], warnings: { id: string, why: string }[], notes: { id: string, why: string }[] }>}
 *   notes: each state whose reach set a state key as a prop, which the render set as a step instead
 */
export async function renderDesign(ctx, opts) {
  const { paths, inventory } = opts;
  const width = opts.width ?? 'desktop';
  const snapshotDir = opts.snapshotDir ?? paths.designSnapshot;
  const serveDir = opts.serveDir ?? paths.designServe;
  const outDir = opts.outDir ?? paths.designRenders;
  // The page's own state keys and props, read before planning so a state key in props becomes a step.
  let design = null;
  if (opts.adapter !== 'image-folder') {
    const dc = await findDcFile(snapshotDir, { page: opts.page ?? null });
    if (!dc.error) design = designReachKeys(await readFile(join(snapshotDir, dc.file), 'utf8').catch(() => ''));
  }
  const plan = planRenders(inventory, { states: opts.states ?? null, adapter: opts.adapter, width, design });
  const outFile = (id, ext) => {
    paths.designRender(id, ext); // checks the id
    return join(outDir, renderFileName(id, width, ext));
  };
  const result = { rendered: [], shots: [], skipped: [], failed: [], escaped: [], warnings: [], notes: [] };
  await ensureDir(outDir);
  for (const p of plan) {
    if (!p.moved) continue;
    const keys = Object.keys(p.moved);
    result.notes.push({ id: p.id, why: `${keys.map((k) => `"${k}"`).join(', ')} ${keys.length > 1 ? 'are state keys' : 'is a state key'} of the design, so the render set ${keys.length > 1 ? 'them' : 'it'} with a {"set": ${JSON.stringify(p.moved)}} step, not as a prop; put that step in the reach` });
  }

  for (const p of plan) {
    if (p.action === 'skip') result.skipped.push({ id: p.id, why: p.why });
    if (p.action === 'fail') result.failed.push({ id: p.id, why: p.why });
    if (p.action === 'shot') {
      const src = join(snapshotDir, p.shot);
      if (extname(src).toLowerCase() !== '.png') { result.failed.push({ id: p.id, why: `shot ${p.shot} is not a png` }); continue; }
      try {
        await copyFile(src, outFile(p.id, 'png'));
        result.shots.push(p.id);
      } catch (err) {
        result.failed.push({ id: p.id, why: `cannot copy shot ${p.shot}: ${err.code ?? err.message}` });
      }
    }
  }
  const toRender = plan.filter((p) => p.action === 'render');
  if (!toRender.length) return result;

  const root = opts.playwrightRoot || ctx.repoRoot;
  const pw = await resolvePlaywright({ repoRoot: root, e2eDir: opts.e2eDir ?? null });
  // The repo's own packages answer the runtime's CDN scripts; a separate Playwright root is a fallback.
  const vendor = vendorResolver([...playwrightSearchDirs(ctx.repoRoot, opts.e2eDir ?? null), ...(opts.playwrightRoot ? [opts.playwrightRoot] : [])]);
  const serve = await prepareServeDir(snapshotDir, serveDir, { page: opts.page ?? null });
  const server = await startStaticServer(serveDir, { port: opts.port ?? 0 });
  const escaped = new Set();
  let pageStateKeys = new Set();
  try { pageStateKeys = designStateKeys(await readFile(join(serveDir, serve.dcFile), 'utf8')); } catch { /* the render names a missing page itself */ }
  let browser;
  try {
    try {
      browser = await pw.chromium.launch({ headless: true });
    } catch (err) {
      throw new ConfigError(`Playwright could not start Chromium: ${String(err.message).split('\n')[0]} (install it with the repo's Playwright: "playwright install chromium")`);
    }
    const previewCache = new Map();
    // Duplicate-picture check (A7): two different states that render byte-identical pictures at
    // this width are refused, unless one names the other with "samePictureAs" in its inventory
    // entry. Scoped to this one call (one width), since desktop and phone renders never collide.
    const seenHashes = new Map();
    const sameEscape = new Map(toRender.filter((p) => p.samePictureAs).map((p) => [p.id, p.samePictureAs]));
    for (const p of toRender) {
      const errors = [];
      const dcFile = p.file ?? serve.dcFile;
      const clash = p.file ? null : propStateClash(p.preset ?? p.props, pageStateKeys);
      if (clash) result.warnings.push({ id: p.id, why: clash });
      let viewport = opts.viewport ?? DEFAULT_VIEWPORT;
      if (p.file) {
        if (!previewCache.has(p.file)) previewCache.set(p.file, await readComponentPreview(serveDir, p.file));
        const { preview, why } = previewCache.get(p.file);
        if (why) { result.failed.push({ id: p.id, why }); continue; }
        if (preview) {
          viewport = previewViewport(preview, width);
        }
      }
      // W3 (D4): the design reads dates in the organisation's zone, as the shoot's browser does.
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', ...(opts.timeZone ? { timezoneId: opts.timeZone } : {}) });
      try {
        await context.addInitScript({ content: SET_STATE_INIT });
        await context.route('**/*', async (route) => {
          const url = route.request().url();
          if (url.startsWith(server.origin) || !/^https?:/i.test(url)) return route.continue();
          const hit = vendor(url);
          if (hit) return route.fulfill({ status: 200, path: hit.path, headers: { 'content-type': contentTypeFor(hit.path), 'access-control-allow-origin': '*' } });
          if (opts.offline) { escaped.add(new URL(url).origin); return route.abort(); }
          return route.continue();
        });
        const page = await context.newPage();
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e.message)));
        const file = p.props ? await writePropCopy(serveDir, dcFile, p.id, p.props) : dcFile;
        await page.goto(server.url(file), { waitUntil: 'load' });
        try {
          await page.waitForSelector(BOOT_SELECTOR, { timeout: BOOT_TIMEOUT_MS });
        } catch {
          // the runtime's own message says more than the browser's "Failed to load resource"
          const why = errors.find((e) => !/^Failed to load resource/.test(e)) ?? errors[0];
          throw new Error(`the design did not boot${why ? `: ${why}` : ''}`);
        }
        await page.addStyleTag({ content: KILL_MOTION_CSS });
        await settle(page);
        const logicError = await page.evaluate(() => { const e = document.querySelector('.sc-logic-error'); return e ? e.textContent : null; });
        if (logicError) throw new Error(`the design's logic failed: ${logicError.trim().slice(0, 200)}`);
        if (p.preset) {
          // Applied after boot as a prop change, never baked in as new defaults and never written
          // to state: presets only run when componentDidUpdate sees the prop change.
          const ok = await page.evaluate((patch) => (typeof window.__deliveryProps === 'function' ? window.__deliveryProps(patch) : false), p.preset);
          if (!ok) throw new Error(`preset: found no design component to set ${JSON.stringify(p.preset)} on`);
          await settle(page);
        }
        for (let i = 0; i < p.steps.length; i++) await runDesignStep(page, p.steps[i], i + 1);
        const hosts = await page.evaluate(() => [...document.querySelectorAll('.sc-host[data-sc-name]')]
          .map((e) => ({ name: e.getAttribute('data-sc-name'), root: e.parentElement?.id === 'dc-root' })));
        await writeFile(outFile(p.id, 'components.json'), JSON.stringify({ names: componentNames(hosts) }, null, 2) + '\n');
        const frames = await page.evaluate(() => ({
          page: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
          frames: [...document.querySelectorAll('iframe')].map((f) => f.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0).map((r) => ({ w: r.width, h: r.height })),
        }));
        const framed = iframeWarning(iframeShare(frames.frames, frames.page));
        if (framed) result.warnings.push({ id: p.id, why: framed });
        const { lines, dom } = await page.evaluate(pageExtract, {});
        const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
        const hash = sha256(png);
        const dupe = seenHashes.get(hash);
        if (dupe && dupe !== p.id && p.samePictureAs !== dupe && sameEscape.get(dupe) !== p.id) {
          throw new Error(`renders the same picture as ${dupe} (sha256 ${hash}); if that is expected, add "samePictureAs": "${dupe}" to ${p.id}'s inventory entry`);
        }
        if (!dupe) seenHashes.set(hash, p.id);
        await writeFile(outFile(p.id, 'png'), png);
        await writeFile(outFile(p.id, 'txt'), linesToText(lines));
        if (width === 'desktop') await writeArtefact(paths, 'design-dom', dom, { key: p.id });
        else await writeFile(outFile(p.id, 'dom.json'), JSON.stringify(dom, null, 2) + '\n');
        result.rendered.push(p.id);
      } catch (err) {
        result.failed.push({ id: p.id, why: String(err.message).split('\n')[0] });
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
  result.escaped = [...escaped].sort();
  return result;
}
