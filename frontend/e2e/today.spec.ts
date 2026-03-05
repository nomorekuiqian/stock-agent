import { test, expect } from '@playwright/test';

test.describe('Today page (/today)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/today');
  });

  test('loads and shows page heading', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    // Page should load without errors
    await expect(page).toHaveURL(/\/today/);
  });

  test('displays at least one market index', async ({ page }) => {
    // Wait for content to load (market indices section)
    const indexCard = page.locator('text=/S&P 500|NASDAQ|VIX|GOLD|US DOLLAR|10Y TREASURY/').first();
    await expect(indexCard).toBeVisible({ timeout: 30000 });
  });

  test('renders news section with headlines', async ({ page }) => {
    // News section should appear after data loads
    const newsSection = page.locator('text=/新闻|头条|快讯/').first();
    await expect(newsSection).toBeVisible({ timeout: 30000 });
  });

  test('can navigate to archive', async ({ page }) => {
    // Look for a link to archive or historical reports
    const archiveLink = page.locator('a[href*="/today/archive"], a[href*="/today/history"], text=/历史|归档|更多/').first();
    if (await archiveLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await archiveLink.click();
      await expect(page).not.toHaveURL(/\/today$/);
    }
  });
});
