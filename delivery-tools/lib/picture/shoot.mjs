// delivery shoot (picture mode): sign in as each state's fixture user, walk its reach steps, and
// picture the page's own area at full height, next to the design picture cropped the same way. It
// also records which of the state's buttons are on the page. Pure helpers first; runShoot drives a
// browser and is only called by the command.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writesData } from './map.mjs';

export const SAFE_TO_CLICK = new Set(['none', 'free']);
const MAX_HEIGHT = 8000;

/**
 * The states a shoot takes: every capture-reachable state, or the ids given; an id starting with
 * "!" leaves that state out.
 * @param {object} map
 * @param {string[]} picks
 * @returns {{ states: object[], unknown: string[] }}
 */
export function selectStates(map, picks = []) {
  const skip = new Set(picks.filter((p) => p.startsWith('!')).map((p) => p.slice(1)));
  const want = picks.filter((p) => !p.startsWith('!'));
  const all = map.states ?? [];
  const known = new Set(all.map((s) => s.id));
  const unknown = [...want, ...skip].filter((id) => !known.has(id));
  const states = all.filter((s) => s.reach && !s.reach.test && !skip.has(s.id) && (!want.length || want.includes(s.id)));
  return { states, unknown };
}

/**
 * Capture order: one group per fixture user, in first-seen order, and inside each group the states
 * that change data (a save, a discard, an add) last, so they cannot change what an earlier state
 * shows. Groups that write come after groups that do not.
 */
export function captureOrder(states, map) {
  const groups = new Map();
  for (const s of states) {
    const key = `${s.reach.world}::${s.reach.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const [key, list] of groups) {
    const reads = list.filter((s) => !writesData(s, map));
    const writes = list.filter((s) => writesData(s, map));
    const [world, role] = key.split('::');
    out.push({ world, role, states: [...reads, ...writes], writes: writes.map((s) => s.id) });
  }
  return out.sort((a, b) => Number(a.writes.length > 0) - Number(b.writes.length > 0));
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

/** Plain summary lines for one state's result. */
export function resultLine(id, rec) {
  const missing = rec.buttons.filter((b) => b.shouldBe === 'shown' && !b.onPage).map((b) => b.label);
  const leaked = rec.buttons.filter((b) => b.shouldBe === 'hidden' && b.onPage).map((b) => b.label);
  return `${id} ${rec.reached ? 'reached' : 'NOT REACHED'}`
    + (missing.length ? ` · missing: ${missing.join(', ')}` : '')
    + (leaked.length ? ` · shown to a member: ${leaked.join(', ')}` : '')
    + (rec.problems.length ? ` · ${rec.problems[0]}` : '');
}

// ---- Browser side: functions passed to page.evaluate, so they must not close over anything. ----

/** How much taller the page's own scroll areas are than the window. */
function extraScrollHeight() {
  let most = 0;
  for (const el of document.querySelectorAll('*')) {
    const st = getComputedStyle(el);
    if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4) most = Math.max(most, el.scrollHeight - el.clientHeight);
  }
  return most;
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

/**
 * @param {object} o
 * @param {object} o.map
 * @param {object[]} o.states       from selectStates
 * @param {string} o.baseUrl
 * @param {string} o.outDir         the round's folder
 * @param {string} o.designDir      the run's design renders
 * @param {string} o.sessionsDir
 * @param {string} o.magicLinkPath
 * @param {{ signInHash: (email: string) => Promise<string> }} o.auth
 * @param {any} o.chromium
 * @param {(line: string) => void} o.log
 * @returns {Promise<Record<string, object>>}
 */
export async function runShoot(o) {
  await mkdir(o.outDir, { recursive: true });
  await mkdir(o.sessionsDir, { recursive: true });
  const left = o.map.pageArea?.left ?? 240;
  const designLeft = o.map.pageArea?.designLeft ?? left;
  const landing = o.map.route;
  const browser = await o.chromium.launch();
  const report = {};
  let ip = 20;
  try {
    for (const group of captureOrder(o.states, o.map)) {
      const user = userFor(o.map, group.world, group.role);
      if (!user) {
        for (const s of group.states) report[s.id] = { user: null, reached: false, problems: [`world ${group.world} has no ${group.role} user`], buttons: [] };
        continue;
      }
      const host = new URL(o.baseUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
      const sessionFile = join(o.sessionsDir, `shoot-${host}-${group.world}-${group.role}.json`);
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
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
      for (const s of group.states) {
        report[s.id] = await shootState(page, s, o, left);
        o.log(resultLine(s.id, report[s.id]));
      }
      await context.close();
    }
    await cropDesigns(browser, o, designLeft, Object.keys(report));
  } finally {
    await browser.close();
  }
  return report;
}

async function shootState(page, s, o, left) {
  const rec = { user: `${s.reach.world}/${s.reach.role}`, reached: true, problems: [], buttons: [], writes: writesData(s, o.map) };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (s.reach.intercept) {
    const ic = s.reach.intercept;
    await page.route((u) => u.pathname === ic.url, (route) => (route.request().method() === ic.method
      ? route.fulfill({ status: ic.status ?? 200, contentType: 'application/json', body: typeof ic.body === 'string' ? ic.body : JSON.stringify(ic.body ?? {}) })
      : route.continue()));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  try {
    for (const step of s.reach.steps) {
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
    const hidden = s.reach.role === 'member' && b.member === 'hidden';
    rec.buttons.push({ label: b.label ?? b.testid, testid: b.testid, opens: b.opens ?? null, onPage, shouldBe: hidden ? 'hidden' : 'shown' });
  }
  const extra = await page.evaluate(extraScrollHeight);
  const height = Math.min(900 + extra, MAX_HEIGHT);
  await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(300);
  const top = await page.evaluate(pageAreaTop, left);
  await page.screenshot({ path: join(o.outDir, `${s.id}.live.png`), clip: { x: left, y: top, width: 1440 - left, height: height - top }, animations: 'disabled', caret: 'hide' });
  return rec;
}

/** The design picture of each state, cropped to the page area the same way. */
async function cropDesigns(browser, o, designLeft, ids) {
  const page = await browser.newPage();
  try {
    for (const id of ids) {
      const src = join(o.designDir, `${id}.png`);
      if (!existsSync(src)) continue;
      const data = readFileSync(src).toString('base64');
      await page.setContent(`<body style="margin:0"><img id="d" src="data:image/png;base64,${data}"></body>`);
      const size = await page.evaluate(() => new Promise((res) => {
        const img = document.getElementById('d');
        const done = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        if (img.complete) done(); else img.onload = done;
      }));
      await page.setViewportSize({ width: Math.max(1, size.w), height: Math.max(1, Math.min(size.h, MAX_HEIGHT)) });
      await page.screenshot({ path: join(o.outDir, `${id}.design.png`), clip: { x: designLeft, y: 0, width: Math.max(1, size.w - designLeft), height: Math.min(size.h, MAX_HEIGHT) } });
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
