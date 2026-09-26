// delivery shoot (picture mode): sign in as each state's fixture user, walk its reach steps, and
// picture the page's own area at full height, next to the design picture cropped the same way, at
// every width the map declares (an "item" is a state at a width). It also records which of the
// state's buttons are on the page and, at phone width, whether the page scrolls sideways. Pure
// helpers first; runShoot drives a browser and is only called by the command.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reachSteps, writesData } from './map.mjs';
import { WIDTHS, cropFor, designFileCandidates, mapItems, overflowProblem, roundFiles } from './widths.mjs';

export const SAFE_TO_CLICK = new Set(['none', 'free']);
const MAX_HEIGHT = 8000;

/**
 * The items a shoot takes: every capture-reachable state at each of its widths, or the ones picked.
 * "KC-05" picks the state at every width, "KC-05@phone" (or "KC-05@desktop") one width; a pick
 * starting with "!" leaves those items out.
 * @param {object} map
 * @param {string[]} picks
 * @returns {{ items: { key: string, id: string, width: string, state: object }[], states: object[], unknown: string[] }}
 */
export function selectStates(map, picks = []) {
  const parse = (p) => { const at = p.lastIndexOf('@'); return at > 0 ? { id: p.slice(0, at), width: p.slice(at + 1), raw: p } : { id: p, width: null, raw: p }; };
  const skip = picks.filter((p) => p.startsWith('!')).map((p) => parse(p.slice(1)));
  const want = picks.filter((p) => !p.startsWith('!')).map(parse);
  const all = mapItems(map);
  const hits = (pick, item) => pick.id === item.id && (pick.width === null || pick.width === item.width);
  const unknown = [...want, ...skip].filter((p) => !all.some((i) => hits(p, i))).map((p) => p.raw);
  const items = all.filter((i) => i.state.reach && !i.state.reach.test
    && !skip.some((p) => hits(p, i)) && (!want.length || want.some((p) => hits(p, i))));
  const states = [...new Set(items.map((i) => i.state))];
  return { items, states, unknown };
}

/**
 * Capture order. One group per fixture user, in first-seen order; groups that change data (a save,
 * a discard, an add) come after groups that do not. Inside a group, every width's reading items
 * come before any width's writing items, so a save at one width cannot change what another width
 * reads. Each entry is one browser context at one width: consecutive entries at the same width are
 * joined, so a desktop-only group is one entry with its writing items last.
 * @returns {{ width: string, world: string, role: string, items: object[], writes: string[] }[]}
 */
