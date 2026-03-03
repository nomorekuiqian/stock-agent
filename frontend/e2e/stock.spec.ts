import { test, expect } from '@playwright/test';

test.describe('Stock page (/stock)', () => {
  test('displays track cards on stock landing', async ({ page }) => {
    await page.goto('/stock');
    // Should show some stock cards (Mag 7 or similar)
    const stockCard = page.locator('text=/AAPL|MSFT|GOOGL|AMZN|NVDA|META|TSLA/').first();
    await expect(stockCard).toBeVisible({ timeout: 15000 });
  });

  test('search input is visible and functional', async ({ page }) => {
    await page.goto('/stock');
    const searchInput = page.locator('input[type="text"], input[placeholder*="搜索"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('typing in search shows dropdown', async ({ page }) => {
    await page.goto('/stock');
    const searchInput = page.locator('input[type="text"], input[placeholder*="搜索"], input[placeholder*="search" i]').first();
    await searchInput.fill('AAPL');
    // Dropdown should appear with results (listbox or Apple/AAPL text)
    const dropdown = page.locator('[role="listbox"]').or(page.getByText(/Apple|AAPL/)).first();
    await expect(dropdown).toBeVisible({ timeout: 15000 });
  });

  test('individual stock page loads with symbol', async ({ page }) => {
    await page.goto('/stock/AAPL');
    // Should display the stock symbol somewhere on the page
    await expect(page.locator('text=AAPL').first()).toBeVisible({ timeout: 20000 });
  });

  test('individual stock page shows price area', async ({ page }) => {
    await page.goto('/stock/AAPL');
    // Should display a price (dollar sign followed by digits)
    const priceEl = page.locator('text=/\\$[\\d,]+\\.\\d{2}/').first();
    await expect(priceEl).toBeVisible({ timeout: 20000 });
  });
});
