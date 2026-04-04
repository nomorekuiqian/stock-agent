import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProfilePage from '../page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseSubscription = vi.fn();
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: (...args: unknown[]) => mockUseSubscription(...args),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));

vi.mock('@/hooks/queries/use-preferences', () => ({
  useEmailPreferences: () => ({
    data: { morning_report: true, daily_report: true, weekly_report: false, personal_digest: false },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/queries/query-keys', () => ({
  queryKeys: { subscriptions: { preferences: () => ['sub', 'prefs'] } },
}));

vi.mock('@/lib/api', () => ({
  api: { subscriptions: { updatePreferences: vi.fn() } },
}));

vi.mock('@/lib/pricing', () => ({
  STRIPE_LIVE: true,
  PRICING: { proPerMonth: '$9.99/月' },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authState() {
  return {
    user: { id: 'u1', email: 'test@example.com', name: 'Test' },
    isAuthenticated: true,
    isLoading: false,
    updateProfile: vi.fn().mockResolvedValue({ success: true }),
  };
}

function subState(overrides = {}) {
  return {
    isPro: false,
    isLoading: false,
    isCheckoutLoading: false,
    checkoutError: null,
    plan: 'free',
    status: 'none',
    currentPeriodEnd: null,
    accessExpiresAt: null,
    createCheckout: vi.fn(),
    openBillingPortal: vi.fn(),
    refreshSubscription: vi.fn(),
    redeemInviteCode: vi.fn(),
    ...overrides,
  };
}

/** Switch to subscription tab by setting URL param before render */
function setTabParam(tab: string) {
  mockSearchParams.delete('tab');
  if (tab !== 'account') {
    mockSearchParams.set('tab', tab);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(authState());
  mockUseSubscription.mockReturnValue(subState());
  setTabParam('subscription');
});

afterEach(() => {
  cleanup();
  mockSearchParams.delete('tab');
});

// ---------------------------------------------------------------------------
// Tests — each test re-sets the mock before render
// ---------------------------------------------------------------------------
describe('ProfilePage subscription states', () => {
  it('renders free state with pricing link', () => {
    render(<ProfilePage />);

    expect(screen.getByText('暂无订阅')).toBeDefined();
    expect(screen.getByText(/查看方案/)).toBeDefined();
    const link = screen.getByText(/查看方案/).closest('a');
    expect(link?.getAttribute('href')).toBe('/pricing');
  });

  it('renders paid pro state with manage button', () => {
    mockUseSubscription.mockReturnValue(subState({
      isPro: true, plan: 'pro', status: 'active',
      currentPeriodEnd: '2026-05-01T00:00:00Z',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('Pro 会员')).toBeDefined();
    expect(screen.getByRole('button', { name: /管理订阅/ })).toBeDefined();
    expect(screen.getByText('活跃')).toBeDefined();
    expect(screen.getByText('下次续费')).toBeDefined();
  });

  it('renders trial state with countdown and upgrade link', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);

    mockUseSubscription.mockReturnValue(subState({
      isPro: true, plan: 'pro', status: 'active',
      accessExpiresAt: future.toISOString(),
    }));

    render(<ProfilePage />);

    expect(screen.getByText('邀请码体验')).toBeDefined();
    expect(screen.getByText('天后到期')).toBeDefined();
    const link = screen.getByText(/升级到 Pro/).closest('a');
    expect(link?.getAttribute('href')).toBe('/pricing');
  });

  it('renders trial upgrade CTA when <= 7 days left', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);

    mockUseSubscription.mockReturnValue(subState({
      isPro: true, plan: 'pro', status: 'active',
      accessExpiresAt: future.toISOString(),
    }));

    render(<ProfilePage />);

    expect(screen.getByText(/升级到 Pro/)).toBeDefined();
  });

  it('renders canceled state with resubscribe CTA', () => {
    mockUseSubscription.mockReturnValue(subState({
      isPro: false, plan: 'free', status: 'canceled',
      currentPeriodEnd: '2026-04-15T00:00:00Z',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('订阅已取消')).toBeDefined();
    expect(screen.getByText('重新订阅 Pro')).toBeDefined();
  });

  it('shows correct badge per state', () => {
    mockUseSubscription.mockReturnValue(subState({
      isPro: false, status: 'canceled',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('已取消')).toBeDefined();
  });
});

describe('ProfilePage manage subscription', () => {
  it('calls openBillingPortal on manage click', async () => {
    vi.useFakeTimers();
    // Mock portal to never resolve — simulates redirect (page unloads)
    const mockPortal = vi.fn().mockReturnValue(new Promise(() => {}));
    const state = subState({
      isPro: true, plan: 'pro', status: 'active',
      currentPeriodEnd: '2026-05-01T00:00:00Z',
      openBillingPortal: mockPortal,
    });
    mockUseSubscription.mockReturnValue(state);

    const { unmount } = render(<ProfilePage />);

    screen.getByRole('button', { name: /管理订阅/ }).click();

    expect(mockPortal).toHaveBeenCalled();

    // Cleanup before timers fire to prevent state updates on unmounted component
    unmount();
    vi.useRealTimers();
  });

  it('upgrade link points to pricing in trial', () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);

    mockUseSubscription.mockReturnValue(subState({
      isPro: true, plan: 'pro', status: 'active',
      accessExpiresAt: future.toISOString(),
    }));

    render(<ProfilePage />);

    const link = screen.getByText(/升级到 Pro/).closest('a');
    expect(link?.getAttribute('href')).toBe('/pricing');
  });
});
