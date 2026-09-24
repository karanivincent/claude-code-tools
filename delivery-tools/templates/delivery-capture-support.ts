/**
 * The capture half of delivery-tools, committed into the repo beside delivery-capture.spec.ts.
 * Copied from the delivery-tools plugin's templates/; see that spec for how it runs.
 *
 * `delivery capture` writes a job file (states, worlds, users, widths, locales, themes, how to
 * reach each state) and runs the spec with DELIVERY_CAPTURE_JOB pointing at it. For every item
 * this file signs in as the item's user, reaches the state, and writes, next to the job:
 *   <key>.png         the full page
 *   <key>.txt         one visible text element per line, read from the page
 *   <key>.dom.json    every text element and control with box, role, name and computed style
 *   <key>.errors.json console messages, requests, timing and axe results
 *   <key>.meta.json   the served SHA, the steps taken, rows created, any error
 *   <key>.controls.json  whether each clicked control reached its target (when the job asks)
 * It never judges anything: the CLI validates every item from these files.
 *
 * Three things are enforced here rather than trusted:
 * - read-only items (the founder's organisation) abort every request that is not a read, except
 *   the sign-in exchange, and click nothing;
 * - an item's intercept answers the one request the plan names, so nothing is spent or dialled;
 * - only controls whose effect is none or free are ever clicked (the CLI sends no others).
 *
 * Wiring, once per repo: add `webServer: deliveryWebServer()` to the Playwright config, so a
 * branch-mode capture starts and stops the dev server it captures (it returns undefined
 * otherwise and changes nothing about the repo's own e2e runs).
 */
import type { Browser, BrowserContext, Locator, Page, Request, Response } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { join } from 'path';

export interface CaptureStep {
  goto?: string;
  click?: { testid?: string; role?: string; name?: string };
  type?: { testid: string; text: string };
  select?: { testid: string; value: string };
  press?: string;
  waitFor?: { testid?: string; text?: string };
}

export interface CaptureControl {
  label: string;
  testid: string;
  effect: string;
  target: string;
  enabledWhen?: string;
  /** False when this run cannot judge arriving at the target: it is reached another way. */
  verifyTarget?: boolean;
}

export interface CaptureIntercept {
  method: string;
  url: string;
  status: number;
  body: string;
  timeoutMs?: number;
}

export interface CaptureItem {
  key: string;
  state: string;
  world: string;
  role: string;
  email: string;
  width: number;
  height: number;
  locale: string;
  theme: 'light' | 'dark';
  readOnly: boolean;
  check: string;
  steps: CaptureStep[];
  intercept: CaptureIntercept | null;
  clicks: boolean;
  controls: CaptureControl[];
  axe: boolean;
}

export interface CaptureWebServer {
  command: string;
  url: string;
  cwd?: string;
  timeoutMs: number;
  env: Record<string, string>;
}

export interface CaptureJob {
  schemaVersion: 1;
  runId: string;
  mode: string;
  feature: string;
  baseUrl: string;
  expectedSha: string;
  outDir: string;
  extractScript: string;
  versionProbe: { method: string; path: string } | null;
  auth: { module: string; fn: string };
  webServer: CaptureWebServer | null;
  settleMs: number;
  /** Selectors for loading indicators a capture must never photograph. Defaults to DEFAULT_LOADING. */
  loadingSelectors?: string[];
  items: CaptureItem[];
  targets: Record<string, { text: string[]; testids: string[] }>;
  /** Re-applies one fixture world (`delivery seed --refresh <world>`); null when nothing is seeded. */
  worldRefresh?: { command: string; args: string[]; cwd: string } | null;
}

interface ConsoleEntry { type: 'error' | 'warning' | 'pageerror'; text: string; location?: string }
interface RequestEntry { method: string; url: string; status: number | null; failure: string | null; intercepted: boolean; aborted: boolean }
interface AxeEntry { id: string; impact: 'minor' | 'moderate' | 'serious' | 'critical'; nodes: number; help: string }
interface ErrorLog {
  schemaVersion: 1;
  console: ConsoleEntry[];
  requests: RequestEntry[];
  perf: { requestCount: number; loadMs: number };
  axe: AxeEntry[] | null;
}
interface Meta {
  key: string;
  state: string;
  startedAt: string;
  finishedAt: string | null;
  finalUrl: string | null;
  servedSha: string | null;
  versionStatus: number | null;
  steps: { n: number; step: string; ok: boolean; error?: string }[];
  error: string | null;
  createdRows: { method: string; url: string; id: string }[];
  axe: string;
}
/** One entry of <key>.controls.json (schemas/capture-controls.schema.json in delivery-tools). */
interface ControlResult {
  testid: string;
  target: string;
  reached: boolean;
  why?: string;
  /** False when this run could not judge arriving at the target; it is not a failure to reach it. */
  verifyTarget?: boolean;
}

