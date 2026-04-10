import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { EntitlementsProvider, useEntitlements } from '../EntitlementsContext';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
  getAccessTokenAsync: vi.fn().mockResolvedValue('fake-token'),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;

  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return <EntitlementsProvider>{children}</EntitlementsProvider>;
}

// ---------------------------------------------------------------------------
// has() behavior
// ---------------------------------------------------------------------------
describe('EntitlementsContext - has()', () => {
  it('returns true for a present feature', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email', 'weekly_report_email'] }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.has('morning_report_email')).toBe(true);
  });

  it('returns false for an absent feature', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email'] }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.has('nonexistent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated state
// ---------------------------------------------------------------------------
describe('EntitlementsContext - unauthenticated', () => {
  it('has empty entitlements when not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entitlements.size).toBe(0);
    expect(result.current.has('morning_report_email')).toBe(false);
    // Should not have called fetch at all
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh({ fresh: true })
// ---------------------------------------------------------------------------
describe('EntitlementsContext - refresh()', () => {
  it('passes ?fresh=true query param when opts.fresh is true', async () => {
    // Initial fetch on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email'] }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Second fetch for refresh({ fresh: true })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entitlements: ['morning_report_email', 'weekly_report_email'] }),
    });

    await act(async () => {
      await result.current.refresh({ fresh: true });
    });

    // The second call should include ?fresh=true
    const secondCallUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('?fresh=true');
    expect(result.current.has('weekly_report_email')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('EntitlementsContext - error handling', () => {
  it('handles API error gracefully without crashing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useEntitlements(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should not crash, entitlements remain empty
    expect(result.current.entitlements.size).toBe(0);
    expect(result.current.has('morning_report_email')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider boundary
// ---------------------------------------------------------------------------
describe('EntitlementsContext - provider boundary', () => {
  it('throws when useEntitlements is used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useEntitlements());
    }).toThrow('useEntitlements must be used within EntitlementsProvider');

    spy.mockRestore();
  });
});
