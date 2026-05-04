import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AIPaywall } from '../shared';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockUseAuth = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
  getAccessTokenAsync: (...args: unknown[]) => mockGetAccessToken(...args),
}));

const mockRefreshSubscription = vi.fn();
const mockUseSubscription = vi.fn();
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

const mockRefreshEntitlements = vi.fn();
const mockUseEntitlements = vi.fn();
vi.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: (...args: unknown[]) => mockUseEntitlements(...args),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockGetAccessToken.mockReset();
  mockRefreshSubscription.mockReset();
  mockRefreshEntitlements.mockReset();
  globalThis.fetch = mockFetch;

  mockGetAccessToken.mockResolvedValue('fake-token');
  mockUseSubscription.mockReturnValue({
    refreshSubscription: mockRefreshSubscription,
  });
});

// Vitest is not configured with `globals: true`, so testing-library's
// auto-cleanup is not wired up. Clean up manually so DOM doesn't leak.
afterEach(() => {
  cleanup();
});

function setupAuthenticatedEligible() {
  mockUseAuth.mockReturnValue({ isAuthenticated: true });
  mockUseEntitlements.mockReturnValue({
    trialEligible: true,
    refresh: mockRefreshEntitlements,
  });
}

function setupAuthenticatedUsedTrial() {
  mockUseAuth.mockReturnValue({ isAuthenticated: true });
  mockUseEntitlements.mockReturnValue({
    trialEligible: false,
    refresh: mockRefreshEntitlements,
  });
}

function setupUnauthenticated() {
  mockUseAuth.mockReturnValue({ isAuthenticated: false });
  mockUseEntitlements.mockReturnValue({
    trialEligible: true,
    refresh: mockRefreshEntitlements,
  });
}

// ---------------------------------------------------------------------------
// CTA selection by trialEligible flag
// ---------------------------------------------------------------------------
describe('AIPaywall - CTA selection', () => {
  it('shows "开启 14 天免费试用" button when authenticated and trial-eligible', () => {
    setupAuthenticatedEligible();

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getByText('开启 14 天免费试用')).toBeTruthy();
    // No "试用已结束" copy on the eligible path
    expect(screen.queryByText('你的试用已结束')).toBeNull();
  });

  it('shows "试用已结束" + "查看订阅方案" when authenticated and trial-ineligible', () => {
    setupAuthenticatedUsedTrial();

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getByText('你的试用已结束')).toBeTruthy();
    expect(screen.getByText('查看订阅方案')).toBeTruthy();
    // No trial activation button on this path
    expect(screen.queryByText('开启 14 天免费试用')).toBeNull();
  });

  it('shows "免费注册体验" link when unauthenticated', () => {
    setupUnauthenticated();

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getByText('免费注册体验')).toBeTruthy();
    expect(screen.queryByText('开启 14 天免费试用')).toBeNull();
    expect(screen.queryByText('你的试用已结束')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Regression: handleActivateTrial must always refresh, never short-circuit on
// `already_active=true`. This is the morning-report bug from 2026-05-03.
// ---------------------------------------------------------------------------
describe('AIPaywall - activate trial flow', () => {
  it('calls refresh helpers when backend returns already_active=false (fresh trial)', async () => {
    setupAuthenticatedEligible();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ already_active: false }),
    });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    fireEvent.click(screen.getByText('开启 14 天免费试用'));

    await waitFor(() => {
      expect(mockRefreshSubscription).toHaveBeenCalledTimes(1);
      expect(mockRefreshEntitlements).toHaveBeenCalledWith({ fresh: true });
    });
  });

  it('still refreshes when backend returns already_active=true (race with auto-trial)', async () => {
    // Regression test: pre-fix, this case set trialUsed=true and skipped refresh,
    // so a newly-registered user with an active trial saw "试用已结束" forever.
    setupAuthenticatedEligible();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ already_active: true }),
    });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    fireEvent.click(screen.getByText('开启 14 天免费试用'));

    await waitFor(() => {
      // The whole point of the fix: even when already_active=true, we still
      // refresh to discover the truth from the server.
      expect(mockRefreshSubscription).toHaveBeenCalledTimes(1);
      expect(mockRefreshEntitlements).toHaveBeenCalledWith({ fresh: true });
    });
  });

  it('shows error message when backend returns non-200', async () => {
    setupAuthenticatedEligible();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'rate_limited' }),
    });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    fireEvent.click(screen.getByText('开启 14 天免费试用'));

    await waitFor(() => {
      expect(screen.getByText('rate_limited')).toBeTruthy();
    });
    // No refresh on failure
    expect(mockRefreshSubscription).not.toHaveBeenCalled();
    expect(mockRefreshEntitlements).not.toHaveBeenCalled();
  });

  it('shows network error when fetch rejects', async () => {
    setupAuthenticatedEligible();
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    fireEvent.click(screen.getByText('开启 14 天免费试用'));

    await waitFor(() => {
      expect(screen.getByText('网络错误，请稍后再试')).toBeTruthy();
    });
  });
});
