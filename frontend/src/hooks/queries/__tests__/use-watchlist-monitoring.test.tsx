import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useTwitterTickerDiscussion } from '../use-twitter-ticker-discussion';
import { useWatchlistMonitor } from '../use-watchlist-monitor';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    getWatchlistMonitor: vi.fn(),
    getTwitterTickerDiscussion: vi.fn(),
  },
}));

const mockGetWatchlistMonitor = vi.mocked(api.getWatchlistMonitor);
const mockGetTwitterTickerDiscussion = vi.mocked(api.getTwitterTickerDiscussion);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { Wrapper, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWatchlistMonitor', () => {
  it('fetches cached monitor data when user id is present', async () => {
    const payload = {
      success: true,
      symbols: ['AAPL'],
      ticker_rows: [],
      priority_items: [],
    };
    mockGetWatchlistMonitor.mockResolvedValue(payload as never);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlistMonitor('user-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(mockGetWatchlistMonitor).toHaveBeenCalledOnce();
  });

  it('does not fetch when user id is missing', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlistMonitor(undefined), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetWatchlistMonitor).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlistMonitor('user-1', false), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetWatchlistMonitor).not.toHaveBeenCalled();
  });
});

describe('useTwitterTickerDiscussion', () => {
  it('normalizes symbol and fetches the default discussion window', async () => {
    const payload = {
      success: true,
      symbol: 'AMD',
      hours: 24,
      count: 0,
      overview: { one_line_summary: '暂无讨论' },
      themes: [],
      data: [],
    };
    mockGetTwitterTickerDiscussion.mockResolvedValue(payload as never);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTwitterTickerDiscussion(' amd '), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(mockGetTwitterTickerDiscussion).toHaveBeenCalledWith('AMD', 24, 200);
  });

  it('does not fetch when normalized symbol is empty', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTwitterTickerDiscussion('   '), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetTwitterTickerDiscussion).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTwitterTickerDiscussion('AMD', false), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetTwitterTickerDiscussion).not.toHaveBeenCalled();
  });
});
