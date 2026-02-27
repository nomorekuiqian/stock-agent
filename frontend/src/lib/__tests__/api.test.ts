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
});