export const JOB_ENV = 'DELIVERY_CAPTURE_JOB';
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_REQUESTS = 600;

/** The job named by DELIVERY_CAPTURE_JOB, or null (then the spec skips itself). */
export function readJob(): CaptureJob | null {
  const path = process.env[JOB_ENV];
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as CaptureJob;
}

/**
 * For the repo's Playwright config: `webServer: deliveryWebServer()`. Undefined unless a capture job
 * asks for a server (branch mode, or a local production build where there are no previews).
 */
export function deliveryWebServer():
  | { command: string; url: string; cwd?: string; timeout: number; reuseExistingServer: boolean; env: Record<string, string>; stdout: 'ignore'; stderr: 'pipe' }
  | undefined {
  const job = readJob();
  if (!job || !job.webServer) return undefined;
  const inherited: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') inherited[k] = v;
  return {
    command: job.webServer.command,
    url: job.webServer.url,
    cwd: job.webServer.cwd,
    timeout: job.webServer.timeoutMs,
    reuseExistingServer: false,
    env: { ...inherited, ...job.webServer.env },
    stdout: 'ignore',
    stderr: 'pipe',
  };
}

// ---- Project adapter: the one function a repo may need to edit when it commits this file. ----
/**
 * Sign `page` in as `email` and land on `next` (a path under the base URL). The default calls the
 * profile's auth.signInFunction from auth.supportModule as fn(page, email, next). A helper with a
 * different signature is adapted here, and only here.
 */
export async function signIn(page: Page, job: CaptureJob, email: string, next: string): Promise<void> {
  const mod = (await import(job.auth.module)) as Record<string, unknown>;
  const fn = mod[job.auth.fn];
  if (typeof fn !== 'function') throw new Error(`${job.auth.module} exports no function ${job.auth.fn}`);
  await (fn as (p: Page, e: string, n: string) => Promise<unknown>)(page, email, next);
}
// ---- End of the project adapter. ----

/** Errors that mean the connection dropped, not that signing in is wrong. */
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i;

/**
 * signIn, tried again when the connection drops. On a flaky line one lost request while minting a
 * magic link made a correct state not-reached and a gate red. Anything else fails at once: a wrong
 * password or a missing user does not get better by asking three times.
 */
async function signInRetrying(page: Page, job: CaptureJob, email: string, next: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await signIn(page, job, email, next);
      return;
    } catch (e) {
      if (attempt >= 3 || !TRANSIENT.test(message(e))) throw e;
      await page.waitForTimeout(2000 * attempt);
    }
  }
}

type StoredSession = Awaited<ReturnType<BrowserContext['storageState']>>;

const sessions = new Map<string, StoredSession>();

/**
 * Where a signed-in session is kept between capture runs: beside the captures, not inside one, so
 * a gate re-run reuses it instead of minting another magic link.
 *
 * Signing in costs a one-time token, and a project's auth endpoints are rate limited per hour. One
 * gate run over eleven states signs in once per world user; four runs in an hour reached the limit
 * and the capture recorded 429s on `/auth/confirm` and on the page itself, which reads as a broken
 * screen and is a spent allowance.
 */
const SESSION_MAX_AGE_MS = 20 * 60 * 1000;

/**
 * A session belongs to one site as well as one user. Keyed by email alone, a session a branch gate
 * stored for the local dev server was handed to the next wave capture of a Vercel preview, where
 * its cookies do not apply: every state was graded on the login page.
 */
function sessionKey(job: CaptureJob, email: string): string {
  return `${new URL(job.baseUrl).host} ${email}`;
}

function sessionFile(job: CaptureJob, email: string): string {
  const safe = `${new URL(job.baseUrl).host}-${email}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return join(job.outDir, '..', '..', 'sessions', `${safe}.json`);
}

/** A stored session, when one was written recently enough to still be signed in. */
function loadSession(job: CaptureJob, email: string): StoredSession | undefined {
  const inMemory = sessions.get(sessionKey(job, email));
  if (inMemory) return inMemory;
  const path = sessionFile(job, email);
  try {
    if (!existsSync(path)) return undefined;
    const { mtimeMs } = statSync(path);
    if (Date.now() - mtimeMs > SESSION_MAX_AGE_MS) return undefined;
    const state = JSON.parse(readFileSync(path, 'utf8')) as StoredSession;
    sessions.set(sessionKey(job, email), state);
    return state;
  } catch {
    return undefined;
  }
}

function saveSession(job: CaptureJob, email: string, state: StoredSession): void {
  // A sign-in that failed leaves an empty state behind. Storing it would hand every later run a
  // session that is not signed in, and the capture would grade the login page.
  if (!state.cookies?.length && !state.origins?.length) return;
  sessions.set(sessionKey(job, email), state);
  const path = sessionFile(job, email);
  try {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state)}\n`);
  } catch {
    // A session that cannot be written is a session signed in again next run, nothing worse.
  }
}

