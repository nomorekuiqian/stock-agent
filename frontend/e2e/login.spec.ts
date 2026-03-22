import { test, expect, type Page, type Route } from '@playwright/test';

function passwordInput(page: Page) {
  return page.locator('input#password');
}

function createFakeJwt(): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 }),
    'signature',
  ].join('.');
}

/**
 * Mock all Insforge SDK auth API calls (SDK Direct — no /api/auth server bridge).
 *
 * The SDK calls the Insforge server directly:
 *   signInWithPassword → POST {INSFORGE_URL}/api/auth/sessions
 *   signOut            → POST {INSFORGE_URL}/api/auth/logout
 *   refreshSession     → POST {INSFORGE_URL}/api/auth/refresh
 *   getCurrentUser     → GET  {INSFORGE_URL}/api/auth/sessions/current
 *
 * All are intercepted via the `** /api/auth/**` glob.
 * Specific optional mocks (signUp, verifyEmail, resend) are registered separately
 * and take priority over this handler (Playwright LIFO route resolution).
 */
async function setupAuthMocks(page: Page) {
  const accessToken = createFakeJwt();
  let currentUser: Record<string, unknown> | null = null;
  let loginShouldSucceed = false;
  let loginErrorMessage = 'Invalid credentials';

  await page.route('**/api/auth/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    // SDK auth config (needed by sign-up / verify-email pages)
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
    if (path.endsWith('/api/auth/sessions') && request.method() === 'POST') {
      if (loginShouldSucceed) {
        const body = request.postDataJSON() as { email?: string };
        currentUser = {
          id: 'user-123',
          email: body.email || 'user@example.com',
          profile: { name: 'Test User' },
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken,
            csrfToken: 'test-csrf-token',
            user: currentUser,
          }),
        });
        // Belt-and-suspenders: set first-party CSRF cookie so middleware allows
        // protected routes, regardless of whether the SDK sets it via document.cookie.
        await page.context().addCookies([{
          name: 'insforge_csrf_token',
          value: 'test-csrf-token',
          domain: 'localhost',
          path: '/',
          sameSite: 'Lax',
        }]);
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: loginErrorMessage }),
        });
      }
      return;
    }

    // refreshSession — not available without server bridge; return 401
    if (path.endsWith('/api/auth/refresh')) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
      return;
    }

    // getCurrentUser (session check)
    if (path.endsWith('/api/auth/sessions/current')) {
      await route.fulfill({
        status: currentUser ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(
          currentUser ? { user: currentUser } : { message: 'Unauthorized' },
        ),
      });
      return;
    }

    // signOut → POST /api/auth/logout
    if (path.endsWith('/api/auth/logout') && request.method() === 'POST') {
      currentUser = null;
      await page.context().clearCookies({ name: 'insforge_csrf_token' });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    // Profile update
    if (path.endsWith('/api/auth/profiles/current') && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as { profile?: { name?: string } };
      currentUser = {
        ...(currentUser ?? {}),
        profile: {
          ...((currentUser?.profile as Record<string, unknown> | undefined) ?? {}),
          ...(payload.profile ?? {}),
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: (currentUser as { profile?: unknown }).profile ?? {} }),
      });
      return;
    }

    await route.continue();
  });

  return {
    mockLoginSuccess() {
      loginShouldSucceed = true;
    },

    mockLoginFailure(message = 'Invalid credentials') {
      loginShouldSucceed = false;
      loginErrorMessage = message;
    },

    async mockSignUpRequiresVerification() {
      await page.route('**/api/auth/users', async (route: Route) => {
        const payload = route.request().postDataJSON() as { email: string };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            requireEmailVerification: true,
            accessToken: null,
            user: { id: 'pending-user-123', email: payload.email, emailVerified: false },
          }),
        });
      });
    },

    async mockSignUpDuplicateEmail(message = 'User already exists') {
      await page.route('**/api/auth/users', async (route: Route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message }),
        });
      });
    },

    async mockVerifyEmailSuccess() {
      await page.route('**/api/auth/email/verify', async (route: Route) => {
        currentUser = { id: 'verified-user-123', email: 'fresh-user@example.com', profile: {} };
        await page.context().addCookies([{
          name: 'insforge_csrf_token',
          value: 'test-csrf-token',
          domain: 'localhost',
          path: '/',
          sameSite: 'Lax',
        }]);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ accessToken, user: currentUser }),
        });
      });
    },

    async mockVerifyEmailFailure() {
      await page.route('**/api/auth/email/verify', async (route: Route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid verification code' }),
        });
      });
    },

    async mockResendVerification() {
      // SDK calls POST /api/auth/email/send-verification for resend
      await page.route('**/api/auth/email/send-verification', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });
    },
  };
}

