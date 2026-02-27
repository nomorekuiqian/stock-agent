import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useDigestList, useDigestById, useGenerateDigest } from '../use-digest-data';
import { queryKeys } from '../query-keys';

vi.mock('@/lib/api', () => ({
  api: {
    digests: {
      list: vi.fn(),
      getById: vi.fn(),
    },
    generateDigest: vi.fn(),
  },
}));

import { api } from '@/lib/api';

const mockList = api.digests.list as ReturnType<typeof vi.fn>;
const mockGetById = api.digests.getById as ReturnType<typeof vi.fn>;
const mockGenerateDigest = api.generateDigest as ReturnType<typeof vi.fn>;

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

describe('useDigestList', () => {
  it('fetches digest list with correct params', async () => {
    const mockData = { data: [{ id: '1' }], total: 1 };
    mockList.mockResolvedValue(mockData);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDigestList('user-1', 10, 0), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockList).toHaveBeenCalledWith('user-1', 10, 0);
    expect(result.current.data).toEqual(mockData);
  });

  it('does not fetch when userId is empty', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDigestList('', 10, 0), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDigestList('user-1', 10, 0, false), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('useDigestById', () => {
  it('fetches a specific digest', async () => {
    const mockDigest = { id: 'abc', user_id: 'u1', digest_data: {} };
    mockGetById.mockResolvedValue(mockDigest);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDigestById('abc'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetById).toHaveBeenCalledWith('abc');
    expect(result.current.data).toEqual(mockDigest);
  });

  it('does not fetch when id is empty', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDigestById(''), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fetch when enabled is false', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDigestById('abc', false), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useGenerateDigest', () => {
  it('calls api.generateDigest with symbols and userId', async () => {
    mockGenerateDigest.mockResolvedValue({ success: true });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useGenerateDigest(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ symbols: ['AAPL', 'MSFT'], userId: 'user-1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGenerateDigest).toHaveBeenCalledWith(['AAPL', 'MSFT'], 'user-1');
  });

  it('invalidates digest queries on success', async () => {
    mockGenerateDigest.mockResolvedValue({ success: true });
    const { Wrapper, queryClient } = createWrapper();

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGenerateDigest(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ symbols: ['NVDA'], userId: 'user-1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.digests.all })
    );
  });

  it('handles generation error', async () => {
    mockGenerateDigest.mockRejectedValue(new Error('Generation failed'));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useGenerateDigest(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ symbols: ['AAPL'] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
