import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockReloadAuth = vi.fn();
const mockSignOut = vi.fn();
let mockSdkUser: Record<string, unknown> | null = null;
let mockIsLoaded = true;

vi.mock('@insforge/nextjs', () => ({
  useInsforge: () => ({
    user: mockSdkUser,
    isLoaded: mockIsLoaded,
    reloadAuth: mockReloadAuth,
    signOut: mockSignOut,
  }),
}));

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: { getCurrentSession: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      syncUser: vi.fn().mockResolvedValue({ success: true, synced_channels: [] }),
      getStatus: vi.fn().mockResolvedValue({ subscribed: true }),
      subscribe: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Test helper to consume context
// ---------------------------------------------------------------------------
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user-email">{auth.user?.email ?? 'none'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSdkUser = null;
    mockIsLoaded = true;
    // Suppress localStorage errors in jsdom
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <span data-testid="child">Hello</span>
        </AuthProvider>
      );
    });
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('exposes authenticated user from SDK', async () => {
    mockSdkUser = {
      id: 'u1',
      email: 'test@test.com',
      profile: { name: 'Test User' },
    };

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@test.com');
  });

  it('shows not authenticated when SDK has no user', async () => {
    mockSdkUser = null;
    mockIsLoaded = true;

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('shows loading when SDK is not yet loaded', async () => {
    mockSdkUser = null;
    mockIsLoaded = false;

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('throws when useAuth is called outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    spy.mockRestore();
  });
});
