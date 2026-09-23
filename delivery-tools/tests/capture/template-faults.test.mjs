// Six faults found by RUNNING a capture against a live preview rather than by reading it, each of
// which made the gate downstream report things that were not true. They were found in an
// independently written copy of this capture, so the copy is not what is guarded here: the shipped
// template is, and these tests fail if it ever loses the fix.
//
// The template is TypeScript that only executes inside Playwright, so these are assertions about
// the text that ships. That is weaker than running it, and it is what stops a regression that
// nothing else in this suite can see. The colour half of the backport is a real unit test, in
// tests/checks/color-notation.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const support = readFileSync(join(ROOT, 'templates', 'delivery-capture-support.ts'), 'utf8');
const spec = readFileSync(join(ROOT, 'templates', 'delivery-capture.spec.ts'), 'utf8');
const shipped = { 'delivery-capture-support.ts': support, 'delivery-capture.spec.ts': spec };

// 1. `import.meta` typechecks and then dies.
test('no shipped template uses import.meta', () => {
  // Playwright specs transpile to CommonJS, where `import.meta` throws at load. Playwright then
  // reports "No tests found. Make sure that arguments are regular expressions matching test
  // files." and names no file, which reads as a mistyped filter. `pnpm typecheck` passes on a spec
  // that cannot load, so nothing before the run catches it.
  for (const [name, text] of Object.entries(shipped)) {
    assert.doesNotMatch(text, /import\.meta/, `${name} uses import.meta, which dies under CommonJS`);
  }
});

// 2. A click with no retry captures the previous state under this state's id.
test('a click is retried and proved to have moved the page', () => {
  assert.match(support, /movedWithin/, 'clicks must verify the page actually moved');
  assert.match(support, /attempt <= 3/, 'clicks must be retried: a handler may not have attached yet');
  assert.match(support, /changed nothing after 3 attempts/, 'a click that never moves the page must fail loudly');
  // Watch for the move, do not sample once: a client-side navigation makes no request and updates
  // the URL a tick later, so one sample reads a click that worked as a click that did nothing.
  assert.match(support, /const deadline = Date\.now\(\) \+ ms;/, 'movedWithin must poll to a deadline');
});

