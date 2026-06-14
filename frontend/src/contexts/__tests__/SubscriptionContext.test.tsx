import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubscriptionProvider, useSubscription } from '../SubscriptionContext';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockUser = { id: 'user-1', email: 'test@example.com' };
const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
  getAccessTokenAsync: vi.fn().mockResolvedValue('fake-token'),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
  localStorage.clear();
  mockUseAuth.mockReturnValue({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
  });
});

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SubscriptionProvider>{children}</SubscriptionProvider>
      </QueryClientProvider>
    );
  };
}

// PAYWALL_ENABLED is read at module load — tests can't change it at runtime.
// The visible-from-tests behavior is: at module-level PAYWALL_ENABLED=false,
// isPro/isMax/isUltra always return true regardless of API response.

describe('SubscriptionContext - basic behavior', () => {
  it('isPro is true when paywall is disabled (module-level const)', async () => {
    const { result } = renderHook(() => useSubscription(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isPro).toBe(true);
    expect(result.current.isMax).toBe(true);
    expect(result.current.isUltra).toBe(true);
  });

  it('does not fetch subscription status when PAYWALL_ENABLED is false', async () => {
    renderHook(() => useSubscription(), { wrapper: makeWrapper() });

    // Wait long enough for any async fetch to kick in
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets isLoading false for unauthenticated users', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useSubscription(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('exposes plan/status defaults when query is disabled', async () => {
    const { result } = renderHook(() => useSubscription(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // With paywall disabled at module level, query never fires; plan defaults.
    expect(result.current.plan).toBe('free');
    expect(result.current.status).toBe('none');
  });
});

describe('SubscriptionContext - provider boundary', () => {
  it('throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useSubscription());
    }).toThrow('useSubscription must be used within a SubscriptionProvider');
    spy.mockRestore();
  });
});