function message(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 300);
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function interceptMatches(req: Request, icpt: CaptureIntercept): boolean {
  if (req.method().toUpperCase() !== icpt.method.toUpperCase()) return false;
  const u = new URL(req.url());
  const re = globToRegExp(icpt.url);
  return /^https?:/i.test(icpt.url) ? re.test(`${u.origin}${u.pathname}`) : re.test(u.pathname) || re.test(`${u.pathname}${u.search}`);
}

function isSignInExchange(url: string): boolean {
  try { return /\/auth\//.test(new URL(url).pathname); } catch { return false; }
}

function shaFrom(body: string): string | null {
  const t = body.trim();
  try {
    const v = JSON.parse(t) as unknown;
    if (typeof v === 'string') return /^[0-9a-f]{7,40}$/i.test(v) ? v.toLowerCase() : null;
    if (v && typeof v === 'object') {
      for (const k of ['sha', 'commit', 'commitSha', 'gitSha', 'git_sha', 'revision', 'version', 'build']) {
        const x = (v as Record<string, unknown>)[k];
        if (typeof x === 'string' && /^[0-9a-f]{7,40}$/i.test(x.trim())) return x.trim().toLowerCase();
      }
    }
  } catch {
    // not JSON: look for a SHA in the text
  }
  const m = /\b[0-9a-f]{40}\b/i.exec(t) ?? /\b[0-9a-f]{7,39}\b/i.exec(t);
  return m ? m[0].toLowerCase() : null;
}

async function settle(page: Page, ms: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => Promise.race([document.fonts.ready.then(() => undefined), new Promise<void>((r) => setTimeout(r, 3000))])).catch(() => undefined);
  await page.waitForTimeout(ms);
}

/** The loading indicators a capture must never photograph, when the job names none of its own. */
const DEFAULT_LOADING = ['[aria-busy="true"]', '[role="progressbar"]', '[data-testid$="-loading"]'];

/**
 * Which loading indicators are still visible, having waited up to `ms` for them to go.
 *
 * PROVING A CLICK LANDED IS NOT PROVING THE PANEL FINISHED LOADING. `settle` waits for
 * `networkidle`, which returns immediately when a client-rendered panel fetches nothing, and for
 * fonts, which say nothing about data. A capture taken then photographs the skeleton, and every
 * check downstream reads a page whose markers have not been rendered yet: the markers are reported
 * missing, the text parity is measured against placeholder boxes, and the whole state is judged
 * against something the product never shows a person.
 *
 * Returning the list rather than throwing keeps the decision with the caller: a state that is
 * still loading is `unavailable` with a reason, which is honest, rather than a wrong comparison.
 */
async function stillLoading(page: Page, selectors: string[], ms: number): Promise<string[]> {
  const deadline = Date.now() + ms;
  for (;;) {
    const loading = await page.evaluate((sel: string[]) =>
      Array.from(document.querySelectorAll(sel.join(',')))
        .filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width < 1 || box.height < 1) return false;
          const cs = getComputedStyle(el);
          return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
        })
        .map((el) => el.getAttribute('data-testid') || el.tagName.toLowerCase()), selectors).catch(() => null);
    // A torn-down execution context is not an answer. Ask again.
    if (loading !== null && loading.length === 0) return [];
    if (Date.now() >= deadline) return loading ?? ['the page never answered'];
    await page.waitForTimeout(150);
  }
}

/** Settle, then refuse to photograph a page that is still loading. */
async function settled(page: Page, job: CaptureJob): Promise<void> {
  await settle(page, job.settleMs);
  const loading = await stillLoading(page, job.loadingSelectors ?? DEFAULT_LOADING, 15_000);
  if (loading.length) throw new Error(`still loading after 15s (${loading.slice(0, 6).join(', ')})`);
}

/**
 * The one visible element a click step addresses, or an error saying why there is not exactly one.
 *
 * AMBIGUITY IS AN ERROR, NOT SOMETHING TO RESOLVE BY TAKING THE FIRST. Two controls can carry one
 * label -- a rail tab named "Knowledge" and a sidebar link named "Knowledge" -- and `.first()`
 * took the sidebar, navigated off the screen entirely, and the retry below watched the page change
 * and called it a success. The capture recorded a different PAGE under this state's id, and every
 * marker the checks then reported missing was really present, somewhere else. A step that names
 * two controls has not said what it meant; the state is `unavailable` until it does.
 */
/** Give a client-rendered control time to appear before counting how many of it there are. */
async function waitForFirst(locator: Locator): Promise<void> {
  if (await locator.first().isVisible().catch(() => false)) return;
  await locator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
}

