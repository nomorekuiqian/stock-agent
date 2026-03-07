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

async function setupAuthMocks(page: Page) {
  const accessToken = createFakeJwt();
  let currentUser: Record<string, unknown> | null = null;

  await page.route('**/api/auth/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/api/auth/public-config')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          requireEmailVerification: true,
          verifyEmailMethod: 'code',
          passwordMinLength: 8,
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
        status: currentUser ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(currentUser ? { user: currentUser } : { message: 'Unauthorized' }),
      });
      return;
    }

    if (url.pathname.endsWith('/api/auth/profiles/current') && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as { profile?: { name?: string } };
      currentUser = {
        ...(currentUser ?? {}),
        profile: {
          ...(((currentUser?.profile as Record<string, unknown> | undefined) ?? {})),
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
    async mockLoginSuccess() {
      await page.route('**/api/auth/sessions', async (route: Route) => {
        const payload = route.request().postDataJSON() as { email: string };
        currentUser = {
          id: 'user-123',
          email: payload.email,
          profile: { name: 'Playwright User' },
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken,
            csrfToken: 'csrf-token',
            user: currentUser,
          }),
        });
      });
    },

    async mockLoginFailure(message = 'Invalid email or password') {
      await page.route('**/api/auth/sessions', async (route: Route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message }),
        });
      });
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
            user: {
              id: 'pending-user-123',
              email: payload.email,
              emailVerified: false,
            },
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
        currentUser = {
          id: 'verified-user-123',
          email: 'fresh-user@example.com',
          profile: {},
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken,
            user: currentUser,
          }),
        });
      });
    },
  };
}

test.describe('Auth flows (/login, /verify-email)', () => {
  test('displays login form', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/login');

    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '使用 Google 登录' })).toBeVisible();
  });

  test('shows translated error for invalid credentials', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockLoginFailure();

    await page.goto('/login');
    await page.getByLabel('邮箱').fill('wrong@example.com');
    await passwordInput(page).fill('WrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page.getByText('邮箱或密码错误')).toBeVisible();
  });

  test('redirects after successful login', async ({ page }) => {
    const auth = await setupAuthMocks(page);
    await auth.mockLoginSuccess();

    await page.goto('/login?redirect=%2Ffor-you');
    await page.getByLabel('邮箱').fill('user@example.com');
    await passwordInput(page).fill('StrongPassword123');
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page).toHaveURL(/\/for-you/, { timeout: 10000 });
  });

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
        value: {
          getData: () => '23456',
        },
      });
      element.dispatchEvent(clipboardEvent);
    });

    await expect(codeInputs.nth(5)).toHaveValue('6');
    await page.getByRole('button', { name: '验证邮箱' }).click();

    await expect(page.getByText('邮箱已验证')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 10000 });
  });
});
