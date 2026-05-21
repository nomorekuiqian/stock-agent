import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navbar } from '../Navbar';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/today'),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/NavAuth', () => ({
  NavAuth: () => <div data-testid="nav-auth">NavAuth</div>,
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

vi.mock('@/components/MobileMenu', () => ({
  MobileMenu: () => <div data-testid="mobile-menu">MobileMenu</div>,
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ isPro: false, plan: 'free', status: 'none' }),
}));

vi.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({
    flags: new Set<string>(),
    isLoading: false,
    has: (_flag: string) => false,
  }),
}));

vi.mock('@/hooks/use-is-admin', () => ({
  useIsAdmin: () => false,
}));

vi.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    entitlements: new Set<string>(),
    isLoading: false,
    has: (_feature: string) => false,
    refresh: async (_opts?: { fresh?: boolean }) => {},
  }),
}));

vi.mock('@/components/Logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <svg data-testid="logo" className={className} />
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Navbar', () => {
  it('renders without crashing', () => {
    const { container } = render(<Navbar />);
    expect(container.querySelector('nav')).toBeTruthy();
  });

  it('displays brand name', () => {
    render(<Navbar />);
    // MobileMenu may also render brand, use getAllByText
    expect(screen.getAllByText('TheMarketBrew').length).toBeGreaterThanOrEqual(1);
  });

  it('renders navigation links', () => {
    render(<Navbar />);
    // Navigation links may appear in both desktop and mobile menus
    expect(screen.getAllByText('日报').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('专属').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('个股').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('宏观').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('联系').length).toBeGreaterThanOrEqual(1);
  });
});