async function resolveClick(page: Page, c: NonNullable<CaptureStep['click']>) {
  if (c.testid) {
    const byTestId = page.getByTestId(c.testid);
    // WAIT BEFORE COUNTING. `count()` answers about the DOM at that instant, and `networkidle`
    // returns before a client-rendered control is painted, because no request was made.
    if (!(await byTestId.first().isVisible().catch(() => false))) {
      await byTestId.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    }
    const hits = await byTestId.count();
    if (hits === 1) return byTestId;
    // Name the page it was actually on: a step that fails because the goto landed elsewhere reads
    // identically to one that fails because the control is missing.
    const seen = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'))).catch(() => []);
    throw new Error(hits === 0
      ? `no visible element carries data-testid="${c.testid}" on ${page.url()}, which carries ${seen.length} test ids${seen.length ? `: ${seen.slice(0, 12).join(', ')}` : ''}`
      : `data-testid="${c.testid}" matches ${hits} elements, so this step does not address one control`);
  }
  if (c.role) {
    const byRole = page.getByRole(c.role as Parameters<Page['getByRole']>[0], c.name ? { name: c.name, exact: true } : {});
    // Wait before counting, for the same reason the test-id branch does: a control the browser
    // renders once its data arrives is not in the DOM when the navigation settles, and counting
    // then reports it missing. Learned on the test-id branch and not applied here, which is why a
    // row of a fetched list could be clicked by test id and not by the name beside it.
    await waitForFirst(byRole);
    const n = await byRole.count();
    if (n > 1) throw new Error(`role ${c.role}${c.name ? ` named "${c.name}"` : ''} matches ${n} visible controls, so this step is ambiguous`);
    if (n === 0) throw new Error(`no visible ${c.role}${c.name ? ` named "${c.name}"` : ''} on ${page.url()}`);
    return byRole;
  }
  const byText = page.getByText(c.name ?? '', { exact: true });
  await waitForFirst(byText);
  const n = await byText.count();
  if (n > 1) throw new Error(`"${c.name}" matches ${n} visible elements by text, so this step is ambiguous`);
  if (n === 0) throw new Error(`nothing reads exactly "${c.name}" on ${page.url()}`);
  return byText;
}

/**
 * Click, and prove the page moved. Up to three attempts.
 *
 * A CLICK THAT DID NOTHING IS INVISIBLE WITHOUT THIS. A tab clicked before React attached its
 * handler does nothing at all, and `waitUntil: 'networkidle'` returns at once because no request
 * was made -- so the capture records the page it was already on, under the next state's id.
 *
 * Watch for the move, do not sample once. A client-side navigation makes no request and updates
 * the URL and the body a tick later; a single sample taken then reads a click that WORKED as a
 * click that did nothing, and the next attempt then hunts for the control on the page it has just
 * successfully left.
 */
async function clickAndVerify(page: Page, c: NonNullable<CaptureStep['click']>): Promise<void> {
  const fingerprint = () => page.evaluate(() => `${location.href}|${document.body.innerText.length}`);
  const before = await fingerprint();
  const movedWithin = async (ms: number): Promise<boolean> => {
    const deadline = Date.now() + ms;
    for (;;) {
      // Mid-navigation the execution context can be torn down; that is not an answer.
      const now = await fingerprint().catch(() => before);
      if (now !== before) return true;
      if (Date.now() >= deadline) return false;
      await page.waitForTimeout(100);
    }
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    await (await resolveClick(page, c)).click({ timeout: 10_000 });
    if (await movedWithin(5_000)) return;
    await page.waitForTimeout(500 * attempt);
  }
  const what = c.testid ? `data-testid="${c.testid}"` : `"${c.name}"`;
  throw new Error(`clicking ${what} changed nothing after 3 attempts; the handler had probably not attached`);
}

async function runStep(page: Page, step: CaptureStep): Promise<void> {
  if (step.goto !== undefined) { await page.goto(step.goto); return; }
  if (step.click) { await clickAndVerify(page, step.click); return; }
  if (step.type) { await page.getByTestId(step.type.testid).first().fill(step.type.text, { timeout: 10_000 }); return; }
  if (step.select) { await page.getByTestId(step.select.testid).first().selectOption(step.select.value, { timeout: 10_000 }); return; }
  if (step.press) { await page.keyboard.press(step.press); return; }
  if (step.waitFor) {
    if (step.waitFor.testid) await page.getByTestId(step.waitFor.testid).first().waitFor({ state: 'visible', timeout: 15_000 });
    if (step.waitFor.text) await page.getByText(step.waitFor.text).first().waitFor({ state: 'visible', timeout: 15_000 });
    return;
  }
  throw new Error(`not a capture step: ${JSON.stringify(step)}`);
}

