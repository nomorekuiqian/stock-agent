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
  const user = { id: 'user-123', email: 'test@example.com', name: 'Playwright User' };

  await page.context().addCookies([{
    name: 'app_access_token',
    value: accessToken,
    domain: 'localhost',
    path: '/',
    sameSite: 'Lax',
  }]);

  await page.route('**/api/auth/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user, accessToken }),
    });
  });

  await page.route('**/api/auth/public-config', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requireEmailVerification: true,
        verifyEmailMethod: 'code',
        passwordMinLength: 6,
      }),
    });
  });
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

function buildLayoutMessages(kind: 'long' | 'short') {
  const count = kind === 'long' ? 36 : 2;
  return Array.from({ length: count }).flatMap((_, index) => [
    {
      id: `${kind}-u-${index}`,
      role: 'user' as const,
      content: `${kind} 用户消息 ${index + 1}`,
    },
    {
      id: `${kind}-a-${index}`,
      role: 'assistant' as const,
      content: (`${kind} 助手回答 ${index + 1}，用于测试滚动布局。 `).repeat(
        kind === 'long' ? 16 : 2,
      ),
    },
  ]);
}

function buildLayoutSessionState(kind: 'long' | 'short') {
  return {
    phase: 'chat',
    messages: buildLayoutMessages(kind),
    accumulatedFilters: [],
    candidates: [],
    candidateCount: 0,
    universeSize: 0,
    recommendations: [],
    funnelSteps: [],
    isLoading: false,
    toolActivities: [],
    error: null,
    hasNewResults: false,
    conversationId: `layout-${kind}`,
    conversationTitle: kind === 'long' ? '长对话' : '短对话',
    activeContent: {
      type: 'screener',
      label: '选股结果',
      summary: '',
      params: {},
      available_actions: [],
    },
    contentStack: [],
    contextEntryKey: null,
    kolChunks: [],
    personaUsername: null,
  };
}

function buildLayoutConversation(kind: 'long' | 'short') {
  const state = buildLayoutSessionState(kind);
  return {
    id: `layout-${kind}`,
    title: kind === 'long' ? '长对话' : '短对话',
    message_count: state.messages.length,
    data: {
      messages: state.messages,
      accumulated_filters: [],
      candidates: [],
      candidate_count: 0,
      universe_size: 0,
      recommendations: [],
      funnel_steps: [],
      active_content: state.activeContent,
      content_stack: [],
      kol_chunks: [],
      persona_username: null,
    },
  };
}

