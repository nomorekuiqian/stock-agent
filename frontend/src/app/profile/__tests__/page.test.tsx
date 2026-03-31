import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProfilePage from '../page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(authState());
  mockUseSubscription.mockReturnValue(subState());
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests — each test re-sets the mock before render
// ---------------------------------------------------------------------------
describe('ProfilePage subscription states', () => {
  it('renders free state with pricing link', () => {
    render(<ProfilePage />);

    expect(screen.getByText('当前为免费版')).toBeDefined();
    expect(screen.getByText('查看方案')).toBeDefined();
    const link = screen.getByText('查看方案').closest('a');
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
    // Renewal date renders (locale formatting varies in jsdom, just check the row exists)
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
    // Upgrade link always visible for trial users
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
    // Canceled badge
    mockUseSubscription.mockReturnValue(subState({
      isPro: false, status: 'canceled',
    }));

    render(<ProfilePage />);

    expect(screen.getByText('已取消')).toBeDefined();
  });
});

describe('ProfilePage manage subscription', () => {
  it('calls openBillingPortal on manage click', async () => {
    const mockPortal = vi.fn().mockResolvedValue(undefined);
    mockUseSubscription.mockReturnValue(subState({
      isPro: true, plan: 'pro', status: 'active',
      currentPeriodEnd: '2026-05-01T00:00:00Z',
      openBillingPortal: mockPortal,
    }));

    render(<ProfilePage />);

    screen.getByRole('button', { name: /管理订阅/ }).click();

    await vi.waitFor(() => {
      expect(mockPortal).toHaveBeenCalled();
    });
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