/** Reach the item's state: sign in (or reuse this user's session), then every step. */
/** How long to wait out an app's own rate limit before giving up on an item. */
export const RATE_LIMIT_MAX_WAIT_MS = 16 * 60 * 1000;

/**
 * Go to a path, waiting out the app's own request budget rather than working around it.
 *
 * An app that budgets requests per client sees one client here: a capture drives every state and
 * every control click from one machine, and one state costs a document, its payloads and its
 * prefetches. When the app says 429 it also says for how long, and the honest answer is to wait
 * that long and ask again -- the alternative is to make the product count this traffic as
 * somebody else's, which is the limit's whole job.
 */
async function gotoWaitingOutLimits(page: Page, path: string, meta: Meta): Promise<void> {
  let waited = 0;
  for (;;) {
    const res = await page.goto(path);
    if (res?.status() !== 429) return;
    const after = Number(res.headers()['retry-after'] ?? '0');
    const wait = Math.min(Math.max(after, 1) * 1000 + 1000, RATE_LIMIT_MAX_WAIT_MS - waited);
    if (wait <= 0) return;
    meta.steps.push({ n: 0, step: `the app's rate limit answered 429: waiting ${Math.round(wait / 1000)}s`, ok: true });
    await new Promise((r) => setTimeout(r, wait));
    waited += wait;
  }
}

/**
 * How long the page the item lands on took to load, by the browser's own clock.
 *
 * NOT A STOPWATCH AROUND THE CAPTURE. That measured the magic-link sign-in, every click that opens
 * a dialog, and settle's quiet windows, and reported a page that loaded in well under two seconds
 * at nearly seven. This is the landing document's Navigation Timing instead: from `fetchStart`,
 * which comes after every redirect (the sign-in's included), to the last response the page had
 * made once the network went quiet, so the data a client-rendered page fetches counts and nothing
 * the capture does afterwards does.
 */
async function landingLoadMs(page: Page): Promise<number> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation').at(-1) as PerformanceNavigationTiming | undefined;
    if (!nav) return 0;
    const ends = [nav.loadEventEnd || nav.responseEnd, ...performance.getEntriesByType('resource').map((r) => (r as PerformanceResourceTiming).responseEnd)];
    return Math.max(0, Math.round(Math.max(...ends) - nav.fetchStart));
  }).catch(() => 0);
}

/** Sign in or go to the first page, then run the steps. Returns the landing page's load time. */
async function reach(page: Page, job: CaptureJob, item: CaptureItem, meta: Meta, signInFirst: boolean): Promise<number> {
  const steps = item.steps.slice();
  const first = steps.length && steps[0].goto !== undefined ? (steps.shift() as CaptureStep).goto as string : '/';
  if (signInFirst) {
    try {
      await signInRetrying(page, job, item.email, first);
    } catch (e) {
      throw new Error(`sign-in as ${item.email} failed: ${message(e)}`);
    }
    meta.steps.push({ n: 0, step: `sign in as ${item.email}, land on ${first}`, ok: true });
  } else {
    await gotoWaitingOutLimits(page, first, meta);
    meta.steps.push({ n: 0, step: `goto ${first}`, ok: true });
  }
  const loadMs = await landingLoadMs(page);
  for (const [i, s] of steps.entries()) {
    try {
      await runStep(page, s);
      await settle(page, 50);
      meta.steps.push({ n: i + 1, step: JSON.stringify(s), ok: true });
    } catch (e) {
      meta.steps.push({ n: i + 1, step: JSON.stringify(s), ok: false, error: message(e) });
      throw new Error(`step ${i + 1} ${JSON.stringify(s)}: ${message(e)}`);
    }
  }
  return loadMs;
}

function watch(page: Page, job: CaptureJob, log: ErrorLog, marks: { intercepted: Set<Request>; aborted: Set<Request> }, meta: Meta, counter: { n: number }): void {
  const origin = new URL(job.baseUrl).origin;
  const skipUrl = (u: string | undefined): boolean => {
    if (!u) return false;
    for (const r of [...marks.intercepted, ...marks.aborted]) if (r.url() === u) return true;
    return false;
  };
  page.on('console', (m) => {
    const t = m.type();
    if (t !== 'error' && t !== 'warning') return;
    const loc = m.location();
    if (skipUrl(loc?.url)) return; // the browser reporting a request this capture answered or refused
    log.console.push({ type: t, text: m.text().slice(0, 2000), ...(loc?.url ? { location: `${loc.url}:${loc.lineNumber}` } : {}) });
  });
  page.on('pageerror', (e) => log.console.push({ type: 'pageerror', text: String(e.message).slice(0, 2000) }));
  page.on('request', () => { counter.n++; });
  const record = (req: Request, status: number | null, failure: string | null): void => {
    if (log.requests.length >= MAX_REQUESTS) return;
    log.requests.push({ method: req.method(), url: req.url(), status, failure, intercepted: marks.intercepted.has(req), aborted: marks.aborted.has(req) });
  };
  page.on('requestfinished', async (req) => {
    const res = await req.response().catch(() => null);
    record(req, res ? res.status() : null, null);
  });
  page.on('requestfailed', (req) => record(req, null, req.failure()?.errorText ?? 'failed'));
  page.on('response', async (res: Response) => {
    const req = res.request();
    if (READS.has(req.method()) || marks.intercepted.has(req)) return;
    if (new URL(req.url()).origin !== origin || res.status() >= 400) return;
    try {
      const body = (await res.json()) as unknown;
      for (const id of idsIn(body)) meta.createdRows.push({ method: req.method(), url: req.url(), id });
    } catch {
      // not JSON: nothing to record
    }
  });
}

