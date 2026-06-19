import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageShell } from '../PageShell';

const mocks = vi.hoisted(() => ({
  pathname: '/today',
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/Navbar', () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

vi.mock('@/components/Logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <svg data-testid="logo" className={className} />
  ),
}));

describe('PageShell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.pathname = '/today';
    mocks.searchParams = new URLSearchParams();
  });

  it('renders global chrome on normal routes', () => {
    render(<PageShell><main>content</main></PageShell>);

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText('TheMarketBrew')).toBeInTheDocument();
  });

  it('skips global chrome for focused Panda partner routes', () => {
    mocks.pathname = '/panda';

    render(<PageShell><main>Panda content</main></PageShell>);

    expect(screen.queryByTestId('navbar')).toBeNull();
    expect(screen.getByText('Panda content')).toBeInTheDocument();
    expect(screen.queryByText('TheMarketBrew')).toBeNull();
  });

  it('continues to skip global chrome inside WeChat webview', () => {
    mocks.searchParams = new URLSearchParams('from=wechat');

    render(<PageShell><main>webview content</main></PageShell>);

    expect(screen.queryByTestId('navbar')).toBeNull();
    expect(screen.getByText('webview content')).toBeInTheDocument();
    expect(screen.queryByText('TheMarketBrew')).toBeNull();
  });
});
