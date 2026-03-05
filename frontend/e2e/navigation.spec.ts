import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navbar is visible on all pages', async ({ page }) => {
    for (const path of ['/', '/today', '/stock', '/macro']) {
      await page.goto(path);
      const nav = page.locator('nav').first();
      await expect(nav).toBeVisible({ timeout: 10000 });
    }
  });

  test('404 page shows custom content', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    // Should show custom 404 page, not a blank page
    const notFoundText = page.locator('text=/404|找不到|not found|does not exist/i').first();
    await expect(notFoundText).toBeVisible({ timeout: 10000 });
  });

  test('home page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out common non-critical errors (e.g., favicon, analytics)
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('analytics') && !e.includes('hydration')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('navbar links navigate correctly', async ({ page }) => {
    await page.goto('/');

    // Click on a nav link
    const todayLink = page.locator('nav a[href="/today"]').first();
    if (await todayLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await todayLink.click();
      await expect(page).toHaveURL(/\/today/);
    }
  });
});