function idsIn(body: unknown): string[] {
  const out: string[] = [];
  const one = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const id = (o as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') out.push(String(id));
  };
  if (Array.isArray(body)) body.slice(0, 50).forEach(one);
  else if (body && typeof body === 'object') {
    one(body);
    const data = (body as Record<string, unknown>).data;
    if (Array.isArray(data)) data.slice(0, 50).forEach(one); else one(data);
  }
  return [...new Set(out)];
}

async function guard(context: BrowserContext, item: CaptureItem, marks: { intercepted: Set<Request>; aborted: Set<Request> }): Promise<void> {
  const icpt = item.intercept;
  await context.route('**/*', async (route) => {
    const req = route.request();
    if (icpt && interceptMatches(req, icpt)) {
      marks.intercepted.add(req);
      if (icpt.timeoutMs) {
        await new Promise((r) => setTimeout(r, icpt.timeoutMs));
        await route.abort('timedout');
        return;
      }
      const json = /^\s*[[{]/.test(icpt.body);
      await route.fulfill({ status: icpt.status, body: icpt.body, contentType: json ? 'application/json' : 'text/plain' });
      return;
    }
    if (item.readOnly && !READS.has(req.method()) && !isSignInExchange(req.url())) {
      marks.aborted.add(req);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
}

async function probeVersion(page: Page, job: CaptureJob, meta: Meta): Promise<void> {
  if (!job.versionProbe) return;
  try {
    // The same three rules as the CLI's probe (bug 39): a redirect is an answer, not something to
    // follow; an HTML body is a page, never a version; and a plain-text body is read only when it is
    // short. Following /api/version to /login once reported a hex string off the login page as the
    // served commit.
    const res = await page.request.fetch(new URL(job.versionProbe.path, job.baseUrl).toString(), { method: job.versionProbe.method, failOnStatusCode: false, maxRedirects: 0, timeout: 15_000 });
    meta.versionStatus = res.status();
    const type = res.headers()['content-type'] ?? '';
    const body = res.ok() ? await res.text() : '';
    const html = /text\/html/i.test(type) || /^\s*</.test(body);
    if (res.ok() && !html && (/json/i.test(type) || body.trim().length <= 200)) meta.servedSha = shaFrom(body);
  } catch (e) {
    meta.versionStatus = null;
    meta.steps.push({ n: -1, step: 'version probe', ok: false, error: message(e) });
  }
}

async function extract(page: Page, job: CaptureJob): Promise<{ lines: string[]; dom: unknown }> {
  // Evaluated rather than injected as a <script>, so a strict Content-Security-Policy cannot block it.
  await page.evaluate(readFileSync(job.extractScript, 'utf8'));
  return page.evaluate(() => (window as unknown as { __deliveryExtract: (o: object) => { lines: string[]; dom: unknown } }).__deliveryExtract({}));
}

async function runAxe(page: Page, log: ErrorLog, meta: Meta): Promise<void> {
  let axePath: string;
  try {
    axePath = createRequire(join(process.cwd(), 'noop.js')).resolve('axe-core/axe.min.js');
  } catch {
    meta.axe = 'not-installed';
    return;
  }
  try {
    await page.evaluate(readFileSync(axePath, 'utf8'));
    const found = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[]; help: string }[] }> } }).axe;
      const r = await axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact ?? 'minor', nodes: v.nodes.length, help: v.help }));
    });
    log.axe = found.filter((v): v is AxeEntry => ['minor', 'moderate', 'serious', 'critical'].includes(v.impact));
    meta.axe = 'ran';
  } catch (e) {
    meta.axe = `failed: ${message(e)}`;
  }
}

