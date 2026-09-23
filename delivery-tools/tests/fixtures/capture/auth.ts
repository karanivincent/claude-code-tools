// The test app's sign-in helper, in the shape the capture template's default adapter calls:
// signIn(page, email, next). The page's base URL is the app under capture.
import type { Page } from '@playwright/test';

export async function signIn(page: Page, email: string, next: string): Promise<void> {
  await page.goto(`/auth/confirm?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  if (new URL(page.url()).pathname === '/login') throw new Error(`sign-in as ${email} landed on /login`);
}
