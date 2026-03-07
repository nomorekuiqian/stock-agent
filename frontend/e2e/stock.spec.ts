import { test, expect } from '@playwright/test';

test.describe('Stock page (/stock)', () => {
  test('displays track cards on stock landing', async ({ page }) => {
    await page.goto('/stock', { timeout: 60000 });
    // Should show some stock cards (Mag 7 or similar)
    const stockCard = page.locator('text=/AAPL|MSFT|GOOGL|AMZN|NVDA|META|TSLA/').first();
    await expect(stockCard).toBeVisible({ timeout: 30000 });
  });

  test('search input is visible and functional', async ({ page }) => {
    await page.goto('/stock', { timeout: 60000 });
    const searchInput = page.locator('input[type="text"], input[placeholder*="搜索"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });
  });

  test('typing in search shows dropdown', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/stock', { timeout: 60000 });
    const searchInput = page.locator('input[type="text"], input[placeholder*="搜索"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    // Use pressSequentially to simulate real typing and trigger React onChange + debounce
    await searchInput.pressSequentially('AAPL', { delay: 50 });
    // Dropdown should appear with results (300ms debounce + API call)
    const dropdown = page.locator('[role="listbox"]').first();
    await expect(dropdown).toBeVisible({ timeout: 30000 });
  });

  test('individual stock page loads with symbol', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/stock/AAPL', { timeout: 60000 });
    // Should display the stock symbol
    await expect(page.locator('text=AAPL').first()).toBeVisible({ timeout: 30000 });
  });

  test('individual stock page shows price area', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/stock/AAPL', { timeout: 60000 });
    // Should display a price (dollar sign followed by digits)
    const priceEl = page.locator('text=/\\$[\\d,]+\\.\\d{2}/').first();
    await expect(priceEl).toBeVisible({ timeout: 30000 });
  });
});
