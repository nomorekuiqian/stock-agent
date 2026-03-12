import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const mockUpdatePreferences = vi.fn();
const mockSubscribe = vi.fn();
const mockSendEmail = vi.fn();
const mockGenerate = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      getPreferences: vi.fn().mockResolvedValue({
        success: true,
        preferences: { morning_report: false, daily_report: true, weekly_report: true, personal_digest: false },
      }),
      updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
      subscribe: (...args: unknown[]) => mockSubscribe(...args),
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

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MorningActions', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows subscribe button when not subscribed', async () => {
    setLoggedIn();
    renderWithProviders(<MorningActions reportExists />);

    await waitFor(() => {
      expect(screen.getByText('订阅')).toBeTruthy();
    });
  });

  it('subscribe calls updatePreferences with morning_report: true', async () => {
    mockUpdatePreferences.mockResolvedValue({
      success: true,
      preferences: { morning_report: true, daily_report: true, weekly_report: true, personal_digest: false },
    });
    setLoggedIn('alice@example.com');
    renderWithProviders(<MorningActions reportExists />);

    await waitFor(() => {
      expect(screen.getByText('订阅')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ morning_report: true });
    });
  });

  it('falls back to subscribe when updatePreferences fails', async () => {
    mockUpdatePreferences.mockRejectedValue(new Error('contact not found'));
    mockSubscribe.mockResolvedValue({ success: true });
    setLoggedIn('alice@example.com');
    renderWithProviders(<MorningActions reportExists />);

    await waitFor(() => {
      expect(screen.getByText('订阅')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith('daily_report', {
        email: 'alice@example.com',
        user_id: 'u1',
        first_name: 'Test User',
      });
    });
  });

  it('redirects to login when subscribe clicked without user', () => {
    setLoggedOut();
    renderWithProviders(<MorningActions reportExists />);

    fireEvent.click(screen.getByText('订阅'));

    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/morning');
  });

  it('send email and generate buttons hidden in non-dev env', () => {
    setLoggedIn();
    renderWithProviders(<MorningActions reportExists />);
    expect(screen.queryByText('发送邮件')).toBeNull();
    expect(screen.queryByText('生成报告')).toBeNull();
  });

  it('button changes to subscribed state after successful subscription', async () => {
    mockUpdatePreferences.mockResolvedValue({
      success: true,
      preferences: { morning_report: true, daily_report: true, weekly_report: true, personal_digest: false },
    });
    setLoggedIn();
    renderWithProviders(<MorningActions reportExists />);

    await waitFor(() => {
      expect(screen.getByText('订阅')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('订阅'));

    await waitFor(() => {
      expect(screen.getByText('已订阅')).toBeTruthy();
    });
  });
});
