// Spike S5: a saving state (SM-08, change a member's role) leaks into the next read of the same world,
// and a refresh of the world (run separately, between the two phases) removes the leak.
import { createRequire } from 'node:module';
const WT = '/Users/vince/Projects/Telitask/telitask-development/.claude/worktrees/delivery-settings-page';
const { chromium } = createRequire(`${WT}/apps/dashboard/package.json`)('@playwright/test');
const { pageExtract } = await import('/Users/vince/Documents/Projects/claude-code-tools/delivery-tools/lib/capture/page-extract.mjs');
const BASE = 'http://localhost:3419';
const phase = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: `${WT}/.delivery/settings-page/sessions/shoot-localhost-role-change-owner.json` });
const page = await ctx.newPage();
await page.goto(BASE + '/dashboard/settings?tab=members', { waitUntil: 'networkidle' });
const roles = async () => (await page.evaluate(pageExtract, {})).lines.filter((l) => /^(Owner|Admin|Member)$/.test(l)).join(',');
console.log(`${phase} before: ${await roles()}`);
if (phase === 'write') {
  await page.getByTestId('member-role-2').click();
  await page.getByTestId('member-role-option').filter({ hasText: 'Admin' }).click();
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  console.log(`${phase} after reload: ${await roles()}`);
}
await browser.close();
