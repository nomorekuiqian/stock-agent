import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { AuthSubscriptionSync } from '../AuthSubscriptionSync';

const mockUseAuth = vi.fn();
const mockSyncUser = vi.fn();
const mockGetStatus = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      syncUser: (...args: unknown[]) => mockSyncUser(...args),
      getStatus: (...args: unknown[]) => mockGetStatus(...args),
      subscribe: (...args: unknown[]) => mockSubscribe(...args),
    },
  },
}));

describe('AuthSubscriptionSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does nothing when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null });

    render(<AuthSubscriptionSync />);

    expect(mockSyncUser).not.toHaveBeenCalled();
    expect(mockGetStatus).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('syncs subscriptions and auto-subscribes daily report on first login', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com', name: 'Tester' },
    });
    mockSyncUser.mockResolvedValue({ success: true, synced_channels: [] });
    mockGetStatus.mockResolvedValue({ subscribed: false });
    mockSubscribe.mockResolvedValue({ success: true });

    render(<AuthSubscriptionSync />);

    await waitFor(() => expect(mockSyncUser).toHaveBeenCalledWith('user-1', 'user@example.com', 'Tester'));
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledWith('daily_report', 'user@example.com'));
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith('daily_report', {
      email: 'user@example.com',
      first_name: 'Tester',
      user_id: 'user-1',
    }));

    expect(localStorage.getItem('auto_subscribed_user-1')).toBe('true');
  });

  it('skips sync when local cache is still fresh', () => {
    localStorage.setItem('sub_synced', JSON.stringify({ userId: 'user-1', ts: Date.now() }));
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com', name: 'Tester' },
    });

    render(<AuthSubscriptionSync />);

    expect(mockSyncUser).not.toHaveBeenCalled();
  });
});
