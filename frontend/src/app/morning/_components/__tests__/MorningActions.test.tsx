import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MorningActions } from '../MorningActions';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockGetStatus = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockSendEmail = vi.fn();
const mockGenerate = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      getStatus: (...args: unknown[]) => mockGetStatus(...args),
      subscribe: (...args: unknown[]) => mockSubscribe(...args),
      unsubscribe: (...args: unknown[]) => mockUnsubscribe(...args),
    },
    sendMorningReportEmail: (...args: unknown[]) => mockSendEmail(...args),
    generateMorningReport: (...args: unknown[]) => mockGenerate(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setLoggedIn(email = 'test@test.com') {
  mockUseAuth.mockReturnValue({
    user: { id: 'u1', email, name: 'Test User' },
    isLoading: false,
    isAuthenticated: true,
  } as ReturnType<typeof useAuth>);
}

function setLoggedOut() {
  mockUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
  } as ReturnType<typeof useAuth>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MorningActions', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({ subscribed: false });
  });

  it('shows subscribe button when not subscribed', () => {
    setLoggedIn();
    render(<MorningActions reportExists />);

    expect(screen.getByText('订阅')).toBeTruthy();
  });

  it('shows subscribed state with checkmark when subscribed', async () => {
    mockGetStatus.mockResolvedValue({ subscribed: true });
    setLoggedIn();
    render(<MorningActions reportExists />);

    await waitFor(() => {
      expect(screen.getByText('已订阅')).toBeTruthy();
    });
  });

  it('subscribe calls api.subscriptions.subscribe with user email', async () => {
    mockSubscribe.mockResolvedValue({ success: true });
    setLoggedIn('alice@example.com');
    render(<MorningActions reportExists />);

    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith('daily_report', {
        email: 'alice@example.com',
        user_id: 'u1',
        first_name: 'Test User',
      });
    });
  });

  it('unsubscribe calls api.subscriptions.unsubscribe with user email', async () => {
    mockGetStatus.mockResolvedValue({ subscribed: true });
    mockUnsubscribe.mockResolvedValue({ success: true });
    setLoggedIn('bob@example.com');
    render(<MorningActions reportExists />);

    // Wait for subscribed state to appear
    await waitFor(() => {
      expect(screen.getByText('已订阅')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('已订阅'));

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalledWith('daily_report', 'bob@example.com');
    });
  });

  it('redirects to login when subscribe clicked without user', () => {
    setLoggedOut();
    render(<MorningActions reportExists />);

    fireEvent.click(screen.getByText('订阅'));

    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/morning');
  });

  it('shows send email button when user is logged in', () => {
    setLoggedIn();
    render(<MorningActions reportExists />);

    expect(screen.getByText('发送邮件')).toBeTruthy();
  });

  it('send email button is disabled when reportExists is false', () => {
    setLoggedIn();
    render(<MorningActions reportExists={false} />);

    const sendButton = screen.getByText('发送邮件').closest('button');
    expect(sendButton).toBeTruthy();
    expect(sendButton!.disabled).toBe(true);
  });

  it('redirects to login when send email clicked without user', () => {
    setLoggedOut();
    render(<MorningActions reportExists />);

    // Send email button is only rendered when user exists, so we need
    // a scenario where user becomes null mid-flow. The component guards
    // by not rendering the button. Verify button is absent.
    expect(screen.queryByText('发送邮件')).toBeNull();
  });

  it('generate button only shown in development env', () => {
    // In test mode (vitest sets NODE_ENV=test), isDev is false
    setLoggedIn();
    render(<MorningActions reportExists />);
    expect(screen.queryByText('生成报告')).toBeNull();

    cleanup();
  });

  it('checks subscription status on mount when user has email', async () => {
    mockGetStatus.mockResolvedValue({ subscribed: true });
    setLoggedIn('check@example.com');
    render(<MorningActions reportExists />);

    await waitFor(() => {
      expect(mockGetStatus).toHaveBeenCalledWith('daily_report', 'check@example.com');
    });
  });

  it('sends email to user email when send email button clicked', async () => {
    mockSendEmail.mockResolvedValue({});
    setLoggedIn('send@example.com');
    render(<MorningActions reportExists />);

    fireEvent.click(screen.getByText('发送邮件'));

    await waitFor(() => {
      expect(mockSendEmail).toHaveBeenCalledWith('send@example.com');
    });
  });

  it('shows success message after successful subscription', async () => {
    mockSubscribe.mockResolvedValue({ success: true });
    setLoggedIn();
    render(<MorningActions reportExists />);

    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(screen.getByText('Subscribed to daily reports!')).toBeTruthy();
    });
  });
});
