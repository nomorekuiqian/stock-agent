import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LoginGate from '../LoginGate';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  pathname: '/kol/qinbafrank/stocks',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('LoginGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/kol/qinbafrank/stocks';
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a loading indicator while auth state is recovering', () => {
    mocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const { container } = render(
      <LoginGate>
        <div>protected content</div>
      </LoginGate>,
    );

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders children for authenticated users', () => {
    mocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <LoginGate>
        <div>protected content</div>
      </LoginGate>,
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('renders login and signup links with current path redirect', () => {
    mocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <LoginGate>
        <div>protected content</div>
      </LoginGate>,
    );

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(screen.getByText('登录后查看完整内容')).toBeInTheDocument();

    const redirect = encodeURIComponent('/kol/qinbafrank/stocks');
    expect(screen.getByRole('link', { name: '登录' }).getAttribute('href')).toBe(
      `/login?redirect=${redirect}`,
    );
    expect(screen.getByRole('link', { name: '免费注册' }).getAttribute('href')).toBe(
      `/login?mode=signup&redirect=${redirect}`,
    );
  });

  it('honors an explicit redirectTo that carries query params', () => {
    mocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <LoginGate redirectTo="/research?agent=kol&persona=qinbafrank&q=NVDA">
        <div>protected content</div>
      </LoginGate>,
    );

    // pathname mock stays at /kol/qinbafrank/stocks; redirectTo must win.
    const redirect = encodeURIComponent('/research?agent=kol&persona=qinbafrank&q=NVDA');
    expect(screen.getByRole('link', { name: '登录' }).getAttribute('href')).toBe(
      `/login?redirect=${redirect}`,
    );
    expect(screen.getByRole('link', { name: '免费注册' }).getAttribute('href')).toBe(
      `/login?mode=signup&redirect=${redirect}`,
    );
  });
});