export function captureOrder(items, map) {
  const groups = new Map();
  for (const it of items) {
    const key = `${it.state.reach.world}::${it.state.reach.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const ordered = [];
  for (const [key, list] of groups) {
    const [world, role] = key.split('::');
    const widths = [...new Set(list.map((i) => i.width))];
    const writes = (i) => writesData(i.state, map, i.width);
    const entries = [];
    for (const w of widths) entries.push({ width: w, world, role, items: list.filter((i) => i.width === w && !writes(i)), writes: [] });
    for (const w of [...widths].reverse()) {
      const ws = list.filter((i) => i.width === w && writes(i));
      entries.push({ width: w, world, role, items: ws, writes: ws.map((i) => i.key) });
    }
    const joined = [];
    for (const e of entries.filter((x) => x.items.length)) {
      const prev = joined[joined.length - 1];
      if (prev && prev.width === e.width) { prev.items.push(...e.items); prev.writes.push(...e.writes); } else joined.push(e);
    }
    ordered.push({ writes: list.some(writes), entries: joined });
  }
  return ordered.sort((a, b) => Number(a.writes) - Number(b.writes)).flatMap((g) => g.entries);
}

/** The fixture user a world gives a role. */
export function userFor(map, world, role) {
  return (map.worlds ?? []).find((w) => w.id === world)?.users?.find((u) => u.role === role) ?? null;
}

/** The sign-in URL: the app's magic-link path with the token and where to land. */
export function signInUrl(baseUrl, path, hash, next) {
  const u = new URL(path, baseUrl);
  u.searchParams.set('token_hash', hash);
  u.searchParams.set('type', 'magiclink');
  u.searchParams.set('next', next);
  return u.toString();
}

/** Local dev servers rate-limit sign-in per address; a shoot gives each browser its own. */
export function isLocal(baseUrl) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname); } catch { return false; }
}

/** A CSS selector for a test id, matching "<id>" and "<id>-<n>" (one per row). */
export function testidSelector(t) {
  const q = String(t).replace(/"/g, '\\"');
  return `[data-testid="${q}"], [data-testid^="${q}-"]`;
}

/** The plain summary line for one item's result. */
export function resultLine(id, rec) {
  const missing = rec.buttons.filter((b) => b.shouldBe === 'shown' && !b.onPage).map((b) => b.label);
  const leaked = rec.buttons.filter((b) => b.shouldBe === 'hidden' && b.onPage);
  const toMember = leaked.filter((b) => !b.hiddenAt).map((b) => b.label);
  const atWidth = leaked.filter((b) => b.hiddenAt).map((b) => b.label);
  return `${id} ${rec.reached ? 'reached' : 'NOT REACHED'}`
    + (missing.length ? ` · missing: ${missing.join(', ')}` : '')
    + (toMember.length ? ` · shown to a member: ${toMember.join(', ')}` : '')
    + (atWidth.length ? ` · shown at ${rec.width} width: ${atWidth.join(', ')}` : '')
    + (rec.problems.length ? ` · ${rec.problems.join(' · ')}` : '');
}

/**
 * Whether a button should be on the page for this item: hidden from a member when the map says
 * member "hidden", hidden on a phone for phone "hidden", and hidden on the desktop for phone
 * "shown" (a control only the phone layout has, such as the menu button).
 * @returns {{ shouldBe: 'shown'|'hidden', hiddenAt?: string }}
 */
export function buttonExpectation(button, role, width) {
  if (role === 'member' && button.member === 'hidden') return { shouldBe: 'hidden' };
  if (width === 'phone' && button.phone === 'hidden') return { shouldBe: 'hidden', hiddenAt: width };
  if (width !== 'phone' && button.phone === 'shown') return { shouldBe: 'hidden', hiddenAt: width };
  return { shouldBe: 'shown' };
}

// ---- Browser side: functions passed to page.evaluate, so they must not close over anything. ----

/**
 * How much taller the page's own scroll areas are than the window. With withDocument (the phone,
 * where a page usually scrolls as a whole), the document's own scroll counts too.
 */
function extraScrollHeight(withDocument) {
  let most = 0;
  for (const el of document.querySelectorAll('*')) {
    const st = getComputedStyle(el);
    if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4) most = Math.max(most, el.scrollHeight - el.clientHeight);
  }
  if (withDocument) most = Math.max(most, document.documentElement.scrollHeight - window.innerHeight);
  return most;
}

/** The document's width against the window's, for the sideways-scroll check. */
function documentWidth() {
  return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
}

/**
 * A bar fixed along the bottom of the window across (nearly) its full width: a phone's tab bar.
 * It is the app's shared navigation, like the desktop sidebar, so it is hidden before the
 * picture rather than graded. Pure; the page-side copy below applies the same rule.
 * @param {{ bottom: number, width: number, height: number }} box
 */
export function isBottomBar(box, viewportWidth, viewportHeight) {
  return box.height > 0 && box.height <= BOTTOM_BAR_MAX && box.width >= viewportWidth * 0.9 && Math.abs(box.bottom - viewportHeight) <= 2;
}
const BOTTOM_BAR_MAX = 160;

/** Hide every fixed bottom bar (isBottomBar's rule, in the page). Returns how many. */
function hideBottomBars(max) {
  let n = 0;
  // Dev-server overlays (TanStack Query devtools, the Next.js indicator) exist only locally; a
  // preview never shows them, so neither may a picture.
  for (const d of document.querySelectorAll('.tsqd-parent-container, .tsqd-open-btn-container, nextjs-portal, [data-nextjs-dev-tools-button]')) {
    d.style.setProperty('visibility', 'hidden', 'important');
    n += 1;
  }
  for (const d of document.querySelectorAll('body *')) {
    const st = getComputedStyle(d);
    if (st.position !== 'fixed' || st.display === 'none' || st.visibility === 'hidden') continue;
    const b = d.getBoundingClientRect();
    if (b.height > 0 && b.height <= max && b.width >= window.innerWidth * 0.9 && Math.abs(b.bottom - window.innerHeight) <= 2) {
      d.style.setProperty('visibility', 'hidden', 'important');
      n += 1;
    }
  }
  return n;
}

/** Top of the page area: the page title less a margin, raised to any open panel or dialog. */
function pageAreaTop(left) {
  const h = [...document.querySelectorAll('h1')].find((e) => e.getBoundingClientRect().left >= left - 8);
  let t = h ? Math.floor(h.getBoundingClientRect().top) - 24 : 0;
  // A side panel or dialog: a dialog role, or any large fixed box inside the page area (a sidebar
  // starts left of it, a top bar is too short to count).
  for (const d of document.querySelectorAll('body *')) {
    const st = getComputedStyle(d);
    const isDialog = d.getAttribute('role') === 'dialog';
    if (!isDialog && st.position !== 'fixed') continue;
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
    const b = d.getBoundingClientRect();
    if (b.width < 200 || b.height < 200 || b.left < left - 8) continue;
    t = Math.min(t, Math.floor(b.top));
  }
  return Math.max(0, t);
}

// ---- The run. ----

/** The browser context options for a width: the phone is a touch device at its own viewport. */
export function contextOptions(width) {
  const viewport = { ...WIDTHS[width] };
  return width === 'phone' ? { viewport, isMobile: true, hasTouch: true } : { viewport };
}

/**
 * @param {object} o
 * @param {object} o.map
 * @param {object[]} o.items        from selectStates
 * @param {string} o.baseUrl
 * @param {string} o.outDir         the round's folder
 * @param {string} o.designDir      the run's design renders
 * @param {string} o.sessionsDir
 * @param {string} o.magicLinkPath
 * @param {{ signInHash: (email: string) => Promise<string> }} o.auth
 * @param {any} o.chromium
 * @param {(line: string) => void} o.log
 * @returns {Promise<Record<string, object>>} keyed by item key
 */
export async function runShoot(o) {
  await mkdir(o.outDir, { recursive: true });
  await mkdir(o.sessionsDir, { recursive: true });
  const landing = o.map.route;
  const browser = await o.chromium.launch();
  const report = {};
  let ip = 20;
  try {
    for (const entry of captureOrder(o.items, o.map)) {
      const user = userFor(o.map, entry.world, entry.role);
      if (!user) {
        for (const it of entry.items) report[it.key] = { user: null, width: it.width, reached: false, problems: [`world ${entry.world} has no ${entry.role} user`], buttons: [] };
        continue;
      }
      const host = new URL(o.baseUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
      const sessionFile = join(o.sessionsDir, `shoot-${host}-${entry.world}-${entry.role}.json`);
      const context = await browser.newContext({
        ...contextOptions(entry.width),
        ...(isLocal(o.baseUrl) ? { extraHTTPHeaders: { 'x-real-ip': `10.77.0.${ip++ % 250}` } } : {}),
        ...(existsSync(sessionFile) ? { storageState: sessionFile } : {}),
      });
      const page = await context.newPage();
      await page.goto(new URL(landing, o.baseUrl).toString(), { waitUntil: 'networkidle' }).catch(() => {});
      if (!new URL(page.url()).pathname.startsWith(landing)) {
        const hash = await o.auth.signInHash(user.email);
        await page.goto(signInUrl(o.baseUrl, o.magicLinkPath, hash, landing), { waitUntil: 'networkidle' });
        await context.storageState({ path: sessionFile });
      }
      for (const it of entry.items) {
        report[it.key] = await shootItem(page, it, o);
        o.log(resultLine(it.key, report[it.key]));
      }
      await context.close();
    }
    await cropDesigns(browser, o, o.items);
  } finally {
    await browser.close();
  }
  return report;
}

async function shootItem(page, it, o) {
  const s = it.state;
  const size = WIDTHS[it.width];
  const { left } = cropFor(o.map, it.width);
  const rec = { user: `${s.reach.world}/${s.reach.role}`, width: it.width, reached: true, problems: [], buttons: [], writes: writesData(s, o.map, it.width) };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (s.reach.intercept) {
    const ic = s.reach.intercept;
    await page.route((u) => u.pathname === ic.url, (route) => (route.request().method() === ic.method
      ? route.fulfill({ status: ic.status ?? 200, contentType: 'application/json', body: typeof ic.body === 'string' ? ic.body : JSON.stringify(ic.body ?? {}) })
      : route.continue()));
  }
  await page.setViewportSize({ width: size.width, height: size.height });
  try {
    for (const step of reachSteps(s, it.width)) {
      if (step.goto) await page.goto(new URL(step.goto, o.baseUrl).toString(), { waitUntil: 'networkidle' });
      else if (step.click) {
        let loc = step.click.testid ? page.locator(testidSelector(step.click.testid)) : page.getByRole(step.click.role ?? 'button', { name: step.click.name });
        if (step.click.testid && step.click.name) loc = loc.filter({ hasText: step.click.name });
        await loc.first().click({ timeout: 8000 });
      } else if (step.type) {
        await page.locator(testidSelector(step.type.testid)).first().fill(step.type.text, { timeout: 8000 });
      } else if (step.open) {
        const g = page.locator(testidSelector(step.open.testid)).first();
        if ((await g.getAttribute('aria-expanded', { timeout: 8000 })) === 'false') await g.click();
      }
      await page.waitForTimeout(400);
    }
  } catch (err) {
    rec.reached = false;
    rec.problems.push(String(err?.message ?? err).split('\n')[0]);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  for (const b of s.buttons ?? []) {
    if (!b.testid) continue;
    const onPage = await page.locator(testidSelector(b.testid)).first().isVisible().catch(() => false);
    rec.buttons.push({ label: b.label ?? b.testid, testid: b.testid, opens: b.opens ?? null, onPage, ...buttonExpectation(b, s.reach.role, it.width) });
  }
  const phone = it.width === 'phone';
  if (phone && rec.reached) {
    const w = await page.evaluate(documentWidth).catch(() => null);
    const over = w ? overflowProblem(w.scrollWidth, w.innerWidth) : null;
    if (over) { rec.overflow = over.by; rec.problems.push(over.problem); }
  }
  const extra = await page.evaluate(extraScrollHeight, phone);
  const height = Math.min(size.height + extra, MAX_HEIGHT);
  await page.setViewportSize({ width: size.width, height });
  await page.waitForTimeout(300);
  const top = await page.evaluate(pageAreaTop, left);
  if (phone) await page.evaluate(hideBottomBars, BOTTOM_BAR_MAX).catch(() => 0);
  await page.screenshot({ path: join(o.outDir, roundFiles(it.key).live), clip: { x: left, y: top, width: size.width - left, height: height - top }, animations: 'disabled', caret: 'hide' });
  return rec;
}

/** The design picture of each item, cropped to the page area at its width the same way. */
async function cropDesigns(browser, o, items) {
  const page = await browser.newPage();
  try {
    for (const it of items) {
      const file = designFileCandidates(it.state, it.width).find((f) => existsSync(join(o.designDir, f)));
      if (!file) continue;
      const { designLeft } = cropFor(o.map, it.width);
      const data = readFileSync(join(o.designDir, file)).toString('base64');
      await page.setContent(`<body style="margin:0"><img id="d" src="data:image/png;base64,${data}"></body>`);
      const size = await page.evaluate(() => new Promise((res) => {
        const img = document.getElementById('d');
        const done = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        if (img.complete) done(); else img.onload = done;
      }));
      await page.setViewportSize({ width: Math.max(1, size.w), height: Math.max(1, Math.min(size.h, MAX_HEIGHT)) });
      await page.screenshot({ path: join(o.outDir, roundFiles(it.key).design), clip: { x: designLeft, y: 0, width: Math.max(1, size.w - designLeft), height: Math.min(size.h, MAX_HEIGHT) } });
    }
  } finally {
    await page.close();
  }
}

/** Merge a shoot's results into the round's shoot.json (a second pass adds to the first). */
export async function writeShootJson(outDir, { baseUrl, at, report }) {
  const file = join(outDir, 'shoot.json');
  const prior = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { states: {} };
  const doc = { schemaVersion: 1, baseUrl, at, states: { ...prior.states, ...report } };
  await writeFile(file, JSON.stringify(doc, null, 1) + '\n');
  return doc;
}