// 5. A click resolving to the wrong one of two same-labelled controls.
test('a click refuses to guess between two matches rather than taking the first', () => {
  assert.doesNotMatch(support, /\.first\(\)\.click\(/, 'taking the first of several matches is what captured the wrong page');
  assert.match(support, /so this step is ambiguous/, 'more than one match must be an error');
  assert.match(support, /does not address one control/, 'a duplicated test id must be an error');
});

// 6. The capture photographs a loading skeleton.
test('a page that is still loading is not photographed', () => {
  assert.match(support, /async function stillLoading\(/, 'the capture must be able to see a loading indicator');
  assert.match(support, /still loading after 15s/, 'a page still loading must fail the item, not be captured');
  // aria-busy and role=progressbar are standards; the testid suffix is the common convention.
  for (const sel of ['[aria-busy="true"]', '[role="progressbar"]', '[data-testid$="-loading"]']) {
    assert.ok(support.includes(sel), `DEFAULT_LOADING must cover ${sel}`);
  }
  // Every place that takes a reading of the page goes through `settled`. `settle` alone returns
  // on a client-rendered panel that has fetched nothing yet, so the only call left to it is the
  // one inside `settled` itself.
  const bare = support.match(/await settle\(page, job\.settleMs\)/g) ?? [];
  assert.equal(bare.length, 1, `${bare.length} call sites still use settle() directly; only settled() may`);
  assert.equal((support.match(/await settled\(page, job\)/g) ?? []).length, 3,
    'the state capture and both readings in clickControls must all refuse a loading page');
});

// 4. A selector taken from prose rather than from the column, silently falling back.
test('a step that cannot address one element refuses, and never falls back', () => {
  // The fault this pins: had the capture fallen back to a default when its selector matched
  // nothing, it would have recorded one page under six state ids, and the checks would have
  // reported six states' worth of findings about a page never reached.
  assert.match(support, /no visible element carries data-testid=/, 'a missing test id must name what the page does carry');
  assert.match(support, /which carries \$\{seen\.length\} test ids/, 'the message must name the page it was actually on');
  assert.match(support, /nothing reads exactly/, 'a text step that matches nothing must say so');
});

// 3. An element carrying only a data-testid was dropped from the capture.
test('an element with a test id and no text of its own is still captured', async () => {
  // The plan addresses states BY test id, so dropping the wrapper that carries one made the
  // checks report ids as missing that were on the page.
  const { pageExtract } = await import('../../lib/capture/page-extract.mjs');
  assert.equal(typeof pageExtract, 'function');
  const src = readFileSync(join(ROOT, 'lib', 'capture', 'page-extract.mjs'), 'utf8');
  assert.match(src, /if \(!owner && !control && !testid\) continue;/,
    'an element is kept when it carries a test id, whatever else it is');
});

// 7. A control the browser renders once its data arrives is counted before it exists.
test('every way of resolving a click waits before counting', () => {
  // The test-id branch learned this and said so in a comment; the role and text branches counted
  // immediately, so a row of a fetched list could be clicked by its test id and not by the name
  // printed beside it -- and the capture reported the state unreachable, which reads as a screen
  // that has no such control (widgets WG-09).
  assert.match(support, /async function waitForFirst\(/, 'a shared wait-then-count helper must exist');
  const resolve = support.slice(support.indexOf('async function resolveClick('));
  const body = resolve.slice(0, resolve.indexOf('\n}\n'));
  for (const branch of ['byRole', 'byText']) {
    const at = body.indexOf(`const n = await ${branch}.count();`);
    assert.ok(at > 0, `resolveClick has no ${branch} count`);
    assert.match(body.slice(Math.max(0, at - 400), at), new RegExp(`waitForFirst\\(${branch}\\)`), `${branch} counts without waiting first`);
  }
});

// 7. The load time was the capture's own stopwatch.
test('the load time is the landing page\'s own, not sign-in plus clicks plus the capture\'s waits', () => {
  // loadMs used to be Date.now() around sign-in, every reach step and settle's quiet windows, so a
  // page that loaded in 1.5 s was reported at 6.9 s and every state of a run broke M17's ceiling.
  // It is the landing document's Navigation Timing now: from fetchStart, which comes after the
  // sign-in redirect, to the last response the page made before the steps begin.
  assert.doesNotMatch(support, /loadMs = Date\.now\(\) - t0/, 'loadMs must not be a wall clock around the whole capture');
  assert.match(support, /async function landingLoadMs\(/, 'the landing page is measured on its own');
  assert.match(support, /fetchStart/, 'measured from the document fetch, after redirects');
  assert.match(support, /getEntriesByType\('resource'\)/, 'the data a client-rendered page fetches counts');
  const reachBody = support.slice(support.indexOf('async function reach('), support.indexOf('function watch('));
  assert.ok(reachBody.indexOf('landingLoadMs(') > -1 && reachBody.indexOf('landingLoadMs(') < reachBody.indexOf('for (const [i, s] of steps.entries())'),
    'measured when the page lands, before any step clicks');
});

// 8. One dropped request while minting a sign-in link failed a whole state.
test('a sign-in that fails on a dropped connection is tried again; any other failure is not', () => {
  // On a flaky line, "Could not mint a magic link: fetch failed" made a correct state not-reached,
  // and the gate red. The retry wraps the adapter rather than living in it: signIn is the one
  // function a repository edits, and its copy must not have to learn this.
  assert.match(support, /async function signInRetrying\(/);
  assert.match(support, /fetch failed/);
  const reachBody = support.slice(support.indexOf('async function reach('), support.indexOf('function watch('));
  assert.match(reachBody, /await signInRetrying\(page, job, item\.email, first\)/);
  assert.doesNotMatch(reachBody, /await signIn\(page/);
});
