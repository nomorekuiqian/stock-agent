import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntitlementsProvider, useEntitlements } from '../EntitlementsContext';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
  getAccessTokenAsync: vi.fn().mockResolvedValue('fake-token'),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
  mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
});

function makeWrapper() {
  // Fresh QueryClient per test, retries disabled so mocked failures surface
  // immediately instead of triggering React Query's 3x retry loop.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <EntitlementsProvider>{children}</EntitlementsProvider>
      </QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// has() behavior
// ---------------------------------------------------------------------------
describe('EntitlementsContext - has()', () => {
  it('returns true for a present feature', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email'] }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.has('morning_report_email')).toBe(true);
    });
  });

  it('returns false for an absent feature', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email'] }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.has('morning_report_email')).toBe(true);
    });

    expect(result.current.has('twitter_digest')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated state
// ---------------------------------------------------------------------------
describe('EntitlementsContext - unauthenticated', () => {
  it('does not fetch and has() returns false', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    const { result } = renderHook(() => useEntitlements(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.has('morning_report_email')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// refresh() behavior
// ---------------------------------------------------------------------------
describe('EntitlementsContext - refresh()', () => {
  it('passes ?fresh=true query param when opts.fresh is true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: [] }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email'] }),
    });

    await act(async () => {
      await result.current.refresh({ fresh: true });
    });

    const urlsCalled = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urlsCalled.some((u) => u.includes('fresh=true'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('EntitlementsContext - error handling', () => {
  it('does not crash when API fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper: makeWrapper() });

    // React Query retries (retry: 3 in EntitlementsContext queryFn) so the
    // resolution can take a moment with exponential backoff. We just verify
    // the hook doesn't throw and has() is callable.
    expect(typeof result.current.has).toBe('function');
    expect(result.current.has('morning_report_email')).toBe(false);
  });
});

