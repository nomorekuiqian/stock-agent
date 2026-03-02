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
vi.mock('@/lib/auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token'),
}));

import { api } from '../api';

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
        expect.stringContaining('/market/reports/latest')
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
        expect.stringContaining('/market/reports/abc-123')
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
        expect.stringContaining('/market/reports?limit=10&offset=5')
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
        expect.stringContaining('/morning/reports/latest')
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
        expect.stringContaining('/morning/reports/date/2026-02-27')
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
        expect.stringContaining('/morning/reports/mr-abc')
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
});
