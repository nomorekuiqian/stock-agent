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
    has: () => false,
  }),
}));

vi.mock('@/hooks/use-is-admin', () => ({
  useIsAdmin: () => false,
}));

vi.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    entitlements: new Set<string>(),
    isLoading: false,
    has: () => false,
    refresh: async () => {},
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
    expect(screen.getAllByText('每日简报').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('AI 研究助手').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('投研').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('我的').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('定价').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('联系')).toBeNull();
  });

  it('adds guided tour anchors to primary nav entries', () => {
    const { container } = render(<Navbar />);

    expect(container.querySelector('[data-guided-tour-target="nav-research-agent"]')).toBeTruthy();
    expect(container.querySelector('[data-guided-tour-target="nav-daily-reports"]')).toBeTruthy();
    expect(container.querySelector('[data-guided-tour-target="nav-research-system"]')).toBeTruthy();
    expect(container.querySelector('[data-guided-tour-target="nav-my"]')).toBeTruthy();
  });

  it('shows KOL research under the research menu after rollout', () => {
    render(<Navbar />);

    expect(screen.getAllByText('博主研究室').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('menuitem', { name: '博主研究室' }).every((link) => (
      link.getAttribute('href') === '/kol'
    ))).toBe(true);
  });
});
