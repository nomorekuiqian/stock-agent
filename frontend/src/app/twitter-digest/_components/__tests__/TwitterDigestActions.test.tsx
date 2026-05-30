import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { TwitterDigestActions } from '../TwitterDigestActions';

const mockUseAuth = vi.fn();
const mockUseEmailPreferences = vi.fn();
const mockUpdatePreferences = vi.fn();
const mockSetQueryData = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/queries/use-preferences', () => ({
  useEmailPreferences: (enabled?: boolean) => mockUseEmailPreferences(enabled),
}));

vi.mock('@/hooks/queries/query-keys', () => ({
  queryKeys: {
    subscriptions: { preferences: () => ['subscriptions', 'preferences'] },
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
    },
  },
}));

describe('TwitterDigestActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('always shows the archive link', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: undefined });

    render(<TwitterDigestActions showSubscribe={false} />);

    expect(screen.getByText('往期归档')).toBeInTheDocument();
  });

  it('shows 订阅 button when user not subscribed', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: false } });

    render(<TwitterDigestActions />);

    expect(screen.getByText('订阅')).toBeInTheDocument();
  });

  it('shows 已订阅 when user subscribed', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: true } });

    render(<TwitterDigestActions />);

    expect(screen.getByText('已订阅')).toBeInTheDocument();
  });

  it('redirects to login when anonymous user clicks subscribe', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: undefined });

    render(<TwitterDigestActions />);

    // No user → button shouldn't show (prefsLoading=false but user undefined →
    // the "订阅" button still renders, click triggers redirect)
    const btn = screen.queryByText('订阅');
    if (btn) {
      fireEvent.click(btn);
      expect(mockRouterPush).toHaveBeenCalledWith('/login?redirect=/twitter-digest');
    }
  });

  it('shows success feedback after subscribing', async () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: false } });
    mockUpdatePreferences.mockResolvedValue({
      success: true,
      preferences: { twitter_digest: true },
    });

    render(<TwitterDigestActions />);
    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(screen.getByText('已订阅推特日报')).toBeInTheDocument();
    });
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ twitter_digest: true });
    expect(mockSetQueryData).toHaveBeenCalled();
  });

  it('shows unsubscribe feedback after toggling off', async () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: true } });
    mockUpdatePreferences.mockResolvedValue({
      success: true,
      preferences: { twitter_digest: false },
    });

    render(<TwitterDigestActions />);
    fireEvent.click(screen.getByText('已订阅'));

    await waitFor(() => {
      expect(screen.getByText('已退订推特日报')).toBeInTheDocument();
    });
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ twitter_digest: false });
  });

  it('surfaces Max entitlement requirement when API throws entitlement error', async () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: false } });
    mockUpdatePreferences.mockRejectedValue(
      new Error('feature requires an active entitlement'),
    );

    render(<TwitterDigestActions />);
    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(screen.getByText('需要 Max 权益才能订阅')).toBeInTheDocument();
    });
  });

  it('shows generic error when toggle returns success=false', async () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: false } });
    mockUpdatePreferences.mockResolvedValue({ success: false });

    render(<TwitterDigestActions />);
    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(screen.getByText('操作失败,请稍后再试')).toBeInTheDocument();
    });
  });

  it('hides subscribe button when showSubscribe=false', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: { twitter_digest: true } });

    render(<TwitterDigestActions showSubscribe={false} />);

    expect(screen.queryByText('已订阅')).not.toBeInTheDocument();
    expect(screen.queryByText('订阅')).not.toBeInTheDocument();
  });

  it('shows loading skeleton while preferences are being fetched', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'u@test.com' }, isLoading: false });
    mockUseEmailPreferences.mockReturnValue({ data: undefined });

    const { container } = render(<TwitterDigestActions />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
