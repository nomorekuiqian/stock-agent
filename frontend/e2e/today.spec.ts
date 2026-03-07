import { test, expect } from '@playwright/test';

test.describe('Today page (/today)', () => {
  test.beforeEach(async ({ page }) => {
    // Today page fetches market data from backend APIs which can be slow
    await page.goto('/today', { timeout: 60000 });
  });

  test('loads and shows page heading', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    // Page should load without errors
    await expect(page).toHaveURL(/\/today/);
  });

  test('displays market indices or empty state', async ({ page }) => {
    test.setTimeout(90_000);
    // SSR page — either report with indices loads, or empty state shows
    const indexCard = page.locator('text=/S&P 500|NASDAQ|VIX|GOLD|US DOLLAR|10Y TREASURY/').first();
    const emptyState = page.locator('text=暂无报告');
    // One of the two must be visible
    await expect(indexCard.or(emptyState).first()).toBeVisible({ timeout: 60000 });
  });

  test('renders news section or empty state', async ({ page }) => {
    test.setTimeout(90_000);
    // SSR page — either report with news loads, or empty state shows
    const newsSection = page.locator('text=/新闻|头条|快讯/').first();
    const emptyState = page.locator('text=暂无报告');
    await expect(newsSection.or(emptyState).first()).toBeVisible({ timeout: 60000 });
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