/** Stub out all backend API calls so /for-you and other pages load without errors. */
async function mockBackendApis(page: Page) {
  await page.route('http://localhost:8000/api/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/watchlist') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbols: [] }) });
    } else if (path.startsWith('/api/digests')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], total: 0 }) });
    } else if (path.startsWith('/api/subscriptions')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, subscribed: false, channel: 'personal_digest', email: '', metadata: {} }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
  });
}

test.describe('Auth flows (/login, /verify-email)', () => {
  // ── Section: Login UI ───────────────────────────────────────────────────────

  test('displays login form with email/password inputs and Google button', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/login');

    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '使用 Google 登录' })).toBeVisible();
  });

  test('shows translated error for invalid credentials', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    auth.mockLoginFailure();

    await page.goto('/login');
    await page.getByLabel('邮箱').fill('wrong@example.com');
    await passwordInput(page).fill('WrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page.getByText('邮箱或密码错误')).toBeVisible();
  });

  test('redirects to stored redirect path after successful login', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    auth.mockLoginSuccess();
    await mockBackendApis(page);

    await page.goto('/login?redirect=%2Ffor-you');
    await page.getByLabel('邮箱').fill('user@example.com');
    await passwordInput(page).fill('StrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });
  });

  // ── Section A: Middleware redirect (unauthenticated) ────────────────────────

  test('redirects unauthenticated user from /for-you to /login with redirect param', async ({ page }) => {
    await setupAuthMocks(page);
    // No insforge_csrf_token cookie → middleware redirects
    await page.goto('/for-you');

    // Middleware sets redirect param; browser may or may not encode the slash
    await expect(page).toHaveURL(/\/login.*redirect.*for-you/, { timeout: 10000 });
  });

  test('redirects unauthenticated user from /profile to /login with redirect param', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/profile');

    await expect(page).toHaveURL(/\/login.*redirect.*profile/, { timeout: 10000 });
  });

  test('redirects unauthenticated user from /screener to /login with redirect param', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/screener');

    await expect(page).toHaveURL(/\/login.*redirect.*screener/, { timeout: 10000 });
  });

  // ── Section J: Post-logout redirect ─────────────────────────────────────────

  test('removing insforge_csrf_token cookie causes subsequent protected-page visits to redirect to /login', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    auth.mockLoginSuccess();
    await mockBackendApis(page);

    // Login and reach a protected page
    await page.goto('/login?redirect=%2Ffor-you');
    await page.getByLabel('邮箱').fill('user@example.com');
    await passwordInput(page).fill('StrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });

    // Simulate sign-out by clearing the auth hint cookie
    await page.context().clearCookies({ name: 'insforge_csrf_token' });

    // Middleware should now redirect
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login.*redirect.*profile/, { timeout: 10000 });
  });

  // ── Section K: Bearer token on API calls ────────────────────────────────────

  test('backend API requests include Authorization Bearer header after login', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    auth.mockLoginSuccess();

    const capturedAuthHeaders: string[] = [];
    await page.route('http://localhost:8000/api/**', async (route: Route) => {
      capturedAuthHeaders.push(route.request().headers()['authorization'] ?? '');
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/watchlist') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbols: [] }) });
      } else if (path.startsWith('/api/digests')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], total: 0 }) });
      } else if (path.startsWith('/api/subscriptions')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, subscribed: false, channel: 'personal_digest', email: '', metadata: {} }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/login?redirect=%2Ffor-you');
    await page.getByLabel('邮箱').fill('user@example.com');
    await passwordInput(page).fill('StrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });

    // Allow page API calls to fire
    await page.waitForTimeout(2000);

    const bearerCalls = capturedAuthHeaders.filter((h) => h.startsWith('Bearer '));
    expect(bearerCalls.length).toBeGreaterThan(0);
  });

  // ── Section L: Failure recovery ─────────────────────────────────────────────

  test('recovers from failed login — second attempt with correct password succeeds', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    auth.mockLoginFailure();
    await mockBackendApis(page);

    await page.goto('/login?redirect=%2Ffor-you');
    await page.getByLabel('邮箱').fill('user@example.com');
    await passwordInput(page).fill('WrongPassword');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page.getByText('邮箱或密码错误')).toBeVisible();

    // Second attempt
    auth.mockLoginSuccess();
    await passwordInput(page).fill('CorrectPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });
  });

  // ── Section C: Auth-expired backend 401 ─────────────────────────────────────

  test('shows auth-expired error when backend watchlist returns 401', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    auth.mockLoginSuccess();

    await page.route('http://localhost:8000/api/watchlist', async (route: Route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid or expired token' }),
      });
    });

    await page.route('http://localhost:8000/api/digests?*', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], total: 0 }),
      });
    });

    await page.route('http://localhost:8000/api/subscriptions/**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          channel: 'personal_digest',
          subscribed: false,
          email: 'user@example.com',
          metadata: {},
        }),
      });
    });

    await page.goto('/login?redirect=%2Ffor-you');
    await page.getByLabel('邮箱').fill('user@example.com');
    await passwordInput(page).fill('StrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });

    await expect(page.getByText('加载持仓数据失败')).toBeVisible();
    await expect(page.getByText('登录已过期', { exact: false })).toBeVisible();
  });

  // ── Section F: Sign-up and email verification ────────────────────────────────

  test('redirects sign-up users into verify-email flow', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockSignUpRequiresVerification();

    await page.goto('/login?redirect=%2Ftoday');
    await page.getByRole('button', { name: '注册' }).click();
    await page.getByLabel('姓名').fill('Fresh User');
    await page.getByLabel('邮箱').fill('fresh-user@example.com');
    await passwordInput(page).fill('Password123!');
    await page.getByRole('button', { name: '创建账户' }).click();

    await expect(page).toHaveURL(/\/verify-email\?redirect=%2Ftoday&email=fresh-user%40example\.com/, { timeout: 10000 });
    await expect(page.getByText('我们已向 fresh-user@example.com 发送验证邮件。')).toBeVisible();
  });

  test('shows translated duplicate-email error during sign up', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockSignUpDuplicateEmail();

    await page.goto('/login');
    await page.getByRole('button', { name: '注册' }).click();
    await page.getByLabel('姓名').fill('Existing User');
    await page.getByLabel('邮箱').fill('existing@example.com');
    await passwordInput(page).fill('Password123!');
    await page.getByRole('button', { name: '创建账户' }).click();

    await expect(page.getByText('该邮箱已注册，请直接登录')).toBeVisible();
  });

  test('accepts pasted verification code and completes verification', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockVerifyEmailSuccess();

    await page.goto('/verify-email?email=fresh-user%40example.com&redirect=%2Ftoday');

    const codeInputs = page.locator('input[inputmode="numeric"]');
    await expect(codeInputs).toHaveCount(6);
    await codeInputs.nth(0).click();
    await codeInputs.nth(0).fill('1');
    await codeInputs.nth(1).evaluate((element) => {
      const clipboardEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clipboardEvent, 'clipboardData', {
        value: { getData: () => '23456' },
      });
      element.dispatchEvent(clipboardEvent);
    });

    await expect(codeInputs.nth(5)).toHaveValue('6');
    await page.getByRole('button', { name: '验证邮箱' }).click();

    await expect(page.getByText('邮箱已验证')).toBeVisible({ timeout: 10000 });
  });

  test('verify-email redirects to original destination after success', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockVerifyEmailSuccess();
    await mockBackendApis(page);

    await page.goto('/verify-email?email=fresh-user%40example.com&redirect=%2Ffor-you');

    const codeInputs = page.locator('input[inputmode="numeric"]');
    await codeInputs.nth(0).click();
    await codeInputs.nth(0).fill('1');
    await codeInputs.nth(1).evaluate((element) => {
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '23456' } });
      element.dispatchEvent(ev);
    });
    await expect(codeInputs.nth(5)).toHaveValue('6');

    await page.getByRole('button', { name: '验证邮箱' }).click();

    // Should redirect to the stored redirect destination
    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });
  });

  // ── Section L: OTP failure recovery ─────────────────────────────────────────

  test('shows error for wrong OTP code and then succeeds with correct code', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockVerifyEmailFailure();

    await page.goto('/verify-email?email=fresh-user%40example.com&redirect=%2Ftoday');

    // Enter wrong code (fill index 0, paste rest from index 1)
    const codeInputs = page.locator('input[inputmode="numeric"]');
    await codeInputs.nth(0).click();
    await codeInputs.nth(0).fill('9');
    await codeInputs.nth(1).evaluate((element) => {
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '99999' } });
      element.dispatchEvent(ev);
    });
    await page.getByRole('button', { name: '验证邮箱' }).click();

    // Should stay on verify-email and show error
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 5000 });
    await expect(page.locator('.text-red-400')).toBeVisible({ timeout: 5000 });

    // Now switch to success mock and try with correct code
    await auth.mockVerifyEmailSuccess();
    await mockBackendApis(page);

    await codeInputs.nth(0).fill('1');
    await codeInputs.nth(1).evaluate((element) => {
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '23456' } });
      element.dispatchEvent(ev);
    });
    await expect(codeInputs.nth(5)).toHaveValue('6');
    await page.getByRole('button', { name: '验证邮箱' }).click();

    await expect(page.getByText('邮箱已验证')).toBeVisible({ timeout: 10000 });
  });

  // ── Section F: Resend verification ──────────────────────────────────────────

  test('resend verification email shows success confirmation', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockResendVerification();

    await page.goto('/verify-email?email=fresh-user%40example.com');

    await page.getByRole('button', { name: '重新发送验证邮件' }).click();

    await expect(page.getByText('验证邮件已重新发送')).toBeVisible({ timeout: 5000 });
  });
});
