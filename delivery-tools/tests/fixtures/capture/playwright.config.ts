// The test app's Playwright config: the repo wiring a capture needs is the one webServer line.
import { defineConfig } from '@playwright/test';
import { deliveryWebServer } from './e2e/delivery-capture-support';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  reporter: 'line',
  timeout: 60_000,
  webServer: deliveryWebServer(),
  use: { browserName: 'chromium' },
});
