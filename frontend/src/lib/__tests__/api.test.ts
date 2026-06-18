/**
 * API Library Unit Tests -- generated from git diff
 *
 * Tests for: api.* methods after cachedFetch removal.
 * Verifies API methods call fetch directly, handle errors, and
 * that the removed cache exports no longer exist.
 *
 * No network access. globalThis.fetch is mocked.
 *
 * Usage:
 *   cd frontend
 *   npx vitest run src/lib/__tests__/api.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth module before importing api
vi.mock('@/contexts/AuthContext', () => ({
  getAccessTokenAsync: vi.fn().mockResolvedValue('fake-token'),
  refreshSession: vi.fn().mockResolvedValue(null),
}));

import { api, ApiError } from '../api';
import { getAccessTokenAsync as getAccessToken, refreshSession } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch;

function mockFetchOk(data: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

function mockFetchError(status: number, detail?: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => (detail ? { detail } : {}),
  });
}

function mockFetchJsonFails(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => { throw new Error('not json'); },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('api (post cache removal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue('fake-token');
    vi.mocked(refreshSession).mockResolvedValue(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Cache removal regression
  // -------------------------------------------------------------------------
  describe('cache removal', () => {
    it('invalidateCache is no longer exported', async () => {
      const mod = await import('../api');
      expect('invalidateCache' in mod).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Liquidity APIs
  // -------------------------------------------------------------------------
  describe('getLiquidityMetrics', () => {
    it('calls fetch and returns data on success', async () => {
      const payload = { success: true, data: { fed_balance: 1000 } };
      mockFetchOk(payload);

      const result = await api.getLiquidityMetrics();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/liquidity/metrics')
      );
      expect(result).toEqual(payload);
    });

    it('throws on non-ok response with detail', async () => {
      mockFetchError(500, 'Server error');

      await expect(api.getLiquidityMetrics()).rejects.toThrow('Server error');
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.getLiquidityMetrics()).rejects.toThrow('Failed to fetch liquidity metrics');
    });
  });

  describe('getLiquidityHistory', () => {
    it('passes days parameter in query string', async () => {
      mockFetchOk({ success: true, data: [] });

      await api.getLiquidityHistory(180);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/liquidity/history?days=180')
      );
    });

    it('defaults to 365 days', async () => {
      mockFetchOk({ success: true, data: [] });

      await api.getLiquidityHistory();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/liquidity/history?days=365')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Macro Risk Dashboard
  // -------------------------------------------------------------------------
  describe('getMacroRiskDashboard', () => {
    it('fetches dashboard data directly', async () => {
      const payload = { success: true, dashboard: {} };
      mockFetchOk(payload);

      const result = await api.getMacroRiskDashboard();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/macro-risk/dashboard')
      );
      expect(result).toEqual(payload);
    });
  });

  // -------------------------------------------------------------------------
  // Reports APIs
  // -------------------------------------------------------------------------
  describe('reports.getLatest', () => {
    it('returns MarketData on success', async () => {
      const report = { title: 'Daily Report', report_date: '2026-02-26' };
      mockFetchOk({ data: report });

      const result = await api.reports.getLatest();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/reports/latest'),
        expect.any(Object)
      );
      expect(result).toEqual(report);
    });

    it('returns null on 404', async () => {
      mockFetchError(404);

      const result = await api.reports.getLatest();

      expect(result).toBeNull();
    });

    it('throws on non-404 error', async () => {
      mockFetchError(500, 'Internal error');

      await expect(api.reports.getLatest()).rejects.toThrow('Failed to fetch latest report');
    });
  });

  describe('reports.getById', () => {
    it('fetches report by ID', async () => {
      const report = { title: 'Test', report_date: '2026-01-01' };
      mockFetchOk({ data: report });

      const result = await api.reports.getById('abc-123');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/reports/abc-123'),
        expect.any(Object)
      );
      expect(result).toEqual(report);
    });

    it('returns null on 404', async () => {
      mockFetchError(404);

      const result = await api.reports.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('reports.list', () => {
    it('passes limit and offset params', async () => {
      mockFetchOk({ data: [], total: 0 });

      await api.reports.list(10, 5);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/market/reports?limit=10&offset=5'),
        expect.any(Object)
      );
    });

    it('returns data array and total count', async () => {
      const items = [{ id: '1', title: 'R1' }];
      mockFetchOk({ data: items, total: 42 });

      const result = await api.reports.list();

      expect(result.data).toEqual(items);
      expect(result.total).toBe(42);
    });

    it('defaults total to data length when total is missing', async () => {
      const items = [{ id: '1' }, { id: '2' }];
      mockFetchOk({ data: items });

      const result = await api.reports.list();

      expect(result.total).toBe(2);
    });

    it('handles null data gracefully', async () => {
      mockFetchOk({ data: null, total: 0 });

      const result = await api.reports.list();

      expect(result.data).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Weekly Report
  // -------------------------------------------------------------------------
  describe('weeklyReport.getLatest', () => {
    it('fetches weekly report directly', async () => {
      const payload = { success: true, report: {} };
      mockFetchOk(payload);

      const result = await api.weeklyReport.getLatest();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/weekly-report')
      );
      expect(result).toEqual(payload);
    });

    it('throws on failure', async () => {
      mockFetchError(500);

      await expect(api.weeklyReport.getLatest()).rejects.toThrow('Failed to fetch weekly report');
    });
  });

  // -------------------------------------------------------------------------
  // Economic & Sentiment APIs
  // -------------------------------------------------------------------------
  describe('getEconomicFundamentals', () => {
    it('fetches from correct endpoint', async () => {
      mockFetchOk({ success: true });

      await api.getEconomicFundamentals();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/macro-risk/economy')
      );
    });
  });

  describe('getMarketSentiment', () => {
    it('fetches from correct endpoint', async () => {
      mockFetchOk({ success: true });

      await api.getMarketSentiment();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/macro-risk/sentiment')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Global Liquidity
  // -------------------------------------------------------------------------
  describe('getGlobalLiquidity', () => {
    it('fetches from correct endpoint', async () => {
      mockFetchOk({ success: true });

      await api.getGlobalLiquidity();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/liquidity/global')
      );
    });
  });

  describe('getGlobalLiquidityHistory', () => {
    it('defaults to 365 days', async () => {
      mockFetchOk({ success: true, data: [] });

      await api.getGlobalLiquidityHistory();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/liquidity/global/history?days=365')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Morning Reports APIs
  // -------------------------------------------------------------------------
  describe('morningReports.getLatest', () => {
    it('returns data on success', async () => {
      const report = { id: 'mr-1', report_date: '2026-02-28', title: 'Morning' };
      mockFetchOk({ data: report });

      const result = await api.morningReports.getLatest();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/morning/reports/latest'),
        expect.any(Object)
      );
      expect(result).toEqual(report);
    });

    it('returns null on 404', async () => {
      mockFetchError(404);

      const result = await api.morningReports.getLatest();

      expect(result).toBeNull();
    });

    it('throws on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(api.morningReports.getLatest()).rejects.toThrow('Network failure');
    });
  });

  describe('morningReports.getByDate', () => {
    it('returns data on success', async () => {
      const report = { id: 'mr-2', report_date: '2026-02-27' };
      mockFetchOk({ data: report });

      const result = await api.morningReports.getByDate('2026-02-27');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/morning/reports/date/2026-02-27'),
        expect.any(Object)
      );
      expect(result).toEqual(report);
    });

    it('returns null on 404', async () => {
      mockFetchError(404);

      const result = await api.morningReports.getByDate('1999-01-01');

      expect(result).toBeNull();
    });
  });

  describe('morningReports.getById', () => {
    it('returns data on success', async () => {
      const report = { id: 'mr-abc', report_date: '2026-02-26' };
      mockFetchOk({ data: report });

      const result = await api.morningReports.getById('mr-abc');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/morning/reports/mr-abc'),
        expect.any(Object)
      );
      expect(result).toEqual(report);
    });

    it('returns null on 404', async () => {
      mockFetchError(404);

      const result = await api.morningReports.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('morningReports.list', () => {
    it('passes limit and offset params', async () => {
      mockFetchOk({ data: [], total: 0 });

      await api.morningReports.list(10, 5);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/morning/reports?limit=10&offset=5')
      );
    });

    it('returns data array and total count', async () => {
      const items = [{ id: 'mr-1', report_date: '2026-02-28' }];
      mockFetchOk({ data: items, total: 42 });

      const result = await api.morningReports.list();

      expect(result.data).toEqual(items);
      expect(result.total).toBe(42);
    });

    it('defaults total to data length when total is missing', async () => {
      const items = [{ id: 'mr-1' }, { id: 'mr-2' }];
      mockFetchOk({ data: items });

      const result = await api.morningReports.list();

      expect(result.total).toBe(2);
    });

    it('handles null data gracefully', async () => {
      mockFetchOk({ data: null, total: 0 });

      const result = await api.morningReports.list();

      expect(result.data).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // sendMorningReportEmail
  // -------------------------------------------------------------------------
  describe('sendMorningReportEmail', () => {
    it('POSTs to correct URL and returns json', async () => {
      const payload = { success: true, message: 'sent' };
      mockFetchOk(payload);

      const result = await api.sendMorningReportEmail('test@example.com');

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/morning-report/send-test');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body)).toEqual({ email: 'test@example.com' });
      expect(result).toEqual(payload);
    });

    it('throws with detail message on non-ok response', async () => {
      mockFetchError(500, 'Email service down');

      await expect(api.sendMorningReportEmail()).rejects.toThrow('Email service down');
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.sendMorningReportEmail()).rejects.toThrow('Failed to send morning report email');
    });
  });

  // -------------------------------------------------------------------------
  // generateMorningReport
  // -------------------------------------------------------------------------
  describe('generateMorningReport', () => {
    it('POSTs with force=false by default and returns json', async () => {
      const payload = { success: true, report_id: 'mr-new' };
      mockFetchOk(payload);

      const result = await api.generateMorningReport();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/morning');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer fake-token');
      expect(JSON.parse(opts.body)).toEqual({ force: false });
      expect(result).toEqual(payload);
    });

    it('sends force=true when specified', async () => {
      mockFetchOk({ success: true });

      await api.generateMorningReport(true);

      const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({ force: true });
    });

    it('throws with detail message on non-ok response', async () => {
      mockFetchError(500, 'Generation failed');

      await expect(api.generateMorningReport()).rejects.toThrow('Generation failed');
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.generateMorningReport()).rejects.toThrow('Failed to generate morning report');
    });
  });

  // -------------------------------------------------------------------------
  // Subscription APIs
  // -------------------------------------------------------------------------
  describe('subscriptions.getStatus', () => {
    it('throws actionable error when network request fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        api.subscriptions.getStatus('personal_digest', 'tester@example.com')
      ).rejects.toThrow('Failed to reach API endpoint');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/subscriptions/personal_digest/status?email=tester%40example.com')
      );
    });
  });

  describe('subscriptions.syncUser', () => {
    it('sends bearer token so backend can verify user identity', async () => {
      mockFetchOk({
        success: true,
        email: 'tester@example.com',
        user_id: 'u-123',
        synced_channels: [],
        errors: [],
      });

      await api.subscriptions.syncUser('u-123', 'tester@example.com', 'Tester');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/subscriptions/sync-user'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer fake-token',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Watchlist APIs
  // -------------------------------------------------------------------------
  describe('watchlist.save', () => {
    it('includes base_updated_at in request body when provided', async () => {
      mockFetchOk({ success: true, data: { user_id: 'u1', symbols: ['AAPL'], updated_at: '2026-03-06T10:00:00Z' } });

      await api.watchlist.save('u1', ['AAPL'], '', '2026-03-06T09:00:00Z');

      const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({
        symbols: ['AAPL'],
        email: '',
        base_updated_at: '2026-03-06T09:00:00Z',
      });
    });

    it('throws with backend detail on non-ok response', async () => {
      mockFetchError(500, 'DB unavailable');

      await expect(api.watchlist.save('u1', ['AAPL'])).rejects.toThrow('DB unavailable');
    });

    it('throws when backend returns success=false', async () => {
      mockFetchOk({ success: false, error: 'Invalid symbol list' });

      await expect(api.watchlist.save('u1', ['AAPL'])).rejects.toThrow('Invalid symbol list');
    });

    it('throws ApiError with status on conflict response', async () => {
      mockFetchError(409, 'Watchlist was updated elsewhere. Please refresh and try again.');

      await expect(api.watchlist.save('u1', ['AAPL'])).rejects.toMatchObject({
        message: 'Watchlist was updated elsewhere. Please refresh and try again.',
        status: 409,
      });

      await api.watchlist.save('u1', ['AAPL']).catch((error) => {
        expect(error).toBeInstanceOf(ApiError);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Screener APIs
  // -------------------------------------------------------------------------
  describe('screener.filter', () => {
    it('POSTs to correct URL with auth headers and returns json', async () => {
      const filterReq = { query: 'tech stocks', limit: 20 };
      const payload = { stocks: [{ symbol: 'AAPL' }], total: 1 };
      mockFetchOk(payload);

      const result = await api.screener.filter(filterReq as never);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/screener/filter');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer fake-token');
      expect(JSON.parse(opts.body)).toEqual(filterReq);
      expect(result).toEqual(payload);
    });

    it('throws with detail message on error', async () => {
      mockFetchError(500, 'Filter engine error');

      await expect(api.screener.filter({} as never)).rejects.toThrow('Filter engine error');
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.screener.filter({} as never)).rejects.toThrow('Failed to filter stocks');
    });
  });

  describe('screener.status', () => {
    it('GETs from correct URL and returns json', async () => {
      const payload = { status: 'ready', last_update: '2026-02-28' };
      mockFetchOk(payload);

      const result = await api.screener.status();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/screener/status')
      );
      expect(result).toEqual(payload);
    });

    it('throws on non-ok response', async () => {
      mockFetchError(500);

      await expect(api.screener.status()).rejects.toThrow('Failed to fetch screener status');
    });
  });

  describe('screener.sectors', () => {
    it('GETs from correct URL and returns json', async () => {
      const payload = { sectors: ['Technology', 'Healthcare'] };
      mockFetchOk(payload);

      const result = await api.screener.sectors();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/screener/sectors')
      );
      expect(result).toEqual(payload);
    });

    it('throws on non-ok response', async () => {
      mockFetchError(500);

      await expect(api.screener.sectors()).rejects.toThrow('Failed to fetch screener sectors');
    });
  });

  describe('screener.ask', () => {
    it('POSTs with auth headers and returns json', async () => {
      const askReq = { question: 'best dividend stocks' };
      const payload = { answer: 'Here are top dividend stocks', stocks: [] };
      mockFetchOk(payload);

      const result = await api.screener.ask(askReq as never);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/screener/ask');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer fake-token');
      expect(JSON.parse(opts.body)).toEqual(askReq);
      expect(result).toEqual(payload);
    });

    it('throws with detail message on error', async () => {
      mockFetchError(500, 'Query processing failed');

      await expect(api.screener.ask({} as never)).rejects.toThrow('Query processing failed');
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.screener.ask({} as never)).rejects.toThrow('AI 查询失败');
    });
  });

  // -------------------------------------------------------------------------
  // Screener Pick API (Stock Research Agent)
  // -------------------------------------------------------------------------
  describe('screener.pick', () => {
    const pickResponse = {
      success: true,
      message: 'Here are some picks',
      options: [{ label: 'Growth', value: 'growth' }],
      candidates: [{ symbol: 'AAPL', name: 'Apple' }],
      candidate_count: 1,
      universe_size: 3680,
      recommendations: [{ symbol: 'AAPL', reason: 'Great company' }],
      accumulated_filters: [{ field: 'roe', op: 'gt', value: 15 }],
      data_freshness: '2026-03-02T00:00:00Z',
      is_stale: false,
    };

    it('calls POST /screener/pick with auth header', async () => {
      mockFetchOk(pickResponse);

      const result = await api.screener.pick({ message: 'stable stocks' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Here are some picks');
      expect(result.recommendations).toHaveLength(1);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toContain('/screener/pick');
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer fake-token');
    });

    it('sends history and accumulated_filters in body', async () => {
      mockFetchOk(pickResponse);

      await api.screener.pick({
        message: 'more',
        history: [{ role: 'user', content: 'hi' }],
        accumulated_filters: [{ field: 'roe', op: 'gt', value: 15 }],
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.message).toBe('more');
      expect(body.history).toHaveLength(1);
      expect(body.accumulated_filters).toHaveLength(1);
    });

    it('throws on 401 with login expired message', async () => {
      mockFetchError(401);

      await expect(api.screener.pick({ message: 'test' })).rejects.toThrow('登录已过期');
    });

    it('throws with detail message on error', async () => {
      mockFetchError(500, 'Agent processing failed');

      await expect(api.screener.pick({ message: 'test' })).rejects.toThrow('Agent processing failed');
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.screener.pick({ message: 'test' })).rejects.toThrow('AI 助手暂时无法响应');
    });
  });

  describe('generateDigest', () => {
    it('POSTs authenticated request without user_id in body', async () => {
      mockFetchOk({ success: true, symbols_used: ['AAPL'] });

      await api.generateDigest(['AAPL']);

      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/digest');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer fake-token');
      expect(JSON.parse(opts.body)).toEqual({ symbols: ['AAPL'] });
    });

    it('throws login expired on 401', async () => {
      mockFetchError(401);

      await expect(api.generateDigest(['AAPL'])).rejects.toThrow('登录已过期');
    });
  });

  describe('watchlist auth handling', () => {
    it('fails fast when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      globalThis.fetch = vi.fn();

      await expect(api.watchlist.get()).rejects.toThrow('登录已过期');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('maps 401 to login expired message', async () => {
      mockFetchError(401);

      await expect(api.watchlist.get()).rejects.toThrow('登录已过期');
    });

    it('does not retry protected requests after 401', async () => {
      mockFetchError(401);

      await expect(api.watchlist.get()).rejects.toThrow('登录已过期');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWatchlistMonitor', () => {
    it('fetches the AI monitor with bearer auth', async () => {
      const payload = {
        success: true,
        symbols: ['AAPL'],
        summary: { new_signals: 1 },
        ticker_rows: [],
      };
      mockFetchOk(payload);

      const result = await api.getWatchlistMonitor();

      expect(result).toEqual(payload);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/watchlist-monitor');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer fake-token');
    });

    it('throws backend detail when entitlement check fails', async () => {
      mockFetchError(403, 'AI monitor requires an active For You entitlement');

      await expect(api.getWatchlistMonitor()).rejects.toThrow(
        'AI monitor requires an active For You entitlement',
      );
    });
  });

  describe('backfillWatchlistMonitor', () => {
    it('queues missing AI monitor briefs with bearer auth', async () => {
      const payload = {
        success: true,
        accepted: true,
        requested_symbols: ['AAPL', 'MSFT'],
        queued_symbols: ['MSFT'],
        skipped_symbols: ['AAPL'],
        message: 'watchlist monitor backfill started',
      };
      mockFetchOk(payload);

      const result = await api.backfillWatchlistMonitor(['AAPL', 'MSFT']);

      expect(result).toEqual(payload);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/watchlist-monitor/backfill');
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer fake-token');
      expect(JSON.parse(opts.body)).toEqual({ symbols: ['AAPL', 'MSFT'] });
    });

    it('can ask the backend to resolve missing symbols from the user watchlist', async () => {
      mockFetchOk({
        success: true,
        accepted: false,
        requested_symbols: [],
        queued_symbols: [],
        skipped_symbols: [],
        message: 'watchlist monitor is already current',
      });

      await api.backfillWatchlistMonitor();

      const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({});
    });
  });

  describe('getTwitterTickerDiscussion', () => {
    it('passes symbol, hours, and limit query params with bearer auth', async () => {
      const payload = {
        success: true,
        symbol: 'AMD',
        hours: 48,
        count: 0,
        overview: { one_line_summary: '暂无讨论' },
        themes: [],
        data: [],
      };
      mockFetchOk(payload);

      const result = await api.getTwitterTickerDiscussion('AMD', 48, 20);

      expect(result).toEqual(payload);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/twitter/ticker-discussion?');
      expect(url).toContain('symbol=AMD');
      expect(url).toContain('hours=48');
      expect(url).toContain('limit=20');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer fake-token');
    });

    it('throws fallback message when ticker discussion error is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.getTwitterTickerDiscussion('AMD')).rejects.toThrow(
        'Failed to fetch ticker discussion',
      );
    });
  });

  describe('user onboarding auth handling', () => {
    it('refreshes and retries onboarding status after a stale token 401', async () => {
      vi.mocked(refreshSession).mockResolvedValueOnce('fresh-token');
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ completed: true }),
        });

      const result = await api.user.onboardingStatus();

      expect(result).toEqual({ completed: true });
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/user/onboarding-status'),
        { headers: { Authorization: 'Bearer fake-token' } },
      );
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/user/onboarding-status'),
        { headers: { Authorization: 'Bearer fresh-token' } },
      );
    });

    it('does not convert onboarding status failures into incomplete onboarding', async () => {
      mockFetchError(500, 'DB unavailable');

      await expect(api.user.onboardingStatus()).rejects.toThrow('DB unavailable');
    });

    it('fails onboarding status fast when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      globalThis.fetch = vi.fn();

      await expect(api.user.onboardingStatus()).rejects.toThrow('登录已过期');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('refreshes and retries onboarding completion after a stale token 401', async () => {
      vi.mocked(refreshSession).mockResolvedValueOnce('fresh-token');
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            completed: true,
            completed_at: '2026-06-01T20:00:00Z',
          }),
        });

      const result = await api.user.completeOnboarding();

      expect(result.completed).toBe(true);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/user/onboarding/complete'),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: 'Bearer fresh-token',
          },
        },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Research API (unified endpoints)
  // -------------------------------------------------------------------------
  describe('research.chat', () => {
    it('POSTs to /research/chat with auth headers', async () => {
      const payload = {
        success: true,
        message: 'Here are some stocks',
        options: [],
        candidates: [],
      };
      mockFetchOk(payload);

      const result = await api.research.chat({ message: 'find growth stocks' });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/chat');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer fake-token');
      expect(JSON.parse(opts.body)).toEqual({ message: 'find growth stocks' });
      expect(result).toEqual(payload);
    });

    it('throws on 401 with login expired message', async () => {
      mockFetchError(401);

      await expect(api.research.chat({ message: 'test' })).rejects.toThrow(
        /登录/
      );
    });

    it('refreshes and retries once on 401, succeeding with the new token', async () => {
      const payload = { success: true, message: 'ok', options: [], candidates: [] };
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Missing or invalid Authorization header' }),
        })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });
      vi.mocked(refreshSession).mockResolvedValueOnce('fresh-token');

      const result = await api.research.chat({ message: 'test' });

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      const retryHeaders = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].headers;
      expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
      expect(result).toEqual(payload);
    });

    it('does not retry on 401 when refresh yields no token', async () => {
      mockFetchError(401);
      vi.mocked(refreshSession).mockResolvedValueOnce(null);

      await expect(api.research.chat({ message: 'test' })).rejects.toThrow(/登录/);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws with detail message on error', async () => {
      mockFetchError(500, 'Agent processing failed');

      await expect(api.research.chat({ message: 'test' })).rejects.toThrow(
        'Agent processing failed'
      );
    });

    it('throws fallback message when response is not JSON', async () => {
      mockFetchJsonFails(500);

      await expect(api.research.chat({ message: 'test' })).rejects.toThrow(
        'AI 助手暂时无法响应'
      );
    });
  });

  describe('research.quota', () => {
    it('checks anonymous quota by default when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      const payload = {
        success: true,
        allowed: true,
        used: 0,
        limit: 5,
        remaining: 5,
        unlimited: false,
      };
      mockFetchOk(payload);

      const result = await api.research.quota();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/quota');
      expect(opts.headers.Authorization).toBeUndefined();
      expect(result).toEqual(payload);
    });

    it('fails fast for authenticated quota checks when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      globalThis.fetch = vi.fn();

      await expect(api.research.quota({ requiredAuth: true })).rejects.toThrow('登录已过期');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('research.chatStream', () => {
    it('fails fast for authenticated streams when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      globalThis.fetch = vi.fn();

      await expect(
        api.research.chatStream({ message: 'test' }, vi.fn(), { requiredAuth: true })
      ).rejects.toThrow('登录已过期');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('agentRuntime.getSession', () => {
    it('returns null on a missing runtime session', async () => {
      mockFetchError(404, 'not found');

      const result = await api.agentRuntime.getSession('missing-session', 'research_agent');

      expect(result).toBeNull();
    });

    it('throws on transient runtime restore failures instead of treating them as missing data', async () => {
      mockFetchError(502, 'Auth service unavailable');

      await expect(
        api.agentRuntime.getSession('session-id', 'research_agent')
      ).rejects.toThrow('Auth service unavailable');
    });
  });

  describe('kolResearch.chatStream', () => {
    // Minimal SSE-style 200 response whose ReadableStream yields `lines` then ends.
    function streamOk(lines: string[]) {
      const encoder = new TextEncoder();
      let i = 0;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () =>
              i < lines.length
                ? { done: false, value: encoder.encode(lines[i++]) }
                : { done: true, value: undefined },
          }),
        },
      };
    }

    it('refreshes and retries once on 401, then streams with the new token', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Missing or invalid Authorization header' }),
        })
        .mockResolvedValueOnce(streamOk(['data: {"type":"final","content":"hi"}\n\n']));
      vi.mocked(refreshSession).mockResolvedValueOnce('fresh-token');

      const events: Array<{ type?: string; code?: string }> = [];
      await api.kolResearch.chatStream(
        { message: 'NVDA', persona_username: 'qinbafrank' },
        (e) => events.push(e),
      );

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      const retryHeaders = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].headers;
      expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
      expect(events.find((e) => e.code === 'auth_error')).toBeUndefined();
      expect(events.find((e) => e.type === 'final')).toBeTruthy();
    });

    it('emits auth_error (no retry) when 401 persists and refresh yields no token', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Missing or invalid Authorization header' }),
      });
      vi.mocked(refreshSession).mockResolvedValue(null);

      const events: Array<{ type?: string; code?: string }> = [];
      await api.kolResearch.chatStream(
        { message: 'NVDA', persona_username: 'qinbafrank' },
        (e) => events.push(e),
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const errEvent = events.find((e) => e.type === 'error');
      expect(errEvent?.code).toBe('auth_error');
    });
  });

  describe('research.conversations.list', () => {
    it('GETs /research/conversations with auth header', async () => {
      const payload = { conversations: [{ id: 'c1', title: 'Test' }] };
      mockFetchOk(payload);

      const result = await api.research.conversations.list();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations');
      expect(opts.headers['Authorization']).toBe('Bearer fake-token');
      expect(result).toEqual(payload);
    });

    it('passes pagination and search query params', async () => {
      mockFetchOk({ conversations: [], has_more: false });

      await api.research.conversations.list({ limit: 20, offset: 40, search: '  NVDA thesis  ' });

      const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations?');
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=40');
      expect(url).toContain('search=NVDA+thesis');
    });

    it('throws on 401', async () => {
      mockFetchError(401);

      await expect(api.research.conversations.list()).rejects.toThrow(/登录/);
    });

    it('fails fast without sending an anonymous history request when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      globalThis.fetch = vi.fn();

      await expect(api.research.conversations.list()).rejects.toThrow(/登录/);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('research.conversations.create', () => {
    it('POSTs to /research/conversations with body', async () => {
      const payload = { id: 'new-conv-id' };
      mockFetchOk(payload);

      const req = { title: 'My Research', data: { messages: [] }, message_count: 3 };
      const result = await api.research.conversations.create(req);

      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body)).toEqual(req);
      expect(result).toEqual(payload);
    });

    it('throws on error', async () => {
      mockFetchError(500, 'Failed to create conversation');

      await expect(
        api.research.conversations.create({ title: '', data: {}, message_count: 0 })
      ).rejects.toThrow('Failed to create conversation');
    });
  });

  describe('research.conversations.get', () => {
    it('GETs /research/conversations/{id}', async () => {
      const payload = { id: 'c1', title: 'Test', data: {} };
      mockFetchOk(payload);

      const result = await api.research.conversations.get('c1');

      const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations/c1');
      expect(result).toEqual(payload);
    });

    it('throws on 404', async () => {
      mockFetchError(404, 'Conversation not found');

      await expect(api.research.conversations.get('bad-id')).rejects.toThrow(
        'Conversation not found'
      );
    });
  });

  describe('research.conversations.update', () => {
    it('PUTs to /research/conversations/{id}', async () => {
      const payload = { success: true };
      mockFetchOk(payload);

      const req = { title: 'Updated', data: { x: 1 }, message_count: 5 };
      const result = await api.research.conversations.update('c1', req);

      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations/c1');
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body)).toEqual(req);
      expect(result).toEqual(payload);
    });

    it('throws on error', async () => {
      mockFetchError(404, 'Conversation not found or not owned');

      await expect(
        api.research.conversations.update('c1', { title: '', data: {}, message_count: 0 })
      ).rejects.toThrow('Conversation not found or not owned');
    });
  });

  describe('research.conversations.pin', () => {
    it('PATCHes /research/conversations/{id}/pin with pinned state', async () => {
      const payload = {
        success: true,
        id: 'c1',
        is_pinned: true,
        pinned_at: '2026-06-10T20:00:00Z',
      };
      mockFetchOk(payload);

      const result = await api.research.conversations.pin('c1', true);

      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations/c1/pin');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ is_pinned: true });
      expect(result).toEqual(payload);
    });

    it('includes runtime agent_id when provided', async () => {
      mockFetchOk({
        success: true,
        id: 'c1',
        agent_id: 'kol_research_agent',
        is_pinned: true,
        pinned_at: '2026-06-10T20:00:00Z',
      });

      await api.research.conversations.pin('c1', true, 'kol_research_agent');

      const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({
        is_pinned: true,
        agent_id: 'kol_research_agent',
      });
    });

    it('throws on error', async () => {
      mockFetchError(404, 'Conversation not found or not owned');

      await expect(api.research.conversations.pin('bad-id', false)).rejects.toThrow(
        'Conversation not found or not owned'
      );
    });
  });

  describe('research.conversations.delete', () => {
    it('DELETEs /research/conversations/{id}', async () => {
      const payload = { success: true };
      mockFetchOk(payload);

      const result = await api.research.conversations.delete('c1');

      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/research/conversations/c1');
      expect(opts.method).toBe('DELETE');
      expect(result).toEqual(payload);
    });

    it('throws on 404', async () => {
      mockFetchError(404, 'Conversation not found');

      await expect(api.research.conversations.delete('bad-id')).rejects.toThrow(
        'Conversation not found'
      );
    });
  });

  describe('kolResearch.conversations.list', () => {
    it('throws on 403 instead of caching a fake empty history', async () => {
      mockFetchError(403, 'Forbidden');

      await expect(api.kolResearch.conversations.list()).rejects.toThrow('Forbidden');
    });

    it('fails fast without fetch when no token is available', async () => {
      vi.mocked(getAccessToken).mockResolvedValue(null);
      globalThis.fetch = vi.fn();

      await expect(api.kolResearch.conversations.list()).rejects.toThrow(/登录/);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('kolResearch.cockpitHighConviction', () => {
    it('GETs the persona high-conviction endpoint', async () => {
      const payload = { groups: [] };
      mockFetchOk(payload);

      const result = await api.kolResearch.cockpitHighConviction('aleabitoreddit');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/kol_research/personas/aleabitoreddit/high-conviction'),
      );
      expect(result).toEqual(payload);
    });

    it('throws on non-ok response', async () => {
      mockFetchError(500);

      await expect(
        api.kolResearch.cockpitHighConviction('aleabitoreddit'),
      ).rejects.toThrow('Failed to load high-conviction grid');
    });
  });

  describe('kolResearch.cockpitFeed', () => {
    it('serializes ticker and keyword filters as query params', async () => {
      const payload = {
        tweets: [],
        total: 0,
        raw_total: 0,
        has_more: false,
        offset: 0,
        limit: 1500,
      };
      mockFetchOk(payload);

      const result = await api.kolResearch.cockpitFeed('qinbafrank', {
        limit: 1500,
        offset: 0,
        tickers: ['HOOD', 'COIN'],
        keywords: ['RWA', '代币化'],
      });

      const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const parsed = new URL(String(url));
      expect(parsed.pathname).toContain('/kol_research/personas/qinbafrank/feed');
      expect(parsed.searchParams.get('limit')).toBe('1500');
      expect(parsed.searchParams.get('offset')).toBe('0');
      expect(parsed.searchParams.get('tickers')).toBe('HOOD,COIN');
      expect(parsed.searchParams.get('keywords')).toBe('RWA,代币化');
      expect(result).toEqual(payload);
    });
  });

});
