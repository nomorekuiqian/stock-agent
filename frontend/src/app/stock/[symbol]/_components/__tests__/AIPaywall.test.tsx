import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { track } from '@vercel/analytics';
import { AIPaywall } from '../shared';

const mockUseAuth = vi.fn();
const mockUseSubscription = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/stock/AAPL',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pricing')>();
  return { ...actual, STRIPE_LIVE: true };
});

const trackMock = vi.mocked(track);

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUseSubscription.mockReset();
  trackMock.mockReset();
  mockUseSubscription.mockReturnValue({
    createCheckout: vi.fn(),
    isCheckoutLoading: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('AIPaywall - post-freemium CTA', () => {
  it('renders "免费注册" link routing to /login with the stock returnPath when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    const registerLink = screen.getByText('免费注册').closest('a');
    expect(registerLink).toBeTruthy();
    expect(registerLink?.getAttribute('href')).toBe('/login?redirect=%2Fstock%2FAAPL');
    expect(screen.queryByText('14 天免费试用')).toBeNull();
    expect(screen.queryByText('开启 14 天免费试用')).toBeNull();
    expect(screen.queryByText('你的试用已结束')).toBeNull();
  });

  it('renders the unified "解锁全部功能" lock copy and no legacy /pricing link when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getAllByText('解锁全部功能').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /升级 Max/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /pricing/ })).toBeNull();
  });

  it('fires paywall_view on mount with the stock_ai_paywall source', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(trackMock).toHaveBeenCalledWith('paywall_view', {
      source: 'stock_ai_paywall',
      tier: 'max',
    });
  });

  it('fires paywall_cta_click with authenticated=true when the unlock button is clicked', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    const ctaButton = screen.getByRole('button', { name: /解锁全部功能|订阅功能即将上线/ });
    fireEvent.click(ctaButton);

    expect(trackMock).toHaveBeenCalledWith('paywall_cta_click', {
      source: 'stock_ai_paywall',
      tier: 'max',
      authenticated: true,
    });
  });
});
