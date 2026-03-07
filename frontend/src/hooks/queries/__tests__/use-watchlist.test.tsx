import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useWatchlist, useSaveWatchlist } from '../use-watchlist';
import { queryKeys } from '../query-keys';

vi.mock('@/lib/api', () => ({
  api: {
    watchlist: {
      get: vi.fn(),
      save: vi.fn(),
    },
  },
}));

import { api } from '@/lib/api';

const mockGet = api.watchlist.get as ReturnType<typeof vi.fn>;
const mockSave = api.watchlist.save as ReturnType<typeof vi.fn>;

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
});

describe('useWatchlist', () => {
  it('fetches watchlist data', async () => {
    mockGet.mockResolvedValue({ symbols: ['AAPL', 'MSFT'] });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlist('user-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ symbols: ['AAPL', 'MSFT'] });
    expect(mockGet).toHaveBeenCalledOnce();
  });

  it('does not fetch when enabled=false', async () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlist('user-1', false), { wrapper: Wrapper });

    // Should stay in idle state, not loading
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fetch when userId is missing', async () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlist(undefined, true), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useWatchlist('user-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useSaveWatchlist', () => {
  it('calls api.watchlist.save with correct params', async () => {
    mockSave.mockResolvedValue({ success: true, data: { user_id: 'user-1', symbols: ['AAPL', 'NVDA'] } });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useSaveWatchlist(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        userId: 'user-1',
        symbols: ['AAPL', 'NVDA'],
        baseUpdatedAt: '2026-03-06T09:00:00Z',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSave).toHaveBeenCalledWith(
      'user-1',
      ['AAPL', 'NVDA'],
      undefined,
      '2026-03-06T09:00:00Z',
    );
  });

  it('optimistically updates watchlist cache', async () => {
    // Set up initial cache data
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(queryKeys.watchlist.byUser('u1'), { symbols: ['AAPL'], user_id: 'u1' });

    // Make save hang so we can inspect the optimistic state
    let resolveSave: (value: unknown) => void;
    mockSave.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));

    const { result } = renderHook(() => useSaveWatchlist(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ userId: 'u1', symbols: ['AAPL', 'NVDA'] });
    });

    // The cache should be optimistically updated before the API responds
    await waitFor(() => {
      const cached = queryClient.getQueryData(queryKeys.watchlist.byUser('u1')) as { symbols: string[] };
      expect(cached.symbols).toEqual(['AAPL', 'NVDA']);
    });

    // Resolve the save
    await act(async () => {
      resolveSave!({ symbols: ['AAPL', 'NVDA'] });
    });
  });

  it('rolls back on save error', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const original = { symbols: ['AAPL'], user_id: 'u1' };
    queryClient.setQueryData(queryKeys.watchlist.byUser('u1'), original);

    mockSave.mockRejectedValue(new Error('Save failed'));

    const { result } = renderHook(() => useSaveWatchlist(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ userId: 'u1', symbols: ['AAPL', 'NVDA'] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Cache should be rolled back to original
    const cached = queryClient.getQueryData(queryKeys.watchlist.byUser('u1'));
    expect(cached).toEqual(original);
  });

  it('does not crash when cache is null (no previous data)', async () => {
    const { Wrapper, queryClient } = createWrapper();
    // No initial data in cache — simulates first-time user
    queryClient.setQueryData(queryKeys.watchlist.byUser('u1'), null);

    mockSave.mockResolvedValue({ symbols: ['TSLA'] });

    const { result } = renderHook(() => useSaveWatchlist(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ userId: 'u1', symbols: ['TSLA'] });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData(queryKeys.watchlist.byUser('u1')) as { symbols: string[] };
      expect(cached.symbols).toEqual(['TSLA']);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('invalidates watchlist queries on settled (success or error)', async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(queryKeys.watchlist.byUser('u1'), { symbols: ['AAPL'] });

    mockSave.mockResolvedValue({ symbols: ['AAPL', 'GOOGL'] });
    mockGet.mockResolvedValue({ symbols: ['AAPL', 'GOOGL'] });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveWatchlist(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ userId: 'u1', symbols: ['AAPL', 'GOOGL'] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.watchlist.byUser('u1') })
    );
  });

  it('replaces optimistic cache with server returned watchlist data on success', async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(queryKeys.watchlist.byUser('u1'), {
      user_id: 'u1',
      symbols: ['AAPL'],
      updated_at: '2026-03-06T09:00:00Z',
    });

    mockSave.mockResolvedValue({
      success: true,
      data: {
        user_id: 'u1',
        symbols: ['AAPL', 'MSFT'],
        updated_at: '2026-03-06T10:00:00Z',
      },
    });

    const { result } = renderHook(() => useSaveWatchlist(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        userId: 'u1',
        symbols: ['AAPL', 'MSFT'],
        baseUpdatedAt: '2026-03-06T09:00:00Z',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.watchlist.byUser('u1'))).toEqual({
      user_id: 'u1',
      symbols: ['AAPL', 'MSFT'],
      updated_at: '2026-03-06T10:00:00Z',
    });
  });
});