async function markersShown(page: Page, marks: { text: string[]; testids: string[] }): Promise<string[]> {
  const missing: string[] = [];
  const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const norm = (s: string): string => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  const text = norm(body);
  for (const t of marks.text) if (!text.includes(norm(t))) missing.push(`"${t}"`);
  for (const id of marks.testids) if (!(await page.getByTestId(id).first().isVisible().catch(() => false))) missing.push(`testid ${id}`);
  return missing;
}

async function controlState(page: Page, c: CaptureControl): Promise<{ found: boolean; visible: boolean; enabled: boolean }> {
  const loc = page.getByTestId(c.testid).first();
  const found = (await page.getByTestId(c.testid).count()) > 0;
  const visible = found && (await loc.isVisible().catch(() => false));
  const enabled = visible && (await loc.evaluate((el) => {
    const e = el as HTMLElement & { disabled?: boolean };
    return !(e.disabled === true || e.getAttribute('aria-disabled') === 'true' || getComputedStyle(e).pointerEvents === 'none');
  }));
  return { found, visible, enabled };
}

/**
 * M9: from the state, click each none/free control on a fresh page and see whether the target
 * state's markers appear. Rows a click creates are recorded in meta.createdRows (the CLI tears them
 * down); the click pages' console is not the state's, so it is not logged against the capture.
 * Whether a member sees a control, and whether it is enabled, is read from dom.json instead.
 */
/**
 * Which of several elements sharing one test id is the one the plan's label names.
 * Returns its index, -1 when none is, -2 when more than one is. Names are read the way a person
 * reads them: the visible text, or the aria-label when the element has no text of its own.
 */
async function namedOne(all: Locator, label: string): Promise<number> {
  const want = label.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want) return -1;
  const names: string[] = await all.evaluateAll((els) =>
    els.map((el) => {
      const e = el as HTMLElement;
      const text = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
      return (text || e.getAttribute('aria-label') || '').toLowerCase();
    })
  );
  const exact = names.reduce<number[]>((out, n, i) => (n === want ? [...out, i] : out), []);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return -2;
  const partial = names.reduce<number[]>((out, n, i) => (n.includes(want) ? [...out, i] : out), []);
  if (partial.length === 1) return partial[0];
  return partial.length > 1 ? -2 : -1;
}

async function clickControls(context: BrowserContext, job: CaptureJob, item: CaptureItem, meta: Meta, marks: { intercepted: Set<Request>; aborted: Set<Request> }): Promise<ControlResult[]> {
  const results: ControlResult[] = [];
  for (const c of item.controls) {
    const r: ControlResult = { testid: c.testid, target: c.target, reached: false, ...(c.verifyTarget === false ? { verifyTarget: false } : {}) };
    const page = await context.newPage();
    const scratch: ErrorLog = { schemaVersion: 1, console: [], requests: [], perf: { requestCount: 0, loadMs: 0 }, axe: null };
    watch(page, job, scratch, marks, meta, { n: 0 });
    const sent: Request[] = [];
    page.on('request', (req) => { sent.push(req); });
    try {
      await reach(page, job, item, { ...meta, steps: [] }, false);
      // `settled`, not `settle`: a control that has not rendered yet is not a missing control, and
      // a target whose panel is still a skeleton has not failed to be reached.
      await settled(page, job);
      const st = await controlState(page, c);
      const all = page.getByTestId(c.testid);
      const hits = await all.count();
      // Every row of a list carries the list's one test id, and the design tells them apart by
      // what they say -- which is how this row's own reach step reaches it. So when the test id
      // matches several, the control's label picks one, exactly as a person would; only a label
      // that matches none of them, or more than one, is an address that reaches no control.
      const named = hits > 1 ? await namedOne(all, c.label) : 0;
      const one = hits > 1 ? all.nth(named) : all;
      if (!st.found) r.why = 'no element has this test id';
      else if (hits > 1 && named < 0) r.why = `${hits} elements carry this test id and none is named "${c.label}", so it does not address one control`;
      else if (hits > 1 && named === -2) r.why = `${hits} elements carry this test id and more than one is named "${c.label}"`;
      else if (!st.visible) r.why = 'not visible';
      else if (!st.enabled) r.why = 'disabled';
      else if (c.effect !== 'none' && c.effect !== 'free') r.why = `not clicked: its effect is ${c.effect}`;
      else {
        await one.click({ timeout: 10_000 });
        await settled(page, job);
        // A target this run cannot judge is not a target this click failed to reach: the state is
        // reached another way (another world, another pane), and its markers describe that way.
        const target = c.verifyTarget === false ? null : job.targets[c.target];
        const missing = target ? await markersShown(page, target) : [];
        r.reached = missing.length === 0;
        if (!target) r.why = `clicked; its target ${c.target} is reached another way, so this run does not judge arriving there`;
        else if (missing.length) r.why = `after the click, missing ${missing.slice(0, 4).join(', ')} (now at ${page.url()})`;
      }
    } catch (e) {
      r.why = message(e);
    } finally {
      await page.close().catch(() => undefined);
    }
    results.push(r);
    // A click can write (keep, discard, save), and the next control in this state, or the next
    // state in this world, would then open on changed data: "Keep all" had already kept every
    // suggestion by the time "Keep" and "Discard" were clicked, so both failed. So a control whose
    // page sent a write is followed by a refresh of the world, before the next control is clicked
    // and after the last one; a control that wrote nothing costs nothing.
    if (sent.some((req) => wrote(req, marks))) refreshWorld(job, item, c.testid);
  }
  return results;
}

