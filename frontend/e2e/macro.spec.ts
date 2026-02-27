import { test, expect } from '@playwright/test';

test.describe('Macro page (/macro)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/macro');
  });

  test('loads and shows page content', async ({ page }) => {
    await expect(page).toHaveURL(/\/macro/);
    // Should show some macro content
    await expect(page.locator('body')).toBeVisible();
  });

  test('displays signal lights or risk indicators', async ({ page }) => {
    // Wait for the macro dashboard to load
    const indicator = page.locator('text=/信号|风险|流动性|通胀|经济|情绪|liquidity|economy|inflation|sentiment/i').first();
    await expect(indicator).toBeVisible({ timeout: 30000 });
  });

  test('shows analysis sections', async ({ page }) => {
    // Should have some analysis content
    const section = page.locator('text=/分析|展望|趋势|summary|analysis|outlook/i').first();
    await expect(section).toBeVisible({ timeout: 30000 });
  });
});
