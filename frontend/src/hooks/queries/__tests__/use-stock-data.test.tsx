import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useStockQuotes, useGenerateStockAnalysis, useGenerateTechnicalAnalysis } from '../use-stock-data';
import { queryKeys } from '../query-keys';

vi.mock('@/lib/api', () => ({
  api: {
    getStockQuotes: vi.fn(),
  },
}));

import { api } from '@/lib/api';

const mockGetStockQuotes = api.getStockQuotes as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { Wrapper, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn();
});

describe('useStockQuotes', () => {
  it('fetches quotes when symbols are provided', async () => {
    const mockQuotes = { quotes: [{ symbol: 'AAPL', price: 180 }] };
    mockGetStockQuotes.mockResolvedValue(mockQuotes);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useStockQuotes(['AAPL']), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockQuotes);
  });

  it('does not fetch when symbols array is empty', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useStockQuotes([]), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetStockQuotes).not.toHaveBeenCalled();
  });
});

describe('useGenerateStockAnalysis', () => {
  it('calls POST /stocks/{symbol}/analysis and sets cache on success', async () => {
    const mockAnalysis = { rating: 'buy', summary: 'Looks good' };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, analysis: mockAnalysis }),
    });

    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useGenerateStockAnalysis('AAPL'), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAnalysis);

    // Verify cache was populated via onSuccess
    const cached = queryClient.getQueryData(queryKeys.stocks.analysis('AAPL'));
    expect(cached).toEqual(mockAnalysis);
  });

  it('passes force parameter correctly', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, analysis: { rating: 'hold' } }),
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGenerateStockAnalysis('TSLA'), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ force: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/stocks/TSLA/analysis?force=true'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-ok response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGenerateStockAnalysis('AAPL'), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('returns null when success is false', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGenerateStockAnalysis('AAPL'), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useGenerateTechnicalAnalysis', () => {
  it('calls POST with timeframe and sets cache on success', async () => {
    const mockTechnical = { signal: 'bullish', score: 85 };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, analysis: mockTechnical }),
    });

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useGenerateTechnicalAnalysis('NVDA'), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ timeframe: 'weekly' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/stocks/NVDA/technical?force=false&timeframe=weekly'),
      expect.objectContaining({ method: 'POST' }),
    );

    // Cache should be set via onSuccess
    const cached = queryClient.getQueryData(queryKeys.stocks.technical('NVDA'));
    expect(cached).toEqual(mockTechnical);
  });

  it('defaults to daily timeframe and force=false', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, analysis: {} }),
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGenerateTechnicalAnalysis('META'), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/stocks/META/technical?force=false&timeframe=daily'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
