import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaywallGuard from '../PaywallGuard';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/for-you',
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockPush.mockReset();
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1', email: 'test@example.com' },
  });
  mockUseSubscription.mockReturnValue({
    isPro: true,
    isLoading: false,
    isCheckoutLoading: false,
    checkoutError: null,
    plan: 'pro',
    status: 'active',
    createCheckout: vi.fn(),
    openBillingPortal: vi.fn(),
    refreshSubscription: vi.fn(),
  });
  mockUseEntitlements.mockReturnValue({
    has: vi.fn().mockReturnValue(true),
    isLoading: false,
    refresh: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// NOTE: PAYWALL_ENABLED is a module-level const evaluated at import time.
// In test env, NEXT_PUBLIC_ENABLE_PAYWALL is not 'true', so PAYWALL_ENABLED=false.
// The paywall-enabled branch (loading state, pricing page) is tested via E2E.

describe('PaywallGuard', () => {
  it('renders children when PAYWALL is disabled (default test env)', () => {
    render(
      <PaywallGuard>
        <div data-testid="content">Protected content</div>
      </PaywallGuard>
    );

    expect(screen.getByTestId('content')).toBeTruthy();
    expect(screen.getByText('Protected content')).toBeTruthy();
  });

  it('always renders children regardless of isPro when paywall disabled', () => {
    mockUseSubscription.mockReturnValue({
      isPro: false,
      isLoading: false,
      isCheckoutLoading: false,
      checkoutError: null,
      plan: 'free',
      status: 'none',
      createCheckout: vi.fn(),
      openBillingPortal: vi.fn(),
      refreshSubscription: vi.fn(),
    });

    render(
      <PaywallGuard>
        <div data-testid="free-content">Free user content</div>
      </PaywallGuard>
    );

    // Paywall disabled = always render children
    expect(screen.getByTestId('free-content')).toBeTruthy();
  });

  it('renders children regardless of auth state when paywall disabled', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(
      <PaywallGuard>
        <div data-testid="unauth-content">Unauthenticated content</div>
      </PaywallGuard>
    );

    expect(screen.getByTestId('unauth-content')).toBeTruthy();
  });

  it('renders children during loading when paywall disabled', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });
    mockUseSubscription.mockReturnValue({
      isPro: false,
      isLoading: true,
      isCheckoutLoading: false,
      checkoutError: null,
      plan: 'free',
      status: 'none',
      createCheckout: vi.fn(),
      openBillingPortal: vi.fn(),
      refreshSubscription: vi.fn(),
    });

    render(
      <PaywallGuard>
        <div data-testid="loading-content">Content while loading</div>
      </PaywallGuard>
    );

    // Paywall disabled short-circuits before loading check
    expect(screen.getByTestId('loading-content')).toBeTruthy();
  });

  // -------------------------------------------------------------------
  // Entitlements integration (paywall disabled)
  // NOTE: The paywall-enabled entitlement checking (has() gating,
  // MAX_ONLY_FEATURES, loading states) is covered by E2E tests since
  // PAYWALL_ENABLED is a module-level const that cannot be changed
  // via vi.stubEnv at runtime.
  // -------------------------------------------------------------------

  it('calls useEntitlements hook even when paywall is disabled', () => {
    const mockHas = vi.fn().mockReturnValue(false);
    mockUseEntitlements.mockReturnValue({
      has: mockHas,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(
      <PaywallGuard requiredFeature="stock_research">
        <div data-testid="ent-content">Entitlement content</div>
      </PaywallGuard>
    );

    // Children rendered regardless (paywall disabled)
    expect(screen.getByTestId('ent-content')).toBeTruthy();
    // The hook is still called (component imports it unconditionally)
    expect(mockUseEntitlements).toHaveBeenCalled();
  });

  it('accepts requiredFeature prop without error', () => {
    render(
      <PaywallGuard requiredFeature="stock_research">
        <div data-testid="feature-content">Feature content</div>
      </PaywallGuard>
    );

    expect(screen.getByTestId('feature-content')).toBeTruthy();
  });
});
