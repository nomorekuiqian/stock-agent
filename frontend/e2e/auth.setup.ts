import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('login with test account', async ({ page }) => {
  await page.goto('/login');

  const emailInput = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  const passwordInput = page.locator('input[type="password"]').first();

  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill('voya.technologies@gmail.com');
  await passwordInput.fill('123456');

  const submitBtn = page
    .locator('button[type="submit"], button:has-text("Sign")')
    .first();
  await submitBtn.click();

  // Wait until redirected away from /login (auth completes)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });

  // Save signed-in state (cookies + localStorage) for reuse
  await page.context().storageState({ path: authFile });
});
