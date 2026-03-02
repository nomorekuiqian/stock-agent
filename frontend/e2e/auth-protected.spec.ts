import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Unauthenticated access — no @auth tag, runs without stored cookies
// ---------------------------------------------------------------------------

test.describe('Unauthenticated redirect', () => {
  test('redirects /for-you to /login', async ({ page }) => {
    await page.goto('/for-you');

    // Auth guard should redirect to login with a redirect param
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    // The redirect param preserves the original destination
    expect(page.url()).toContain('redirect');
  });

  test('redirects /profile to /login', async ({ page }) => {
    await page.goto('/profile');

    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Authenticated access — uses stored cookies from auth.setup.ts
// Tag with @auth so Playwright config routes them through the 'authenticated' project
// ---------------------------------------------------------------------------

test.describe('Authenticated page loading @auth', () => {
  test('/for-you loads without server error', async ({ page }) => {
    await page.goto('/for-you');

    // Should NOT be redirected to /login
    await expect(page).toHaveURL(/\/for-you/, { timeout: 15000 });

    // Should NOT show the "cannot connect" error state
    const errorText = page.locator('text=无法连接到服务器');
    // Wait for either content to appear or confirm error is absent.
    // Give the page time to finish loading (watchlist query etc.)
    await page.waitForTimeout(3000);
    await expect(errorText).not.toBeVisible();
  });

  test('/for-you shows user content', async ({ page }) => {
    await page.goto('/for-you');
    await expect(page).toHaveURL(/\/for-you/, { timeout: 15000 });

    // Page should show either:
    // - Loading spinner ("loading your data")
    // - Or actual digest content / empty state
    // We wait for the loading spinner to disappear (data loaded)
    const loadingText = page.locator('text=加载你的数据');
    // If spinner appeared, wait for it to go away
    if (await loadingText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(loadingText).not.toBeVisible({ timeout: 30000 });
    }

    // After loading, the page should have meaningful content — not an error
    const errorText = page.locator('text=无法连接到服务器');
    await expect(errorText).not.toBeVisible();
  });

  test('/for-you survives page refresh', async ({ page }) => {
    await page.goto('/for-you');
    await expect(page).toHaveURL(/\/for-you/, { timeout: 15000 });

    // Refresh the page — this forces cookie recovery
    await page.reload();

    // After refresh, should still be on /for-you (not redirected to /login)
    await expect(page).toHaveURL(/\/for-you/, { timeout: 15000 });

    // No server error after refresh
    await page.waitForTimeout(3000);
    const errorText = page.locator('text=无法连接到服务器');
    await expect(errorText).not.toBeVisible();
  });

  test('/profile loads without redirect', async ({ page }) => {
    await page.goto('/profile');

    // Should stay on profile, not redirect to login
    await expect(page).toHaveURL(/\/profile/, { timeout: 15000 });
  });

  test('navbar shows logged-in state', async ({ page }) => {
    await page.goto('/for-you');
    await expect(page).toHaveURL(/\/for-you/, { timeout: 15000 });

    // Navbar should NOT show a login/sign-in button when authenticated.
    // Instead it shows the user avatar or profile menu.
    const loginBtn = page.locator('a[href="/login"], button:has-text("Sign In"), button:has-text("Log In")');
    await expect(loginBtn).not.toBeVisible({ timeout: 5000 });
  });
});
