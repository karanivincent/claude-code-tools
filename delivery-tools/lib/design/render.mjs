// Design render (spec 4.2 step 3): serve the snapshot, bring each inventory state up in a browser by
// its click path or prop values, and save what the page shows: <ID>.png, <ID>.txt (one line per
// text element, read from the rendered page, never transcribed from source) and <ID>.dom.json.

import { copyFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { ensureDir } from '../core/fs.mjs';
import { writeArtefact } from '../core/artefacts.mjs';
import { resolvePlaywright, playwrightSearchDirs } from '../core/playwright.mjs';
import { ConfigError } from '../core/exit.mjs';
import { startStaticServer, contentTypeFor } from './server.mjs';
import { prepareServeDir, writePropCopy } from './serve.mjs';
import { vendorResolver } from './vendor.mjs';
import { pageExtract, linesToText } from '../capture/page-extract.mjs';
import { itemKey } from '../picture/widths.mjs';

export const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const BOOT_SELECTOR = '#dc-root .sc-host';
const STEP_TIMEOUT_MS = 5000;
const BOOT_TIMEOUT_MS = 20000;

const KILL_MOTION_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

// Installed before any page script: reaches the design component's own state through React's
// fiber on the root host element, which is what a {set: {...}} step writes to.
const SET_STATE_INIT = `window.__deliverySet = function (patch) {
  var hosts = document.querySelectorAll('.sc-host[data-sc-name]');
  for (var h = 0; h < hosts.length; h++) {
    var el = hosts[h], keys = Object.keys(el), f = null;
    for (var k = 0; k < keys.length; k++) if (keys[k].indexOf('__reactFiber$') === 0) f = el[keys[k]];
    for (; f; f = f.return) {
      var sn = f.stateNode;
      if (sn && sn.logic && typeof sn.logic.setState === 'function') { sn.logic.setState(patch); return true; }
    }
  }
  return false;
};`;

/**
 * What to do for each state (pure).
 * @param {object} inventory
 * @param {{ states?: string[]|null, adapter: string }} opts
 * @returns {{ id: string, action: 'render'|'shot'|'skip'|'fail', why?: string, steps?: object[], props?: object|null, shot?: string }[]}
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
    if (reach.kind === 'prop' && !props) { out.push({ id: s.id, action: 'fail', why: 'a prop state names no props' }); continue; }
    out.push({ id: s.id, action: 'render', steps: reach.steps ?? [], props });
  }
  return out;
}

/**
 * A design render's file name. Desktop keeps "<ID>.<ext>"; any other named width adds "@<width>":
 * "<ID>@phone.png".
 */
export function renderFileName(id, width, ext) {
  return `${itemKey(id, width ?? 'desktop')}.${ext}`;
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
 *           e2eDir?: string|null, playwrightRoot?: string|null }} opts
 * @returns {Promise<{ rendered: string[], shots: string[], skipped: { id: string, why: string }[], failed: { id: string, why: string }[], escaped: string[] }>}
 */
export async function renderDesign(ctx, opts) {
  const { paths, inventory } = opts;
  const width = opts.width ?? 'desktop';
  const plan = planRenders(inventory, { states: opts.states ?? null, adapter: opts.adapter, width });
  const outFile = (id, ext) => {
    paths.designRender(id, ext); // checks the id
    return join(paths.designRenders, renderFileName(id, width, ext));
  };
  const result = { rendered: [], shots: [], skipped: [], failed: [], escaped: [] };
  await ensureDir(paths.designRenders);

  for (const p of plan) {
    if (p.action === 'skip') result.skipped.push({ id: p.id, why: p.why });
    if (p.action === 'fail') result.failed.push({ id: p.id, why: p.why });
    if (p.action === 'shot') {
      const src = join(paths.designSnapshot, p.shot);
      if (extname(src).toLowerCase() !== '.png') { result.failed.push({ id: p.id, why: `shot ${p.shot} is not a png` }); continue; }
      try {
        await copyFile(src, paths.designRender(p.id, 'png'));
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
  const serve = await prepareServeDir(paths.designSnapshot, paths.designServe);
  const server = await startStaticServer(paths.designServe, { port: opts.port ?? 0 });
  const escaped = new Set();
  let browser;
  try {
    try {
      browser = await pw.chromium.launch({ headless: true });
    } catch (err) {
      throw new ConfigError(`Playwright could not start Chromium: ${String(err.message).split('\n')[0]} (install it with the repo's Playwright: "playwright install chromium")`);
    }
    for (const p of toRender) {
      const errors = [];
      const context = await browser.newContext({ viewport: opts.viewport ?? DEFAULT_VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US' });
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
        const file = p.props ? await writePropCopy(paths.designServe, serve.dcFile, p.id, p.props) : serve.dcFile;
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
        for (let i = 0; i < p.steps.length; i++) await runDesignStep(page, p.steps[i], i + 1);
        const { lines, dom } = await page.evaluate(pageExtract, {});
        const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
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
