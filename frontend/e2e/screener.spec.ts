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
  // Shared state persists across page navigations within the same route handler
  let currentUser: Record<string, unknown> | null = null;

  // Mock Insforge SDK auth endpoints (SDK Direct — no /api/auth server bridge).
  // currentUser is captured in closure so refreshSession can recover session on
  // subsequent page.goto() calls (full page reloads clear in-memory auth state).
  await page.route('**/api/auth/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/api/auth/public-config')) {
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

    // signInWithPassword → POST /api/auth/sessions
    if (path.endsWith('/api/auth/sessions') && route.request().method() === 'POST') {
      currentUser = { id: 'user-123', email: 'test@example.com', profile: { name: 'Playwright User' } };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken, csrfToken: 'test-csrf-token', user: currentUser }),
      });
      // Set first-party CSRF cookie so middleware allows protected routes
      await page.context().addCookies([{
        name: 'insforge_csrf_token',
        value: 'test-csrf-token',
        domain: 'localhost',
        path: '/',
        sameSite: 'Lax',
      }]);
      return;
    }

    // refreshSession — succeeds if user is logged in so page reloads recover session
    if (path.endsWith('/api/auth/refresh')) {
      if (currentUser) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ accessToken, user: currentUser }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Unauthorized' }),
        });
      }
      return;
    }

    // getCurrentUser (session check)
    if (path.endsWith('/api/auth/sessions/current')) {
      await route.fulfill({
        status: currentUser ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(currentUser ? { user: currentUser } : { message: 'Unauthorized' }),
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
}

// ---------------------------------------------------------------------------
// Helper: mock backend API for self-contained tests
// ---------------------------------------------------------------------------

const MOCK_AI_RESPONSE = {
  success: true,
  message: '根据你的筛选条件，我找到了一些符合要求的股票。以下是初步结果，我们可以进一步细化。',
  options: ['查看详情', '继续筛选', '换个方向'],
  candidates: [
    { symbol: 'AAPL', name: 'Apple Inc.', pe: 28.5, roe: 145.6 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', pe: 35.2, roe: 38.4 },
  ],
  candidate_count: 2,
  universe_size: 8500,
  recommendations: [],
  accumulated_filters: [],
  reset_results: false,
  title: '价值筛选',
  navigate: null,
  data_freshness: new Date().toISOString(),
  is_stale: false,
};

async function mockBackendApi(page: Page) {
  // Mock research chat endpoint
  await page.route('**/api/research/chat', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AI_RESPONSE),
    });
  });

  // Mock research conversations endpoints
  await page.route('**/api/research/conversations', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] }),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'conv-mock-001' }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/research/conversations/*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Mock screener conversations endpoints (used by WelcomeScreen)
  await page.route('**/api/screener/conversations', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [] }),
    });
  });

  // Mock screener sectors (used by DataStatus)
  await page.route('**/api/screener/sectors', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, sectors: [{ name: 'Technology', count: 3500 }] }),
    });
  });

  // Mock screener status
  await page.route('**/api/screener/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cached: true, freshness: new Date().toISOString() }),
    });
  });

  // Mock cookie session recovery
  await page.route('**/api/auth/session', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          accessToken: createFakeJwt(),
          user: { id: 'user-123', email: 'test@example.com' },
        }),
      });
    } else {
      await route.continue();
    }
  });
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

    // Editorial title (use heading role to avoid matching nav link)
    await expect(page.getByRole('heading', { name: '投研助手' })).toBeVisible({ timeout: 15000 });

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
    const refreshButtons = page.locator('button[aria-label="换一批策略"], button[aria-label="换一批主题"]');
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
    test.setTimeout(30_000);

    await mockBackendApi(page);
    await page.goto('/screener');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

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
    const userBubble = page.locator('.bg-primary').first();
    await expect(userBubble).toBeVisible({ timeout: 5000 });

    // Wait for AI response — max-w-[85%] distinguishes real messages from TypingIndicator
    const aiMessage = page.locator('.max-w-\\[85\\%\\].rounded-tl-sm').first();
    await expect(aiMessage).toBeVisible({ timeout: 15000 });

    // AI response should contain some text (not empty)
    const aiText = await aiMessage.innerText();
    expect(aiText.length).toBeGreaterThan(10);
  });

  test('typing a custom query gets AI response with results', async ({ page }) => {
    test.setTimeout(30_000);

    await mockBackendApi(page);
    await page.goto('/screener');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Type a custom query
    const textarea = page.locator('textarea');
    await textarea.fill('PE 低于 15 且 ROE 超过 20%');

    // Click send button — the button is next to the textarea inside the same container
    const sendBtn = textarea.locator('..').locator('button');
    await sendBtn.click();

    // Should transition to chat phase
    await expect(page.locator('text=重新开始')).toBeVisible({ timeout: 10000 });

    // Wait for AI response
    const aiMessage = page.locator('.max-w-\\[85\\%\\].rounded-tl-sm').first();
    await expect(aiMessage).toBeVisible({ timeout: 15000 });

    // On desktop, results panel should show something
    // (candidate count, funnel steps, or "waiting for results" state)
    const resultsPanel = page.locator('.lg\\:w-1\\/2').last();
    await expect(resultsPanel).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 3. Navigation and state management
  // -----------------------------------------------------------------------

  test('"重新开始" resets back to WelcomeScreen', async ({ page }) => {
    test.setTimeout(30_000);

    await mockBackendApi(page);
    await page.goto('/screener');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

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
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10000 });
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
