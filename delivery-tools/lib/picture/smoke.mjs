// delivery smoke (W2 of the 2026-09-30 improvement plan): the page loads before anything is
// pictured. Opens each distinct route the map reaches, signed in as a user who reaches it, at each
// width, and stops at the first route that answers 500 or more, shows the Next.js error overlay,
// serves a replaced build output, or still shows a loading placeholder after ten seconds. Pure
// helpers first; runSmoke drives a browser.

import { mkdir } from 'node:fs/promises';
import { reachSteps } from './map.mjs';
import { openSignedIn, selectStates } from './shoot.mjs';

/** The loading placeholders a page shows until its data arrives, when the profile names none. */
export const SKELETON_DEFAULT = Object.freeze(['[aria-busy=true]', '[data-skeleton]']);
/** How long a placeholder may stay before the page counts as not loading. */
export const SKELETON_WAIT_MS = 10000;
const GOTO_TIMEOUT_MS = 60000; // a dev server compiles a route on its first visit

/** An error a dev server gives when its build output was replaced under it (Next.js: a missing chunk). */
export const REPLACED_OUTPUT = /Cannot find module|ENOENT[^\n]*(\.next|dist|build)\/|vendor-chunks/i;

/** The profile's skeleton selector (smoke.skeleton), else the defaults, as one CSS selector list. */
export function skeletonSelector(profile) {
  const own = profile?.smoke?.skeleton;
  const list = Array.isArray(own) ? own : typeof own === 'string' ? [own] : [];
  return (list.length ? list : SKELETON_DEFAULT).join(', ');
}

/**
 * What smoke opens: each distinct route (by path) the chosen items reach, the map's landing route
 * first, at each width they are taken at, with the first user who reaches it there. A route keeps
 * the first full path seen for it, query included, since some routes need their parameters.
 * Grouped so one browser context signs in once per user and width.
 * @param {object} map
 * @param {{ width: string, state: object }[]} [items] from selectStates (default: all of the map's)
 * @returns {{ route: string, width: string, world: string, role: string }[]}
 */
