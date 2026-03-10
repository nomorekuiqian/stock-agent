import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helper: mock auth and login
// ---------------------------------------------------------------------------

function createFakeJwt(): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 }),
    'signature',
  ].join('.');
}

async function loginWithMock(page: Page) {
  const accessToken = createFakeJwt();
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    profile: { name: 'Playwright User' },
  };

  // Mock our Server Proxy auth endpoint (POST /api/auth with action: 'sign-in')
  await page.route('**/api/auth', async (route: Route) => {
    if (route.request().method() === 'POST') {
      let body: Record<string, unknown> = {};
      try { body = route.request().postDataJSON(); } catch { /* not JSON */ }

      if (body.action === 'login') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, accessToken, csrfToken: 'csrf-token', user: mockUser }),
        });
        return;
      }
    }
    await route.continue();
  });

  // Mock Insforge auth sub-path endpoints (SDK direct calls)
  await page.route('**/api/auth/**', async (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/api/auth/public-config')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          requireEmailVerification: true,
          verifyEmailMethod: 'code',
          passwordMinLength: 6,
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/api/auth/refresh')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not found' }),
      });
      return;
    }

    if (url.pathname.endsWith('/api/auth/sessions/current')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: mockUser }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/login');
  await page.getByLabel('邮箱').fill('test@example.com');
  await page.locator('#password').fill('Password123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });

  // Set auth cookies so full page reloads recover the session
  // (simulates what the real Server Proxy sets via Set-Cookie headers)
  await page.context().addCookies([
    { name: 'insforge-session', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'insforge-user', value: JSON.stringify({ id: mockUser.id, email: mockUser.email, profile: mockUser.profile || null }), domain: 'localhost', path: '/' },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Screener page (/screener)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithMock(page);
  });

  // -----------------------------------------------------------------------
  // 1. WelcomeScreen renders correctly (fast, no API call)
  // -----------------------------------------------------------------------

  test('displays WelcomeScreen with all key elements', async ({ page }) => {
    await page.goto('/screener');

    // Editorial title
    await expect(page.locator('text=投资机会')).toBeVisible({ timeout: 15000 });

    // Strategy cards section
    await expect(page.locator('text=热门策略')).toBeVisible();
    // At least 4 strategy cards visible (from pool of 8)
    const strategyCards = page.locator(
      [
        'button:has-text("稳定收益")',
        'button:has-text("成长动能")',
        'button:has-text("价值发现")',
        'button:has-text("趋势策略")',
        'button:has-text("科技前沿")',
        'button:has-text("防御配置")',
        'button:has-text("现金流优选")',
        'button:has-text("高速成长")',
      ].join(', '),
    );
    expect(await strategyCards.count()).toBeGreaterThanOrEqual(4);

    // Theme chips section
    await expect(page.locator('text=试试这些')).toBeVisible();

    // Chat input textarea
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('shuffle buttons refresh strategy cards and theme chips', async ({ page }) => {
    await page.goto('/screener');
    await expect(page.locator('text=热门策略')).toBeVisible({ timeout: 15000 });

    // Two refresh buttons (strategies + themes)
    const refreshButtons = page.locator('button[title="换一批"]');
    expect(await refreshButtons.count()).toBe(2);

    // Click strategy shuffle — cards should still be visible after animation
    await refreshButtons.first().click();
    // Wait for fade animation (300ms exit + 300ms settle)
    await page.waitForTimeout(400);
    const strategyCards = page.locator(
      [
        'button:has-text("稳定收益")',
        'button:has-text("成长动能")',
        'button:has-text("价值发现")',
        'button:has-text("趋势策略")',
        'button:has-text("科技前沿")',
        'button:has-text("防御配置")',
        'button:has-text("现金流优选")',
        'button:has-text("高速成长")',
      ].join(', '),
    );
    expect(await strategyCards.count()).toBeGreaterThanOrEqual(4);
  });

  // -----------------------------------------------------------------------
  // 2. Full agent conversation flow (requires running backend)
  // -----------------------------------------------------------------------

  test('clicking a strategy card starts a conversation with AI', async ({ page }) => {
    test.setTimeout(120_000); // LLM calls can be slow

    await page.goto('/screener');
    await expect(page.locator('text=投资机会')).toBeVisible({ timeout: 15000 });

    // Click the first visible strategy card
    const firstCard = page
      .locator(
        [
          'button:has-text("稳定收益")',
          'button:has-text("成长动能")',
          'button:has-text("价值发现")',
          'button:has-text("趋势策略")',
        ].join(', '),
      )
      .first();
    await firstCard.click();

    // Should transition to chat phase — header appears
    await expect(page.locator('text=重新开始')).toBeVisible({ timeout: 10000 });

    // User message should appear in the chat
    // The card label becomes the user's first message
    const userBubble = page.locator('.bg-emerald-600').first();
    await expect(userBubble).toBeVisible({ timeout: 5000 });

    // Wait for AI response — max-w-[85%] distinguishes real messages from TypingIndicator
    const aiMessage = page.locator('.max-w-\\[85\\%\\].rounded-tl-sm').first();
    await expect(aiMessage).toBeVisible({ timeout: 90000 });

    // AI response should contain some text (not empty)
    const aiText = await aiMessage.innerText();
    expect(aiText.length).toBeGreaterThan(10);
  });

  test('typing a custom query gets AI response with results', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/screener');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Type a custom query
    const textarea = page.locator('textarea');
    await textarea.fill('PE 低于 15 且 ROE 超过 20%');

    // Click send button
    const sendBtn = page.locator('button:near(textarea)').last();
    await sendBtn.click();

    // Should transition to chat phase
    await expect(page.locator('text=重新开始')).toBeVisible({ timeout: 10000 });

    // Wait for AI response
    const aiMessage = page.locator('.max-w-\\[85\\%\\].rounded-tl-sm').first();
    await expect(aiMessage).toBeVisible({ timeout: 90000 });

    // On desktop, results panel should show something
    // (candidate count, funnel steps, or "waiting for results" state)
    const resultsPanel = page.locator('.lg\\:w-1\\/2').last();
    await expect(resultsPanel).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 3. Navigation and state management
  // -----------------------------------------------------------------------

  test('"重新开始" resets back to WelcomeScreen', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/screener');
    await expect(page.locator('text=投资机会')).toBeVisible({ timeout: 15000 });

    // Start a conversation — click any visible strategy card
    const firstCard = page
      .locator(
        [
          'button:has-text("稳定收益")',
          'button:has-text("成长动能")',
          'button:has-text("价值发现")',
          'button:has-text("趋势策略")',
          'button:has-text("科技前沿")',
          'button:has-text("防御配置")',
          'button:has-text("现金流优选")',
          'button:has-text("高速成长")',
        ].join(', '),
      )
      .first();
    await firstCard.click();
    await expect(page.locator('text=重新开始')).toBeVisible({ timeout: 10000 });

    // Click reset
    await page.locator('text=重新开始').click();

    // Should return to WelcomeScreen
    await expect(page.locator('text=投资机会')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=热门策略')).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ browser }) => {
    // Fresh context without login — but still need public-config mock
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route('**/api/auth/**', async (route: Route) => {
      const url = new URL(route.request().url());

      if (url.pathname.endsWith('/api/auth/public-config')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            requireEmailVerification: true,
            verifyEmailMethod: 'code',
            passwordMinLength: 6,
          }),
        });
        return;
      }

      if (url.pathname.endsWith('/api/auth/sessions/current')) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Unauthorized' }),
        });
        return;
      }

      if (url.pathname.endsWith('/api/auth/refresh')) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not found' }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/screener');

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    await context.close();
  });
});
