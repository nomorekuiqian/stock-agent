import { test, expect, type Page, type Route } from '@playwright/test';

async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/api/auth/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
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

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });
}

async function mockKolCockpit(page: Page) {
  await page.route('**/api/kol_research/personas/qinbafrank/profile', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        persona: {
          username: 'qinbafrank',
          display_name: 'qinbafrank',
          description: 'Public KOL research cockpit',
        },
        core: {
          bio: 'Mock Frank bio',
          portrait: 'Mock portrait',
          principles: [],
          fingerprint: '',
          not_doing: [],
        },
        sectors: [],
      }),
    });
  });

  await page.route('**/api/kol_research/personas/qinbafrank/tickers', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tickers: [{
          ticker: 'NVDA',
          aliases: ['英伟达'],
          count: 3,
          first: '2026-01-01T00:00:00Z',
          latest: '2026-06-01T00:00:00Z',
          priceable: true,
          price: 123.45,
          daily_change: 1.2,
          summary: null,
        }],
      }),
    });
  });

  await page.route('**/api/kol_research/personas/qinbafrank/sectors', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sectors: [{
          key: 'ai-infrastructure',
          label: 'AI 产业',
          eyebrow: 'AI',
          layer: 'sector',
          short: 'AI infrastructure',
          tweet_count: 3,
          ticker_count: 1,
        }],
      }),
    });
  });

  await page.route('**/api/kol_research/personas/qinbafrank/feed**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tweets: [{
          id: 'tweet-1',
          text: 'Mock qinbafrank AI thesis',
          created_at: '2026-06-01T00:00:00Z',
          url: 'https://x.com/qinbafrank/status/1',
          like_count: 10,
          retweet_count: 2,
          reply_count: 1,
          tweet_type: 'original',
          tickers: ['NVDA'],
          sectors: ['AI'],
          content_type: 'thesis',
          key_claim: 'AI thesis',
          topics: ['industry/ai_infra'],
          reply_kind: null,
        }],
        total: 1,
        raw_total: 99,
        has_more: false,
        offset: 0,
        limit: 3,
      }),
    });
  });
}

test.describe('KOL page login gate', () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await mockKolCockpit(page);
  });

  test('keeps qinbafrank root public but gates sub-pages behind login', async ({ page }) => {
    await page.goto('/kol/qinbafrank');
    await expect(page.getByText('qinbafrank研究室')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('登录后查看完整内容')).not.toBeVisible();

    await page.goto('/kol/qinbafrank/stocks');
    await expect(page.getByText('登录后查看完整内容')).toBeVisible({ timeout: 15000 });
    const gatedMain = page.getByRole('main');
    await expect(gatedMain.getByRole('link', { name: '登录' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fkol%2Fqinbafrank%2Fstocks',
    );
    await expect(gatedMain.getByRole('link', { name: '免费注册' })).toHaveAttribute(
      'href',
      '/login?mode=signup&redirect=%2Fkol%2Fqinbafrank%2Fstocks',
    );
  });
});