export function smokeTargets(map, items = selectStates(map).items) {
  const seen = new Map();
  const pathOf = (r) => { try { return new URL(r, 'http://x').pathname; } catch { return r; } };
  for (const it of items) {
    const { world, role } = it.state.reach ?? {};
    if (!world || !role) continue;
    const routes = [map.route, ...reachSteps(it.state, it.width).filter((s) => typeof s.goto === 'string').map((s) => s.goto)];
    for (const route of routes) {
      const key = `${it.width} ${pathOf(route)}`;
      if (!seen.has(key)) seen.set(key, { route, width: it.width, world, role });
    }
  }
  const groups = new Map();
  for (const t of seen.values()) {
    const g = `${t.world}::${t.role}::${t.width}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  return [...groups.values()].flat();
}

/**
 * Why a page that was opened is broken, or null (pure).
 * @param {{ status: number|null, body?: string, overlay?: string|null, skeletons?: number, selector?: string, waitMs?: number }} sig
 */
export function pageProblem(sig) {
  if (typeof sig.status === 'number' && sig.status >= 500) {
    return REPLACED_OUTPUT.test(sig.body ?? '') ? `it answers ${sig.status}: its build output is missing files (a production build probably replaced it)` : `it answers ${sig.status}`;
  }
  if (REPLACED_OUTPUT.test(sig.body ?? '')) return 'its build output is missing files (a production build probably replaced it)';
  if (sig.overlay) return `it shows the Next.js error overlay: ${sig.overlay}`;
  if (sig.skeletons > 0) return `it still shows ${sig.skeletons} loading placeholder(s) (${sig.selector}) after ${Math.round((sig.waitMs ?? SKELETON_WAIT_MS) / 1000)} s`;
  return null;
}

// Run in the page. The dev overlay lives in <nextjs-portal>'s shadow root; its dialog is open only
// for an error (the collapsed issues badge is not one). A crash with no overlay leaves Next's own
// error text in the body.
export function nextErrorOverlay() {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  for (const host of document.querySelectorAll('nextjs-portal')) {
    const root = host.shadowRoot;
    const dialog = root && root.querySelector('[data-nextjs-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]');
    if (dialog) return clean(dialog.textContent) || 'an error';
  }
  const body = document.body ? document.body.innerText : '';
  const m = /Application error: a (client|server)-side exception has occurred|Unhandled Runtime Error|Failed to compile/.exec(body);
  return m ? m[0] : null;
}

// Run in the page: how many elements matching the selector are on screen.
export function countVisible(selector) {
  return [...document.querySelectorAll(selector)].filter((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
  }).length;
}

/**
 * Open one page and read what makes it broken.
 * @returns {Promise<{ status: number|null, body: string, overlay: string|null, skeletons: number }>}
 */
async function openPage(page, url, o) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  const status = res ? res.status() : null;
  const body = res && status >= 400 ? await res.text().catch(() => '') : '';
  if (typeof status === 'number' && status >= 500) return { status, body, overlay: null, skeletons: 0 };
  const overlay = await page.evaluate(nextErrorOverlay).catch(() => null);
  if (overlay) return { status, body, overlay, skeletons: 0 };
  const deadline = o.now() + o.waitMs;
  let skeletons = 0;
  for (;;) {
    skeletons = await page.evaluate(countVisible, o.selector);
    if (!skeletons || o.now() >= deadline) break;
    await o.sleep(250);
  }
  // A page can crash while its data loads: look for the overlay again once it has settled.
  const late = await page.evaluate(nextErrorOverlay).catch(() => null);
  return { status, body, overlay: late, skeletons };
}

/**
 * Open every target, signed in; stop at the first broken page.
 * @param {object} o
 * @param {object} o.map
 * @param {object[]} [o.items]   from selectStates; default every item of the map
 * @param {string} o.baseUrl
 * @param {string} o.sessionsDir
 * @param {string} o.magicLinkPath
 * @param {{ signInHash: (email: string) => Promise<string> }} o.auth
 * @param {any} o.chromium
 * @param {string} [o.selector]  the skeleton selector (skeletonSelector(profile))
 * @param {number} [o.waitMs]
 * @param {string|null} [o.timeZone]
 * @param {(line: string) => void} [o.log]
 * @returns {Promise<{ checked: { route: string, width: string, user: string, status: number|null }[],
 *   failure: { route: string, width: string, user: string, why: string } | null }>}
 */
export async function runSmoke(o) {
  const opts = {
    selector: o.selector ?? SKELETON_DEFAULT.join(', '),
    waitMs: o.waitMs ?? SKELETON_WAIT_MS,
    now: o.now ?? (() => Date.now()),
    sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
  };
  const log = o.log ?? (() => {});
  const targets = smokeTargets(o.map, o.items);
  const checked = [];
  if (!targets.length) return { checked, failure: null };
  await mkdir(o.sessionsDir, { recursive: true });
  const browser = await o.chromium.launch();
  let ip = 120; // its own addresses, apart from the shoot's
  try {
    let open = null; // { key, context, page }
    for (const t of targets) {
      const user = (o.map.worlds ?? []).find((w) => w.id === t.world)?.users?.find((u) => u.role === t.role) ?? null;
      const who = `${t.world}/${t.role}`;
      if (!user) return { checked, failure: { route: t.route, width: t.width, user: who, why: `world ${t.world} has no ${t.role} user` } };
      const key = `${who}::${t.width}`;
      if (open?.key !== key) {
        if (open) await open.context.close().catch(() => {});
        try {
          open = { key, ...(await openSignedIn(browser, o, { world: t.world, role: t.role, width: t.width }, user, ip++)) };
        } catch (err) {
          return { checked, failure: { route: o.map.route, width: t.width, user: who, why: `signing in failed: ${String(err?.message ?? err).split('\n')[0]}` } };
        }
      }
      let why;
      let status = null;
      try {
        const sig = await openPage(open.page, new URL(t.route, o.baseUrl).toString(), opts);
        status = sig.status;
        why = pageProblem({ ...sig, selector: opts.selector, waitMs: opts.waitMs });
      } catch (err) {
        why = `it did not load: ${String(err?.message ?? err).split('\n')[0]}`;
      }
      checked.push({ route: t.route, width: t.width, user: who, status });
      if (why) {
        log(`✖ ${t.route} at ${t.width} as ${who}: ${why}`);
        await open.context.close().catch(() => {});
        return { checked, failure: { route: t.route, width: t.width, user: who, why } };
      }
      log(`✔ ${t.route} at ${t.width} as ${who}${status ? ` (${status})` : ''}`);
    }
    if (open) await open.context.close().catch(() => {});
    return { checked, failure: null };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** One line naming a smoke failure. */
export function smokeFailureLine(f, baseUrl) {
  return `${f.route} at ${f.width} (as ${f.user}) on ${baseUrl} is broken: ${f.why}. Fix the page, or restart the dev server if a build replaced its output, then run delivery smoke again`;
}

/**
 * Ask the app once. Returns why it is broken, or null when it serves (or cannot be asked at all: the
 * shoot then reports each state it could not reach, as before). A production build run in the
 * run's worktree while the dev server served it replaced the server's output, and every page
 * returned 404 or 500: a builder lost a whole round of pictures to it.
 * @param {{ fetch: typeof fetch }} ctx
 * @param {string} baseUrl
 */
export async function probeServer(ctx, baseUrl) {
  let res;
  try {
    res = await ctx.fetch(baseUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  } catch {
    return null;
  }
  const body = res.status >= 400 ? await res.text().catch(() => '') : '';
  if (res.status >= 500 || REPLACED_OUTPUT.test(body)) {
    const why = REPLACED_OUTPUT.test(body) ? 'its build output is missing files (a production build probably replaced it)' : `it answers ${res.status}`;
    return `the app at ${baseUrl} is broken: ${why}. Restart the dev server, and never run the build in the run's worktree while it serves`;
  }
  return null;
}

