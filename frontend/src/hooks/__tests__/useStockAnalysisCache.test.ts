import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useStockAnalysisCache } from '../queries/use-stock-data';
import { getAccessTokenAsync } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Mock auth — the cache hook now sends a bearer token (requiredAuthHeaders).
// ---------------------------------------------------------------------------

vi.mock('@/contexts/AuthContext', () => ({
  getAccessTokenAsync: vi.fn(),
}));

const mockGetAccessToken = getAccessTokenAsync as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStockAnalysisCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('test-token');
  });

  it('returns cached analysis when available', async () => {
    const mockAnalysis = {
      title: 'Test Title',
      company_profile: 'Test profile',
      financial_health: 'Test health',
      valuation_judgment: 'Test valuation',
      catalysts_and_risks: 'Test catalysts',
      investment_summary: 'Test summary',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, analysis: mockAnalysis }),
    });

    const { result } = renderHook(() => useStockAnalysisCache('AAPL'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockAnalysis);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/stocks/AAPL/analysis/cache'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('returns null when no cached analysis', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, analysis: null }),
    });

    const { result } = renderHook(() => useStockAnalysisCache('NVDA'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useStockAnalysisCache('ERR'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  it('does not fetch when symbol is empty', () => {
    const { result } = renderHook(() => useStockAnalysisCache(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when success is false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    const { result } = renderHook(() => useStockAnalysisCache('FAIL'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });
});
