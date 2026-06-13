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

const mockUseEntitlements = vi.fn();
vi.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: (...args: unknown[]) => mockUseEntitlements(...args),
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
  PRICING: {
    proPerMonth: '$10/月',
    maxPerMonth: '$20/月',
    ultraPerMonth: '$30/月',
  },
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
    isMax: false,
    isLoading: false,
    isCheckoutLoading: false,
    checkoutError: null,
    portalError: null,
    plan: 'free',
    status: 'none',
    currentPeriodEnd: null,
    accessExpiresAt: null,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    canceledAt: null,
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
  mockUseEntitlements.mockReturnValue({
    has: () => false,
  });
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

  it('renders paid ultra state with manage button and no higher upgrade CTA', () => {
    mockUseSubscription.mockReturnValue(subState({
      isPro: true,
      isMax: true,
      plan: 'ultra',
      status: 'active',
      currentPeriodEnd: '2026-05-01T00:00:00Z',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('Ultra 会员')).toBeDefined();
    expect(screen.getByText('$30/月 · 自动续费')).toBeDefined();
    expect(screen.getByRole('button', { name: /管理订阅/ })).toBeDefined();
    expect(screen.queryByText(/升级到 Ultra/)).toBeNull();
    expect(screen.queryByText(/升级到 Max/)).toBeNull();
  });

  it('renders scheduled Ultra cancellation while access remains active', () => {
    mockUseSubscription.mockReturnValue(subState({
      isPro: true,
      isMax: true,
      plan: 'ultra',
      status: 'active',
      currentPeriodEnd: '2026-07-12T02:48:43Z',
      cancelAt: '2026-07-12T02:48:43Z',
      canceledAt: '2026-06-12T02:14:40Z',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('Ultra 会员')).toBeDefined();
    expect(screen.getByText('订阅已取消')).toBeDefined();
    expect(screen.getByText('权益有效至')).toBeDefined();
    expect(screen.getByText(/你仍可使用 Ultra 权限/)).toBeDefined();
    expect(screen.getAllByText('已取消').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('$30/月 · 自动续费')).toBeNull();
    expect(screen.queryByText('下次续费')).toBeNull();
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
    expect(screen.getByRole('button', { name: '查看订阅方案' })).toBeDefined();
  });

  it('renders scheduled cancellation indicator while paid access remains active', () => {
    mockUseSubscription.mockReturnValue(subState({
      isPro: true,
      plan: 'max',
      status: 'active',
      currentPeriodEnd: '2026-07-11T18:28:24+00:00',
      cancelAt: '2026-07-11T18:28:24+00:00',
      canceledAt: '2026-06-11T18:53:59+00:00',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('Max 会员')).toBeDefined();
    expect(screen.getAllByText('已取消').length).toBeGreaterThan(0);
    expect(screen.getByText('权益有效至')).toBeDefined();
    expect(screen.getByText(/到期后将自动回到免费版/)).toBeDefined();
    expect(screen.queryByText('下次续费')).toBeNull();
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

describe('ProfilePage email preferences', () => {
  it('forces paid-only email switches off and disabled for free users', () => {
    setTabParam('email');

    render(<ProfilePage />);

    const morning = screen.getByRole('switch', { name: /早报 需要升级/ });
    const daily = screen.getByRole('switch', { name: /晚报 已开启/ });
    const weekly = screen.getByRole('switch', { name: /宏观周报 需要升级/ });
    // personal_digest toggle removed — now auto-managed by watchlist

    expect(morning.getAttribute('aria-checked')).toBe('false');
    expect((morning as HTMLButtonElement).disabled).toBe(true);
    expect((daily as HTMLButtonElement).disabled).toBe(false);
    expect(weekly.getAttribute('aria-checked')).toBe('false');
    expect((weekly as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('升级 Pro 解锁')).toHaveLength(2);
  });

  it('keeps entitled email switches interactive for paid users', () => {
    setTabParam('email');
    mockUseSubscription.mockReturnValue(subState({
      isPro: true,
      plan: 'pro',
      status: 'active',
    }));
    mockUseEntitlements.mockReturnValue({
      has: (feature: string) => feature !== 'personal_digest_email',
    });

    render(<ProfilePage />);

    const morning = screen.getByRole('switch', { name: /早报 已开启/ });
    const weekly = screen.getByRole('switch', { name: /宏观周报 已关闭/ });
    // personal_digest toggle removed — now auto-managed by watchlist

    expect((morning as HTMLButtonElement).disabled).toBe(false);
    expect((weekly as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Entitlement-gated email preferences
// ---------------------------------------------------------------------------
describe('ProfilePage entitlement-gated preferences', () => {
  it('shows all toggles enabled for user with all entitlements', () => {
    setTabParam('email');
    mockUseSubscription.mockReturnValue(subState({
      isPro: true, plan: 'pro', status: 'active',
    }));
    mockUseEntitlements.mockReturnValue({
      has: () => true,
    });

    render(<ProfilePage />);

    const morning = screen.getByRole('switch', { name: /早报 已开启/ });
    const daily = screen.getByRole('switch', { name: /晚报 已开启/ });
    const weekly = screen.getByRole('switch', { name: /宏观周报 已关闭/ });
    // personal_digest toggle removed — now auto-managed by watchlist

    expect((morning as HTMLButtonElement).disabled).toBe(false);
    expect((daily as HTMLButtonElement).disabled).toBe(false);
    expect((weekly as HTMLButtonElement).disabled).toBe(false);

    // No lock text should appear
    expect(screen.queryByText('升级 Pro 解锁')).toBeNull();
  });

  it('locks paid toggles for free user without entitlements', () => {
    setTabParam('email');
    mockUseSubscription.mockReturnValue(subState({ isPro: false, plan: 'free', status: 'none' }));
    mockUseEntitlements.mockReturnValue({
      has: () => false,
    });

    render(<ProfilePage />);

    // morning_report, weekly_report have entitlement field -> locked
    // personal_digest toggle removed — now auto-managed by watchlist
    const morning = screen.getByRole('switch', { name: /早报 需要升级/ });
    const weekly = screen.getByRole('switch', { name: /宏观周报 需要升级/ });

    expect((morning as HTMLButtonElement).disabled).toBe(true);
    expect((weekly as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('升级 Pro 解锁')).toHaveLength(2);
  });

  it('does not lock daily_report toggle for free user (no entitlement field)', () => {
    setTabParam('email');
    mockUseSubscription.mockReturnValue(subState({ isPro: false, plan: 'free', status: 'none' }));
    mockUseEntitlements.mockReturnValue({
      has: () => false,
    });

    render(<ProfilePage />);

    // daily_report has no entitlement field, so it should not be locked
    const daily = screen.getByRole('switch', { name: /晚报 已开启/ });
    expect((daily as HTMLButtonElement).disabled).toBe(false);
  });
});
