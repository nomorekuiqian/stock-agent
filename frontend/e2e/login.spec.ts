import { test, expect } from '@playwright/test';

test.describe('Login page (/login)', () => {
  test('displays login form', async ({ page }) => {
    await page.goto('/login');
    // Should show email and password fields
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('wrong@example.com');
    await passwordInput.fill('wrongpassword');

    // Submit the email/password form (not the Google button)
    const submitBtn = page.locator('form button[type="submit"]').first();
    await submitBtn.click();

    // Should show an error message
    const error = page.locator('text=/错误|失败|invalid|error|incorrect/i').first();
    await expect(error).toBeVisible({ timeout: 10000 });
  });

  test('successful login with test account', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('voya.technologies@gmail.com');
    await passwordInput.fill('123456');

    // Submit the email/password form (not the Google button)
    const submitBtn = page.locator('form button[type="submit"]').first();
    await submitBtn.click();

    // Should redirect away from login page
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  });

  test('redirects after login', async ({ page }) => {
    // Go to login with redirect param
    await page.goto('/login?redirect=%2Ffor-you');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('voya.technologies@gmail.com');
    await passwordInput.fill('123456');

    // Submit the email/password form (not the Google button)
    const submitBtn = page.locator('form button[type="submit"]').first();
    await submitBtn.click();

    // Should redirect to the specified path
    await expect(page).toHaveURL(/\/for-you/, { timeout: 15000 });
  });
});