/**
 * A request that could have changed the app's data: not a read, not the sign-in exchange, and not
 * one this capture answered or refused itself. The same test the read-only guard applies.
 */
function wrote(req: Request, marks: { intercepted: Set<Request>; aborted: Set<Request> }): boolean {
  return !READS.has(req.method()) && !isSignInExchange(req.url()) && !marks.intercepted.has(req) && !marks.aborted.has(req);
}

/**
 * Re-apply the item's world after a control that wrote. A refresh that fails is said on the
 * console, not thrown: the control itself was judged correctly, and the capture goes on.
 */
function refreshWorld(job: CaptureJob, item: CaptureItem, after: string): void {
  if (!job.worldRefresh) return;
  try {
    execFileSync(job.worldRefresh.command, [...job.worldRefresh.args, item.world], {
      cwd: job.worldRefresh.cwd, stdio: 'pipe', timeout: 180_000,
    });
  } catch (e) {
    console.warn(`delivery capture: world ${item.world} was not refreshed after ${item.key}'s control ${after} wrote (${message(e)})`);
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Capture one item. Never throws for a page problem: the error goes into meta.json for the CLI. */
export async function captureItem(browser: Browser, job: CaptureJob, item: CaptureItem): Promise<void> {
  const file = (ext: string): string => join(job.outDir, `${item.key}.${ext}`);
  const meta: Meta = {
    key: item.key, state: item.state, startedAt: new Date().toISOString(), finishedAt: null, finalUrl: null,
    servedSha: null, versionStatus: null, steps: [], error: null, createdRows: [], axe: 'skipped',
  };
  const log: ErrorLog = { schemaVersion: 1, console: [], requests: [], perf: { requestCount: 0, loadMs: 0 }, axe: null };
  const marks = { intercepted: new Set<Request>(), aborted: new Set<Request>() };
  const counter = { n: 0 };
  const saved = loadSession(job, item.email);
  const context = await browser.newContext({
    baseURL: job.baseUrl,
    viewport: { width: item.width, height: item.height },
    colorScheme: item.theme,
    locale: item.locale,
    reducedMotion: 'reduce',
    storageState: saved ?? { cookies: [], origins: [] },
  });
  try {
    await context.addInitScript((theme: string) => {
      try { window.localStorage.setItem('theme', theme); } catch { /* storage unavailable */ }
    }, item.theme);
    await guard(context, item, marks);
    const page = await context.newPage();
    watch(page, job, log, marks, meta, counter);
    const sent: Request[] = [];
    page.on('request', (req) => { sent.push(req); });
    log.perf.loadMs = await reach(page, job, item, meta, saved === undefined);
    await settled(page, job);
    // Always, not only after a sign-in: the session the page came back with carries the tokens as
    // they now are. A stored session whose access token has expired makes every later item refresh
    // it again, and a rotating refresh token used twice is refused -- which arrives as 429s on the
    // sign-in exchange and then on the page itself, for the last states of a run only.
    saveSession(job, item.email, await context.storageState());
    meta.finalUrl = page.url();
    await probeVersion(page, job, meta);
    const { lines, dom } = await extract(page, job);
    writeFileSync(file('txt'), lines.length ? `${lines.join('\n')}\n` : '');
    writeJson(file('dom.json'), dom);
    await page.screenshot({ path: file('png'), fullPage: true, animations: 'disabled', caret: 'hide' });
    if (item.axe) await runAxe(page, log, meta);
    // A state's own steps can write too ("Keep what it knows" reaches the toast that follows it), and
    // every control below replays those steps: re-apply the world first, or the replay finds the
    // clash already settled.
    if (sent.some((req) => wrote(req, marks))) refreshWorld(job, item, 'reach');
    if (item.clicks && !item.readOnly) {
      writeJson(file('controls.json'), await clickControls(context, job, item, meta, marks));
    }
  } catch (e) {
    meta.error = message(e);
  } finally {
    log.perf.requestCount = counter.n;
    meta.finishedAt = new Date().toISOString();
    writeJson(file('errors.json'), log);
    writeJson(file('meta.json'), meta);
    await context.close().catch(() => undefined);
  }
}
