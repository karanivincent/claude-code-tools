/**
 * The committed capture spec of delivery-tools (spec 4.2, 4.5, 4.6, 9). Copied from the plugin's
 * templates/ with its support file, delivery-capture-support.ts, into the repo's e2e directory.
 *
 * It runs only under `delivery capture`, which writes a job file and runs the repo's own e2e
 * command for this spec with DELIVERY_CAPTURE_JOB set; a normal e2e run skips it. Every item of
 * the job becomes one test that signs in through the repo's session helper, reaches the state and
 * writes its files. A page problem is written down, not thrown, so one bad state never hides the
 * rest; the CLI judges every item afterwards (markers, sibling text, served SHA, errors).
 *
 * In branch mode the job names a dev server, and the repo's Playwright config starts and stops it:
 * `webServer: deliveryWebServer()` (imported from the support file). The capture owns its server;
 * nothing is left running.
 */
import { test } from '@playwright/test';
import { captureItem, readJob } from './delivery-capture-support';

const job = readJob();

test.describe('delivery capture', () => {
  test.skip(!job, 'no capture job: this spec runs only under `delivery capture`');
  // In order, in one worker: every item of one user shares one sign-in, and a failure of one item
  // must not skip the others (which "serial" would).
  test.describe.configure({ mode: 'default' });
  // Each item signs in as its own world's user; the suite's shared session must not leak in.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const item of job?.items ?? []) {
    test(item.key, async ({ browser }) => {
      test.setTimeout(90_000 + 30_000 * item.controls.length);
      if (!job) return;
      await captureItem(browser, job, item);
    });
  }
});