async function mockBackendApi(page: Page) {
  await page.route('**/api/research/quota', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        allowed: true,
        used: 0,
        limit: 5,
        remaining: 5,
        unlimited: false,
      }),
    });
  });

  // Mock streaming research chat endpoint used by the page.
  await page.route('**/api/research/chat/stream', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ type: 'done', result: MOCK_AI_RESPONSE })}\n\n`,
    });
  });

  // Mock research chat endpoint
  await page.route('**/api/research/chat', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AI_RESPONSE),
    });
  });

  // Mock research conversations endpoints
  await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
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

test.describe('Screener page (/research)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithMock(page);
  });

  // -----------------------------------------------------------------------
  // 1. WelcomeScreen renders correctly (fast, no API call)
  // -----------------------------------------------------------------------

  test('displays WelcomeScreen with all key elements', async ({ page }) => {
    await page.goto('/research');

    await expect(page.getByText('Hi，Playwright User')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /一句话选股/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /个股研究台/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /宏观仪表盘/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /每日简报/ })).toBeVisible();
    await expect(page.getByLabel('消息输入')).toBeVisible();
  });

  test('renders the current capability card set', async ({ page }) => {
    await page.goto('/research');
    await expect(page.getByLabel('消息输入')).toBeVisible({ timeout: 15000 });

    const capabilityCards = page.locator(
      [
        'button:has-text("一句话选股")',
        'button:has-text("个股研究台")',
        'button:has-text("宏观仪表盘")',
        'button:has-text("每日简报")',
      ].join(', '),
    );
    await expect(capabilityCards).toHaveCount(4);
  });

  // -----------------------------------------------------------------------
  // 2. Full agent conversation flow (requires running backend)
  // -----------------------------------------------------------------------

  test('clicking a strategy card starts a conversation with AI', async ({ page }) => {
    test.setTimeout(30_000);

    await mockBackendApi(page);
    await page.goto('/research');
    await expect(page.getByLabel('消息输入')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /一句话选股/ }).click();
    await page.getByRole('button', { name: /估值/ }).click();

    await expect(page.getByText('帮我找 PE 小于 20 且有稳定分红的股票')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(MOCK_AI_RESPONSE.message)).toBeVisible({ timeout: 15000 });
  });

  test('typing a custom query gets AI response with results', async ({ page }) => {
    test.setTimeout(30_000);

    await mockBackendApi(page);
    await page.goto('/research');
    await expect(page.getByLabel('消息输入')).toBeVisible({ timeout: 15000 });

    // Type a custom query
    const textarea = page.getByLabel('消息输入');
    await textarea.fill('PE 低于 15 且 ROE 超过 20%');

    await page.getByRole('button', { name: '发送消息' }).click();

    await expect(page.getByText('PE 低于 15 且 ROE 超过 20%')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(MOCK_AI_RESPONSE.message)).toBeVisible({ timeout: 15000 });
  });

  test('keeps conversation sidebar pinned while switching between long and short chats', async ({ page }) => {
    test.setTimeout(30_000);

    await page.addInitScript((state) => {
      sessionStorage.setItem('screener_research_state', JSON.stringify(state));
    }, buildLayoutSessionState('long'));

    await page.route('**/api/research/quota', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          allowed: true,
          used: 0,
          limit: 5,
          remaining: 5,
          unlimited: false,
        }),
      });
    });

    await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversations: [
            {
              id: 'layout-long',
              title: '长对话',
              message_count: buildLayoutMessages('long').length,
              updated_at: new Date().toISOString(),
            },
            {
              id: 'layout-short',
              title: '短对话',
              message_count: buildLayoutMessages('short').length,
              updated_at: new Date().toISOString(),
            },
          ],
          has_more: false,
        }),
      });
    });

    await page.route('**/api/research/conversations/layout-*', async (route: Route) => {
      const id = route.request().url().split('/').pop();
      const kind = id === 'layout-short' ? 'short' : 'long';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLayoutConversation(kind)),
      });
    });

    await page.route('**/api/agent-runtime/sessions/*', async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not found' }),
      });
    });

    await page.goto('/research');

    const sidebar = page.getByTestId('research-conversation-sidebar');
    const shell = page.getByTestId('research-chat-shell');
    const chatScroll = page.getByTestId('research-chat-scroll');

    await expect(page.getByText('long 用户消息 36')).toBeVisible({ timeout: 15000 });
    await expect(sidebar).toBeVisible();

    const beforeBox = await sidebar.boundingBox();
    expect(beforeBox).not.toBeNull();
    await expect(shell).toHaveJSProperty('scrollTop', 0);

    await chatScroll.hover();
    await page.mouse.wheel(0, 2200);
    await expect(shell).toHaveJSProperty('scrollTop', 0);
    await expect(page.locator('body')).toHaveJSProperty('scrollTop', 0);
    await expect(page.locator('html')).toHaveJSProperty('scrollTop', 0);

    await page.getByText('短对话').click();
    await expect(page.getByText('short 用户消息 2')).toBeVisible({ timeout: 15000 });

    const afterBox = await sidebar.boundingBox();
    expect(afterBox).not.toBeNull();
    expect(Math.round(afterBox!.y)).toBe(Math.round(beforeBox!.y));
    expect(Math.round(afterBox!.height)).toBe(Math.round(beforeBox!.height));
    await expect(shell).toHaveJSProperty('scrollTop', 0);
  });

  test('restores KOL runtime session when picker conversation is unavailable', async ({ page }) => {
    test.setTimeout(30_000);

    const runtimeAgentCalls: string[] = [];

    await page.route('**/api/research/quota', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          allowed: true,
          used: 0,
          limit: 5,
          remaining: 5,
          unlimited: false,
        }),
      });
    });

    await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversations: [
            {
              id: 'conv-runtime-kol',
              title: 'Runtime KOL',
              message_count: 2,
              updated_at: new Date().toISOString(),
            },
          ],
          has_more: false,
        }),
      });
    });

    await page.route('**/api/research/conversations/conv-runtime-kol', async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Conversation not found' }),
      });
    });

    await page.route('**/api/agent-runtime/sessions/conv-runtime-kol?*', async (route: Route) => {
      const url = new URL(route.request().url());
      const agentId = url.searchParams.get('agent_id') || '';
      runtimeAgentCalls.push(agentId);

      if (agentId === 'research_agent') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session: null,
            entries: [],
            events: [],
            cursor: null,
            messages_cursor: null,
            ui_state: null,
            summary: null,
            title: null,
            metadata: {},
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            session_id: 'conv-runtime-kol',
            metadata: {
              agent_kind: 'kol_research',
              persona_username: 'qinbafrank',
              title: 'Runtime KOL',
            },
          },
          entries: [
            {
              id: 'e1',
              role: 'user',
              content: 'NVDA 还能买吗？',
              metadata: {},
              turn_id: 't1',
              client_event_id: 't1:user_message',
              client_ts: null,
              created_at: '2026-01-01T00:00:00Z',
            },
            {
              id: 'e2',
              role: 'assistant',
              content: 'runtime only answer from KOL',
              metadata: {},
              turn_id: 't1',
              client_event_id: 't1:assistant_message',
              client_ts: null,
              created_at: '2026-01-01T00:00:01Z',
            },
          ],
          events: [],
          cursor: { created_at: '2026-01-01T00:00:01Z', id: 'e2' },
          messages_cursor: { created_at: '2026-01-01T00:00:01Z', id: 'e2' },
          ui_state: null,
          summary: null,
          title: 'Runtime KOL',
          metadata: {
            agent_kind: 'kol_research',
            persona_username: 'qinbafrank',
            title: 'Runtime KOL',
          },
        }),
      });
    });

    await page.goto('/research');
    await expect(page.getByText('Runtime KOL')).toBeVisible({ timeout: 15000 });
    await page.getByText('Runtime KOL').click();

    await expect(page.getByText('runtime only answer from KOL')).toBeVisible({ timeout: 10000 });
    expect(runtimeAgentCalls).toEqual(['research_agent', 'kol_research_agent']);
  });

  test('keeps KOL citation chunks when a follow-up returns no new chunks', async ({ page }) => {
    test.setTimeout(30_000);

    let streamCalls = 0;
    const saveBodies: Record<string, unknown>[] = [];
    const citationChunk = {
      citation_index: 1,
      source_id: 'tweet-1',
      title: null,
      url: 'https://x.com/qinbafrank/status/1',
      content: 'Frank 原文支持',
      similarity: 0.92,
      author_username: 'qinbafrank',
      created_at: '2026-01-01T00:00:00Z',
      tickers: ['NVDA'],
      metadata: {},
    };

    await page.route('**/api/flags', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ flags: ['kol_research_agent'] }),
      });
    });

    await page.route('**/api/research/quota', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          allowed: true,
          used: 0,
          limit: 5,
          remaining: 5,
          unlimited: false,
        }),
      });
    });

    await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [], has_more: false }),
      });
    });

    await page.route('**/api/kol_research/conversations', async (route: Route) => {
      if (route.request().method() === 'POST') {
        saveBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'kol-conv-1' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [], has_more: false }),
      });
    });

    await page.route('**/api/kol_research/conversations/kol-conv-1', async (route: Route) => {
      if (route.request().method() === 'PUT') {
        saveBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, id: 'kol-conv-1' }),
      });
    });

    await page.route('**/api/kol_research/chat/stream', async (route: Route) => {
      streamCalls += 1;
      const chunks = streamCalls === 1 ? [citationChunk] : [];
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({
          type: 'final',
          data: {
            persona_username: 'qinbafrank',
            message: streamCalls === 1 ? '第一轮回答 [#1]' : '第二轮回答沿用上一轮证据',
            kol_chunks: chunks,
            activated_skills: [],
            tool_calls: [],
            navigate: null,
          },
        })}\n\n`,
      });
    });

    await page.goto('/research?agent=kol&persona=qinbafrank&q=第一轮问题');
    await expect(page.getByText('第一轮回答')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Frank 原文支持')).toBeVisible({ timeout: 10000 });

    await page.getByLabel('消息输入').fill('第二轮问题');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.getByText('第二轮回答沿用上一轮证据')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Frank 原文支持')).toBeVisible({ timeout: 10000 });

    const latestSave = saveBodies.at(-1);
    const latestData = latestSave?.data as Record<string, unknown>;
    expect((latestData.kol_chunks as unknown[])).toHaveLength(1);
    expect(latestData.active_content).toBeUndefined();
  });

  test('does not save an unchanged restored research conversation', async ({ page }) => {
    test.setTimeout(30_000);

    let saveCalls = 0;

    await page.addInitScript((state) => {
      sessionStorage.setItem('screener_research_state', JSON.stringify(state));
    }, buildLayoutSessionState('short'));

    await page.route('**/api/flags', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ flags: [] }),
      });
    });

    await page.route('**/api/research/quota', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          allowed: true,
          used: 0,
          limit: 5,
          remaining: 5,
          unlimited: false,
        }),
      });
    });

    await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversations: [{
            id: 'layout-short',
            title: '短对话',
            message_count: buildLayoutMessages('short').length,
            updated_at: '2026-01-01T00:00:00.000Z',
          }],
          has_more: false,
        }),
      });
    });

    await page.route('**/api/research/conversations/layout-short', async (route: Route) => {
      if (route.request().method() === 'PUT') {
        saveCalls += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLayoutConversation('short')),
      });
    });

    await page.route(/\/api\/agent-runtime\/sessions\/layout-short(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: null,
          entries: [],
          events: [],
          cursor: null,
          messages_cursor: null,
          ui_state: null,
          summary: null,
          title: null,
          metadata: {},
        }),
      });
    });

    await page.goto('/research');
    await expect(page.getByText('short 用户消息 2')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    expect(saveCalls).toBe(0);

    await page.reload();
    await expect(page.getByText('short 用户消息 2')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    expect(saveCalls).toBe(0);
  });

  test('does not resend a restored KOL URL seed after hard reload', async ({ page }) => {
    test.setTimeout(30_000);

    const seed = '第一轮问题';
    let streamCalls = 0;
    let createCalls = 0;

    await page.route('**/api/flags', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ flags: ['kol_research_agent'] }),
      });
    });

    await page.route('**/api/research/quota', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          allowed: true,
          used: 0,
          limit: 5,
          remaining: 5,
          unlimited: false,
        }),
      });
    });

    await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [], has_more: false }),
      });
    });

    await page.route('**/api/kol_research/conversations', async (route: Route) => {
      if (route.request().method() === 'POST') {
        createCalls += 1;
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: body.id || 'kol-reload-1' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [], has_more: false }),
      });
    });

    await page.route('**/api/kol_research/conversations/*', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route('**/api/agent-runtime/sessions/*', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: null,
          entries: [],
          events: [],
          cursor: null,
          messages_cursor: null,
          ui_state: null,
          summary: null,
          title: null,
          metadata: {},
        }),
      });
    });

    await page.route('**/api/kol_research/chat/stream', async (route: Route) => {
      streamCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({
          type: 'final',
          data: {
            persona_username: 'qinbafrank',
            message: 'KOL 首轮回答',
            kol_chunks: [],
            activated_skills: [],
            tool_calls: [],
            navigate: null,
          },
        })}\n\n`,
      });
    });

    await page.goto(`/research?agent=kol&persona=qinbafrank&q=${encodeURIComponent(seed)}`);
    await expect(page.getByText('KOL 首轮回答')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => createCalls, { timeout: 5000 }).toBe(1);
    await page.waitForFunction((expectedSeed) => {
      const raw = sessionStorage.getItem('screener_research_state');
      if (!raw) return false;
      const restored = JSON.parse(raw) as {
        personaUsername?: string;
        messages?: { role?: string; content?: string }[];
      };
      const firstUserMessage = restored.messages?.find((m) => m.role === 'user');
      return restored.personaUsername === 'qinbafrank' &&
        firstUserMessage?.content === expectedSeed;
    }, seed);

    await page.reload();
    await expect(page.getByText('KOL 首轮回答')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    expect(streamCalls).toBe(1);
    expect(createCalls).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 3. Navigation and state management
  // -----------------------------------------------------------------------

  test('"新对话" resets back to WelcomeScreen', async ({ page }) => {
    test.setTimeout(30_000);

    await mockBackendApi(page);
    await page.goto('/research');
    await expect(page.getByLabel('消息输入')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /一句话选股/ }).click();
    await page.getByRole('button', { name: /估值/ }).click();
    await expect(page.getByText(MOCK_AI_RESPONSE.message)).toBeVisible({ timeout: 15000 });

    // Click reset
    await page.getByRole('button', { name: '新对话' }).click();

    // Should return to WelcomeScreen
    await expect(page.getByLabel('消息输入')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /一句话选股/ })).toBeVisible();
  });

  test('unauthenticated user can view the public research landing', async ({ browser }) => {
    // Fresh context without login.
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route('**/api/auth/session', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null, accessToken: null }),
      });
    });

    await page.route('**/api/research/quota', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          allowed: true,
          used: 0,
          limit: 5,
          remaining: 5,
          unlimited: false,
        }),
      });
    });

    await page.route(/\/api\/research\/conversations(?:\?.*)?$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [], has_more: false }),
      });
    });

    await page.goto('/research');

    await expect(page).toHaveURL(/\/research/, { timeout: 15000 });
    await expect(page.getByLabel('消息输入')).toBeVisible();

    await context.close();
  });
});
